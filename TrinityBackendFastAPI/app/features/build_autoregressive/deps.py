import os
import pandas as pd
import io
from minio import Minio
import redis
from io import BytesIO
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorCollection
from .config import settings
from fastapi import HTTPException
import logging

logger = logging.getLogger(__name__)

# MinIO config
# Default to the development MinIO service if not explicitly configured
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

# Initialize MinIO client
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

# MongoDB configuration
MONGO_URI = os.getenv(
    "AUTOREG_MONGO_URI",
    os.getenv("MONGO_URI", "mongodb://root:rootpass@mongo:27017/trinity_prod?authSource=admin"),
)

# MongoDB client initialization - lazy loading
client = None
autoregressive_db = None
validator_db = None

def get_mongo_client():
    """Get MongoDB client with lazy initialization."""
    global client, autoregressive_db, validator_db
    
    if client is None:
        try:
            client = AsyncIOMotorClient(MONGO_URI)
            autoregressive_db = client["trinity_prod"]  # Use the database from docker-compose
            validator_db = client["validator_atoms_db"]
        except Exception as e:
            logger.error(f"❌ MongoDB connection failed: {e}")
            client = None
            autoregressive_db = None
            validator_db = None
    
    return client

async def get_column_classifications_collection() -> AsyncIOMotorCollection:
    get_mongo_client()  # Initialize connection if needed
    return validator_db["column_classifications"]

async def fetch_measures_list(
    validator_atom_id: str,
    file_key: str,
    collection: AsyncIOMotorCollection
) -> list:
    document = await collection.find_one({
        "validator_atom_id": validator_atom_id,
        "file_key": file_key
    })

    if not document or "final_classification" not in document:
        raise HTTPException(status_code=404, detail="Final classification not found in MongoDB")

    measures = document["final_classification"].get("measures", [])
    identifiers = document["final_classification"].get("identifiers", [])
    return identifiers, measures

async def get_autoreg_identifiers_list() -> AsyncIOMotorCollection:
    get_mongo_client()  # Initialize connection if needed
    return autoregressive_db["autoreg_identifiers"]

async def fetch_autoreg_identifiers_list(
    validator_atom_id: str,
    file_key: str,
    collection: AsyncIOMotorCollection
) -> list:
    document = await collection.find_one({
        "validator_atom_id": validator_atom_id,
        "file_key": file_key
    })

    if not document or "identifiers" not in document:
        raise HTTPException(status_code=404, detail="Identifiers not found in MongoDB")

    return document["identifiers"]

__all__ = [
    'minio_client',
    'get_minio_df',
    'OBJECT_PREFIX',
    'MINIO_BUCKET',
    'redis_client',
    'get_column_classifications_collection',
    'fetch_measures_list',
    'get_autoreg_identifiers_list',
    'fetch_autoreg_identifiers_list',
]