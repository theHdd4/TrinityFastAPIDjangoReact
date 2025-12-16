# app/features/kpi_dashboard/mongodb_saver.py

import os
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
import logging

from app.core.mongo import build_host_mongo_uri

# Configure logging
logger = logging.getLogger(__name__)

# Helper function to mask credentials in URI for logging
def _mask_credentials(uri: str) -> str:
    """Mask credentials in URI for logging"""
    if uri and "@" in uri:
        try:
            credentials = uri.split("@")[0].split("//")[1]
            return uri.replace(credentials, "***:***")
        except IndexError:
            return uri
    return uri if uri else "None"

# ✅ FIX: Use explicit connection string to avoid environment pollution
# Multiple features override MONGO_URI to mongodb://mongo:27017/trinity during import,
# so we can't rely on os.getenv("MONGO_URI"). Use explicit credentials instead.
MONGO_URI = "mongodb://root:rootpass@mongo:27017/trinity_dev?authSource=admin"
MONGO_DB = "trinity_db"

# Allow override via specific KPI_DASHBOARD_MONGO_URI if needed
if os.getenv("KPI_DASHBOARD_MONGO_URI"):
    MONGO_URI = os.getenv("KPI_DASHBOARD_MONGO_URI")
    logger.info(f"📌 Using KPI_DASHBOARD_MONGO_URI override")

# Logging
logger.info(f"🔍 KPI Dashboard MongoDB initialized:")
logger.info(f"  - Database: {MONGO_DB}")
logger.info(f"  - URI: {_mask_credentials(MONGO_URI)}")

client = AsyncIOMotorClient(MONGO_URI)
db = client[MONGO_DB]

async def save_kpi_dashboard_config(
    client_name: str,
    app_name: str,
    project_name: str,
    atom_id: str,
    kpi_dashboard_data: dict,
    *,
    user_id: str = "",
    project_id: int | None = None,
):
    """
    Save KPI Dashboard configuration data to MongoDB kpi_dashboard_configs collection.
    Always overwrites the entire document for the given document_id (no merging).
    Each atom instance gets its own document using atom_id in the key.
    """
    try:
        document_id = f"{client_name}/{app_name}/{project_name}/{atom_id}"
        
        # Create document - always overwrites existing document completely
        document = {
            "_id": document_id,
            "client_name": client_name,
            "app_name": app_name,
            "project_name": project_name,
            "atom_id": atom_id,
            "operation_type": "kpi_dashboard",
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "user_id": user_id,
            "project_id": project_id,
            **kpi_dashboard_data,
        }
        
        # Use replace_one with upsert=True to overwrite if exists, insert if not exists
        result = await db["kpi_dashboard_configs"].replace_one(
            {"_id": document_id},
            document,
            upsert=True
        )
        
        # Determine operation type based on result
        operation = "updated" if result.matched_count > 0 else "inserted"
        
        logger.info(f"📦 {'Overwritten' if operation == 'updated' else 'Inserted'} document in kpi_dashboard_configs: {document_id}")
        
        return {
            "status": "success", 
            "mongo_id": document_id,
            "operation": operation,
            "collection": "kpi_dashboard_configs"
        }
        
    except Exception as e:
        logger.error(f"❌ MongoDB save error for kpi_dashboard_configs: {e}")
        return {"status": "error", "error": str(e)}

async def get_kpi_dashboard_config(
    client_name: str, 
    app_name: str, 
    project_name: str,
    atom_id: str
):
    """Retrieve saved KPI Dashboard configuration for a specific atom instance."""
    try:
        document_id = f"{client_name}/{app_name}/{project_name}/{atom_id}"
        result = await db["kpi_dashboard_configs"].find_one({"_id": document_id})
        return result
    except Exception as e:
        logger.error(f"❌ MongoDB read error for kpi_dashboard_configs: {e}")
        return None

async def delete_kpi_dashboard_config(
    client_name: str, 
    app_name: str, 
    project_name: str,
    atom_id: str
):
    """Delete KPI Dashboard configuration for a specific atom instance."""
    try:
        document_id = f"{client_name}/{app_name}/{project_name}/{atom_id}"
        result = await db["kpi_dashboard_configs"].delete_one({"_id": document_id})
        
        if result.deleted_count > 0:
            logger.info(f"🗑️ Deleted kpi_dashboard_configs: {document_id}")
            return {
                "status": "success",
                "message": "Configuration deleted successfully",
                "deleted_count": result.deleted_count
            }
        else:
            logger.warning(f"⚠️ No document found to delete: {document_id}")
            return {
                "status": "not_found",
                "message": "Configuration not found"
            }
    except Exception as e:
        logger.error(f"❌ MongoDB delete error for kpi_dashboard_configs: {e}")
        return {"status": "error", "error": str(e)}

