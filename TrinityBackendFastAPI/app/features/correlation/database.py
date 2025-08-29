from motor.motor_asyncio import AsyncIOMotorClient
from .config import settings

client = AsyncIOMotorClient(settings.MONGO_URI)
db = client[settings.database_name]  # Use the property instead
column_coll = db.column_classifications
correlation_coll = db.correlation_results  # Changed from cluster_coll
