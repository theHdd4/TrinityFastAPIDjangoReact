from fastapi import APIRouter, Response, Body, HTTPException, UploadFile, File
import os
from minio import Minio
from minio.error import S3Error
from urllib.parse import unquote
import polars as pl
import numba as nb
import io
import uuid
from typing import Dict, Any, List
from app.DataStorageRetrieval.arrow_client import download_table_bytes
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
SESSIONS: Dict[str, pl.DataFrame] = {}


def _get_df(df_id: str) -> pl.DataFrame:
    df = SESSIONS.get(df_id)
    if df is None:
        raise HTTPException(status_code=404, detail="DataFrame not found")
    return df


def _df_payload(df: pl.DataFrame, df_id: str) -> Dict[str, Any]:
    """Serialize the entire dataframe for the frontend using Polars."""

    return {
        "df_id": df_id,
        "headers": df.columns,
        "rows": df.to_dicts(),
        "types": {col: str(dtype) for col, dtype in zip(df.columns, df.dtypes)},
        "row_count": df.height,
        "column_count": df.width,
    }


def _fetch_df_from_object(object_name: str) -> pl.DataFrame:
    """Fetch a DataFrame from the Flight server or MinIO given an object key."""
    object_name = unquote(object_name)
    if not object_name.endswith(".arrow"):
        raise HTTPException(
            status_code=400, detail="Only .arrow objects are supported"
        )
    try:
        data = download_table_bytes(object_name)
        return pl.read_ipc(io.BytesIO(data))
    except Exception:
        raise HTTPException(status_code=404, detail="Not Found")

@router.get("/test_alive")
async def test_alive():
    return {"status": "alive"}

@router.get("/cached_dataframe")
async def cached_dataframe(object_name: str):
    df = _fetch_df_from_object(object_name)
    buf = io.StringIO()
    df.write_csv(buf)
    return Response(content=buf.getvalue(), media_type="text/csv")


@router.post("/load_cached")
async def load_cached_dataframe(object_name: str = Body(..., embed=True)):
    """Load a cached dataframe by object key and create a session."""
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
        df = pl.read_csv(io.StringIO(csv_data))

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
        arrow_buffer = io.BytesIO()
        df.write_ipc(arrow_buffer)
        arrow_bytes = arrow_buffer.getvalue()
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
        df = pl.read_csv(io.BytesIO(content))
    except Exception:
        raise HTTPException(status_code=400, detail="Failed to parse uploaded file")
    df_id = str(uuid.uuid4())
    SESSIONS[df_id] = df
    return _df_payload(df, df_id)


@router.post("/filter_rows")
async def filter_rows(df_id: str = Body(...), column: str = Body(...), value: Any = Body(...)):
    df = _get_df(df_id)
    try:
        if isinstance(value, dict):
            min_v = value.get("min")
            max_v = value.get("max")
            df = df.filter(pl.col(column).is_between(min_v, max_v))
        elif isinstance(value, list):
            df = df.filter(pl.col(column).is_in(value))
        else:
            df = df.filter(pl.col(column) == value)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    return result


@router.post("/sort")
async def sort_dataframe(df_id: str = Body(...), column: str = Body(...), direction: str = Body("asc")):
    df = _get_df(df_id)
    try:
        df = df.sort(column, descending=direction != "asc")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    return result


@router.post("/insert_row")
async def insert_row(
    df_id: str = Body(...),
    index: int = Body(...),
    direction: str = Body("below"),
):
    df = _get_df(df_id)
    empty = {col: None for col in df.columns}
    insert_at = index if direction == "above" else index + 1
    insert_at = max(0, min(insert_at, df.height))
    upper = df.slice(0, insert_at)
    lower = df.slice(insert_at, df.height - insert_at)
    df = pl.concat([upper, pl.DataFrame([empty], schema=df.schema), lower])
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    return result


@router.post("/delete_row")
async def delete_row(df_id: str = Body(...), index: int = Body(...)):
    df = _get_df(df_id)
    try:
        df = df.with_row_count().filter(pl.col("row_nr") != index).drop("row_nr")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    return result


@router.post("/insert_column")
async def insert_column(
    df_id: str = Body(...),
    index: int = Body(...),
    name: str = Body(...),
    default: Any = Body(None),
):
    df = _get_df(df_id)
    if index >= len(df.columns):
        df = df.with_columns(pl.lit(default).alias(name))
    else:
        df = df.with_columns(pl.lit(default).alias(name))
        cols = df.columns
        cols.remove(name)
        cols.insert(index, name)
        df = df.select(cols)
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    return result


@router.post("/delete_column")
async def delete_column(df_id: str = Body(...), name: str = Body(...)):
    df = _get_df(df_id)
    try:
        df = df.drop(name)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    return result


@router.post("/edit_cell")
async def edit_cell(df_id: str = Body(...), row: int = Body(...), column: str = Body(...), value: Any = Body(...)):
    df = _get_df(df_id)
    try:
        df = df.with_row_count().with_columns(
            pl.when(pl.col("row_nr") == row)
            .then(pl.lit(value))
            .otherwise(pl.col(column))
            .alias(column)
        ).drop("row_nr")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    return result


@router.post("/apply_udf")
async def apply_udf(
    df_id: str = Body(...),
    column: str = Body(...),
    udf_code: str = Body(...),
    new_column: str | None = Body(None),
):
    """Apply a custom scalar UDF using Polars with a Numba-compiled function."""
    df = _get_df(df_id)
    try:
        local_ns: Dict[str, Any] = {}
        exec("def _udf(x):\n    return " + udf_code, {}, local_ns)
        udf = nb.njit(local_ns["_udf"])  # type: ignore[arg-type]
        target = new_column or column
        df = df.with_columns(pl.col(column).apply(udf).alias(target))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    SESSIONS[df_id] = df
    return _df_payload(df, df_id)


@router.post("/rename_column")
async def rename_column(df_id: str = Body(...), old_name: str = Body(...), new_name: str = Body(...)):
    df = _get_df(df_id)
    df = df.rename({old_name: new_name})
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    return result


@router.post("/duplicate_row")
async def duplicate_row(df_id: str = Body(...), index: int = Body(...)):
    df = _get_df(df_id)
    try:
        row = df.slice(index, 1)
        df = pl.concat([df.slice(0, index), row, df.slice(index, df.height - index)])
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    return result


@router.post("/duplicate_column")
async def duplicate_column(df_id: str = Body(...), name: str = Body(...), new_name: str = Body(...)):
    df = _get_df(df_id)
    try:
        idx = df.columns.index(name)
        df = df.with_columns(pl.col(name).alias(new_name))
        cols = df.columns
        cols.remove(new_name)
        cols.insert(idx, new_name)
        df = df.select(cols)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    return result


@router.post("/move_column")
async def move_column(df_id: str = Body(...), from_col: str = Body(..., alias="from"), to_index: int = Body(...)):
    df = _get_df(df_id)
    try:
        cols = df.columns
        cols.remove(from_col)
        cols.insert(to_index, from_col)
        df = df.select(cols)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    return result


@router.post("/retype_column")
async def retype_column(df_id: str = Body(...), name: str = Body(...), new_type: str = Body(...)):
    df = _get_df(df_id)
    try:
        if new_type == "number":
            df = df.with_columns(pl.col(name).cast(pl.Float64, strict=False))
        elif new_type in ["string", "text"]:
            df = df.with_columns(pl.col(name).cast(pl.Utf8))
        else:
            df = df.with_columns(pl.col(name).cast(pl.Utf8))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    return result


@router.get("/preview")
async def preview(df_id: str, n: int = 5):
    df = _get_df(df_id)
    preview_df = df.head(n)
    return {
        "df_id": df_id,
        "headers": df.columns,
        "rows": preview_df.to_dicts(),
    }


@router.get("/info")
async def info(df_id: str):
    df = _get_df(df_id)
    return {
        "df_id": df_id,
        "row_count": df.height,
        "column_count": df.width,
        "types": {col: str(dtype) for col, dtype in zip(df.columns, df.dtypes)},
    }


@router.post("/ai/execute_operations")
async def ai_execute(df_id: str = Body(...), operations: List[Dict[str, Any]] = Body(...)):
    df = _get_df(df_id)
    for op in operations:
        name = op.get("op")
        params = op.get("params", {})
        if name == "filter_rows":
            df = df.filter(pl.col(params.get("column")) == params.get("value"))
        elif name == "sort":
            df = df.sort(params.get("column"), descending=params.get("direction", "asc") != "asc")
        elif name == "insert_column":
            idx = params.get("index", len(df.columns))
            df = df.with_columns(pl.lit(params.get("default")).alias(params.get("name")))
            cols = df.columns
            cols.remove(params.get("name"))
            cols.insert(idx, params.get("name"))
            df = df.select(cols)
        elif name == "delete_row":
            df = df.with_row_count().filter(pl.col("row_nr") != params.get("index")).drop("row_nr")
        elif name == "edit_cell":
            df = df.with_row_count().with_columns(
                pl.when(pl.col("row_nr") == params.get("row"))
                .then(pl.lit(params.get("value")))
                .otherwise(pl.col(params.get("column")))
                .alias(params.get("column"))
            ).drop("row_nr")
    SESSIONS[df_id] = df
    return _df_payload(SESSIONS[df_id], df_id)
