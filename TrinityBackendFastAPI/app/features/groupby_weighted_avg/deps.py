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

# -------- Runtime object prefix helper (client/app/project) --------

def _current_names() -> tuple[str, str, str]:
    """Return current (client, app, project) names from env vars."""
    return (
        os.getenv("CLIENT_NAME", "default_client"),
        os.getenv("APP_NAME", "default_app"),
        os.getenv("PROJECT_NAME", "default_project"),
    )

def _object_prefix() -> str:
    """Return the current `<client>/<app>/<project>/` prefix **from environment vars**.

    Environment variables may change during the lifetime of the FastAPI process
    (e.g. set per-request by a middleware). Therefore we must build the prefix
    at *call time*, not import time.
    """
    client = os.getenv("CLIENT_NAME", "default_client")
    app = os.getenv("APP_NAME", "default_app")
    project = os.getenv("PROJECT_NAME", "default_project")
    return f"{client}/{app}/{project}/"

# ------------------------
# Redis configuration
# ------------------------
REDIS_HOST = os.getenv("REDIS_HOST", "redis")
# decode_responses=True to get str directly
redis_client = redis.Redis(host=REDIS_HOST, port=6379, decode_responses=True)

# Helper: fetch column-classifier-config JSON from Redis

def redis_classifier_config() -> dict | None:
    """Retrieve and decode the column-classifier-config JSON from Redis.

    Returns a parsed dict or None if key missing/invalid.
    """
    key = f"{_object_prefix()}column_classifier_config"
    try:
        data_str = redis_client.get(key)
        print(f"🔍 redis_classifier_config GET {key} => {'hit' if data_str else 'miss'}")
        if not data_str:
            return None
        import json
        cfg = json.loads(data_str)
        return cfg if isinstance(cfg, dict) else None
    except Exception as err:
        print(f"⚠️ redis_classifier_config error: {err}")
        return None

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
    collection: AsyncIOMotorCollection,
) -> list:
    """Return **measures** list with direct MongoDB fetch."""

    # COMMENTED OUT: 1️⃣  Redis fast-path
    # cfg = redis_classifier_config()
    # if cfg and isinstance(cfg.get("measures"), list):
    #     return cfg["measures"]

    # DIRECT: 2️⃣  MongoDB classifier_configs (persistent source) - with file-specific lookup
    try:
        from app.features.column_classifier.database import get_classifier_config_from_mongo
        client_name, app_name, project_name = _current_names()
        # Use the complete file_key path for file-specific lookup
        mongo_cfg: dict | None = get_classifier_config_from_mongo(client_name, app_name, project_name, file_key)
        print(f"🔍 Direct MongoDB fetch_measures_list result (file_key={file_key}): {mongo_cfg}")
        if mongo_cfg and isinstance(mongo_cfg.get("measures"), list):
            # COMMENTED OUT: Cache back to Redis for 1 h
            # try:
            #     import json
            #     key = f"{client_name}/{app_name}/{project_name}/column_classifier_config"
            #     redis_client.setex(key, 3600, json.dumps(mongo_cfg, default=str))
            # except Exception as exc:
            #     print(f"⚠️ Redis setex in fetch_measures_list: {exc}")
            return mongo_cfg["measures"]
    except Exception as exc:
        print(f"⚠️ Mongo classifier config lookup failed: {exc}")

    # 3️⃣  Legacy per-file fallback
    document = await collection.find_one({"validator_atom_id": validator_atom_id, "file_key": file_key})
    if not document or "final_classification" not in document:
        raise HTTPException(status_code=404, detail="Final classification not found in MongoDB or Redis")
    return document["final_classification"].get("measures", [])

async def fetch_identifiers_and_measures(
    validator_atom_id: str,
    file_key: str,
    collection: AsyncIOMotorCollection,
) -> Tuple[list, list]:
    """Return identifiers & measures using direct MongoDB fetch strategy with filtering."""

    # COMMENTED OUT: 1️⃣  Redis cache
    # cfg = redis_classifier_config()
    # if cfg and isinstance(cfg.get("identifiers"), list) and isinstance(cfg.get("measures"), list):
    #     identifiers = cfg["identifiers"]
    #     measures = cfg["measures"]
    # else:

    # DIRECT: 2️⃣  MongoDB classifier_configs - with file-specific lookup
    try:
        from app.features.column_classifier.database import get_classifier_config_from_mongo
        client_name, app_name, project_name = _current_names()
        # Use the complete file_key path for file-specific lookup
        mongo_cfg: dict | None = get_classifier_config_from_mongo(client_name, app_name, project_name, file_key)
        print(f"🔍 Direct MongoDB fetch_identifiers_and_measures result (file_key={file_key}): {mongo_cfg}")
        if mongo_cfg and isinstance(mongo_cfg.get("identifiers"), list) and isinstance(mongo_cfg.get("measures"), list):
            identifiers = mongo_cfg["identifiers"]
            measures = mongo_cfg["measures"]
            # COMMENTED OUT: Write back to Redis
            # try:
            #     import json
            #     key = f"{client_name}/{app_name}/{project_name}/column_classifier_config"
            #     redis_client.setex(key, 3600, json.dumps(mongo_cfg, default=str))
            # except Exception as exc:
            #     print(f"⚠️ Redis setex in fetch_identifiers_and_measures: {exc}")
        else:
            raise ValueError("config not found in Mongo")
    except Exception as exc:
        print(f"⚠️ MongoDB fetch failed, trying legacy collection: {exc}")
        # 3️⃣  Legacy collection fallback
        document = await collection.find_one({"validator_atom_id": validator_atom_id, "file_key": file_key})
        if not document or "final_classification" not in document:
            raise HTTPException(status_code=404, detail="Final classification not found in MongoDB or Redis")
        identifiers = document["final_classification"].get("identifiers", [])
        measures = document["final_classification"].get("measures", [])

    # # Strip common time keywords
    # time_keywords = {"date", "time", "month", "months", "week", "weeks", "year"}
    # identifiers = [i for i in identifiers if i and i.lower() not in time_keywords]

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
