# app/features/build_model_feature_based/mongodb_saver.py

import os
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
import logging

# Configure logging
logger = logging.getLogger(__name__)

MONGO_URI = os.getenv("MONGO_URI", "mongodb://admin_dev:pass_dev@10.2.1.65:9005/?authSource=admin")
MONGO_DB = os.getenv("MONGO_DB", "trinity_db")
client = AsyncIOMotorClient(MONGO_URI)
db = client[MONGO_DB]

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
    try:
        document_id = f"{client_name}/{app_name}/{project_name}"
        
        # Check if document already exists
        existing_doc = await db["build-model_featurebased_configs"].find_one({"_id": document_id})
        
        if existing_doc:
            # Merge new data with existing data instead of replacing
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
            
            # Update the existing document
            result = await db["build-model_featurebased_configs"].replace_one(
                {"_id": document_id},
                merged_document
            )
            
            operation = "updated"
        else:
            # Create new document
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
            
            # Insert new document
            result = await db["build-model_featurebased_configs"].insert_one(document)
            
            operation = "inserted"
        
        logger.info(f"📦 Stored in build-model_featurebased_configs: {document_id}")
        
        return {
            "status": "success", 
            "mongo_id": document_id,
            "operation": operation,
            "collection": "build-model_featurebased_configs"
        }
        
    except Exception as e:
        logger.error(f"❌ MongoDB save error for build-model_featurebased_configs: {e}")
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

async def get_scope_config_from_mongo(client_name: str, app_name: str, project_name: str):
    """Retrieve saved scope configuration from scopeselector_configs collection."""
    try:
        document_id = f"{client_name}/{app_name}/{project_name}"
        result = await client["trinity_db"]["scopeselector_configs"].find_one({"_id": document_id})
        return result
    except Exception as e:
        logger.error(f"❌ MongoDB read error for scopeselector_configs: {e}")
        return None

async def get_combination_column_values(minio_client, bucket_name: str, file_key: str, identifiers: list):
    """Get unique column values for identifiers from a source file."""
    try:
        import pandas as pd
        import pyarrow as pa
        import pyarrow.feather as feather
        from io import BytesIO
        
        # Get the file from MinIO
        response = minio_client.get_object(bucket_name, file_key)
        file_data = response.read()
        response.close()
        response.release_conn()
        
        # Determine file type and read accordingly
        if file_key.endswith('.arrow') or file_key.endswith('.feather'):
            # Read Arrow/Feather file
            buffer = BytesIO(file_data)
            df = feather.read_feather(buffer)  # Already returns pandas DataFrame
        elif file_key.endswith('.csv'):
            # Read CSV file
            buffer = BytesIO(file_data)
            df = pd.read_csv(buffer)
        else:
            logger.warning(f"Unsupported file format: {file_key}")
            return {}
        
        # Extract unique values for each identifier column
        column_values = {}
        for identifier in identifiers:
            if identifier in df.columns:
                unique_values = df[identifier].dropna().unique().tolist()
                # Convert to string and limit to first value if multiple exist
                if unique_values:
                    column_values[identifier] = str(unique_values[0])  # Only first value as requested
                else:
                    column_values[identifier] = "Unknown"
            else:
                column_values[identifier] = "Unknown"
        
        return column_values
        
    except Exception as e:
        logger.error(f"Error getting column values from {file_key}: {e}")
        return {identifier: "Unknown" for identifier in identifiers}
