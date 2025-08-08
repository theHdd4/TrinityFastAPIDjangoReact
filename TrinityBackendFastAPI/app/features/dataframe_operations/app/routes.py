from fastapi import APIRouter, Response, Body, HTTPException
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
