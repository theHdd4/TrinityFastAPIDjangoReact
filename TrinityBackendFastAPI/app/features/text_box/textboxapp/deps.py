from motor.motor_asyncio import AsyncIOMotorClient

mongo_uri = "mongodb://admin_dev:pass_dev@10.2.1.65:9005"
mongo_db = "text_saver"

client = AsyncIOMotorClient(mongo_uri)
db = client[mongo_db]

async def get_texts():
    yield db["texts"]
