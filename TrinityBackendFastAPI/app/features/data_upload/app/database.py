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

