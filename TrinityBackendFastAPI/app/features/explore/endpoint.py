from fastapi import APIRouter, HTTPException, Query
from urllib.parse import unquote
import os
import redis
from minio import Minio
from minio.error import S3Error

from .service import summarize_dataframe

router = APIRouter(prefix="/explore", tags=["Explore"])

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "admin_dev")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "pass_dev")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "trinity")
REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_DB = int(os.getenv("REDIS_DB", 0))

minio_client = Minio(
    MINIO_ENDPOINT,
    access_key=MINIO_ACCESS_KEY,
    secret_key=MINIO_SECRET_KEY,
    secure=False,
)
redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB)

@router.get("/summary")
async def explore_summary(object_name: str = Query(..., alias="object_name")):
    """Return basic descriptive statistics for a stored dataframe."""
    try:
        key = unquote(object_name)
        data = redis_client.get(key)
        if data is None:
            obj = minio_client.get_object(MINIO_BUCKET, key)
            data = obj.read()
        is_arrow = key.endswith(".arrow")
        result = summarize_dataframe(data, is_arrow=is_arrow)
        return result
    except S3Error as e:
        raise HTTPException(status_code=404, detail=f"Dataframe not found: {e}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
