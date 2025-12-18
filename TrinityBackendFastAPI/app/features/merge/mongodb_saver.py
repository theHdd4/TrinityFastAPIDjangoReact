# app/mongodb_saver.py

from motor.motor_asyncio import AsyncIOMotorClient
import os
from .config import settings


client = AsyncIOMotorClient(settings.MONGO_URI)
db = client[settings.MONGO_DB]

async def save_merged_data(collection_name: str, data: dict):
    await db[collection_name].insert_one(data)
