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

# Unified collection for all clustering data
clustering_data_coll = db.clustering_data

async def save_clustering_data(
    client_name: str,
    app_name: str,
    project_name: str,
    clustering_data: dict,
    *,
    user_id: str = "",
    project_id: int | None = None,
):
    """Save all clustering data (config, results, metadata) to MongoDB in one collection"""
    logger.info(f"🔍 DEBUG: save_clustering_data called with:")
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
        existing_doc = await clustering_data_coll.find_one({"_id": document_id})
        
        if existing_doc:
            # Update existing document with new data
            logger.info(f"🔍 DEBUG: Existing document found, updating data")
            
            # Create base document with existing data
            updated_document = existing_doc.copy()
            
            # Update timestamp and user info
            updated_document["updated_at"] = datetime.utcnow()
            if user_id:
                updated_document["user_id"] = user_id
            if project_id is not None:
                updated_document["project_id"] = project_id
            
            # Merge clustering_data with existing data
            for key, value in clustering_data.items():
                if key in updated_document:
                    # If key exists and both are lists, extend the list
                    if isinstance(updated_document[key], list) and isinstance(value, list):
                        updated_document[key].extend(value)
                    # If key exists and both are dicts, merge the dicts
                    elif isinstance(updated_document[key], dict) and isinstance(value, dict):
                        updated_document[key].update(value)
                    # Otherwise, replace the value
                    else:
                        updated_document[key] = value
                else:
                    # If key doesn't exist, add it
                    updated_document[key] = value
            
            logger.info(f"🔍 DEBUG: Updated document = {updated_document}")
            
            # Update the existing document
            result = await clustering_data_coll.replace_one(
                {"_id": document_id},
                updated_document
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
            result = await clustering_data_coll.insert_one(document)
            
            operation = "inserted"
        
        logger.info(f"📦 Stored clustering data: {document_id}")
        logger.info(f"🔍 DEBUG: MongoDB result = {result}")
        
        return {
            "status": "success", 
            "mongo_id": document_id,
            "operation": operation,
            "collection": "clustering_data"
        }
        
    except Exception as e:
        logger.error(f"❌ MongoDB save error for clustering_data: {e}")
        return {"status": "error", "error": str(e)}

async def get_clustering_data_from_mongo(client_name: str, app_name: str, project_name: str):
    """Retrieve all clustering data (config, results, metadata) from MongoDB."""
    try:
        document_id = f"{client_name}/{app_name}/{project_name}"
        result = await clustering_data_coll.find_one({"_id": document_id})
        return result
    except Exception as e:
        logger.error(f"MongoDB read error for clustering_data: {e}")
        return None

async def get_all_clustering_projects(client_name: str = None, app_name: str = None):
    """Get all clustering projects, optionally filtered by client and/or app."""
    try:
        filter_query = {}
        if client_name:
            filter_query["client_name"] = client_name
        if app_name:
            filter_query["app_name"] = app_name
            
        cursor = clustering_data_coll.find(filter_query).sort("updated_at", -1)
        results = await cursor.to_list(length=100)  # Limit to 100 projects
        return results
    except Exception as e:
        logger.error(f"MongoDB read error for clustering projects: {e}")
        return []

# Legacy functions for backward compatibility (deprecated)
async def save_clustering_config(
    client_name: str,
    app_name: str,
    project_name: str,
    clustering_data: dict,
    *,
    user_id: str = "",
    project_id: int | None = None,
):
    """DEPRECATED: Use save_clustering_data instead"""
    logger.warning("⚠️ save_clustering_config is deprecated. Use save_clustering_data instead.")
    return await save_clustering_data(client_name, app_name, project_name, clustering_data, user_id=user_id, project_id=project_id)

async def save_clustering_results(
    client_name: str,
    app_name: str,
    project_name: str,
    clustering_results: dict,
    *,
    user_id: str = "",
    project_id: int | None = None,
):
    """DEPRECATED: Use save_clustering_data instead"""
    logger.warning("⚠️ save_clustering_results is deprecated. Use save_clustering_data instead.")
    return await save_clustering_data(client_name, app_name, project_name, clustering_results, user_id=user_id, project_id=project_id)

async def save_clustering_metadata(
    client_name: str,
    app_name: str,
    project_name: str,
    metadata: dict,
    *,
    user_id: str = "",
    project_id: int | None = None,
):
    """DEPRECATED: Use save_clustering_data instead"""
    logger.warning("⚠️ save_clustering_metadata is deprecated. Use save_clustering_data instead.")
    return await save_clustering_data(client_name, app_name, project_name, metadata, user_id=user_id, project_id=project_id)

async def get_clustering_config_from_mongo(client_name: str, app_name: str, project_name: str):
    """DEPRECATED: Use get_clustering_data_from_mongo instead"""
    logger.warning("⚠️ get_clustering_config_from_mongo is deprecated. Use get_clustering_data_from_mongo instead.")
    return await get_clustering_data_from_mongo(client_name, app_name, project_name)

async def get_clustering_results_from_mongo(client_name: str, app_name: str, project_name: str):
    """DEPRECATED: Use get_clustering_data_from_mongo instead"""
    logger.warning("⚠️ get_clustering_results_from_mongo is deprecated. Use get_clustering_data_from_mongo instead.")
    return await get_clustering_data_from_mongo(client_name, app_name, project_name)

async def get_clustering_metadata_from_mongo(client_name: str, app_name: str, project_name: str, limit: int = 10):
    """DEPRECATED: Use get_clustering_data_from_mongo instead"""
    logger.warning("⚠️ get_clustering_metadata_from_mongo is deprecated. Use get_clustering_data_from_mongo instead.")
    return await get_clustering_data_from_mongo(client_name, app_name, project_name)
