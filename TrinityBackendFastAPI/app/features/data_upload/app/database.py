# app/database.py - MongoDB operations for Data Upload Atom System

from pymongo import MongoClient
from datetime import datetime
import logging
import os

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
}

# Initialize MongoDB client with timeout
try:
    mongo_client = MongoClient(
        MONGODB_URL,
        username=MONGO_USER,
        password=MONGO_PASSWORD,
        authSource=MONGO_AUTH_DB,
        serverSelectionTimeoutMS=5000,
    )
    db = mongo_client[DATABASE_NAME]
    trinity_db = mongo_client[TRINITY_DB_NAME]
    
    # Test connection
    mongo_client.admin.command('ping')
    print(f"[OK] Connected to MongoDB at {MONGODB_URL}")
    
except Exception as e:
    print(f"[ERROR] MongoDB connection failed: {e}")
    mongo_client = None
    db = None
    trinity_db = None

def check_mongodb_connection():
    """Check if MongoDB is available"""
    return (
        mongo_client is not None
        and db is not None
        and trinity_db is not None
    )


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

