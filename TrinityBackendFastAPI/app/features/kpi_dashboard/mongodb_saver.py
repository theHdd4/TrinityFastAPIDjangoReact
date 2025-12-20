# app/features/kpi_dashboard/mongodb_saver.py

import os
import io
import uuid
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
import logging
from typing import Any, Dict, List, Optional

import pandas as pd
import pyarrow as pa
import pyarrow.ipc as ipc

from app.core.mongo import build_host_mongo_uri
from app.DataStorageRetrieval.minio_utils import ensure_minio_bucket, upload_to_minio
from app.DataStorageRetrieval.arrow_client import download_dataframe
from app.features.data_upload_validate.app.routes import get_object_prefix

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

# ✅ SAFEGUARD: Aggressively clean up old collection on every operation
async def _cleanup_old_collection():
    """Remove the old kpi_dashboard_configs collection if it exists (runs on every operation)."""
    try:
        collections = await db.list_collection_names()
        if "kpi_dashboard_configs" in collections:
            # First, try to migrate any existing data
            old_collection = db["kpi_dashboard_configs"]
            old_docs = await old_collection.find({}).to_list(length=None)
            
            if old_docs:
                logger.warning(f"🔄 Found {len(old_docs)} documents in old collection, migrating to atom_list_configuration...")
                for doc in old_docs:
                    # Migrate to new collection
                    await db["atom_list_configuration"].replace_one(
                        {"_id": doc["_id"]},
                        doc,
                        upsert=True
                    )
                logger.info(f"✅ Migrated {len(old_docs)} documents to atom_list_configuration")
            
            # Now drop the old collection
            await db.drop_collection("kpi_dashboard_configs")
            logger.warning("🗑️ Removed old kpi_dashboard_configs collection (migrated to atom_list_configuration)")
    except Exception as e:
        logger.error(f"⚠️ Error cleaning up old collection: {e}")

async def _extract_and_save_table_data_to_minio(
    layouts: List[Dict[str, Any]],
    atom_id: str,
    client_name: str,
    app_name: str,
    project_name: str,
    explicit_save: bool = False
) -> Dict[str, str]:
    """
    Extract table row data from layouts and determine MinIO paths.
    Only saves to MinIO if explicit_save=True (user clicked Save/Save As).
    During autosave, uses existing minio_path or sourceFile from table API saves.
    
    Returns a mapping of box_id -> minio_path for tables that have row data.
    """
    table_data_paths = {}
    
    try:
        # Get object prefix
        prefix = await get_object_prefix()
        if isinstance(prefix, tuple):
            prefix = prefix[0]
        if not prefix.endswith("/"):
            prefix = f"{prefix}/"
        
        object_prefix = f"{prefix}kpi_dashboard/tables/"
        ensure_minio_bucket()
        
        # Iterate through all layouts and boxes
        for layout in layouts:
            if not isinstance(layout, dict) or "boxes" not in layout:
                continue
                
            for box in layout.get("boxes", []):
                if not isinstance(box, dict):
                    continue
                    
                # Check if this box has table settings with row data
                table_settings = box.get("tableSettings")
                if not table_settings or not isinstance(table_settings, dict):
                    continue
                
                table_data = table_settings.get("tableData")
                if not table_data or not isinstance(table_data, dict):
                    continue
                
                box_id = box.get("id", f"box_{uuid.uuid4().hex[:8]}")
                
                # Check if tableData has rows (actual data)
                rows = table_data.get("rows")
                has_rows = rows and isinstance(rows, list) and len(rows) > 0
                
                if not has_rows:
                    continue  # Skip tables without rows
                
                # Priority order for MinIO path:
                # 1. Existing minio_path (from previous KPI dashboard save)
                # 2. sourceFile (from table API Save/Save As buttons)
                # 3. Create new path if explicit_save=True
                existing_minio_path = table_data.get("minio_path")
                source_file = table_settings.get("sourceFile")  # From table API saves
                
                if existing_minio_path:
                    # Use existing minio_path (from previous save)
                    table_data_paths[box_id] = existing_minio_path
                    logger.debug(f"🔄 Using existing minio_path for box {box_id}: {existing_minio_path}")
                elif source_file:
                    # Use sourceFile from table API (table was saved via Save/Save As buttons)
                    table_data_paths[box_id] = source_file
                    logger.debug(f"🔄 Using sourceFile as minio_path for box {box_id}: {source_file}")
                elif explicit_save:
                    # Explicit save: create new MinIO file
                    try:
                        # Convert rows to DataFrame
                        df = pd.DataFrame(rows)
                        
                        # Convert to Arrow format
                        table = pa.Table.from_pandas(df)
                        sink = pa.BufferOutputStream()
                        with ipc.new_file(sink, table.schema) as writer:
                            writer.write_table(table)
                        file_bytes = sink.getvalue().to_pybytes()
                        
                        # Generate filename
                        file_name = f"{atom_id}_{box_id}_table_data.arrow"
                        
                        # Upload to MinIO
                        upload_result = upload_to_minio(file_bytes, file_name, object_prefix)
                        
                        if upload_result.get("status") == "success":
                            minio_path = upload_result["object_name"]
                            table_data_paths[box_id] = minio_path
                            logger.info(f"✅ Saved table row data to MinIO: {minio_path} (box_id: {box_id}, rows: {len(df)})")
                        else:
                            logger.error(f"❌ Failed to save table row data to MinIO for box {box_id}: {upload_result.get('error_message')}")
                            
                    except Exception as e:
                        logger.error(f"❌ Error saving table data to MinIO for box {box.get('id', 'unknown')}: {e}")
                        continue
                else:
                    # Autosave but no existing path: still need to track that rows should be stripped
                    # Use table_id as fallback (rows will be loaded from table session when needed)
                    table_id = table_data.get("table_id") or table_settings.get("tableId")
                    if table_id:
                        # Mark that rows exist but will be loaded from table session
                        table_data_paths[box_id] = f"table_session:{table_id}"
                        logger.debug(f"🔄 Table {box_id} has rows but no MinIO path yet, using table_id: {table_id}")
        
        return table_data_paths
        
    except Exception as e:
        logger.error(f"❌ Error in _extract_and_save_table_data_to_minio: {e}")
        return {}


async def _remove_table_row_data_from_mongodb(layouts: List[Dict[str, Any]], table_data_paths: Dict[str, str]) -> List[Dict[str, Any]]:
    """
    Remove row data from tableData in layouts, keeping only metadata.
    Store MinIO path in tableData for later retrieval.
    Always strips rows if tableData has rows, regardless of whether we have a minio_path.
    """
    processed_layouts = []
    
    for layout in layouts:
        if not isinstance(layout, dict):
            processed_layouts.append(layout)
            continue
            
        processed_layout = layout.copy()
        processed_boxes = []
        
        for box in layout.get("boxes", []):
            if not isinstance(box, dict):
                processed_boxes.append(box)
                continue
                
            processed_box = box.copy()
            table_settings = box.get("tableSettings")
            
            if table_settings and isinstance(table_settings, dict):
                box_id = box.get("id")
                table_data = table_settings.get("tableData", {})
                
                # Always strip rows if tableData has rows (regardless of minio_path)
                if isinstance(table_data, dict) and "rows" in table_data:
                    processed_table_settings = table_settings.copy()
                    processed_table_data = table_data.copy()
                    
                    # Remove rows, keep metadata (columns, row_count, etc.)
                    rows = processed_table_data.pop("rows", None)
                    has_rows = rows and isinstance(rows, list) and len(rows) > 0
                    
                    if has_rows:
                        # Store MinIO path if we have one
                        if box_id in table_data_paths:
                            minio_path = table_data_paths[box_id]
                            # Don't store table_session: prefix in minio_path
                            if not minio_path.startswith("table_session:"):
                                processed_table_data["minio_path"] = minio_path
                                processed_table_data["rows_stored_in_minio"] = True
                            else:
                                # Table session fallback - rows will be loaded from table session
                                processed_table_data["rows_stored_in_minio"] = False
                                logger.debug(f"📋 Table {box_id} rows will be loaded from table session")
                        else:
                            # No minio_path yet, but still strip rows
                            # Rows will be loaded from table session when needed
                            processed_table_data["rows_stored_in_minio"] = False
                            logger.debug(f"📋 Table {box_id} has rows but no MinIO path, will load from session")
                        
                        processed_table_settings["tableData"] = processed_table_data
                        processed_box["tableSettings"] = processed_table_settings
                
            processed_boxes.append(processed_box)
        
        processed_layout["boxes"] = processed_boxes
        processed_layouts.append(processed_layout)
    
    return processed_layouts


async def save_kpi_dashboard_config(
    client_name: str,
    app_name: str,
    project_name: str,
    atom_id: str,
    kpi_dashboard_data: dict,
    *,
    user_id: str = "",
    project_id: int | None = None,
    explicit_save: bool = False,
):
    """
    Save KPI Dashboard configuration data to MongoDB atom_list_configuration collection.
    Table row data is stored in MinIO, only metadata is stored in MongoDB.
    Always overwrites the entire document for the given document_id (no merging).
    Each atom instance gets its own document using atom_id in the key.
    
    Args:
        explicit_save: If True, saves table row data to MinIO (user clicked Save/Save As).
                       If False (autosave), only strips rows from MongoDB and reuses existing minio_path.
    """
    try:
        # ✅ SAFEGUARD: Aggressively clean up old collection on every save
        await _cleanup_old_collection()
        
        document_id = f"{client_name}/{app_name}/{project_name}/{atom_id}"
        
        # ✅ STEP 1: Extract table row data and save to MinIO (only if explicit_save=True)
        layouts = kpi_dashboard_data.get("layouts", [])
        table_data_paths = await _extract_and_save_table_data_to_minio(
            layouts, atom_id, client_name, app_name, project_name, explicit_save=explicit_save
        )
        
        # ✅ STEP 2: Remove row data from layouts, keep only metadata
        processed_data = kpi_dashboard_data.copy()
        if layouts:
            processed_data["layouts"] = await _remove_table_row_data_from_mongodb(layouts, table_data_paths)
        
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
            **processed_data,
        }
        
        # Use replace_one with upsert=True to overwrite if exists, insert if not exists
        result = await db["atom_list_configuration"].replace_one(
            {"_id": document_id},
            document,
            upsert=True
        )
        
        # Determine operation type based on result
        operation = "updated" if result.matched_count > 0 else "inserted"
        
        logger.info(f"📦 {'Overwritten' if operation == 'updated' else 'Inserted'} document in atom_list_configuration: {document_id}")
        if table_data_paths:
            logger.info(f"📊 Saved {len(table_data_paths)} table(s) row data to MinIO")
        
        return {
            "status": "success", 
            "mongo_id": document_id,
            "operation": operation,
            "collection": "atom_list_configuration",
            "tables_saved_to_minio": len(table_data_paths)
        }
        
    except Exception as e:
        logger.error(f"❌ MongoDB save error for atom_list_configuration: {e}")
        return {"status": "error", "error": str(e)}

async def _load_table_row_data_from_minio(layouts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Load table row data from MinIO for tables that have minio_path or sourceFile stored.
    Priority: Session (if tableId exists and has unsaved changes) > MinIO > table_session: marker
    
    CRITICAL: If tableId exists, prefer loading from session (which has latest edits)
    rather than MinIO (which may have stale data until Save is clicked).
    """
    
    processed_layouts = []
    
    for layout in layouts:
        if not isinstance(layout, dict):
            processed_layouts.append(layout)
            continue
            
        processed_layout = layout.copy()
        processed_boxes = []
        
        for box in layout.get("boxes", []):
            if not isinstance(box, dict):
                processed_boxes.append(box)
                continue
                
            processed_box = box.copy()
            table_settings = box.get("tableSettings")
            
            if table_settings and isinstance(table_settings, dict):
                table_data = table_settings.get("tableData", {})
                
                # Get tableId - if exists, prefer loading from session (has latest edits)
                table_id = None
                if isinstance(table_data, dict):
                    table_id = table_data.get("table_id")
                if not table_id:
                    table_id = table_settings.get("tableId")
                
                # Determine MinIO path: prefer minio_path, fallback to sourceFile
                minio_path = None
                if isinstance(table_data, dict):
                    minio_path = table_data.get("minio_path")
                if not minio_path:
                    # Fallback to sourceFile (from table API Save/Save As)
                    minio_path = table_settings.get("sourceFile")
                
                # Skip table_session: prefix (rows loaded from table session)
                if minio_path and minio_path.startswith("table_session:"):
                    logger.debug(f"📋 Table {box.get('id')} will load rows from table session")
                    processed_boxes.append(processed_box)
                    continue
                
                # PRIORITY 1: If tableId exists, try to load from session first (has latest edits)
                if table_id and isinstance(table_data, dict):
                    try:
                        # Check if session exists in memory
                        from app.features.table.service import SESSIONS
                        from app.features.table.service import restore_session_from_draft
                        
                        if table_id in SESSIONS:
                            df = SESSIONS[table_id]
                            rows = df.to_dicts()
                            
                            # Restore rows from session (has latest edits)
                            processed_table_data = table_data.copy()
                            processed_table_data["rows"] = rows
                            if minio_path:
                                processed_table_data["minio_path"] = minio_path
                            processed_table_data["rows_loaded_from_session"] = True
                            processed_table_data["rows_stored_in_minio"] = False  # May be stale
                            
                            processed_table_settings = table_settings.copy()
                            processed_table_settings["tableData"] = processed_table_data
                            processed_box["tableSettings"] = processed_table_settings
                            
                            logger.info(f"✅ Loaded table row data from SESSION {table_id} (has latest edits, {len(rows)} rows)")
                            processed_boxes.append(processed_box)
                            continue
                        else:
                            # Session not in memory, try to restore from draft
                            df = await restore_session_from_draft(table_id)
                            if df is not None:
                                rows = df.to_dicts()
                                
                                # Restore rows from draft session
                                processed_table_data = table_data.copy()
                                processed_table_data["rows"] = rows
                                if minio_path:
                                    processed_table_data["minio_path"] = minio_path
                                processed_table_data["rows_loaded_from_session"] = True
                                processed_table_data["rows_stored_in_minio"] = False
                                
                                processed_table_settings = table_settings.copy()
                                processed_table_settings["tableData"] = processed_table_data
                                processed_box["tableSettings"] = processed_table_settings
                                
                                logger.info(f"✅ Restored table row data from SESSION DRAFT {table_id} (has latest edits, {len(rows)} rows)")
                                processed_boxes.append(processed_box)
                                continue
                    except Exception as session_err:
                        logger.warning(f"⚠️ Failed to load from session {table_id}, falling back to MinIO: {session_err}")
                        # Fall through to MinIO loading
                
                # PRIORITY 2: Load from MinIO (may be stale if user hasn't clicked Save)
                if minio_path and isinstance(table_data, dict):
                    try:
                        # Load data from MinIO using Arrow Flight or direct MinIO
                        df = download_dataframe(minio_path)
                        
                        # Convert DataFrame to list of dicts (rows)
                        rows = df.to_dict("records")
                        
                        # Restore rows in tableData
                        processed_table_data = table_data.copy()
                        processed_table_data["rows"] = rows
                        # Store minio_path if not already stored
                        if not processed_table_data.get("minio_path"):
                            processed_table_data["minio_path"] = minio_path
                        processed_table_data["rows_stored_in_minio"] = True
                        processed_table_data["rows_loaded_from_minio"] = True
                        
                        processed_table_settings = table_settings.copy()
                        processed_table_settings["tableData"] = processed_table_data
                        processed_box["tableSettings"] = processed_table_settings
                        
                        logger.info(f"✅ Loaded table row data from MinIO: {minio_path} (rows: {len(rows)})")
                        
                    except Exception as e:
                        logger.error(f"❌ Failed to load table row data from MinIO ({minio_path}): {e}")
                        # Keep the structure but without rows - frontend will handle gracefully
                
            processed_boxes.append(processed_box)
        
        processed_layout["boxes"] = processed_boxes
        processed_layouts.append(processed_layout)
    
    return processed_layouts


async def get_kpi_dashboard_config(
    client_name: str, 
    app_name: str, 
    project_name: str,
    atom_id: str
):
    """
    Retrieve saved KPI Dashboard configuration for a specific atom instance.
    Loads table row data from MinIO if stored there.
    """
    try:
        # ✅ SAFEGUARD: Clean up old collection on every get operation too
        await _cleanup_old_collection()
        
        document_id = f"{client_name}/{app_name}/{project_name}/{atom_id}"
        result = await db["atom_list_configuration"].find_one({"_id": document_id})
        
        if not result:
            return None
        
        # ✅ Load table row data from MinIO if needed
        layouts = result.get("layouts", [])
        if layouts:
            result["layouts"] = await _load_table_row_data_from_minio(layouts)
        
        return result
    except Exception as e:
        logger.error(f"❌ MongoDB read error for atom_list_configuration: {e}")
        return None

async def delete_kpi_dashboard_config(
    client_name: str, 
    app_name: str, 
    project_name: str,
    atom_id: str
):
    """Delete KPI Dashboard configuration for a specific atom instance."""
    try:
        # ✅ SAFEGUARD: Clean up old collection on every delete operation too
        await _cleanup_old_collection()
        
        document_id = f"{client_name}/{app_name}/{project_name}/{atom_id}"
        result = await db["atom_list_configuration"].delete_one({"_id": document_id})
        
        if result.deleted_count > 0:
            logger.info(f"🗑️ Deleted atom_list_configuration: {document_id}")
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
        logger.error(f"❌ MongoDB delete error for atom_list_configuration: {e}")
        return {"status": "error", "error": str(e)}

