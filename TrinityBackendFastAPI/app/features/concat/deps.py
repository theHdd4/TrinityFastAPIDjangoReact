import asyncio
import io
import os

import pandas as pd
from minio import Minio
from motor.motor_asyncio import AsyncIOMotorClient

from app.DataStorageRetrieval.arrow_client import download_dataframe
from app.DataStorageRetrieval.db import fetch_client_app_project
from app.core.feature_cache import feature_cache
from app.core.redis import get_redis_settings

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

_redis_settings = get_redis_settings()
redis_client = feature_cache.router("concat")

if os.getenv("ENVIRONMENT", "production").lower() == "development":
    print(
        f"✅ [dev] Concat atom using shared Redis {_redis_settings.host}:{_redis_settings.port}"
    )


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

def resolve_file_path(file_key: str) -> str:
    """
    Robustly resolve file path using the same system as data_upload_validate.
    Always gets the current dynamic path for consistency.
    """
    if not file_key:
        return ""
    
    try:
        # Import the dynamic path function from data_upload_validate
        from ..data_upload_validate.app.routes import get_object_prefix
        import asyncio
        
        # Get the current dynamic path (this is what data_upload_validate uses)
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            current_prefix = loop.run_until_complete(get_object_prefix())
        finally:
            loop.close()
        
        # If it's already a full path, check if it matches current prefix
        if "/" in file_key:
            if file_key.startswith(current_prefix):
                return file_key  # Already has correct prefix
            else:
                # Extract filename and use current prefix
                filename = file_key.split("/")[-1]
                return f"{current_prefix}{filename}"
        
        # If it's just a filename, add the current prefix
        return f"{current_prefix}{file_key}"
        
    except Exception as e:
        print(f"⚠️ Failed to get dynamic path, using fallback: {e}")
        # Fallback to static prefix if dynamic path fails
        if "/" in file_key:
            if file_key.startswith(OBJECT_PREFIX):
                return file_key
            else:
                filename = file_key.split("/")[-1]
                return f"{OBJECT_PREFIX}{filename}"
        return f"{OBJECT_PREFIX}{file_key}"

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
    Now handles both filenames and full paths robustly.
    """
    # Resolve the file path robustly
    resolved_path = resolve_file_path(object_name)
    filename_only = object_name.split("/")[-1] if "/" in object_name else object_name
    
    # Try Redis cache first using the resolved path
    content = redis_client.get(resolved_path)
    if content is not None:
        print(f"✅ Loaded {filename_only} from Redis cache using path: {resolved_path}")
        if filename_only.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        elif filename_only.endswith((".xls", ".xlsx")):
            df = pd.read_excel(io.BytesIO(content))
        elif filename_only.endswith(".arrow"):
            import pyarrow as pa
            import pyarrow.ipc as ipc
            reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
            df = reader.read_all().to_pandas()
        else:
            raise ValueError(f"Unsupported file format: {filename_only}")
        df.columns = df.columns.str.lower()
        return df
    
    # Try Arrow Flight
    try:
        # For Arrow Flight, we need just the filename without extension
        flight_path = filename_only.replace('.arrow', '').replace('.csv', '').replace('.xlsx', '')
        df = download_dataframe(flight_path)
        print(f"✅ Loaded {filename_only} from Arrow Flight")
        return df
    except Exception as e:
        print(f"⚠️ Arrow Flight download failed for {filename_only}: {e}, falling back to MinIO.")
        
        # Fallback to MinIO using the resolved path
        try:
            response = minio_client.get_object(MINIO_BUCKET, resolved_path)
            content = response.read()
            # Cache in Redis for 1 hour using the resolved path
            redis_client.setex(resolved_path, 3600, content)
            
            if filename_only.endswith(".csv"):
                df = pd.read_csv(io.BytesIO(content))
            elif filename_only.endswith((".xls", ".xlsx")):
                df = pd.read_excel(io.BytesIO(content))
            elif filename_only.endswith(".arrow"):
                import pyarrow as pa
                import pyarrow.ipc as ipc
                reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
                df = reader.read_all().to_pandas()
            else:
                raise ValueError(f"Unsupported file format: {filename_only}")
            
            df.columns = df.columns.str.lower()
            print(f"✅ Loaded {filename_only} from MinIO fallback using path: {resolved_path}")
            return df
            
        except Exception as minio_error:
            print(f"❌ MinIO fallback also failed for {filename_only}: {minio_error}")
            print(f"   Tried path: {resolved_path}")
            raise minio_error

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

def get_minio_df(bucket: str, file_key: str) -> pd.DataFrame:
    try:
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
    except S3Error as e:
        raise RuntimeError(f"MinIO S3 error: {e}")
    except Exception as e:
        raise RuntimeError(f"Failed to fetch file from MinIO: {e}")

__all__ = [
    'minio_client',
    'load_dataframe',
    'get_minio_df',
    'save_concat_result_to_minio',
    'get_concat_results_collection',
    'save_concat_metadata_to_mongo',
    'resolve_file_path',
    'OBJECT_PREFIX',
    'MINIO_BUCKET',
    'redis_client',
]
