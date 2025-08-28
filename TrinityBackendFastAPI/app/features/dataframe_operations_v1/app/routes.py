from fastapi import APIRouter, Response, Body, HTTPException, UploadFile, File
import os
from minio import Minio
from minio.error import S3Error
from urllib.parse import unquote
import pyarrow as pa
import pyarrow.ipc as ipc
import pandas as pd
import numpy as np
import io
import uuid
from typing import Dict, Any, List
from app.DataStorageRetrieval.arrow_client import download_dataframe
from app.features.data_upload_validate.app.routes import get_object_prefix

router = APIRouter()

# Self-contained MinIO config (match feature-overview)
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "admin_dev")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "pass_dev")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "trinity")

minio_client = Minio(
    MINIO_ENDPOINT,
    access_key=MINIO_ACCESS_KEY,
    secret_key=MINIO_SECRET_KEY,
    secure=False
)

# In-memory storage for dataframe sessions
SESSIONS: Dict[str, pd.DataFrame] = {}


def _get_df(df_id: str) -> pd.DataFrame:
    df = SESSIONS.get(df_id)
    if df is None:
        raise HTTPException(status_code=404, detail="DataFrame not found")
    return df


def _df_payload(df: pd.DataFrame, df_id: str) -> Dict[str, Any]:
    safe_df = df.replace([np.inf, -np.inf], np.nan).astype(object)
    rows = safe_df.where(pd.notnull(safe_df), None).to_dict(orient="records")
    return {
        "df_id": df_id,
        "headers": list(df.columns),
        "rows": rows,
        "types": {col: str(df[col].dtype) for col in df.columns},
        "row_count": len(df),
        "column_count": len(df.columns),
    }


def _fetch_df_from_object(object_name: str) -> pd.DataFrame:
    """Fetch a DataFrame from the Flight server or MinIO given an object key."""
    object_name = unquote(object_name)
    if not (object_name.endswith('.arrow') or object_name.endswith('.csv')):
        raise HTTPException(status_code=400, detail="Invalid object_name format")
    try:
        return download_dataframe(object_name)
    except Exception as e:
        print(f"[DFOPS] Flight/MinIO fetch error: {e}")
        raise HTTPException(status_code=404, detail="Not Found")

@router.get("/test_alive")
async def test_alive():
    print("[DFOPS] test_alive endpoint hit")
    return {"status": "alive"}

@router.get("/cached_dataframe")
async def cached_dataframe(object_name: str):
    print("[DFOPS] --- /cached_dataframe called ---")
    df = _fetch_df_from_object(object_name)
    return Response(content=df.to_csv(index=False), media_type="text/csv")


@router.post("/load_cached")
async def load_cached_dataframe(object_name: str = Body(..., embed=True)):
    """Load a cached dataframe by object key and create a session."""
    print(f"[DFOPS] /load_cached called object_name={object_name}")
    df = _fetch_df_from_object(object_name)
    df_id = str(uuid.uuid4())
    SESSIONS[df_id] = df
    return _df_payload(df, df_id)

@router.post("/save")
async def save_dataframe(
    csv_data: str = Body(..., embed=True),
    filename: str = Body(..., embed=True)
):
    """Save a dataframe (CSV) to MinIO under a `dataframe operations` folder using the original file name."""
    try:
        df = pd.read_csv(io.StringIO(csv_data))

        # Generate a filename if none supplied
        if not filename:
            df_id = str(uuid.uuid4())[:8]
            filename = f"{df_id}_dataframe_ops.arrow"
        if not filename.endswith(".arrow"):
            filename += ".arrow"

        # Determine current prefix and ensure folder exists
        prefix = await get_object_prefix()
        # Place results inside a dedicated "dataframe operations" folder
        dfops_prefix = f"{prefix}dataframe operations/"
        try:
            minio_client.stat_object(MINIO_BUCKET, dfops_prefix)
        except S3Error:
            minio_client.put_object(MINIO_BUCKET, dfops_prefix, io.BytesIO(b""), 0)

        object_name = f"{dfops_prefix}{filename}"

        # Convert to Arrow and upload
        table = pa.Table.from_pandas(df)
        arrow_buffer = pa.BufferOutputStream()
        with ipc.new_file(arrow_buffer, table.schema) as writer:
            writer.write_table(table)
        arrow_bytes = arrow_buffer.getvalue().to_pybytes()
        minio_client.put_object(
            MINIO_BUCKET,
            object_name,
            data=io.BytesIO(arrow_bytes),
            length=len(arrow_bytes),
            content_type="application/octet-stream",
        )

        return {
            "result_file": object_name,
            "shape": df.shape,
            "columns": list(df.columns),
            "message": "DataFrame saved successfully",
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ---------------------------------------------------------------------------
# Backend dataframe operation endpoints
# ---------------------------------------------------------------------------


@router.post("/load")
async def load_dataframe(file: UploadFile = File(...)):
    """Load a CSV file and store it in a session."""
    try:
        content = await file.read()
        df = pd.read_csv(io.BytesIO(content))
    except Exception:
        raise HTTPException(status_code=400, detail="Failed to parse uploaded file")
    df_id = str(uuid.uuid4())
    SESSIONS[df_id] = df
    return _df_payload(df, df_id)


@router.post("/filter_rows")
async def filter_rows(df_id: str = Body(...), column: str = Body(...), value: Any = Body(...)):
    print(f"/filter_rows called df_id={df_id}, column={column}, value={value}", flush=True)
    df = _get_df(df_id)
    try:
        if isinstance(value, dict):
            min_v = value.get("min")
            max_v = value.get("max")
            df = df[df[column].between(min_v, max_v)]
        elif isinstance(value, list):
            df = df[df[column].isin(value)]
        else:
            df = df[df[column] == value]
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    print("/filter_rows response", result, flush=True)
    return result


@router.post("/sort")
async def sort_dataframe(df_id: str = Body(...), column: str = Body(...), direction: str = Body("asc")):
    print(f"/sort called df_id={df_id}, column={column}, direction={direction}", flush=True)
    df = _get_df(df_id)
    try:
        df = df.sort_values(by=column, ascending=direction == "asc").reset_index(drop=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    print("/sort response", result, flush=True)
    return result


@router.post("/insert_row")
async def insert_row(
    df_id: str = Body(...),
    index: int = Body(...),
    direction: str = Body("below"),
):
    print(f"/insert_row called df_id={df_id}, index={index}, direction={direction}", flush=True)
    df = _get_df(df_id)
    empty = {col: None for col in df.columns}
    insert_at = index if direction == "above" else index + 1
    insert_at = max(0, min(insert_at, len(df)))
    df = pd.concat([df.iloc[:insert_at], pd.DataFrame([empty]), df.iloc[insert_at:]]).reset_index(drop=True)
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    print("/insert_row response", result, flush=True)
    return result


@router.post("/delete_row")
async def delete_row(df_id: str = Body(...), index: int = Body(...)):
    print(f"/delete_row called df_id={df_id}, index={index}", flush=True)
    df = _get_df(df_id)
    try:
        df = df.drop(index).reset_index(drop=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    print("/delete_row response", result, flush=True)
    return result


@router.post("/insert_column")
async def insert_column(
    df_id: str = Body(...),
    index: int = Body(...),
    name: str = Body(...),
    default: Any = Body(None),
):
    print(f"/insert_column called df_id={df_id}, index={index}, name={name}, default={default}", flush=True)
    df = _get_df(df_id)
    if index >= len(df.columns):
        df[name] = default
    else:
        df.insert(index, name, default)
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    print("/insert_column response", result, flush=True)
    return result


@router.post("/delete_column")
async def delete_column(df_id: str = Body(...), name: str = Body(...)):
    print(f"/delete_column called df_id={df_id}, name={name}", flush=True)
    df = _get_df(df_id)
    try:
        df = df.drop(columns=[name])
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    print("/delete_column response", result, flush=True)
    return result


@router.post("/edit_cell")
async def edit_cell(df_id: str = Body(...), row: int = Body(...), column: str = Body(...), value: Any = Body(...)):
    print(f"/edit_cell called df_id={df_id}, row={row}, column={column}, value={value}", flush=True)
    df = _get_df(df_id)
    try:
        df.at[row, column] = value
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    print("/edit_cell response", result, flush=True)
    return result


@router.post("/rename_column")
async def rename_column(df_id: str = Body(...), old_name: str = Body(...), new_name: str = Body(...)):
    print(f"/rename_column called df_id={df_id}, old_name={old_name}, new_name={new_name}", flush=True)
    df = _get_df(df_id)
    df = df.rename(columns={old_name: new_name})
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    print("/rename_column response", result, flush=True)
    return result


@router.post("/duplicate_row")
async def duplicate_row(df_id: str = Body(...), index: int = Body(...)):
    print(f"/duplicate_row called df_id={df_id}, index={index}", flush=True)
    df = _get_df(df_id)
    try:
        row = df.iloc[[index]]
        df = pd.concat([df.iloc[: index], row, df.iloc[index :]]).reset_index(drop=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    print("/duplicate_row response", result, flush=True)
    return result


@router.post("/duplicate_column")
async def duplicate_column(df_id: str = Body(...), name: str = Body(...), new_name: str = Body(...)):
    print(f"/duplicate_column called df_id={df_id}, name={name}, new_name={new_name}", flush=True)
    df = _get_df(df_id)
    try:
        idx = df.columns.get_loc(name)
        df.insert(idx, new_name, df[name])
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    print("/duplicate_column response", result, flush=True)
    return result


@router.post("/move_column")
async def move_column(df_id: str = Body(...), from_col: str = Body(..., alias="from"), to_index: int = Body(...)):
    print(f"/move_column called df_id={df_id}, from_col={from_col}, to_index={to_index}", flush=True)
    df = _get_df(df_id)
    try:
        col = df.pop(from_col)
        df.insert(to_index, from_col, col)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    print("/move_column response", result, flush=True)
    return result


@router.post("/retype_column")
async def retype_column(df_id: str = Body(...), name: str = Body(...), new_type: str = Body(...)):
    print(f"/retype_column called df_id={df_id}, name={name}, new_type={new_type}", flush=True)
    df = _get_df(df_id)
    try:
        if new_type == "number":
            df[name] = pd.to_numeric(df[name], errors="coerce")
        elif new_type in ["string", "text"]:
            df[name] = df[name].astype(str)
        else:
            df[name] = df[name].astype(new_type)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    print("/retype_column response", result, flush=True)
    return result


@router.get("/preview")
async def preview(df_id: str, n: int = 5):
    df = _get_df(df_id)
    preview_df = df.head(n)
    return {
        "df_id": df_id,
        "headers": list(df.columns),
        "rows": preview_df.to_dict(orient="records"),
    }


@router.get("/info")
async def info(df_id: str):
    df = _get_df(df_id)
    return {
        "df_id": df_id,
        "row_count": len(df),
        "column_count": len(df.columns),
        "types": {col: str(df[col].dtype) for col in df.columns},
    }


@router.post("/ai/execute_operations")
async def ai_execute(df_id: str = Body(...), operations: List[Dict[str, Any]] = Body(...)):
    df = _get_df(df_id)
    for op in operations:
        name = op.get("op")
        params = op.get("params", {})
        if name == "filter_rows":
            df = df[df[params.get("column")] == params.get("value")]
        elif name == "sort":
            df = df.sort_values(by=params.get("column"), ascending=params.get("direction", "asc") == "asc")
        elif name == "insert_column":
            idx = params.get("index", len(df.columns))
            df.insert(idx, params.get("name"), params.get("default"))
        elif name == "delete_row":
            df = df.drop(params.get("index")).reset_index(drop=True)
        elif name == "edit_cell":
            df.at[params.get("row"), params.get("column")] = params.get("value")
    SESSIONS[df_id] = df.reset_index(drop=True)
    return _df_payload(SESSIONS[df_id], df_id)
