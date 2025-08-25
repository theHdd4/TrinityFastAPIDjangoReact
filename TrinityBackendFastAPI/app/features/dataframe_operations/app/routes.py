from fastapi import APIRouter, Response, Body, HTTPException, UploadFile, File
import os
from minio import Minio
from minio.error import S3Error
from urllib.parse import unquote
import redis
import pyarrow as pa
import pyarrow.ipc as ipc
import pandas as pd
import io
import uuid
from typing import Dict, Any, List

router = APIRouter()

# Self-contained MinIO/Redis config (match feature-overview)
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "admin_dev")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "pass_dev")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "trinity")
CLIENT_NAME = os.getenv("CLIENT_NAME", "default_client")
APP_NAME = os.getenv("APP_NAME", "default_app")
PROJECT_NAME = os.getenv("PROJECT_NAME", "default_project")
OBJECT_PREFIX = f"{CLIENT_NAME}/{APP_NAME}/{PROJECT_NAME}/"
REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_DB = int(os.getenv("REDIS_DB", 0))

minio_client = Minio(
    MINIO_ENDPOINT,
    access_key=MINIO_ACCESS_KEY,
    secret_key=MINIO_SECRET_KEY,
    secure=False
)
redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB)

# In-memory storage for dataframe sessions
SESSIONS: Dict[str, pd.DataFrame] = {}


def _get_df(df_id: str) -> pd.DataFrame:
    df = SESSIONS.get(df_id)
    if df is None:
        raise HTTPException(status_code=404, detail="DataFrame not found")
    return df


def _df_payload(df: pd.DataFrame, df_id: str) -> Dict[str, Any]:
    return {
        "df_id": df_id,
        "headers": list(df.columns),
        "rows": df.head(100).to_dict(orient="records"),
        "types": {col: str(df[col].dtype) for col in df.columns},
        "row_count": len(df),
        "column_count": len(df.columns),
    }

@router.get("/test_alive")
async def test_alive():
    print("[DFOPS] test_alive endpoint hit")
    return {"status": "alive"}

@router.get("/cached_dataframe")
async def cached_dataframe(object_name: str):
    print("[DFOPS] --- /cached_dataframe called ---")
    object_name = unquote(object_name)
    print(f"[DFOPS] object_name received: {object_name}")
    print(f"[DFOPS] ENV: MINIO_ENDPOINT={MINIO_ENDPOINT}, MINIO_ACCESS_KEY={MINIO_ACCESS_KEY}, MINIO_SECRET_KEY={MINIO_SECRET_KEY}, MINIO_BUCKET={MINIO_BUCKET}")
    print(f"[DFOPS] ENV: CLIENT_NAME={CLIENT_NAME}, APP_NAME={APP_NAME}, PROJECT_NAME={PROJECT_NAME}, OBJECT_PREFIX={OBJECT_PREFIX}")
    print(f"[DFOPS] Will fetch: bucket={MINIO_BUCKET}, object_name={object_name}")
    # For now, accept any object_name that ends with .arrow or .csv
    # This allows flexibility while the environment variables are being set up
    if not (object_name.endswith('.arrow') or object_name.endswith('.csv')):
        print(f"[DFOPS] object_name does not end with .arrow or .csv: {object_name}")
        return Response(content='{"detail": "Invalid object_name format"}', status_code=400, media_type="application/json")
    # Try Redis first
    try:
        redis_bytes = redis_client.get(object_name)
        if redis_bytes:
            print("[DFOPS] Found in Redis")
            if object_name.endswith('.arrow'):
                reader = ipc.open_file(pa.BufferReader(redis_bytes))
                table = reader.read_all()
                df = table.to_pandas()
            else:
                df = pd.read_csv(io.BytesIO(redis_bytes))
            return Response(content=df.to_csv(index=False), media_type="text/csv")
        else:
            print("[DFOPS] Not found in Redis, trying MinIO")
    except Exception as e:
        print(f"[DFOPS] Redis error: {e}")
    # Try MinIO
    try:
        obj = minio_client.get_object(MINIO_BUCKET, object_name)
        data = obj.read()
        if object_name.endswith('.arrow'):
            reader = ipc.open_file(pa.BufferReader(data))
            table = reader.read_all()
            df = table.to_pandas()
        else:
            df = pd.read_csv(io.BytesIO(data))
        print("[DFOPS] Found in MinIO")
        return Response(content=df.to_csv(index=False), media_type="text/csv")
    except S3Error as e:
        print(f"[DFOPS] MinIO S3Error: {e}")
        return Response(content='{"detail": "Not Found"}', status_code=404, media_type="application/json")
    except Exception as e:
        print(f"[DFOPS] MinIO error: {e}")
        return Response(content='{"detail": "Internal Server Error"}', status_code=500, media_type="application/json")

@router.post("/save")
async def save_dataframe(
    csv_data: str = Body(..., embed=True),
    filename: str = Body(..., embed=True)
):
    """
    Save a dataframe (CSV) to MinIO as Arrow file and return file info.
    """
    try:
        df = pd.read_csv(io.StringIO(csv_data))
        if not filename:
            df_id = str(uuid.uuid4())[:8]
            filename = f"{df_id}_dataframe_ops.arrow"
        if not filename.endswith('.arrow'):
            filename += '.arrow'
        if not filename.startswith(OBJECT_PREFIX):
            filename = OBJECT_PREFIX + filename
        table = pa.Table.from_pandas(df)
        arrow_buffer = pa.BufferOutputStream()
        with ipc.new_file(arrow_buffer, table.schema) as writer:
            writer.write_table(table)
        arrow_bytes = arrow_buffer.getvalue().to_pybytes()
        minio_client.put_object(
            MINIO_BUCKET,
            filename,
            data=io.BytesIO(arrow_bytes),
            length=len(arrow_bytes),
            content_type="application/octet-stream",
        )
        redis_client.setex(filename, 3600, arrow_bytes)
        return {
            "result_file": filename,
            "shape": df.shape,
            "columns": list(df.columns),
            "message": "DataFrame saved successfully"
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
    df = _get_df(df_id)
    try:
        df = df[df[column] == value]
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    SESSIONS[df_id] = df
    return _df_payload(df, df_id)


@router.post("/sort")
async def sort_dataframe(df_id: str = Body(...), column: str = Body(...), direction: str = Body("asc")):
    df = _get_df(df_id)
    try:
        df = df.sort_values(by=column, ascending=direction == "asc").reset_index(drop=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    SESSIONS[df_id] = df
    return _df_payload(df, df_id)


@router.post("/insert_row")
async def insert_row(
    df_id: str = Body(...),
    row: Dict[str, Any] = Body(...),
    index: int | None = Body(None),
):
    df = _get_df(df_id)
    new_row = pd.DataFrame([row], columns=df.columns)
    if index is None or index >= len(df):
        df = pd.concat([df, new_row], ignore_index=True)
    else:
        upper = df.iloc[:index]
        lower = df.iloc[index:]
        df = pd.concat([upper, new_row, lower], ignore_index=True)
    SESSIONS[df_id] = df
    return _df_payload(df, df_id)


@router.post("/delete_row")
async def delete_row(df_id: str = Body(...), index: int = Body(...)):
    df = _get_df(df_id)
    try:
        df = df.drop(index).reset_index(drop=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    SESSIONS[df_id] = df
    return _df_payload(df, df_id)


@router.post("/insert_column")
async def insert_column(
    df_id: str = Body(...),
    column: str = Body(...),
    value: Any = Body(None),
    index: int | None = Body(None),
):
    df = _get_df(df_id)
    if index is None or index >= len(df.columns):
        df[column] = value
    else:
        df.insert(index, column, value)
    SESSIONS[df_id] = df
    return _df_payload(df, df_id)


@router.post("/delete_column")
async def delete_column(df_id: str = Body(...), column: str = Body(...)):
    df = _get_df(df_id)
    try:
        df = df.drop(columns=[column])
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    SESSIONS[df_id] = df
    return _df_payload(df, df_id)


@router.post("/update_cell")
async def update_cell(df_id: str = Body(...), row_idx: int = Body(...), column: str = Body(...), value: Any = Body(...)):
    df = _get_df(df_id)
    try:
        df.at[row_idx, column] = value
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    SESSIONS[df_id] = df
    return _df_payload(df, df_id)


@router.post("/rename_column")
async def rename_column(df_id: str = Body(...), old: str = Body(...), new: str = Body(...)):
    df = _get_df(df_id)
    df = df.rename(columns={old: new})
    SESSIONS[df_id] = df
    return _df_payload(df, df_id)


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
            df[params.get("column")] = params.get("value")
        elif name == "delete_row":
            df = df.drop(params.get("index")).reset_index(drop=True)
        elif name == "update_cell":
            df.at[params.get("row_idx"), params.get("column")] = params.get("value")
    SESSIONS[df_id] = df.reset_index(drop=True)
    return _df_payload(SESSIONS[df_id], df_id)
