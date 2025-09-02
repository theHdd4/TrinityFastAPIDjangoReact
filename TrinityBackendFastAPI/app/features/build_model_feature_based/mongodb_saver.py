# app/features/build_model_feature_based/mongodb_saver.py

import os
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
import logging

# Configure logging
logger = logging.getLogger(__name__)

MONGO_URI = os.getenv("MONGO_URI", "mongodb://admin_dev:pass_dev@10.2.1.65:9005/?authSource=admin")
MONGO_DB = os.getenv("MONGO_DB", "trinity_prod")
client = AsyncIOMotorClient(MONGO_URI)
db = client[MONGO_DB]
logger.info(f"🔍 DEBUG: MONGO_URI = {MONGO_URI}")
logger.info(f"🔍 DEBUG: MONGO_DB = {MONGO_DB}")
logger.info(f"🔍 DEBUG: MongoDB client initialized = {client is not None}")

async def save_build_config(
    client_name: str,
    app_name: str,
    project_name: str,
    build_data: dict,
    *,
    user_id: str = "",
    project_id: int | None = None,
):
    """Save build model configuration data to MongoDB build-model_featurebased_configs collection"""
    logger.info(f"🔍 DEBUG: save_build_config called with:")
    logger.info(f"🔍 DEBUG: client_name = {client_name}")
    logger.info(f"🔍 DEBUG: app_name = {app_name}")
    logger.info(f"🔍 DEBUG: project_name = {project_name}")
    logger.info(f"🔍 DEBUG: user_id = {user_id}")
    logger.info(f"🔍 DEBUG: project_id = {project_id}")
    logger.info(f"🔍 DEBUG: build_data = {build_data}")
    
    try:
        document_id = f"{client_name}/{app_name}/{project_name}"
        logger.info(f"🔍 DEBUG: document_id = {document_id}")
        
        # Check if document already exists
        existing_doc = await db["build-model_featurebased_configs"].find_one({"_id": document_id})
        
        if existing_doc:
            # Merge new data with existing data instead of replacing
            logger.info(f"🔍 DEBUG: Existing document found, merging data")
            
            # Create base document with existing data
            merged_document = existing_doc.copy()
            
            # Update timestamp and user info
            merged_document["updated_at"] = datetime.utcnow()
            if user_id:
                merged_document["user_id"] = user_id
            if project_id is not None:
                merged_document["project_id"] = project_id
            
            # Merge build_data with existing data
            for key, value in build_data.items():
                if key in merged_document:
                    # If key exists and both are lists, extend the list
                    if isinstance(merged_document[key], list) and isinstance(value, list):
                        merged_document[key].extend(value)
                    # If key exists and both are dicts, merge the dicts
                    elif isinstance(merged_document[key], dict) and isinstance(value, dict):
                        merged_document[key].update(value)
                    # Otherwise, replace the value
                    else:
                        merged_document[key] = value
                else:
                    # If key doesn't exist, add it
                    merged_document[key] = value
            
            logger.info(f"🔍 DEBUG: Merged document = {merged_document}")
            
            # Update the existing document
            result = await db["build-model_featurebased_configs"].replace_one(
                {"_id": document_id},
                merged_document
            )
            
            operation = "updated"
        else:
            # Create new document
            logger.info(f"🔍 DEBUG: No existing document found, creating new one")
            
            document = {
                "_id": document_id,
                "client_name": client_name,
                "app_name": app_name,
                "project_name": project_name,
                "operation_type": "build_model_feature_based",
                "updated_at": datetime.utcnow(),
                "user_id": user_id,
                "project_id": project_id,
                **build_data,
            }
            
            logger.info(f"🔍 DEBUG: New document to save = {document}")
            
            # Insert new document
            result = await db["build-model_featurebased_configs"].insert_one(document)
            
            operation = "inserted"
        
        logger.info(f"📦 Stored in build-model_featurebased_configs: {document_id}")
        logger.info(f"🔍 DEBUG: MongoDB result = {result}")
        logger.info(f"🔍 DEBUG: result.upserted_id = {getattr(result, 'upserted_id', None)}")
        logger.info(f"🔍 DEBUG: result.modified_count = {getattr(result, 'modified_count', None)}")
        
        return {
            "status": "success", 
            "mongo_id": document_id,
            "operation": operation,
            "collection": "build-model_featurebased_configs"
        }
        
    except Exception as e:
        logger.error(f"❌ MongoDB save error for build-model_featurebased_configs: {e}")
        logger.error(f"🔍 DEBUG: Exception type = {type(e)}")
        logger.error(f"🔍 DEBUG: Exception details = {str(e)}")
        return {"status": "error", "error": str(e)}

async def get_build_config_from_mongo(client_name: str, app_name: str, project_name: str):
    """Retrieve saved build configuration."""
    try:
        document_id = f"{client_name}/{app_name}/{project_name}"
        result = await db["build-model_featurebased_configs"].find_one({"_id": document_id})
        return result
    except Exception as e:
        logger.error(f"MongoDB read error for build-model_featurebased_configs: {e}")
        return None
