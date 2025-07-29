# app/mongodb_saver.py

import os
from motor.motor_asyncio import AsyncIOMotorClient
MONGO_URI = os.getenv("MONGO_URI", "mongodb://mongo:27017/trinity")
MONGO_DB = os.getenv("MONGO_DB", "trinity")
client = AsyncIOMotorClient(MONGO_URI)
db = client[MONGO_DB]
print("Mongo DB in use:", MONGO_DB)


async def save_create_data(collection_name: str, data: dict):
    await db[collection_name].insert_one(data)


async def save_create_data_settings(collection_name: str, data: dict):
    await db[collection_name].insert_one(data)