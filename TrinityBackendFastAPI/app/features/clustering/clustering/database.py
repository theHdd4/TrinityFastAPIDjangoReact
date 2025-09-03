from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
import logging
from typing import Dict, Any, Optional, List
from .config import settings

# Configure logging
logger = logging.getLogger(__name__)

client = AsyncIOMotorClient(settings.mongo_details)
# Let MongoDB driver handle the database name from the connection string
db = client.get_default_database()
column_coll = db.column_classifications
cluster_coll = db.clustering_results

# New collections for clustering metadata
clustering_configs_coll = db.clustering_configs
clustering_results_coll = db.clustering_results
clustering_metadata_coll = db.clustering_metadata

async def save_clustering_config(
    client_name: str,
    app_name: str,
    project_name: str,
    clustering_data: dict,
    *,
    user_id: str = "",
    project_id: int | None = None,
):
    """Save clustering configuration data to MongoDB clustering_configs collection"""
    logger.info(f"🔍 DEBUG: save_clustering_config called with:")
    logger.info(f"🔍 DEBUG: client_name = {client_name}")
    logger.info(f"🔍 DEBUG: app_name = {app_name}")
    logger.info(f"🔍 DEBUG: project_name = {project_name}")
    logger.info(f"🔍 DEBUG: user_id = {user_id}")
    logger.info(f"🔍 DEBUG: project_id = {project_id}")
    logger.info(f"🔍 DEBUG: clustering_data = {clustering_data}")
    
    try:
        document_id = f"{client_name}/{app_name}/{project_name}"
        logger.info(f"🔍 DEBUG: document_id = {document_id}")
        
        # Check if document already exists
        existing_doc = await clustering_configs_coll.find_one({"_id": document_id})
        
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
            
            # Merge clustering_data with existing data
            for key, value in clustering_data.items():
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
            result = await clustering_configs_coll.replace_one(
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
                "operation_type": "clustering",
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
                "user_id": user_id,
                "project_id": project_id,
                **clustering_data,
            }
            
            logger.info(f"🔍 DEBUG: New document to save = {document}")
            
            # Insert new document
            result = await clustering_configs_coll.insert_one(document)
            
            operation = "inserted"
        
        logger.info(f"📦 Stored in clustering_configs: {document_id}")
        logger.info(f"🔍 DEBUG: MongoDB result = {result}")
        
        return {
            "status": "success", 
            "mongo_id": document_id,
            "operation": operation,
            "collection": "clustering_configs"
        }
        
    except Exception as e:
        logger.error(f"❌ MongoDB save error for clustering_configs: {e}")
        return {"status": "error", "error": str(e)}

async def save_clustering_results(
    client_name: str,
    app_name: str,
    project_name: str,
    clustering_results: dict,
    *,
    user_id: str = "",
    project_id: int | None = None,
):
    """Save clustering results data to MongoDB clustering_results collection"""
    try:
        document_id = f"{client_name}/{app_name}/{project_name}"
        
        # Add metadata
        document = {
            "_id": document_id,
            "client_name": client_name,
            "app_name": app_name,
            "project_name": project_name,
            "operation_type": "clustering_results",
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "user_id": user_id,
            "project_id": project_id,
            **clustering_results,
        }
        
        # Use upsert to either insert or update
        result = await clustering_results_coll.replace_one(
            {"_id": document_id},
            document,
            upsert=True
        )
        
        operation = "inserted" if result.upserted_id else "updated"
        
        logger.info(f"📦 Stored clustering results in clustering_results: {document_id}")
        
        return {
            "status": "success", 
            "mongo_id": document_id,
            "operation": operation,
            "collection": "clustering_results"
        }
        
    except Exception as e:
        logger.error(f"❌ MongoDB save error for clustering_results: {e}")
        return {"status": "error", "error": str(e)}

async def save_clustering_metadata(
    client_name: str,
    app_name: str,
    project_name: str,
    metadata: dict,
    *,
    user_id: str = "",
    project_id: int | None = None,
):
    """Save clustering metadata to MongoDB clustering_metadata collection"""
    try:
        # Generate unique ID for this metadata entry
        # Use clean ID without timestamp for consistency with other collections
        metadata_id = f"{client_name}/{app_name}/{project_name}"
        
        document = {
            "_id": metadata_id,
            "client_name": client_name,
            "app_name": app_name,
            "project_name": project_name,
            "operation_type": "clustering_metadata",
            "created_at": datetime.utcnow(),
            "user_id": user_id,
            "project_id": project_id,
            **metadata,
        }
        
        # Use upsert to either insert or update existing metadata
        result = await clustering_metadata_coll.replace_one(
            {"_id": metadata_id},
            document,
            upsert=True
        )
        
        operation = "inserted" if result.upserted_id else "updated"
        
        logger.info(f"📦 Stored clustering metadata: {metadata_id}")
        
        return {
            "status": "success", 
            "mongo_id": metadata_id,
            "operation": operation,
            "collection": "clustering_metadata"
        }
        
    except Exception as e:
        logger.error(f"❌ MongoDB save error for clustering_metadata: {e}")
        return {"status": "error", "error": str(e)}

async def get_clustering_config_from_mongo(client_name: str, app_name: str, project_name: str):
    """Retrieve saved clustering configuration."""
    try:
        document_id = f"{client_name}/{app_name}/{project_name}"
        result = await clustering_configs_coll.find_one({"_id": document_id})
        return result
    except Exception as e:
        logger.error(f"MongoDB read error for clustering_configs: {e}")
        return None

async def get_clustering_results_from_mongo(client_name: str, app_name: str, project_name: str):
    """Retrieve saved clustering results."""
    try:
        document_id = f"{client_name}/{app_name}/{project_name}"
        result = await clustering_results_coll.find_one({"_id": document_id})
        return result
    except Exception as e:
        logger.error(f"MongoDB read error for clustering_results: {e}")
        return None

async def get_clustering_metadata_from_mongo(client_name: str, app_name: str, project_name: str, limit: int = 10):
    """Retrieve clustering metadata history."""
    try:
        # Get recent metadata entries for this client/app/project
        cursor = clustering_metadata_coll.find({
            "client_name": client_name,
            "app_name": app_name,
            "project_name": project_name
        }).sort("created_at", -1).limit(limit)
        
        results = await cursor.to_list(length=limit)
        return results
    except Exception as e:
        logger.error(f"MongoDB read error for clustering_metadata: {e}")
        return []
