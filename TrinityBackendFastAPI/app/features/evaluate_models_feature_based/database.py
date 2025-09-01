# database.py (evaluate) - align connections with existing atoms
import os
import logging
from functools import lru_cache
from urllib.parse import urlparse

from motor.motor_asyncio import AsyncIOMotorClient
from minio import Minio
import redis

from .config import settings

logger = logging.getLogger(__name__)


def _endpoint(url: str) -> str:
    p = urlparse(url)
    return p.netloc or p.path or url


@lru_cache()
def get_minio() -> Minio:
    endpoint = os.getenv("MINIO_ENDPOINT", settings.minio_url)
    access_key = os.getenv("MINIO_ACCESS_KEY", settings.minio_access_key)
    secret_key = os.getenv("MINIO_SECRET_KEY", settings.minio_secret_key)
    secure_env = os.getenv("MINIO_USE_SSL")
    if secure_env is not None:
        secure = secure_env.lower() == "true"
    else:
        secure = bool(settings.minio_secure)
    return Minio(
        _endpoint(endpoint),
        access_key=access_key,
        secret_key=secret_key,
        secure=secure,
    )


@lru_cache()
def get_mongo() -> AsyncIOMotorClient:
    # Follow common default used by other atoms
    mongo_uri = os.getenv("EVALUATE_MONGO_URI", os.getenv("MONGO_URI", settings.mongo_details))
    return AsyncIOMotorClient(
        mongo_uri,
        serverSelectionTimeoutMS=5000,
        connectTimeoutMS=5000,
        socketTimeoutMS=5000,
        maxPoolSize=10,
    )


@lru_cache()
def get_redis():
    """Return a configured Redis client consistent with other atoms."""
    host = os.getenv("REDIS_HOST", "redis")
    port = int(os.getenv("REDIS_PORT", 6379))
    db = int(os.getenv("REDIS_DB", 0))
    password = os.getenv("REDIS_PASSWORD") or None
    try:
        client = redis.Redis(
            host=host,
            port=port,
            db=db,
            password=password,
            decode_responses=False,
            socket_timeout=5.0,
            socket_connect_timeout=5.0,
            retry_on_timeout=True,
            max_connections=100,
            health_check_interval=30,
        )
        client.ping()
        logger.info(f"Connected to Redis at {host}:{port} (DB: {db})")
        return client
    except Exception as exc:
        logger.warning(f"Failed to connect to Redis at {host}:{port}: {exc}")
        return None


async def get_build_config(client_name: str, app_name: str, project_name: str) -> dict:
    """Fetch coefficients/configs for evaluate from Mongo in line with other atoms."""
    m = get_mongo()
    db = m["trinity_prod"]
    _id = f"{client_name}/{app_name}/{project_name}"
    doc = await db["build-model_featurebased_configs"].find_one({"_id": _id})
    if not doc:
        raise RuntimeError(f"No build configuration for {_id}")
    return doc