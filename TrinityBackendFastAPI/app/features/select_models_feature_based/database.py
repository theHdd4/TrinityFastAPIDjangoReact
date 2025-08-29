import os
import pandas as pd
import io
from minio import Minio
import redis
from io import BytesIO
from motor.motor_asyncio import AsyncIOMotorClient
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
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
    logger.info(f"✅ Connected to Redis at {REDIS_HOST}:{REDIS_PORT} (DB: {REDIS_DB})")
except Exception as e:
    logger.warning(f"⚠️ Failed to connect to Redis at {REDIS_HOST}:{REDIS_PORT}: {e}")
    logger.warning("⚠️ Some features may be limited without Redis.")
    redis_client = None

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
                logger.info(f"✅ Created MinIO bucket: {MINIO_BUCKET}")
            except Exception as e:
                logger.warning(f"⚠️ Failed to create MinIO bucket {MINIO_BUCKET}: {e}")
                raise
        else:
            logger.info(f"✅ MinIO bucket '{MINIO_BUCKET}' is accessible")
    except Exception as e:
        logger.warning(f"⚠️ MinIO connection error: {e}")

ensure_minio_bucket()

# MongoDB configuration
MONGO_URI = os.getenv("MONGO_URI", "mongodb://admin_dev:pass_dev@10.2.1.65:9005/?authSource=admin")
MONGO_DB = os.getenv("MONGO_DB", "validator_atoms_db")
COLLECTION_NAME = "validator_atoms"

# MongoDB Connection with Authentication
client = None
db = None
scopes_collection = None

try:
    # Create connection string without exposing credentials in logs
    mongo_url_safe = MONGO_URI.replace(
        MONGO_URI.split('@')[0].split('//')[1], 
        "***:***"
    )
    logger.info(f"Connecting to MongoDB: {mongo_url_safe}")
    
    client = AsyncIOMotorClient(
        MONGO_URI,
        serverSelectionTimeoutMS=5000,
        connectTimeoutMS=5000,
        socketTimeoutMS=5000,
        maxPoolSize=10,
        minPoolSize=1
    )
    
    db = client[MONGO_DB]
    scopes_collection = db.get_collection(COLLECTION_NAME)
    logger.info(f"✅ MongoDB connection established: {MONGO_DB}.{COLLECTION_NAME}")
    
except Exception as e:
    logger.error(f"❌ MongoDB connection failed: {e}")
    client, db, scopes_collection = None, None, None

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

# Health check function
async def check_database_health():
    """Check health of all database connections."""
    health_status = {
        "mongodb": {"status": False, "details": "Not connected"},
        "minio": {"status": False, "details": "Not connected"},
        "redis": {"status": False, "details": "Not connected"}
    }
    
    # Check MongoDB
    if client and db:
        try:
            await client.admin.command('ping')
            health_status["mongodb"] = {"status": True, "details": f"Connected to {MONGO_DB}"}
        except Exception as e:
            health_status["mongodb"] = {"status": False, "details": str(e)}
    
    # Check MinIO
    if minio_client:
        try:
            minio_client.list_buckets()
            health_status["minio"] = {"status": True, "details": f"Connected to {MINIO_ENDPOINT}"}
        except Exception as e:
            health_status["minio"] = {"status": False, "details": str(e)}
    
    # Check Redis
    if redis_client:
        try:
            redis_client.ping()
            health_status["redis"] = {"status": True, "details": f"Connected to {REDIS_HOST}:{REDIS_PORT}"}
        except Exception as e:
            health_status["redis"] = {"status": False, "details": str(e)}
    
    return health_status

# Placeholder functions for compatibility
async def extract_unique_combinations():
    """Placeholder function for compatibility."""
    return []

async def get_filter_options():
    """Placeholder function for compatibility."""
    return {}

async def get_presigned_url():
    """Placeholder function for compatibility."""
    return ""

async def get_file_info():
    """Placeholder function for compatibility."""
    return {}

async def list_files_in_bucket():
    """Placeholder function for compatibility."""
    return []

async def get_transformation_metadata():
    """Placeholder function for compatibility."""
    return {}

async def get_model_by_transform_and_id():
    """Placeholder function for compatibility."""
    return {}

__all__ = [
    'minio_client',
    'get_minio_df',
    'OBJECT_PREFIX',
    'MINIO_BUCKET',
    'redis_client',
    'client',
    'db',
    'scopes_collection',
    'check_database_health',
    'extract_unique_combinations',
    'get_filter_options',
    'get_presigned_url',
    'get_file_info',
    'list_files_in_bucket',
    'get_transformation_metadata',
    'get_model_by_transform_and_id'
]