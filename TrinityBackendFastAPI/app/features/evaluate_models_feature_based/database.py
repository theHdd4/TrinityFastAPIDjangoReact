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


# MongoDB Connection with Authentication (same pattern as select atom)
# Force the correct URI to match select atom
MONGO_URI = "mongodb://root:rootpass@mongo:27017/trinity_prod?authSource=admin"
MONGO_DB = "trinity_prod"
COLLECTION_NAME = "build-model_featurebased_configs"

# MongoDB Connection with Authentication
client = None
db = None
build_configs_collection = None

def get_authenticated_client():
    """Get authenticated MongoDB client (lazy initialization)"""
    global client, db, build_configs_collection
    
    logger.info(f"get_authenticated_client() called, current client state: {client is not None}")
    
    if client is None:
        try:
            # Create connection string without exposing credentials in logs
            mongo_url_safe = MONGO_URI.replace(
                MONGO_URI.split('@')[0].split('//')[1], 
                "***:***"
            )
            logger.info(f"Connecting to MongoDB: {mongo_url_safe}")
            logger.info(f"MONGO_URI: {MONGO_URI}")
            logger.info(f"MONGO_DB: {MONGO_DB}")
            logger.info(f"COLLECTION_NAME: {COLLECTION_NAME}")
            
            client = AsyncIOMotorClient(
                MONGO_URI,
                serverSelectionTimeoutMS=5000,
                connectTimeoutMS=5000,
                socketTimeoutMS=5000,
                maxPoolSize=10,
                minPoolSize=1
            )
            
            logger.info("AsyncIOMotorClient created successfully")
            
            db = client[MONGO_DB]
            logger.info(f"Database object created: {db}")
            
            build_configs_collection = db.get_collection(COLLECTION_NAME)
            logger.info(f"Collection object created: {build_configs_collection}")
            
            logger.info(f"✅ MongoDB connection established: {MONGO_DB}.{COLLECTION_NAME}")
            
        except Exception as e:
            logger.error(f"❌ MongoDB connection failed: {e}")
            logger.error(f"Exception type: {type(e)}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            client, db, build_configs_collection = None, None, None
            raise e
    else:
        logger.info("Client already exists, returning existing client")
    
    return client

@lru_cache()
def get_mongo() -> AsyncIOMotorClient:
    # Use the same MongoDB configuration as select atom
    mongo_uri = os.getenv("MONGO_URI", "mongodb://root:rootpass@mongo:27017/trinity_prod?authSource=admin")
    return AsyncIOMotorClient(
        mongo_uri,
        serverSelectionTimeoutMS=5000,
        connectTimeoutMS=5000,
        socketTimeoutMS=5000,
        maxPoolSize=10,
        minPoolSize=1
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
    # Use the same pattern as select atom - direct client access
    logger.info(f"Getting build config for {client_name}/{app_name}/{project_name}")
    logger.info(f"Current client state: {client is not None}")
    
    if client is None:
        logger.info("Client is None, calling get_authenticated_client()")
        get_authenticated_client()
        logger.info(f"After get_authenticated_client(), client state: {client is not None}")
    
    if client is None:
        logger.error("Client is still None after get_authenticated_client()")
        raise RuntimeError("Failed to establish MongoDB connection")
    
    logger.info("Using client to access database")
    db = client["trinity_prod"]
    _id = f"{client_name}/{app_name}/{project_name}"
    logger.info(f"Looking for document with ID: {_id}")
    doc = await db["build-model_featurebased_configs"].find_one({"_id": _id})
    if not doc:
        raise RuntimeError(f"No build configuration for {_id}")
    logger.info("Successfully retrieved build configuration")
    return doc