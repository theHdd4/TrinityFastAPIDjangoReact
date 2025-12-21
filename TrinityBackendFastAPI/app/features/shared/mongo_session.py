"""
Shared MongoDB session storage functions for table and dataframe-operations.
"""
import asyncio
import io
import logging
import os
from datetime import datetime
from typing import Dict, Optional, List, Any, Tuple
from motor.motor_asyncio import AsyncIOMotorClient

from app.core.mongo import build_host_mongo_uri

logger = logging.getLogger(__name__)

# MongoDB configuration
MONGO_URI = os.getenv("MONGO_URI", build_host_mongo_uri())
MONGO_DB = os.getenv("MONGO_DB", "trinity_db")

# Draft save queue for debounced saves
_draft_save_queue: Dict[str, asyncio.Task] = {}


async def save_session_metadata(
    session_id: str,
    atom_id: str,
    project_id: str,
    object_name: str,
    session_type: str,  # "table" or "dataframe"
    has_unsaved_changes: bool = False,
    draft_object_name: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None
) -> bool:
    """
    Save session metadata to MongoDB.
    
    Args:
        session_id: Session ID (table_id or df_id)
        atom_id: Atom ID
        project_id: Project ID
        object_name: Original file path in MinIO
        session_type: Type of session ("table" or "dataframe")
        has_unsaved_changes: Whether there are unsaved changes
        draft_object_name: Path to draft file in MinIO (if exists)
        metadata: Additional metadata
        
    Returns:
        True if successful, False otherwise
    """
    try:
        client = AsyncIOMotorClient(MONGO_URI)
        db = client[MONGO_DB]
        coll = db[f"{session_type}_sessions"]
        
        update_doc = {
            "atom_id": atom_id,
            "project_id": project_id,
            "object_name": object_name,
            "session_type": session_type,
            "has_unsaved_changes": has_unsaved_changes,
            "last_modified": datetime.utcnow(),
            "last_accessed": datetime.utcnow(),
        }
        
        if draft_object_name:
            update_doc["draft_object_name"] = draft_object_name
        
        if metadata:
            update_doc["metadata"] = metadata
        
        await coll.update_one(
            {"_id": session_id},
            {
                "$set": update_doc,
                "$setOnInsert": {
                    "created_at": datetime.utcnow(),
                }
            },
            upsert=True
        )
        
        logger.info(f"💾 [SESSION] Saved metadata for {session_type} session {session_id}")
        client.close()
        return True
    except Exception as e:
        logger.error(f"❌ [SESSION] Failed to save metadata for {session_id}: {e}")
        return False


async def get_session_metadata(session_id: str, session_type: str) -> Optional[Dict[str, Any]]:
    """
    Get session metadata from MongoDB.
    
    Args:
        session_id: Session ID
        session_type: Type of session ("table" or "dataframe")
        
    Returns:
        Session metadata dict or None if not found
    """
    try:
        client = AsyncIOMotorClient(MONGO_URI)
        db = client[MONGO_DB]
        coll = db[f"{session_type}_sessions"]
        
        doc = await coll.find_one({"_id": session_id})
        client.close()
        
        if doc:
            result = {
                "session_id": str(doc.get("_id", session_id)),
                "atom_id": doc.get("atom_id"),
                "project_id": doc.get("project_id"),
                "object_name": doc.get("object_name"),
                "draft_object_name": doc.get("draft_object_name"),
                "has_unsaved_changes": doc.get("has_unsaved_changes", False),
                "created_at": doc.get("created_at").isoformat() if doc.get("created_at") else None,
                "last_modified": doc.get("last_modified").isoformat() if doc.get("last_modified") else None,
                "last_accessed": doc.get("last_accessed").isoformat() if doc.get("last_accessed") else None,
                "metadata": doc.get("metadata", {}),
            }
            return result
        return None
    except Exception as e:
        logger.error(f"❌ [SESSION] Failed to get metadata for {session_id}: {e}")
        return None


async def update_session_access_time(session_id: str, session_type: str) -> bool:
    """Update last_accessed timestamp for a session."""
    try:
        client = AsyncIOMotorClient(MONGO_URI)
        db = client[MONGO_DB]
        coll = db[f"{session_type}_sessions"]
        
        await coll.update_one(
            {"_id": session_id},
            {"$set": {"last_accessed": datetime.utcnow()}}
        )
        
        client.close()
        return True
    except Exception as e:
        logger.error(f"❌ [SESSION] Failed to update access time for {session_id}: {e}")
        return False


async def save_change_log(
    session_id: str,
    atom_id: str,
    session_type: str,
    change_type: str,
    change_data: Dict[str, Any]
) -> bool:
    """
    Save a change to MongoDB change log.
    
    Args:
        session_id: Session ID
        atom_id: Atom ID
        session_type: Type of session ("table" or "dataframe")
        change_type: Type of change
        change_data: Change-specific data
        
    Returns:
        True if successful
    """
    try:
        client = AsyncIOMotorClient(MONGO_URI)
        db = client[MONGO_DB]
        coll = db[f"{session_type}_changes"]
        
        await coll.insert_one({
            "session_id": session_id,
            "atom_id": atom_id,
            "session_type": session_type,
            "change_type": change_type,
            "change_data": change_data,
            "timestamp": datetime.utcnow(),
            "applied": False
        })
        
        client.close()
        logger.debug(f"📝 [CHANGE] Logged {change_type} for {session_type} session {session_id}")
        return True
    except Exception as e:
        logger.error(f"❌ [CHANGE] Failed to log change for {session_id}: {e}")
        return False


async def mark_changes_applied(session_id: str, session_type: str) -> bool:
    """Mark all changes for a session as applied (after save)."""
    try:
        client = AsyncIOMotorClient(MONGO_URI)
        db = client[MONGO_DB]
        coll = db[f"{session_type}_changes"]
        
        await coll.update_many(
            {"session_id": session_id, "applied": False},
            {"$set": {"applied": True}}
        )
        
        client.close()
        logger.info(f"✅ [CHANGE] Marked changes as applied for {session_type} session {session_id}")
        return True
    except Exception as e:
        logger.error(f"❌ [CHANGE] Failed to mark changes as applied for {session_id}: {e}")
        return False


async def queue_draft_save(
    session_id: str,
    df: Any,  # pl.DataFrame
    atom_id: str,
    project_id: str,
    object_name: str,
    session_type: str,
    save_func: callable,  # Function to save DataFrame to MinIO
    debounce_seconds: float = 5.0
) -> None:
    """
    Queue a debounced draft save to MinIO.
    
    Args:
        session_id: Session ID
        df: DataFrame to save as draft
        atom_id: Atom ID
        project_id: Project ID
        object_name: Original file path
        session_type: Type of session ("table" or "dataframe")
        save_func: Function to save DataFrame (takes df, object_name)
        debounce_seconds: Delay before saving (default 5 seconds)
    """
    # Cancel existing task if any
    if session_id in _draft_save_queue:
        try:
            _draft_save_queue[session_id].cancel()
        except Exception:
            pass
    
    async def save_draft():
        try:
            await asyncio.sleep(debounce_seconds)
            
            # Save draft to MinIO
            draft_object_name = f"temp/draft_{session_type}_{session_id}.arrow"
            await asyncio.to_thread(save_func, df, draft_object_name)
            
            # Calculate metadata
            metadata = {
                "row_count": df.height,
                "column_count": df.width,
            }
            
            # Update MongoDB metadata
            await save_session_metadata(
                session_id=session_id,
                atom_id=atom_id,
                project_id=project_id,
                object_name=object_name,
                session_type=session_type,
                has_unsaved_changes=True,
                draft_object_name=draft_object_name,
                metadata=metadata
            )
            
            logger.info(f"💾 [DRAFT] Saved draft for {session_type} session {session_id} ({metadata['row_count']} rows)")
        except asyncio.CancelledError:
            logger.debug(f"⏸️ [DRAFT] Draft save cancelled for {session_type} session {session_id}")
        except Exception as e:
            logger.error(f"❌ [DRAFT] Failed to save draft for {session_id}: {e}")
        finally:
            # Remove from queue
            _draft_save_queue.pop(session_id, None)
    
    # Create and store task
    task = asyncio.create_task(save_draft())
    _draft_save_queue[session_id] = task


async def clear_draft(session_id: str, session_type: str, minio_client: Any, bucket: str) -> bool:
    """
    Clear draft file and mark session as saved.
    
    Args:
        session_id: Session ID
        session_type: Type of session ("table" or "dataframe")
        minio_client: MinIO client instance
        bucket: MinIO bucket name
        
    Returns:
        True if successful
    """
    try:
        metadata = await get_session_metadata(session_id, session_type)
        if not metadata:
            return False
        
        draft_object_name = metadata.get("draft_object_name")
        
        # Delete draft from MinIO if exists
        if draft_object_name:
            try:
                minio_client.remove_object(bucket, draft_object_name)
                logger.info(f"🗑️ [DRAFT] Deleted draft file: {draft_object_name}")
            except Exception as e:
                logger.warning(f"⚠️ [DRAFT] Failed to delete draft file: {e}")
        
        # Update MongoDB metadata
        client = AsyncIOMotorClient(MONGO_URI)
        db = client[MONGO_DB]
        coll = db[f"{session_type}_sessions"]
        
        await coll.update_one(
            {"_id": session_id},
            {
                "$set": {
                    "has_unsaved_changes": False,
                    "last_modified": datetime.utcnow(),
                },
                "$unset": {
                    "draft_object_name": ""
                }
            }
        )
        
        # Mark changes as applied
        await mark_changes_applied(session_id, session_type)
        
        client.close()
        logger.info(f"✅ [DRAFT] Cleared draft for {session_type} session {session_id}")
        return True
    except Exception as e:
        logger.error(f"❌ [DRAFT] Failed to clear draft for {session_id}: {e}")
        return False



