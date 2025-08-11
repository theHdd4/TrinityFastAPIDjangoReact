from motor.motor_asyncio import AsyncIOMotorClient
from config import settings

client = AsyncIOMotorClient(settings.mongo_details)
db = client.validator_atoms_db
column_coll = db.column_classifications
cluster_coll = db.clustering_results
