# app/features/scenario_planner_category_forecasting/scenario_planner_category_forecasting/mongodb_saver.py

import os
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
import logging

# Configure logging
logger = logging.getLogger(__name__)

# Use the same MongoDB URI as other features for consistency
MONGO_URI = os.getenv("MONGO_URI", "mongodb://admin_dev:pass_dev@10.2.1.65:9005/?authSource=admin")
MONGO_DB = os.getenv("MONGO_DB", "trinity_prod")
client = AsyncIOMotorClient(MONGO_URI)
db = client[MONGO_DB]

async def save_reference_points(
    client_name: str,
    app_name: str,
    project_name: str,
    reference_points_data: dict,
    *,
    user_id: str = "",
    project_id: int | None = None,
):
    """Save reference points data to MongoDB scenario_reference_points collection"""
    try:
        document_id = f"{client_name}/{app_name}/{project_name}"
        
        # Check if document already exists
        existing_doc = await db["scenario_reference_points"].find_one({"_id": document_id})
        
        if existing_doc:
            # Merge new data with existing data instead of replacing
            merged_document = existing_doc.copy()
            
            # Update timestamp and user info
            merged_document["updated_at"] = datetime.utcnow()
            if user_id:
                merged_document["user_id"] = user_id
            if project_id is not None:
                merged_document["project_id"] = project_id
            
            # Merge reference_points_data with existing data
            for key, value in reference_points_data.items():
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
            result = await db["scenario_reference_points"].replace_one(
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
                "operation_type": "scenario_planner_reference_points",
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
                "user_id": user_id,
                "project_id": project_id,
                **reference_points_data,
            }
            
            # Insert new document
            result = await db["scenario_reference_points"].insert_one(document)
            
            operation = "inserted"
        
        logger.info(f"📦 Stored in scenario_reference_points: {document_id}")
        
        return {
            "status": "success", 
            "mongo_id": document_id,
            "operation": operation,
            "collection": "scenario_reference_points"
        }
        
    except Exception as e:
        logger.error(f"❌ MongoDB save error for scenario_reference_points: {e}")
        return {"status": "error", "error": str(e)}

async def save_scenario_configurations(
    client_name: str,
    app_name: str,
    project_name: str,
    scenario_config_data: dict,
    *,
    user_id: str = "",
    project_id: int | None = None,
):
    """Save scenario configurations data to MongoDB scenario_configurations collection"""
    try:
        document_id = f"{client_name}/{app_name}/{project_name}"
        
        # Check if document already exists
        existing_doc = await db["scenario_configurations"].find_one({"_id": document_id})
        
        if existing_doc:
            # Merge new data with existing data instead of replacing
            merged_document = existing_doc.copy()
            
            # Update timestamp and user info
            merged_document["updated_at"] = datetime.utcnow()
            if user_id:
                merged_document["user_id"] = user_id
            if project_id is not None:
                merged_document["project_id"] = project_id
            
            # Merge scenario_config_data with existing data
            for key, value in scenario_config_data.items():
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
            result = await db["scenario_configurations"].replace_one(
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
                "operation_type": "scenario_planner_configurations",
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
                "user_id": user_id,
                "project_id": project_id,
                **scenario_config_data,
            }
            
            # Insert new document
            result = await db["scenario_configurations"].insert_one(document)
            
            operation = "inserted"
        
        logger.info(f"📦 Stored in scenario_configurations: {document_id}")
        
        return {
            "status": "success", 
            "mongo_id": document_id,
            "operation": operation,
            "collection": "scenario_configurations"
        }
        
    except Exception as e:
        logger.error(f"❌ MongoDB save error for scenario_configurations: {e}")
        return {"status": "error", "error": str(e)}

async def get_reference_points_from_mongo(client_name: str, app_name: str, project_name: str):
    """Retrieve saved reference points configuration."""
    try:
        document_id = f"{client_name}/{app_name}/{project_name}"
        result = await db["scenario_reference_points"].find_one({"_id": document_id})
        return result
    except Exception as e:
        logger.error(f"❌ MongoDB read error for scenario_reference_points: {e}")
        return None

async def get_scenario_configurations_from_mongo(client_name: str, app_name: str, project_name: str):
    """Retrieve saved scenario configurations."""
    try:
        document_id = f"{client_name}/{app_name}/{project_name}"
        result = await db["scenario_configurations"].find_one({"_id": document_id})
        return result
    except Exception as e:
        logger.error(f"❌ MongoDB read error for scenario_configurations: {e}")
        return None
