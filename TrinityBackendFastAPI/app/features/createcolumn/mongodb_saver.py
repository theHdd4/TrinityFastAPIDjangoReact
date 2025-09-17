# app/mongodb_saver.py

import os
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
MONGO_URI = os.getenv("MONGO_URI", "mongodb://admin_dev:pass_dev@10.2.1.65:9005/?authSource=admin")
MONGO_DB = os.getenv("MONGO_DB", "trinity_db")
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
    try:
        document_id = f"{client_name}/{app_name}/{project_name}"
        
        # Check if document already exists
        existing_doc = await client["trinity_db"]["createandtransform_configs"].find_one({"_id": document_id})
        
        if existing_doc:
            # Merge new data with existing data instead of replacing
            merged_document = existing_doc.copy()
            
            # Update timestamp
            merged_document["updated_at"] = datetime.utcnow()
            
            # Initialize files array if it doesn't exist
            if "files" not in merged_document:
                merged_document["files"] = []
            
            # Get the input file from operation data
            input_file = operation_data.get("input_file")
            
            # Check if this file already exists
            existing_file = None
            for file_data in merged_document["files"]:
                if file_data.get("input_file") == input_file:
                    existing_file = file_data
                    break
            
            if existing_file:
                # For same input file, add a new file entry to the files array
                # Each save gets its own entry with its own operations
                new_file_entry = {
                    "saved_file": operation_data.get("saved_file"),
                    "operations": operation_data.get("operations", []),
                    "input_file": input_file,
                    "file_columns": operation_data.get("file_columns"),
                    "file_shape": operation_data.get("file_shape"),
                    "saved_at": operation_data.get("saved_at"),
                    "created_at": datetime.utcnow()
                }
                
                # Add the new file entry to the files array
                merged_document["files"].append(new_file_entry)
                
                print(f"✅ Added new file entry for existing input file {input_file}")
            else:
                # Add new file to the array
                new_file = {
                    "saved_file": operation_data.get("saved_file"),
                    "operations": operation_data.get("operations", []),
                    "input_file": input_file,
                    "file_columns": operation_data.get("file_columns"),
                    "file_shape": operation_data.get("file_shape"),
                    "saved_at": operation_data.get("saved_at"),
                    "created_at": datetime.utcnow()
                }
                merged_document["files"].append(new_file)
                print(f"✅ Added new file {input_file} to document")
            
            # Update the existing document
            result = await client["trinity_db"]["createandtransform_configs"].replace_one(
                {"_id": document_id},
                merged_document
            )
            operation = "updated"
        else:
            # Create new document with files array
            document = {
                "_id": document_id,
                "client_name": client_name,
                "app_name": app_name,
                "project_name": project_name,
                "operation_type": "createcolumn",
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
                "user_id": user_id,
                "project_id": project_id,
                "files": [{
                    "saved_file": operation_data.get("saved_file"),
                    "operations": operation_data.get("operations", []),
                    "input_file": operation_data.get("input_file"),
                    "file_columns": operation_data.get("file_columns"),
                    "file_shape": operation_data.get("file_shape"),
                    "saved_at": operation_data.get("saved_at"),
                    "created_at": datetime.utcnow()
                }]
            }
            
            # Insert new document
            result = await client["trinity_db"]["createandtransform_configs"].insert_one(document)
            operation = "inserted"
        
        print(f"📦 Stored in createandtransform_configs: {document_id}")
        
        return {
            "status": "success", 
            "mongo_id": document_id,
            "operation": operation,
            "collection": "createandtransform_configs"
        }
        
    except Exception as e:
        print(f"❌ MongoDB save error for createandtransform_configs: {e}")
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