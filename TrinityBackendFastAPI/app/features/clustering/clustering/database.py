from motor.motor_asyncio import AsyncIOMotorClient
from .config import settings

client = AsyncIOMotorClient(settings.mongo_details)
# Let MongoDB driver handle the database name from the connection string
db = client.get_default_database()
column_coll = db.column_classifications
cluster_coll = db.clustering_results
