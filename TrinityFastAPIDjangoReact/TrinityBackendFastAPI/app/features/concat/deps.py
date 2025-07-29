import os
import pandas as pd
import io
from minio import Minio
from motor.motor_asyncio import AsyncIOMotorClient
from app.DataStorageRetrieval.db import fetch_client_app_project
from app.DataStorageRetrieval.arrow_client import download_dataframe
import asyncio
import redis  # <-- Add Redis import

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

# Redis configuration
REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_DB = int(os.getenv("REDIS_DB", 0))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD")

# Initialize Redis client with connection pooling and timeouts
redis_client = None
try:
    redis_client = redis.Redis(
        host=REDIS_HOST,
        port=REDIS_PORT,
        db=REDIS_DB,
        password=REDIS_PASSWORD or None,
        decode_responses=False,  # Keep as bytes for binary data
        socket_timeout=5.0,      # 5 second timeout
        socket_connect_timeout=5.0,
        retry_on_timeout=True,
        max_connections=100,
        health_check_interval=30  # Check connection every 30 seconds
    )
    # Test the connection
    redis_client.ping()
    print(f"✅ Connected to Redis at {REDIS_HOST}:{REDIS_PORT} (DB: {REDIS_DB})")
except Exception as e:
    print(f"⚠️ Failed to connect to Redis at {REDIS_HOST}:{REDIS_PORT}: {e}")
    print("⚠️ Some features may be limited without Redis.")
    redis_client = None


def load_names_from_db() -> None:
    global CLIENT_NAME, APP_NAME, PROJECT_NAME
    if USER_ID and PROJECT_ID:
        try:
            CLIENT_NAME_DB, APP_NAME_DB, PROJECT_NAME_DB = asyncio.run(
                fetch_client_app_project(USER_ID, PROJECT_ID)
            )
            CLIENT_NAME = CLIENT_NAME_DB or CLIENT_NAME
            APP_NAME = APP_NAME_DB or APP_NAME
            PROJECT_NAME = PROJECT_NAME_DB or PROJECT_NAME
        except Exception as exc:
            print(f"⚠️ Failed to load names from DB: {exc}")

load_names_from_db()

OBJECT_PREFIX = f"{CLIENT_NAME}/{APP_NAME}/{PROJECT_NAME}/"

# Initialize MinIO client
minio_client = Minio(
    MINIO_ENDPOINT,
    access_key=MINIO_ACCESS_KEY,
    secret_key=MINIO_SECRET_KEY,
    secure=MINIO_SECURE
)

def ensure_minio_bucket():
    try:
        # Check if bucket exists, create if it doesn't
        if not minio_client.bucket_exists(MINIO_BUCKET):
            try:
                minio_client.make_bucket(MINIO_BUCKET)
                print(f"✅ Created MinIO bucket: {MINIO_BUCKET}")
            except Exception as e:
                print(f"⚠️ Failed to create MinIO bucket {MINIO_BUCKET}: {e}")
                raise
        else:
            print(f"✅ MinIO bucket '{MINIO_BUCKET}' is accessible for concat")
    except Exception as e:
        print(f"⚠️ MinIO connection error: {e}")

ensure_minio_bucket()

# MongoDB configuration
_USE_MONGO = os.getenv("CONCAT_USE_MONGO", "false").lower() == "true"
mongo_client = None
concat_db = None

if _USE_MONGO:
    MONGO_URI = os.getenv("MONGO_URI")
    MONGO_DB = os.getenv("MONGO_DB", "trinity")
    
    if not MONGO_URI:
        print("⚠️ CONCAT_USE_MONGO is true but MONGO_URI is not set. MongoDB features will be disabled.")
    else:
        try:
            print(f"🔌 Attempting to connect to MongoDB at {MONGO_URI}...")
            mongo_client = AsyncIOMotorClient(
                MONGO_URI,
                serverSelectionTimeoutMS=5000,  # 5 second timeout
                connectTimeoutMS=30000,         # 30 second connection timeout
                socketTimeoutMS=None,           # No timeout for operations
                connect=False,                  # Lazy connect
                maxPoolSize=100,                # Maximum number of connections
                minPoolSize=1,                  # Minimum number of connections
                maxIdleTimeMS=60000,            # Close idle connections after 1 minute
                retryWrites=True,               # Automatically retry write operations
                retryReads=True                 # Automatically retry read operations
            )
            
            # Force connection on initialization to verify it works
            loop = asyncio.get_event_loop()
            loop.run_until_complete(mongo_client.admin.command('ping'))
            
            concat_db = mongo_client[MONGO_DB]
            print(f"✅ Connected to MongoDB: {MONGO_URI} (DB: {MONGO_DB})")
            
        except Exception as exc:
            print(f"⚠️ Failed to connect to MongoDB: {exc}")
            print("⚠️ Continuing without MongoDB. Some features may be limited.")
            mongo_client = None
            concat_db = None

def get_concat_results_collection():
    """Return MongoDB collection if Mongo is configured, else None."""
    if concat_db is not None:
        return concat_db[os.getenv("CONCAT_RESULTS_COLLECTION", "concat_results")]
    return None

def load_dataframe(object_name: str) -> pd.DataFrame:
    """
    Try to load a dataframe using Arrow Flight first, then fallback to Redis, then MinIO.
    Expects object_name to include OBJECT_PREFIX.
    """
    # Try Redis cache first
    content = redis_client.get(object_name)
    if content is not None:
        print(f"✅ Loaded {object_name} from Redis cache.")
        if object_name.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        elif object_name.endswith((".xls", ".xlsx")):
            df = pd.read_excel(io.BytesIO(content))
        elif object_name.endswith(".arrow"):
            import pyarrow as pa
            import pyarrow.ipc as ipc
            reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
            df = reader.read_all().to_pandas()
        else:
            raise ValueError(f"Unsupported file format: {object_name}")
        df.columns = df.columns.str.lower()
        return df
    # Try Arrow Flight
    try:
        df = download_dataframe(object_name)
        return df
    except Exception as e:
        print(f"⚠️ Arrow Flight download failed for {object_name}: {e}, falling back to MinIO.")
        response = minio_client.get_object(MINIO_BUCKET, object_name)
        content = response.read()
        # Cache in Redis for 1 hour
        redis_client.setex(object_name, 3600, content)
        if object_name.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        elif object_name.endswith((".xls", ".xlsx")):
            df = pd.read_excel(io.BytesIO(content))
        elif object_name.endswith(".arrow"):
            import pyarrow as pa
            import pyarrow.ipc as ipc
            reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
            df = reader.read_all().to_pandas()
        else:
            raise ValueError(f"Unsupported file format: {object_name}")
        df.columns = df.columns.str.lower()
        return df

def save_concat_result_to_minio(key: str, df: pd.DataFrame):
    csv_bytes = df.to_csv(index=False).encode("utf-8")
    minio_client.put_object(
        MINIO_BUCKET,
        key,
        data=io.BytesIO(csv_bytes),
        length=len(csv_bytes),
        content_type="text/csv",
    )
    # Cache result in Redis for 1 hour
    redis_client.setex(key, 3600, csv_bytes)

async def save_concat_metadata_to_mongo(collection, metadata: dict):
    """Insert metadata when collection is available; otherwise silently skip."""
    if collection is None:
        # Mongo not configured – behave like merge atom and do nothing.
        return
    await collection.insert_one(metadata)
    print(f"📦 Stored in {collection.name}: {metadata}")

__all__ = [
    'minio_client',
    'load_dataframe',
    'save_concat_result_to_minio',
    'get_concat_results_collection',
    'save_concat_metadata_to_mongo',
    'OBJECT_PREFIX',
    'MINIO_BUCKET',
    'redis_client',
]
