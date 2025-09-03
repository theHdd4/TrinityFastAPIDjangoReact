# app/mongodb_saver.py

import os
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
MONGO_URI = os.getenv("MONGO_URI", "mongodb://admin_dev:pass_dev@10.2.1.65:9005/?authSource=admin")
MONGO_DB = os.getenv("MONGO_DB", "trinity_prod")
client = AsyncIOMotorClient(MONGO_URI)
db = client[MONGO_DB]
# print("Mongo DB in use:", MONGO_DB)
# print(f"🔍 DEBUG: MONGO_URI = {MONGO_URI}")
# print(f"🔍 DEBUG: MONGO_DB = {MONGO_DB}")
# print(f"🔍 DEBUG: MongoDB client initialized = {client is not None}")


async def save_create_data(collection_name: str, data: dict):
    await db[collection_name].insert_one(data)


async def save_create_data_settings(collection_name: str, data: dict):
    await db[collection_name].insert_one(data)


async def save_createandtransform_configs(
    client_name: str,
    app_name: str,
    project_name: str,
    operation_data: dict,
    *,
    user_id: str = "",
    project_id: int | None = None,
):
    """Save createcolumn operation data to MongoDB createandtransform_configs collection"""
    print(f"🔍 DEBUG: save_createandtransform_configs called with:")
    print(f"🔍 DEBUG: client_name = {client_name}")
    print(f"🔍 DEBUG: app_name = {app_name}")
    print(f"🔍 DEBUG: project_name = {project_name}")
    print(f"🔍 DEBUG: user_id = {user_id}")
    print(f"🔍 DEBUG: project_id = {project_id}")
    print(f"🔍 DEBUG: operation_data = {operation_data}")
    
    try:
        document_id = f"{client_name}/{app_name}/{project_name}"
        print(f"🔍 DEBUG: document_id = {document_id}")
        
        document = {
            "_id": document_id,
            "client_name": client_name,
            "app_name": app_name,
            "project_name": project_name,
            "operation_type": "createcolumn",
            "updated_at": datetime.utcnow(),
            "user_id": user_id,
            "project_id": project_id,
            **operation_data,
        }
        
        print(f"🔍 DEBUG: document to save = {document}")
        print(f"🔍 DEBUG: MongoDB client = {client}")
        print(f"🔍 DEBUG: Database = {MONGO_DB}")
        print(f"🔍 DEBUG: Collection = createandtransform_configs")
        
        # Save to createandtransform_configs collection in trinity_prod database (same as column_classifier_configs)
        result = await db["createandtransform_configs"].replace_one(
            {"_id": document_id},
            document,
            upsert=True
        )
        print(f"📦 Stored in createandtransform_configs: {document}")
        print(f"🔍 DEBUG: MongoDB result = {result}")
        print(f"🔍 DEBUG: result.upserted_id = {result.upserted_id}")
        print(f"🔍 DEBUG: result.modified_count = {result.modified_count}")
        
        return {
            "status": "success", 
            "mongo_id": document_id,
            "operation": "inserted" if result.upserted_id else "updated",
            "collection": "createandtransform_configs"
        }
        
    except Exception as e:
        # print(f"❌ MongoDB save error for createandtransform_configs: {e}")
        # print(f"🔍 DEBUG: Exception type = {type(e)}")
        # print(f"🔍 DEBUG: Exception details = {str(e)}")
        return {"status": "error", "error": str(e)}


async def get_createandtransform_config_from_mongo(client_name: str, app_name: str, project_name: str):
    """Retrieve saved createandtransform configuration."""
    try:
        document_id = f"{client_name}/{app_name}/{project_name}"
        result = await db["createandtransform_configs"].find_one({"_id": document_id})
        return result
    except Exception as e:
        # print(f"MongoDB read error for createandtransform_configs: {e}")
        return None