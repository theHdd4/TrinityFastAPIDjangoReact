# app/mongodb_saver.py

from motor.motor_asyncio import AsyncIOMotorClient
from .config import settings  # Import the settings object

client = AsyncIOMotorClient(settings.mongo_details)
db = client[settings.database_name]


async def save_autoregressive_data(collection_name: str, data: dict):
    await db[collection_name].insert_one(data)



async def save_autoreg_identifiers(collection_name: str, data: dict):
    await db[collection_name].insert_one(data)


async def save_autoreg_results(collection_name: str, data: dict):
    await db[collection_name].insert_one(data)
