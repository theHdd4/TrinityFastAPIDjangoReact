# database.py (minimal for EVALUATE)
import os
from functools import lru_cache
from motor.motor_asyncio import AsyncIOMotorClient
from minio import Minio
from .config import settings
from urllib.parse import urlparse

def _endpoint(url: str) -> str:
    p = urlparse(url)
    return p.netloc or p.path or url

@lru_cache()
def get_minio() -> Minio:
    return Minio(
        _endpoint(settings.minio_url),
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_secure,
    )

@lru_cache()
def get_mongo() -> AsyncIOMotorClient:
    return AsyncIOMotorClient(os.getenv("MONGO_URI", "mongodb://localhost:27017"))

async def get_build_config(client_name: str, app_name: str, project_name: str) -> dict:
    """
    Reads coefficients/configs for evaluate.
    Adjust DB/collection names if yours differ.
    """
    m = get_mongo()
    db = m["trinity_prod"]
    _id = f"{client_name}/{app_name}/{project_name}"
    doc = await db["build-model_featurebased_configs"].find_one({"_id": _id})
    if not doc:
        raise RuntimeError(f"No build configuration for {_id}")
    return doc
