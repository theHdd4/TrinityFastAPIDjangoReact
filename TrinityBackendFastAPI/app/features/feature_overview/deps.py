from motor.motor_asyncio import AsyncIOMotorClient
import os

MONGO_URI = os.getenv(
    "OVERVIEW_MONGO_URI",
    os.getenv("MONGO_URI", "mongodb://mongo:27017/trinity"),
)

client = AsyncIOMotorClient(MONGO_URI)
db = client["feature_overview_db"]

async def get_unique_dataframe_results_collection():
    return db["unique_dataframe"]


async def get_summary_results_collection():
    return db["summary_results"]



# In deps.py

async def get_validator_atoms_collection():
    validator_db = client["validator_atoms_db"]
    return validator_db["business_dimensions_with_assignments"]
