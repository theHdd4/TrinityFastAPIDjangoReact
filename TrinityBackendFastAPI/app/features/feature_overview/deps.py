from motor.motor_asyncio import AsyncIOMotorClient
import os
import redis

MONGO_URI = os.getenv(
    "OVERVIEW_MONGO_URI",
    os.getenv("MONGO_URI", "mongodb://mongo:27017/trinity"),
)

client = AsyncIOMotorClient(MONGO_URI)
db = client["feature_overview_db"]

REDIS_HOST = os.getenv("REDIS_HOST", "redis")
redis_client = redis.Redis(host=REDIS_HOST, port=6379, decode_responses=True)
# Separate binary-safe Redis client for caching dataframe artifacts such as
# Arrow IPC files.  ``decode_responses=False`` ensures redis-py returns raw
# ``bytes`` instead of attempting UTF-8 decoding, which can fail for binary
# payloads containing non-text bytes (e.g., ``0xff``).
redis_binary_client = redis.Redis(
    host=REDIS_HOST, port=6379, decode_responses=False
)

async def get_unique_dataframe_results_collection():
    return db["unique_dataframe"]


async def get_summary_results_collection():
    return db["summary_results"]


# In deps.py

async def get_validator_atoms_collection():
    validator_db = client["validator_atoms_db"]
    return validator_db["business_dimensions_with_assignments"]
