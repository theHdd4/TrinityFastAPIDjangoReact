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
    
    try:
        document_id = f"{client_name}/{app_name}/{project_name}"
        
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
        
        # Save to scopeselector_configs collection in trinity_prod database (same as column classifier)
        result = await db["scopeselector_configs"].replace_one(
            {"_id": document_id},
            document,
            upsert=True
        )
        
        logger.info(f"📦 Stored in scopeselector_configs: {document_id}")
        
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
