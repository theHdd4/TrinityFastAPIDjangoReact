# app/database.py - MongoDB operations for Data Upload Atom System

from pymongo import MongoClient
from datetime import datetime
import logging
import os
from urllib.parse import quote
import uuid

# MongoDB Configuration
# Allow explicit credentials or a full URI.  If no credentials are supplied
# the connection will be attempted without authentication which is fine for
# local development.
MONGODB_URL = os.getenv("MONGO_URI", "mongodb://mongo:27017")
# Accept both MONGO_USERNAME and legacy MONGO_USER for credentials
MONGO_USER = os.getenv("MONGO_USERNAME") or os.getenv("MONGO_USER")
MONGO_PASSWORD = os.getenv("MONGO_PASSWORD")
MONGO_AUTH_DB = os.getenv("MONGO_AUTH_DB", "admin")

DATABASE_NAME = "validator_atoms_db"
# operation logs live in a separate database so they can be shared across
# services.  The rest of the validator atom data remains in
# ``validator_atoms_db``.
TRINITY_DB_NAME = "trinity_db"

# Collection Names
COLLECTIONS = {
    "VALIDATOR_ATOMS": "validator_atoms",
    "BUSINESS_DIMENSIONS": "business_dimensions_with_assignments",
    "VALIDATION_LOGS": "validation_logs",
    "VALIDATION_CONFIG": "validation_config",
    "VALIDATION_UNITS": "validation_units",
    "OPERATION_LOGS": "operation_logs",
    "GUIDED_WORKFLOW": "trinity_guided_workflow",
    "GUIDED_WORKFLOW_FOOTPRINTS": "trinity_guided_workflow_footprints",
    "GUIDED_WORKFLOW_SUMMARY": "trinity_guided_workflow_summary",
}

# Initialize MongoDB client with timeout
try:
    # Check if credentials are already in the URI
    uri_has_credentials = "@" in MONGODB_URL.split("//", 1)[-1]
    
    # Build auth kwargs
    auth_kwargs = {}
    if not uri_has_credentials:
        # If URI doesn't have credentials, use env vars or defaults
        mongo_username = MONGO_USER or "root"
        mongo_password = MONGO_PASSWORD or "rootpass"
        
        if mongo_username and mongo_password:
            auth_kwargs = {
                "username": mongo_username,
                "password": mongo_password,
                "authSource": MONGO_AUTH_DB,
            }
    
    mongo_client = MongoClient(
        MONGODB_URL,
        **auth_kwargs,
        serverSelectionTimeoutMS=5000,
    )
    db = mongo_client[DATABASE_NAME]
    trinity_db = mongo_client[TRINITY_DB_NAME]
    
    # Test connection
    mongo_client.admin.command('ping')
    # Also test write access to ensure authentication works
    try:
        trinity_db[COLLECTIONS["GUIDED_WORKFLOW"]].find_one({})
    except Exception as auth_test_error:
        # If read fails, try to reconnect with explicit credentials
        if "authentication" in str(auth_test_error).lower() or "unauthorized" in str(auth_test_error).lower():
            logging.warning(f"MongoDB authentication test failed: {auth_test_error}. Attempting reconnection with credentials.")
            # Close existing client
            mongo_client.close()
            # Reconnect with explicit credentials (use defaults if not provided)
            mongo_username = MONGO_USER or "root"
            mongo_password = MONGO_PASSWORD or "rootpass"
            auth_kwargs = {
                "username": mongo_username,
                "password": mongo_password,
                "authSource": MONGO_AUTH_DB,
            }
            mongo_client = MongoClient(
                MONGODB_URL,
                **auth_kwargs,
                serverSelectionTimeoutMS=5000,
            )
            db = mongo_client[DATABASE_NAME]
            trinity_db = mongo_client[TRINITY_DB_NAME]
            mongo_client.admin.command('ping')
    
    print(f"[OK] Connected to MongoDB at {MONGODB_URL}")
    
except Exception as e:
    print(f"[ERROR] MongoDB connection failed: {e}")
    mongo_client = None
    db = None
    trinity_db = None

def check_mongodb_connection():
    """Check if MongoDB is available and authenticated"""
    global mongo_client, db, trinity_db
    
    if mongo_client is None or db is None or trinity_db is None:
        return False
    
    try:
        # Test authentication by attempting a read operation
        mongo_client.admin.command('ping')
        # Also test access to the database we'll be using
        trinity_db.command('ping')
        return True
    except Exception as e:
        # If authentication fails, try to reconnect
        if "authentication" in str(e).lower() or "unauthorized" in str(e).lower():
            logging.warning(f"MongoDB authentication check failed: {e}. Attempting to reconnect.")
            try:
                if mongo_client:
                    mongo_client.close()
                
                # Reconnect with credentials
                uri_has_credentials = "@" in MONGODB_URL.split("//", 1)[-1]
                auth_kwargs = {}
                if not uri_has_credentials:
                    mongo_username = MONGO_USER or "root"
                    mongo_password = MONGO_PASSWORD or "rootpass"
                    if mongo_username and mongo_password:
                        auth_kwargs = {
                            "username": mongo_username,
                            "password": mongo_password,
                            "authSource": MONGO_AUTH_DB,
                        }
                
                mongo_client = MongoClient(
                    MONGODB_URL,
                    **auth_kwargs,
                    serverSelectionTimeoutMS=5000,
                )
                db = mongo_client[DATABASE_NAME]
                trinity_db = mongo_client[TRINITY_DB_NAME]
                mongo_client.admin.command('ping')
                trinity_db.command('ping')
                logging.info("✅ MongoDB reconnected with authentication")
                return True
            except Exception as reconnect_error:
                logging.error(f"Failed to reconnect to MongoDB: {reconnect_error}")
                return False
        return False


def log_operation_to_mongo(
    user_id: str,
    client_id: str,
    validator_atom_id: str,
    operation: str,
    details: dict,
    user_name: str = "",
    client_name: str = "",
    app_id: str = "",
    app_name: str = "",
    project_id: str = "",
    project_name: str = "",
):
    """Record a high level operation performed by a user."""
    if not check_mongodb_connection():
        return {"status": "error", "error": "MongoDB not connected"}

    try:
        document = {
            "user_id": user_id,
            "user_name": user_name,
            "client_id": client_id,
            "client_name": client_name,
            "app_id": app_id,
            "app_name": app_name,
            "project_id": project_id,
            "project_name": project_name,
            "validator_atom_id": validator_atom_id,
            "operation": operation,
            "timestamp": datetime.utcnow(),
            "details": details,
        }

        result = trinity_db[COLLECTIONS["OPERATION_LOGS"]].insert_one(document)
        print(f"[STORED] Stored in {COLLECTIONS['OPERATION_LOGS']}: {document}")

        return {
            "status": "success",
            "mongo_id": str(result.inserted_id),
            "collection": COLLECTIONS["OPERATION_LOGS"],
        }

    except Exception as e:
        logging.error(f"MongoDB save error for operation log: {e}")
        return {"status": "error", "error": str(e)}


def mark_operation_log_deleted(object_name: str):
    """Mark operation log entries associated with a dataframe as deleted."""
    if not check_mongodb_connection():
        return {"status": "error", "error": "MongoDB not connected"}

    try:
        result = trinity_db[COLLECTIONS["OPERATION_LOGS"]].update_many(
            {
                "details.files_saved": {
                    "$elemMatch": {"minio_upload.object_name": object_name}
                }
            },
            {
                "$set": {"deleted": True, "deleted_at": datetime.utcnow()}
            },
        )
        return {
            "status": "success",
            "matched": result.matched_count,
            "modified": result.modified_count,
        }
    except Exception as e:
        logging.error(
            f"MongoDB mark delete error for operation log ({object_name}): {e}"
        )
        return {"status": "error", "error": str(e)}


def save_guided_workflow_state(
    user_id: str,
    dataset_id: str,
    workflow_state: dict,
    client_name: str = "",
    app_name: str = "",
    project_name: str = "",
) -> dict:
    """
    Save guided workflow state for a user and dataset.
    
    Structure: {user_id}/{dataset_id}/workflow_state
    
    Args:
        user_id: User identifier
        dataset_id: Dataset identifier (typically file path or name)
        workflow_state: Complete workflow state dictionary
        client_name: Client name for context
        app_name: App name for context
        project_name: Project name for context
    
    Returns:
        dict with status and mongo_id
    """
    if not check_mongodb_connection():
        return {"status": "error", "error": "MongoDB not connected"}

    try:
        # Create a unique document ID based on user_id and dataset_id
        document_id = f"{user_id}:{dataset_id}"
        
        document = {
            "_id": document_id,
            "user_id": user_id,
            "dataset_id": dataset_id,
            "client_name": client_name,
            "app_name": app_name,
            "project_name": project_name,
            "workflow_state": workflow_state,
            "updated_at": datetime.utcnow(),
            "created_at": datetime.utcnow(),
        }
        
        # Use upsert to update if exists, insert if not
        result = trinity_db[COLLECTIONS["GUIDED_WORKFLOW"]].replace_one(
            {"_id": document_id},
            document,
            upsert=True
        )
        
        # Update created_at only if this is a new document
        if result.upserted_id:
            logging.info(f"[STORED] New guided workflow state: {document_id}")
        else:
            # For updates, preserve original created_at
            trinity_db[COLLECTIONS["GUIDED_WORKFLOW"]].update_one(
                {"_id": document_id},
                {"$set": {"updated_at": datetime.utcnow()}},
            )
            logging.info(f"[UPDATED] Guided workflow state: {document_id}")

        return {
            "status": "success",
            "mongo_id": document_id,
            "collection": COLLECTIONS["GUIDED_WORKFLOW"],
            "is_new": result.upserted_id is not None,
        }

    except Exception as e:
        logging.error(f"MongoDB save error for guided workflow state: {e}")
        return {"status": "error", "error": str(e)}


def get_guided_workflow_state(
    user_id: str,
    dataset_id: str,
) -> dict:
    """
    Get guided workflow state for a user and dataset.
    
    Args:
        user_id: User identifier
        dataset_id: Dataset identifier (typically file path or name)
    
    Returns:
        dict with status and workflow_state if found
    """
    if not check_mongodb_connection():
        return {"status": "error", "error": "MongoDB not connected"}

    try:
        document_id = f"{user_id}:{dataset_id}"
        document = trinity_db[COLLECTIONS["GUIDED_WORKFLOW"]].find_one(
            {"_id": document_id}
        )
        
        if document:
            return {
                "status": "success",
                "workflow_state": document.get("workflow_state", {}),
                "updated_at": document.get("updated_at"),
                "created_at": document.get("created_at"),
            }
        else:
            return {
                "status": "not_found",
                "workflow_state": None,
            }

    except Exception as e:
        logging.error(f"MongoDB get error for guided workflow state: {e}")
        return {"status": "error", "error": str(e)}


def delete_guided_workflow_state(
    user_id: str,
    dataset_id: str,
) -> dict:
    """
    Delete guided workflow state for a user and dataset.
    
    Args:
        user_id: User identifier
        dataset_id: Dataset identifier (typically file path or name)
    
    Returns:
        dict with status
    """
    if not check_mongodb_connection():
        return {"status": "error", "error": "MongoDB not connected"}

    try:
        document_id = f"{user_id}:{dataset_id}"
        result = trinity_db[COLLECTIONS["GUIDED_WORKFLOW"]].delete_one(
            {"_id": document_id}
        )
        
        if result.deleted_count > 0:
            logging.info(f"[DELETED] Guided workflow state: {document_id}")
            return {
                "status": "success",
                "deleted": True,
            }
        else:
            return {
                "status": "not_found",
                "deleted": False,
            }

    except Exception as e:
        logging.error(f"MongoDB delete error for guided workflow state: {e}")
        return {"status": "error", "error": str(e)}


def save_footprint_event(
    session_id: str,
    event_type: str,
    stage: str,
    action: str,
    target: str,
    client_name: str = "",
    app_name: str = "",
    project_name: str = "",
    file_name: str | None = None,
    user_id: str = "",
    details: dict | None = None,
    before_value: any = None,
    after_value: any = None,
    metadata: dict | None = None,
) -> dict:
    """
    Save individual footprint event to MongoDB.
    
    Mirrors the column classifier pattern for consistency.
    Events are stored in trinity_guided_workflow_footprints collection.
    
    Args:
        session_id: Unique session identifier
        event_type: Type of event (click, edit, navigation, etc.)
        stage: Current stage (U2, U3, U4, U5, U6)
        action: Specific action (header_selection, column_edit, etc.)
        target: What was interacted with
        client_name: Client name
        app_name: App name
        project_name: Project name
        file_name: File name (optional)
        user_id: User identifier
        details: Event-specific data
        before_value: Value before edit (for edits)
        after_value: Value after edit (for edits)
        metadata: Additional context
    
    Returns:
        dict with status and event_id
    """
    if not check_mongodb_connection():
        return {"status": "error", "error": "MongoDB not connected"}
    
    try:
        # Build document_id like column classifier
        base_id = (
            f"{client_name or ''}/"
            f"{app_name or ''}/"
            f"{project_name or ''}"
        )
        document_id = f"{base_id}::{quote(file_name, safe='')}" if file_name else base_id
        
        # Generate unique event ID
        event_id = str(uuid.uuid4())
        
        event_document = {
            "session_id": session_id,
            "event_id": event_id,
            "document_id": document_id,
            "client_name": client_name,
            "app_name": app_name,
            "project_name": project_name,
            "file_name": file_name,
            "user_id": user_id,
            "timestamp": datetime.utcnow(),
            "event_type": event_type,
            "stage": stage,
            "action": action,
            "target": target,
            "details": details or {},
            "before_value": before_value,
            "after_value": after_value,
            "metadata": metadata or {},
        }
        
        collection_name = COLLECTIONS["GUIDED_WORKFLOW_FOOTPRINTS"]
        collection = trinity_db[collection_name]
        
        # Ensure collection exists
        try:
            if collection_name not in trinity_db.list_collection_names():
                trinity_db.create_collection(collection_name)
                logging.info(f"✅ Created collection {collection_name} in {TRINITY_DB_NAME}")
        except Exception as exc:
            logging.warning(f"Could not verify/create {collection_name}: {exc}")
        
        # Insert event document
        result = collection.insert_one(event_document)
        
        logging.info(
            f"✅ [STORED] Footprint event: {event_id} in collection {collection_name}"
        )
        
        return {
            "status": "success",
            "event_id": event_id,
            "mongo_id": str(result.inserted_id),
            "collection": collection_name,
        }
    
    except Exception as e:
        error_msg = f"MongoDB save error for footprint event: {e}"
        logging.error(f"❌ {error_msg}")
        import traceback
        logging.error(traceback.format_exc())
        return {"status": "error", "error": str(e)}


def get_footprint_events(
    client_name: str = "",
    app_name: str = "",
    project_name: str = "",
    file_name: str | None = None,
    session_id: str | None = None,
    limit: int = 1000,
) -> dict:
    """
    Retrieve footprint events for a workflow session.
    
    Args:
        client_name: Client name
        app_name: App name
        project_name: Project name
        file_name: File name (optional)
        session_id: Session ID to filter by (optional)
        limit: Maximum number of events to return
    
    Returns:
        dict with status and events list
    """
    if not check_mongodb_connection():
        return {"status": "error", "error": "MongoDB not connected"}
    
    try:
        collection = trinity_db[COLLECTIONS["GUIDED_WORKFLOW_FOOTPRINTS"]]
        
        # Build query
        query = {}
        if client_name or app_name or project_name:
            base_id = f"{client_name or ''}/{app_name or ''}/{project_name or ''}"
            document_id = f"{base_id}::{quote(file_name, safe='')}" if file_name else base_id
            query["document_id"] = document_id
        
        if session_id:
            query["session_id"] = session_id
        
        if file_name:
            query["file_name"] = file_name
        
        # Query events, sorted by timestamp descending
        events = list(
            collection.find(query)
            .sort("timestamp", -1)
            .limit(limit)
        )
        
        # Convert ObjectId to string for JSON serialization
        for event in events:
            event["_id"] = str(event["_id"])
            if "timestamp" in event and isinstance(event["timestamp"], datetime):
                event["timestamp"] = event["timestamp"].isoformat()
        
        return {
            "status": "success",
            "events": events,
            "count": len(events),
        }
    
    except Exception as e:
        error_msg = f"MongoDB get error for footprint events: {e}"
        logging.error(f"❌ {error_msg}")
        import traceback
        logging.error(traceback.format_exc())
        return {"status": "error", "error": str(e)}


def save_workflow_summary(
    session_id: str,
    current_stage: str,
    client_name: str = "",
    app_name: str = "",
    project_name: str = "",
    file_name: str | None = None,
    user_id: str = "",
    uploaded_files: list | None = None,
    header_selections: dict | None = None,
    column_name_edits: dict | None = None,
    data_type_selections: dict | None = None,
    missing_value_strategies: dict | None = None,
    file_metadata: dict | None = None,
) -> dict:
    """
    Save/update aggregated workflow summary.
    
    Mirrors the column classifier config pattern:
    - Document ID: {base_id} or {base_id}::{file_name}
    - Stored in trinity_guided_workflow_summary collection
    - Used for quick access to latest state
    
    Args:
        session_id: Unique session identifier
        current_stage: Current stage (U2, U3, U4, U5, U6)
        client_name: Client name
        app_name: App name
        project_name: Project name
        file_name: File name (optional)
        user_id: User identifier
        uploaded_files: List of uploaded files
        header_selections: Header selections dict
        column_name_edits: Column name edits dict
        data_type_selections: Data type selections dict
        missing_value_strategies: Missing value strategies dict
        file_metadata: File metadata dict
    
    Returns:
        dict with status and mongo_id
    """
    if not check_mongodb_connection():
        return {"status": "error", "error": "MongoDB not connected"}
    
    try:
        # Build document_id like column classifier
        base_id = (
            f"{client_name or ''}/"
            f"{app_name or ''}/"
            f"{project_name or ''}"
        )
        safe_file = quote(file_name, safe="") if file_name else ""
        document_id = f"{base_id}::{safe_file}" if file_name else base_id
        
        # Get event count for this session
        events_result = get_footprint_events(
            client_name=client_name,
            app_name=app_name,
            project_name=project_name,
            file_name=file_name,
            session_id=session_id,
            limit=1
        )
        event_count = events_result.get("count", 0) if events_result.get("status") == "success" else 0
        
        # Get last event timestamp
        last_event_timestamp = None
        if events_result.get("status") == "success" and events_result.get("events"):
            last_event = events_result["events"][0]
            if "timestamp" in last_event:
                try:
                    if isinstance(last_event["timestamp"], str):
                        last_event_timestamp = datetime.fromisoformat(last_event["timestamp"].replace("Z", "+00:00"))
                    else:
                        last_event_timestamp = last_event["timestamp"]
                except:
                    pass
        
        summary_document = {
            "_id": document_id,
            "client_name": client_name,
            "app_name": app_name,
            "project_name": project_name,
            "file_name": file_name,
            "user_id": user_id,
            "session_id": session_id,
            "current_stage": current_stage,
            "last_updated": datetime.utcnow(),
            "uploaded_files": uploaded_files or [],
            "header_selections": header_selections or {},
            "column_name_edits": column_name_edits or {},
            "data_type_selections": data_type_selections or {},
            "missing_value_strategies": missing_value_strategies or {},
            "file_metadata": file_metadata or {},
            "event_count": event_count,
            "last_event_timestamp": last_event_timestamp or datetime.utcnow(),
        }
        
        collection_name = COLLECTIONS["GUIDED_WORKFLOW_SUMMARY"]
        collection = trinity_db[collection_name]
        
        # Ensure collection exists
        try:
            if collection_name not in trinity_db.list_collection_names():
                trinity_db.create_collection(collection_name)
                logging.info(f"✅ Created collection {collection_name} in {TRINITY_DB_NAME}")
        except Exception as exc:
            logging.warning(f"Could not verify/create {collection_name}: {exc}")
        
        # Upsert: insert new or fully overwrite existing (same as column_classifier)
        result = collection.replace_one(
            {"_id": document_id},
            summary_document,
            upsert=True,
        )
        
        # Also save legacy document without file_name (same pattern as column_classifier)
        if file_name:
            legacy_document = summary_document.copy()
            legacy_document["_id"] = base_id
            collection.replace_one({"_id": base_id}, legacy_document, upsert=True)
        
        if result.upserted_id:
            logging.info(
                f"✅ [STORED] New workflow summary: {document_id} in collection {collection_name}"
            )
        else:
            logging.info(
                f"✅ [UPDATED] Workflow summary: {document_id} in collection {collection_name}"
            )
        
        return {
            "status": "success",
            "mongo_id": document_id,
            "operation": "inserted" if result.upserted_id else "updated",
            "collection": collection_name,
        }
    
    except Exception as e:
        error_msg = f"MongoDB save error for workflow summary: {e}"
        logging.error(f"❌ {error_msg}")
        import traceback
        logging.error(traceback.format_exc())
        return {"status": "error", "error": str(e)}


def get_workflow_summary(
    client_name: str = "",
    app_name: str = "",
    project_name: str = "",
    file_name: str | None = None,
) -> dict:
    """
    Get latest workflow summary (Redis → MongoDB fallback).
    
    Mirrors get_classifier_config_from_mongo pattern.
    
    Args:
        client_name: Client name
        app_name: App name
        project_name: Project name
        file_name: File name (optional)
    
    Returns:
        dict with status and summary data
    """
    if not check_mongodb_connection():
        return {"status": "error", "error": "MongoDB not connected"}
    
    try:
        base_id = f"{client_name or ''}/{app_name or ''}/{project_name or ''}"
        collection = trinity_db[COLLECTIONS["GUIDED_WORKFLOW_SUMMARY"]]
        
        if file_name:
            safe_file = quote(file_name, safe="")
            document_id = f"{base_id}::{safe_file}"
            logging.info(f"[get_workflow_summary] Trying file-specific document_id={document_id}")
            document = collection.find_one({"_id": document_id})
            if document:
                logging.info(f"[get_workflow_summary] Found file-specific document")
                # Convert datetime to ISO string for JSON serialization
                if "last_updated" in document and isinstance(document["last_updated"], datetime):
                    document["last_updated"] = document["last_updated"].isoformat()
                if "last_event_timestamp" in document and isinstance(document["last_event_timestamp"], datetime):
                    document["last_event_timestamp"] = document["last_event_timestamp"].isoformat()
                return {
                    "status": "success",
                    "summary": document,
                    "mongo_id": document_id,
                }
            # Try legacy base_id if file-specific not found
            logging.info(f"[get_workflow_summary] File-specific document not found, trying legacy base_id={base_id}")
            legacy = collection.find_one({"_id": base_id})
            if legacy:
                stored_file = legacy.get("file_name")
                if stored_file == file_name or not stored_file:
                    if "last_updated" in legacy and isinstance(legacy["last_updated"], datetime):
                        legacy["last_updated"] = legacy["last_updated"].isoformat()
                    if "last_event_timestamp" in legacy and isinstance(legacy["last_event_timestamp"], datetime):
                        legacy["last_event_timestamp"] = legacy["last_event_timestamp"].isoformat()
                    return {
                        "status": "success",
                        "summary": legacy,
                        "mongo_id": base_id,
                    }
        
        # Try base_id without file_name
        document = collection.find_one({"_id": base_id})
        if document:
            if "last_updated" in document and isinstance(document["last_updated"], datetime):
                document["last_updated"] = document["last_updated"].isoformat()
            if "last_event_timestamp" in document and isinstance(document["last_event_timestamp"], datetime):
                document["last_event_timestamp"] = document["last_event_timestamp"].isoformat()
            return {
                "status": "success",
                "summary": document,
                "mongo_id": base_id,
            }
        
        return {
            "status": "not_found",
            "summary": None,
        }
    
    except Exception as e:
        error_msg = f"MongoDB get error for workflow summary: {e}"
        logging.error(f"❌ {error_msg}")
        import traceback
        logging.error(traceback.format_exc())
        return {"status": "error", "error": str(e)}

