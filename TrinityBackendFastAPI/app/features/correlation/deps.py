from motor.motor_asyncio import AsyncIOMotorClient
import os
import redis

# MongoDB configuration - use same pattern as feature overview
MONGO_URI = os.getenv(
    "CORRELATION_MONGO_URI",
    os.getenv("MONGO_URI", "mongodb://mongo:27017/trinity"),
)

client = AsyncIOMotorClient(MONGO_URI)
db = client["correlation_db"]

# Redis configuration
REDIS_HOST = os.getenv("REDIS_HOST", "redis")
redis_client = redis.Redis(host=REDIS_HOST, port=6379, decode_responses=False)

async def get_correlation_results_collection():
    """Get collection for storing correlation analysis results"""
    return db["correlation_results"]

async def get_column_collection():
    """Get collection for column metadata and validator mappings"""
    return db["column_metadata"]

async def get_validator_atoms_collection():
    """Get collection for validator atoms - matches feature overview pattern"""
    validator_db = client["validator_atoms_db"]
    return validator_db["business_dimensions_with_assignments"]

async def get_correlation_settings_collection():
    """Get collection for storing correlation settings and configurations"""
    return db["correlation_settings"]
