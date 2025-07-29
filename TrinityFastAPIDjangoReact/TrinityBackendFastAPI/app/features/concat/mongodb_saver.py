from motor.motor_asyncio import AsyncIOMotorClient
from .config import settings  # Import the settings object

client = AsyncIOMotorClient(settings.MONGO_URI)
db = client[settings.MONGO_DB]

async def save_concat_data(collection_name: str, data: dict):
    await db[collection_name].insert_one(data)
    print(f"📦 Stored in {collection_name}: {data}")
