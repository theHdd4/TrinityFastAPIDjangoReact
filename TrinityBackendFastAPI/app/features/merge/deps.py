import os
import pandas as pd
import io
from minio import Minio
import redis
from io import BytesIO

# MinIO config
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "admin_dev")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "pass_dev")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "trinity")
MINIO_SECURE = os.getenv("MINIO_SECURE", "false").lower() == "true"

USER_ID = int(os.getenv("USER_ID", "0"))
PROJECT_ID = int(os.getenv("PROJECT_ID", "0"))
CLIENT_NAME = os.getenv("CLIENT_NAME", "default_client")
APP_NAME = os.getenv("APP_NAME", "default_app")
PROJECT_NAME = os.getenv("PROJECT_NAME", "default_project")

# Redis config
REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=False)

OBJECT_PREFIX = f"{CLIENT_NAME}/{APP_NAME}/{PROJECT_NAME}/"

minio_client = Minio(
    MINIO_ENDPOINT,
    access_key=MINIO_ACCESS_KEY,
    secret_key=MINIO_SECRET_KEY,
    secure=MINIO_SECURE
)

def get_minio_df(bucket: str, file_key: str) -> pd.DataFrame:
    response = minio_client.get_object(bucket, file_key)
    content = response.read()
    if file_key.endswith(".csv"):
        df = pd.read_csv(BytesIO(content))
    elif file_key.endswith(".xlsx"):
        df = pd.read_excel(BytesIO(content))
    elif file_key.endswith(".arrow"):
        import pyarrow as pa
        import pyarrow.ipc as ipc
        reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
        df = reader.read_all().to_pandas()
    else:
        raise ValueError("Unsupported file type")
    return df

__all__ = [
    'minio_client',
    'get_minio_df',
    'OBJECT_PREFIX',
    'MINIO_BUCKET',
    'redis_client',
]

