# app/features/evaluate_models_feature_based/mongodb_saver.py

import os
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
import logging

# Configure logging
logger = logging.getLogger(__name__)

MONGO_URI = "mongodb://root:rootpass@mongo:27017/trinity_prod?authSource=admin"
MONGO_DB = "trinity_prod"
client = AsyncIOMotorClient(MONGO_URI)
db = client[MONGO_DB]

async def get_scope_config_from_mongo(client_name: str, app_name: str, project_name: str):
    """Retrieve saved scope configuration from scopeselector_configs collection."""
    try:
        document_id = f"{client_name}/{app_name}/{project_name}"
        result = await client["trinity_prod"]["scopeselector_configs"].find_one({"_id": document_id})
        return result
    except Exception as e:
        logger.error(f"❌ MongoDB read error for scopeselector_configs: {e}")
        return None
