# app/features/scope_selector/mongodb_saver.py

import os
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
import logging

# Configure logging
logger = logging.getLogger(__name__)

MONGO_URI = os.getenv("MONGO_URI", "mongodb://mongo:27017/trinity")
MONGO_DB = os.getenv("MONGO_DB", "trinity")
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
        
        # Look up createandtransform_configs to get operations data based on file_key
        createandtransform_operations = None
        try:
            file_key = scope_data.get("file_key", "")
            if file_key:
                # Search in createandtransform_configs collection for files with matching saved_file
                createandtransform_collection = client["trinity_prod"]["createandtransform_configs"]
                createandtransform_docs = await createandtransform_collection.find({
                    "files": {
                        "$elemMatch": {
                            "saved_file": file_key
                        }
                    }
                }).to_list(length=None)
                
                # Extract operations from matching files
                if createandtransform_docs:
                    for doc in createandtransform_docs:
                        for file_entry in doc.get("files", []):
                            if file_entry.get("saved_file") == file_key:
                                createandtransform_operations = {
                                    "saved_file": file_entry.get("saved_file"),
                                    "operations": file_entry.get("operations", []),
                                    "file_columns": file_entry.get("file_columns", []),
                                    "file_shape": file_entry.get("file_shape"),
                                    "saved_at": file_entry.get("saved_at")
                                }
                                break
                        if createandtransform_operations:
                            break
                    
                    if createandtransform_operations:
                        logger.info(f"🔍 Found createandtransform operations for saved_file: {file_key}")
                    else:
                        logger.info(f"🔍 No createandtransform operations found for saved_file: {file_key}")
                        createandtransform_operations = None
                else:
                    logger.info(f"🔍 No createandtransform documents found for saved_file: {file_key}")
                    createandtransform_operations = None
                
        except Exception as e:
            logger.warning(f"⚠️ Could not fetch createandtransform operations: {str(e)}")
            createandtransform_operations = None
        
        document = {
            "_id": document_id,
            "client_name": client_name,
            "app_name": app_name,
            "project_name": project_name,
            "operation_type": "scope_selector",
            "updated_at": datetime.utcnow(),
            "user_id": user_id,
            "project_id": project_id,
            "createandtransform_operations": createandtransform_operations,  # Add the operations data
            **scope_data,
        }
        
        logger.info(f"🔍 DEBUG: document to save = {document}")
        logger.info(f"🔍 DEBUG: MongoDB client = {client}")
        logger.info(f"🔍 DEBUG: Database = trinity_prod")
        logger.info(f"🔍 DEBUG: Collection = scopeselector_configs")
        
        # Save to scopeselector_configs collection in trinity_prod database (same as createandtransform_configs)
        result = await client["trinity_prod"]["scopeselector_configs"].replace_one(
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
        result = await client["trinity_prod"]["scopeselector_configs"].find_one({"_id": document_id})
        return result
    except Exception as e:
        logger.error(f"MongoDB read error for scopeselector_configs: {e}")
        return None
