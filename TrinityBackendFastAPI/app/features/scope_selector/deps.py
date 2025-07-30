"""Dependency injection for scope_selector feature."""
import logging
try:
    from motor.motor_asyncio import (
        AsyncIOMotorClient,
        AsyncIOMotorCollection,
        AsyncIOMotorDatabase,
    )
except ImportError:  # tests provide a stub without AsyncIOMotorDatabase
    from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorCollection

    class AsyncIOMotorDatabase:  # type: ignore
        """Fallback type used only for testing."""
        pass
import os
import redis
from redis import Redis
from minio import Minio
from typing import AsyncGenerator, Optional, Any

from .config import settings

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# MongoDB Connection
MONGO_URI = os.getenv(
    "SCOPE_SELECTOR_MONGO_URI",
    os.getenv("MONGO_URI", "mongodb://mongo:27017/trinity")
)

# Initialize MongoDB client
mongo_client: AsyncIOMotorClient = AsyncIOMotorClient(MONGO_URI)
db = mongo_client[settings.mongo_source_database]

# Initialize Redis client
REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
redis_db = int(os.getenv("REDIS_DB", "0"))

# Initialize Redis client with type hint
redis_client: Redis = redis.Redis(
    host=REDIS_HOST,
    port=REDIS_PORT,
    db=redis_db,
    decode_responses=False,
    socket_connect_timeout=5,
    socket_timeout=5,
    retry_on_timeout=True
)

# Initialize MinIO client
minio_client: Minio = Minio(
    endpoint=settings.minio_endpoint,
    access_key=settings.minio_access_key,
    secret_key=settings.minio_secret_key,
    secure=settings.minio_use_ssl,
    region=settings.minio_region
)

# Ensure MinIO bucket exists if API supports it
try:
    if hasattr(minio_client, "bucket_exists") and not minio_client.bucket_exists(
        settings.minio_bucket
    ):
        minio_client.make_bucket(
            bucket_name=settings.minio_bucket,
            location=settings.minio_region,
        )
        logger.info(f"Created MinIO bucket: {settings.minio_bucket}")
    logger.info(f"MinIO bucket '{settings.minio_bucket}' is ready")
except Exception as e:
    logger.error(f"Error initializing MinIO bucket: {e}")
    raise


def get_mongo_client() -> AsyncIOMotorClient:
    """Get MongoDB client instance."""
    return mongo_client


def get_redis_client() -> Redis:
    """Get Redis client instance."""
    return redis_client


def get_minio_client() -> Minio:
    """Get MinIO client instance and ensure bucket exists."""
    global minio_client
    if minio_client is None:
        try:
            # Initialize MinIO client
            minio_client = Minio(
                settings.minio_endpoint,
                access_key=settings.minio_access_key,
                secret_key=settings.minio_secret_key,
                secure=settings.minio_use_ssl,
                region=settings.minio_region
            )
            
            # Test connection
            if hasattr(minio_client, "bucket_exists") and not minio_client.bucket_exists(
                settings.minio_bucket
            ):
                try:
                    minio_client.make_bucket(
                        bucket_name=settings.minio_bucket,
                        location=settings.minio_region,
                    )
                    logger.info(
                        f"Created MinIO bucket: {settings.minio_bucket} in region {settings.minio_region}"
                    )
                except Exception as e:
                    logger.warning(
                        f"Could not create bucket {settings.minio_bucket}: {str(e)}"
                    )
                    # Continue even if bucket creation fails - it might already exist
                    
            # Verify we can list objects
            minio_client.list_objects(settings.minio_bucket, max_keys=1)
            logger.info(f"Successfully connected to MinIO bucket: {settings.minio_bucket}")
            
        except Exception as e:
            logger.error(f"Error initializing MinIO client: {str(e)}")
            minio_client = None  # Reset client to allow retry
            raise
            
    return minio_client


async def get_validator_atoms_collection() -> AsyncGenerator[AsyncIOMotorCollection, None]:
    """Get MongoDB collection for validator atoms."""
    client = get_mongo_client()
    db: AsyncIOMotorDatabase = client[settings.mongo_source_database]
    yield db[settings.mongo_column_classifications_collection]


async def get_scopes_collection() -> AsyncGenerator[AsyncIOMotorCollection, None]:
    """Get MongoDB collection for scopes."""
    client = get_mongo_client()
    db: AsyncIOMotorDatabase = client[settings.mongo_scope_database]
    yield db[settings.mongo_scopes_collection]


async def get_processing_jobs_collection() -> AsyncGenerator[AsyncIOMotorCollection, None]:
    """Get MongoDB collection for processing jobs."""
    client = get_mongo_client()
    db: AsyncIOMotorDatabase = client[settings.mongo_scope_database]
    yield db[settings.mongo_processing_jobs_collection]
