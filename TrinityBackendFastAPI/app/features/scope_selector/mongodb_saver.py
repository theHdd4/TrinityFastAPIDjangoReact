# app/features/scope_selector/mongodb_saver.py

import os
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
import logging

# Configure logging
logger = logging.getLogger(__name__)

# Use the same MongoDB URI as column classifier for consistency
MONGO_URI = os.getenv("MONGO_URI", "mongodb://admin_dev:pass_dev@10.2.1.65:9005/?authSource=admin")
MONGO_DB = os.getenv("MONGO_DB", "trinity_prod")  # Use trinity_prod database like column classifier
client = AsyncIOMotorClient(MONGO_URI)
db = client[MONGO_DB]
logger.info(f"🔍 DEBUG: MONGO_URI = {MONGO_URI}")
logger.info(f"🔍 DEBUG: MONGO_DB = {MONGO_DB}")
logger.info(f"🔍 DEBUG: MongoDB client initialized = {client is not None}")

async def save_scope_config(
    client_name: str,
    app_name: str,
    project_name: str,
    scope_data: dict,
    *,
    user_id: str = "",
    project_id: int | None = None,
):
    """Save scope configuration data to MongoDB scopeselector_configs collection"""
    logger.info(f"🔍 DEBUG: save_scope_config called with:")
    logger.info(f"🔍 DEBUG: client_name = {client_name}")
    logger.info(f"🔍 DEBUG: app_name = {app_name}")
    logger.info(f"🔍 DEBUG: project_name = {project_name}")
    logger.info(f"🔍 DEBUG: user_id = {user_id}")
    logger.info(f"🔍 DEBUG: project_id = {project_id}")
    logger.info(f"🔍 DEBUG: scope_data = {scope_data}")
    
    try:
        document_id = f"{client_name}/{app_name}/{project_name}"
        logger.info(f"🔍 DEBUG: document_id = {document_id}")
        
        document = {
            "_id": document_id,
            "client_name": client_name,
            "app_name": app_name,
            "project_name": project_name,
            "operation_type": "scope_selector",
            "updated_at": datetime.utcnow(),
            "user_id": user_id,
            "project_id": project_id,
            **scope_data,
        }
        
        logger.info(f"🔍 DEBUG: document to save = {document}")
        logger.info(f"🔍 DEBUG: MongoDB client = {client}")
        logger.info(f"🔍 DEBUG: Database = {MONGO_DB}")
        logger.info(f"🔍 DEBUG: Collection = scopeselector_configs")
        
        # Save to scopeselector_configs collection in trinity_prod database (same as column classifier)
        result = await db["scopeselector_configs"].replace_one(
            {"_id": document_id},
            document,
            upsert=True
        )
        
        logger.info(f"📦 Stored in scopeselector_configs: {document_id}")
        logger.info(f"🔍 DEBUG: MongoDB result = {result}")
        logger.info(f"🔍 DEBUG: result.upserted_id = {result.upserted_id}")
        logger.info(f"🔍 DEBUG: result.modified_count = {result.modified_count}")
        
        return {
            "status": "success", 
            "mongo_id": document_id,
            "operation": "inserted" if result.upserted_id else "updated",
            "collection": "scopeselector_configs"
        }
        
    except Exception as e:
        logger.error(f"❌ MongoDB save error for scopeselector_configs: {e}")
        logger.error(f"🔍 DEBUG: Exception type = {type(e)}")
        logger.error(f"🔍 DEBUG: Exception details = {str(e)}")
        return {"status": "error", "error": str(e)}

async def get_scope_config_from_mongo(client_name: str, app_name: str, project_name: str):
    """Retrieve saved scope configuration."""
    try:
        document_id = f"{client_name}/{app_name}/{project_name}"
        result = await db["scopeselector_configs"].find_one({"_id": document_id})
        return result
    except Exception as e:
        logger.error(f"MongoDB read error for scopeselector_configs: {e}")
        return None

async def test_mongodb_connection():
    """Test MongoDB connection and return status"""
    try:
        # Test connection by listing databases
        databases = await client.list_database_names()
        logger.info(f"🔍 DEBUG: Available databases: {databases}")
        
        # Test access to trinity_prod database
        if "trinity_prod" in databases:
            collections = await db.list_collection_names()
            logger.info(f"🔍 DEBUG: Collections in trinity_prod: {collections}")
            
            # Test write access by inserting a test document
            test_doc = {"_id": "test_connection", "timestamp": datetime.utcnow()}
            await db["scopeselector_configs"].replace_one(
                {"_id": "test_connection"}, 
                test_doc, 
                upsert=True
            )
            logger.info("🔍 DEBUG: Test document inserted successfully")
            
            # Clean up test document
            await db["scopeselector_configs"].delete_one({"_id": "test_connection"})
            logger.info("🔍 DEBUG: Test document cleaned up")
            
            return {
                "status": "success",
                "message": "MongoDB connection and write access working",
                "databases": databases,
                "collections": collections
            }
        else:
            return {
                "status": "error",
                "message": "trinity_prod database not found",
                "databases": databases
            }
            
    except Exception as e:
        logger.error(f"❌ MongoDB connection test failed: {e}")
        return {
            "status": "error",
            "message": f"MongoDB connection failed: {str(e)}",
            "error": str(e)
        }
