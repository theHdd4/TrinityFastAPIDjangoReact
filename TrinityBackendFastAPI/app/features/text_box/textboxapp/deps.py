import os
from motor.motor_asyncio import AsyncIOMotorClient

# Allow overriding the Mongo connection so the service works in Docker
MONGO_URI = os.getenv("MONGO_URI", "mongodb://mongo:27017/trinity")
MONGO_DB = os.getenv("MONGO_DB", "trinity")

client = AsyncIOMotorClient(MONGO_URI)
db = client[MONGO_DB]

async def get_texts():
    yield db["texts"]

async def get_deleted_cards():
    yield db["deleted_cards"]
