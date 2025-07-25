import os
from minio import Minio
import pandas as pd
import pyarrow as pa
import pyarrow.ipc as ipc
from minio.error import S3Error
from io import BytesIO
import redis
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorCollection
from fastapi import HTTPException
from typing import Tuple

# MinIO configuration from environment variables
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "admin_dev")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "pass_dev")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "trinity")

# Common prefix for stored objects (client/app/project)
CLIENT_NAME = os.getenv("CLIENT_NAME", "default_client")
APP_NAME = os.getenv("APP_NAME", "default_app")
PROJECT_NAME = os.getenv("PROJECT_NAME", "default_project")
OBJECT_PREFIX = f"{CLIENT_NAME}/{APP_NAME}/{PROJECT_NAME}/"

minio_client = Minio(
    MINIO_ENDPOINT,
    access_key=MINIO_ACCESS_KEY,
    secret_key=MINIO_SECRET_KEY,
    secure=False  # Set to True if using HTTPS
)

def ensure_minio_bucket():
    try:
        if not minio_client.bucket_exists(MINIO_BUCKET):
            minio_client.make_bucket(MINIO_BUCKET)
            print(f"📁 Created MinIO bucket '{MINIO_BUCKET}' for groupby_weighted_avg")
        else:
            print(f"✅ MinIO bucket '{MINIO_BUCKET}' is accessible for groupby_weighted_avg")
    except Exception as e:
        print(f"⚠️ MinIO connection error: {e}")

ensure_minio_bucket()

def get_minio_df(bucket: str, file_key: str) -> pd.DataFrame:
    try:
        response = minio_client.get_object(bucket, file_key)
        content = response.read()
        if file_key.endswith(".csv"):
            df = pd.read_csv(BytesIO(content))
        elif file_key.endswith(".xlsx"):
            df = pd.read_excel(BytesIO(content))
        elif file_key.endswith(".arrow"):
            reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
            df = reader.read_all().to_pandas()
        else:
            raise ValueError("Unsupported file type")
        return df
    except S3Error as e:
        raise RuntimeError(f"MinIO S3 error: {e}")
    except Exception as e:
        raise RuntimeError(f"Failed to fetch file from MinIO: {e}")

# MongoDB async client setup
MONGO_URI = os.getenv("MONGO_URI", "mongodb://mongo:27017/trinity")
MONGO_DB = os.getenv("MONGO_DB", "trinity")
client = AsyncIOMotorClient(MONGO_URI)

# --- MongoDB Dependency Functions ---
async def get_validator_atoms_collection() -> AsyncIOMotorCollection:
    return client["validator_atoms_db"]["business_dimensions_with_assignments"]

async def get_column_classifications_collection() -> AsyncIOMotorCollection:
    return client["validator_atoms_db"]["column_classifications"]

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
    return measures

async def fetch_identifiers_and_measures(
    validator_atom_id: str,
    file_key: str,
    collection: AsyncIOMotorCollection
) -> Tuple[list, list]:
    document = await collection.find_one({
        "validator_atom_id": validator_atom_id,
        "file_key": file_key
    })
    if not document or "final_classification" not in document:
        raise HTTPException(status_code=404, detail="Final classification not found in MongoDB")
    identifiers = document["final_classification"].get("identifiers", [])
    measures = document["final_classification"].get("measures", [])
    return identifiers, measures

async def fetch_dimensions_dict(
    validator_atom_id: str,
    file_key: str,
    collection: AsyncIOMotorCollection
) -> dict:
    document = await collection.find_one({
        "validator_atom_id": validator_atom_id,
        "file_key": file_key
    })
    if not document:
        raise HTTPException(status_code=404, detail="Dimension document not found")
    result = {}
    for dim in document.get("dimensions", []):
        dim_id = dim.get("dimension_id")
        result[dim_id] = dim.get("assigned_identifiers", [])
    return result
