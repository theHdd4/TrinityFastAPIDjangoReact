# app/database.py - MongoDB operations for Data Classification API

from pymongo import MongoClient
from datetime import datetime
import logging
import os
from urllib.parse import quote
from .config import settings

try:
    import asyncpg  # type: ignore
except ModuleNotFoundError:  # pragma: no cover
    asyncpg = None

POSTGRES_HOST = os.getenv("POSTGRES_HOST", "postgres")
POSTGRES_DB = os.getenv("POSTGRES_DB", "trinity_db")
POSTGRES_USER = os.getenv("POSTGRES_USER", "trinity_user")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "trinity_pass")

# MongoDB Configuration
# Support both dedicated CLASSIFY_MONGO_URI and fallback MONGO_URI so the
# service connects in dev and prod environments without additional tweaks.
MONGODB_URL = (
    os.getenv("CLASSIFY_MONGO_URI")
    or os.getenv("MONGO_URI")
    or settings.mongo_uri
)
# Accept both MONGO_USERNAME and legacy MONGO_USER for credentials
MONGO_USER = os.getenv("MONGO_USERNAME") or os.getenv("MONGO_USER")
MONGO_PASSWORD = os.getenv("MONGO_PASSWORD")
MONGO_AUTH_DB = os.getenv("MONGO_AUTH_DB", "admin")

DATABASE_NAME = settings.classification_database
CONFIG_DB_NAME = os.getenv(
    "CLASSIFIER_CONFIG_DB", settings.classifier_configs_database
)

# Collection Names - ONLY the ones you specified
# Use settings for consistency
COLLECTIONS = {
    "VALIDATOR_ATOMS": settings.validator_atoms_collection,
    "COLUMN_CLASSIFICATIONS": settings.column_classifications_collection,
    "BUSINESS_DIMENSIONS": settings.business_dimensions_collection,
    "CLASSIFIER_CONFIGS": settings.classifier_configs_collection,
}

# Initialize MongoDB client with timeout
try:
    auth_kwargs = (
        {
            "username": MONGO_USER,
            "password": MONGO_PASSWORD,
            "authSource": MONGO_AUTH_DB,
        }
        if MONGO_USER and MONGO_PASSWORD
        else {}
    )
    mongo_client = MongoClient(
        MONGODB_URL,
        **auth_kwargs,
        serverSelectionTimeoutMS=5000,
    )
    db = mongo_client[DATABASE_NAME]
    config_db = mongo_client[CONFIG_DB_NAME]

    # Test connection
    mongo_client.admin.command('ping')
    print(f"✅ Connected to MongoDB: {DATABASE_NAME}")
    print(f"✅ Config DB: {CONFIG_DB_NAME}")
    try:  # pragma: no cover - best effort to ensure collection exists
        if (
            COLLECTIONS["CLASSIFIER_CONFIGS"]
            not in config_db.list_collection_names()
        ):
            config_db.create_collection(COLLECTIONS["CLASSIFIER_CONFIGS"])
            print(
                f"✅ Created collection {COLLECTIONS['CLASSIFIER_CONFIGS']} in {CONFIG_DB_NAME}"
            )
    except Exception as exc:
        logging.warning(
            f"Could not verify/create {COLLECTIONS['CLASSIFIER_CONFIGS']}: {exc}"
        )
    
except Exception as e:
    print(f"❌ MongoDB connection failed: {e}")
    mongo_client = None
    db = None
    config_db = None

def ensure_mongo_connection() -> bool:
    """Ensure a live connection to MongoDB.

    The initial connection attempt happens at import time. However, services
    like MongoDB might not be ready yet when the module is imported. This
    helper retries the connection on demand so that later requests (e.g. when
    the user clicks *Save Configuration*) can still succeed and automatically
    create the necessary collection.
    """

    global mongo_client, db, config_db

    if mongo_client is not None and db is not None and config_db is not None:
        return True

    try:
        auth_kwargs = (
            {
                "username": MONGO_USER,
                "password": MONGO_PASSWORD,
                "authSource": MONGO_AUTH_DB,
            }
            if MONGO_USER and MONGO_PASSWORD
            else {}
        )
        mongo_client = MongoClient(
            MONGODB_URL,
            **auth_kwargs,
            serverSelectionTimeoutMS=5000,
        )
        db = mongo_client[DATABASE_NAME]
        config_db = mongo_client[CONFIG_DB_NAME]
        mongo_client.admin.command("ping")
        try:  # pragma: no cover - best effort to ensure collection exists
            if (
                COLLECTIONS["CLASSIFIER_CONFIGS"]
                not in config_db.list_collection_names()
            ):
                config_db.create_collection(COLLECTIONS["CLASSIFIER_CONFIGS"])
        except Exception as exc:
            logging.warning(
                f"Could not verify/create {COLLECTIONS['CLASSIFIER_CONFIGS']}: {exc}"
            )
        return True
    except Exception as exc:  # pragma: no cover - best effort
        logging.error(f"MongoDB reconnection failed: {exc}")
        mongo_client = None
        db = None
        config_db = None
        return False


def check_mongodb_connection() -> bool:
    """Check if MongoDB is available, attempting reconnection if necessary."""
    return ensure_mongo_connection()

def get_validator_atom_from_mongo(validator_atom_id: str):
    """Get validator atom data from MongoDB - USED BY classify_columns endpoint"""
    if not check_mongodb_connection():
        return None
    
    try:
        result = db[COLLECTIONS["VALIDATOR_ATOMS"]].find_one({"_id": validator_atom_id})
        return result
        
    except Exception as e:
        logging.error(f"MongoDB read error for validator atom: {e}")
        return None

def save_classification_to_mongo(
    validator_atom_id: str,
    file_key: str,
    classification_data: dict,
    *,
    user_id: str = "",
    client_id: str = "",
    project_id: int | None = None,
):
    """Save column classification to MongoDB - USED BY classify_columns endpoint"""
    if not check_mongodb_connection():
        return {"status": "error", "error": "MongoDB not connected"}
    
    try:
        document_id = f"{validator_atom_id}_{file_key}_classification"
        document = {
            "_id": document_id,
            "validator_atom_id": validator_atom_id,
            "file_key": file_key,
            "classification_type": "column_classification",
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "user_id": user_id,
            "client_id": client_id,
            "project_id": project_id,
            **classification_data,
        }
        
        # Save to column_classifications collection
        result = db[COLLECTIONS["COLUMN_CLASSIFICATIONS"]].replace_one(
            {"_id": document_id},
            document,
            upsert=True
        )
        print(
            f"📦 Stored in {COLLECTIONS['COLUMN_CLASSIFICATIONS']}: {document}"
        )
        
        return {
            "status": "success", 
            "mongo_id": document_id,
            "operation": "inserted" if result.upserted_id else "updated",
            "collection": COLLECTIONS["COLUMN_CLASSIFICATIONS"]
        }
        
    except Exception as e:
        logging.error(f"MongoDB save error for classification: {e}")
        return {"status": "error", "error": str(e)}

def get_classification_from_mongo(validator_atom_id: str, file_key: str):
    """Retrieve classification data from MongoDB"""
    if not check_mongodb_connection():
        return None
    
    try:
        document_id = f"{validator_atom_id}_{file_key}_classification"
        result = db[COLLECTIONS["COLUMN_CLASSIFICATIONS"]].find_one({"_id": document_id})
        return result
        
    except Exception as e:
        logging.error(f"MongoDB read error for classification: {e}")
        return None

def save_business_dimension_to_mongo(
    dimension_data: dict,
    *,
    user_id: str = "",
    client_id: str = "",
    project_id: int | None = None,
):
    """Save business dimension data to MongoDB"""
    if not check_mongodb_connection():
        return {"status": "error", "error": "MongoDB not connected"}
    
    try:
        document = {
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "user_id": user_id,
            "client_id": client_id,
            "project_id": project_id,
            **dimension_data,
        }
        
        # Save to business_dimensions collection
        result = db[COLLECTIONS["BUSINESS_DIMENSIONS"]].insert_one(document)
        print(f"📦 Stored in {COLLECTIONS['BUSINESS_DIMENSIONS']}: {document}")

        return {
            "status": "success",
            "mongo_id": str(result.inserted_id),
            "collection": COLLECTIONS["BUSINESS_DIMENSIONS"]
        }
        
    except Exception as e:
        logging.error(f"MongoDB save error for business dimension: {e}")
        return {"status": "error", "error": str(e)}

def get_validator_from_memory_or_disk(validator_atom_id: str):
    """Fallback function for backward compatibility - USED BY classify_columns endpoint"""
    try:
        # Placeholder for your existing fallback logic
        return None
    except Exception as e:
        logging.error(f"Fallback retrieval error: {e}")
        return None

def test_mongodb_operations():
    """Test MongoDB connection and basic operations"""
    if not check_mongodb_connection():
        return {
            "status": "error",
            "message": "MongoDB not connected",
            "mongodb_url": MONGODB_URL
        }
    
    try:
        # Test basic operations
        databases = mongo_client.list_database_names()
        collections = db.list_collection_names()
        
        return {
            "status": "success",
            "message": "MongoDB operations working",
            "mongodb_url": MONGODB_URL,
            "database": DATABASE_NAME,
            "available_databases": databases,
            "collections": collections,
            "required_collections": list(COLLECTIONS.values())
        }
        
    except Exception as e:
        return {
            "status": "error",
            "message": f"MongoDB test failed: {str(e)}",
            "mongodb_url": MONGODB_URL
        }



def save_business_dimensions_to_mongo(
    validator_atom_id: str,
    file_key: str,
    dimensions_dict: dict,
    project_id: int | None = None,
    *,
    user_id: str = "",
    client_id: str = "",
):
    """Save business dimensions for a specific file key to MongoDB"""
    if not check_mongodb_connection():
        return {"status": "error", "error": "MongoDB not connected"}
    
    try:
        document_id = f"{validator_atom_id}_{file_key}_dimensions"
        document = {
            "_id": document_id,
            "validator_atom_id": validator_atom_id,
            "file_key": file_key,
            "project_id": project_id,
            "user_id": user_id,
            "client_id": client_id,
            "dimensions_type": "business_dimensions",
            "dimensions": dimensions_dict,
            "dimensions_count": len(dimensions_dict),
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
        
        # ✅ Save to business_dimensions_with_assignments collection
        result = db["business_dimensions_with_assignments"].replace_one(
            {"_id": document_id},
            document,
            upsert=True
        )
        print(
            f"📦 Stored in business_dimensions_with_assignments: {document}"
        )
        
        return {
            "status": "success", 
            "mongo_id": document_id,
            "operation": "inserted" if result.upserted_id else "updated",
            "collection": "business_dimensions_with_assignments"  # ✅ Updated collection name
        }
        
    except Exception as e:
        logging.error(f"MongoDB save error for business dimensions: {e}")
        return {"status": "error", "error": str(e)}


def get_business_dimensions_from_mongo(validator_atom_id: str, file_key: str):
    """Get business dimensions for a specific file key from MongoDB"""
    if not check_mongodb_connection():
        return None
    
    try:
        document_id = f"{validator_atom_id}_{file_key}_dimensions"
        result = db["business_dimensions_with_assignments"].find_one({"_id": document_id})
        return result
        
    except Exception as e:
        logging.error(f"MongoDB read error for business dimensions: {e}")
        return None

def update_business_dimensions_assignments_in_mongo(
    validator_atom_id: str,
    file_key: str,
    assignments: dict,
    project_id: int | None = None,
    *,
    user_id: str = "",
    client_id: str = "",
):
    """Update business dimensions with identifier assignments in MongoDB"""
    if not check_mongodb_connection():
        return {"status": "error", "error": "MongoDB not connected"}
    
    try:
        document_id = f"{validator_atom_id}_{file_key}_dimensions"
        
        # Get existing document
        existing_doc = db["business_dimensions_with_assignments"].find_one({"_id": document_id})
        if not existing_doc:
            return {"status": "error", "error": "Business dimensions not found. Define dimensions first."}
        
        # Update dimensions with assignments
        updated_dimensions = existing_doc.get("dimensions", {}).copy()
        for dim_id, identifiers in assignments.items():
            if dim_id in updated_dimensions:
                updated_dimensions[dim_id]["assigned_identifiers"] = identifiers
                updated_dimensions[dim_id]["assignment_timestamp"] = datetime.utcnow().isoformat()
        
        # Update document
        update_data = {
            "dimensions": updated_dimensions,
            "identifier_assignments": assignments,
            "updated_at": datetime.utcnow(),
            "assignment_completed": True,
            "project_id": project_id,
            "user_id": user_id,
            "client_id": client_id,
        }
        
        result = db["business_dimensions_with_assignments"].update_one(
            {"_id": document_id},
            {"$set": update_data}
        )
        print(
            f"📦 Stored in business_dimensions_with_assignments: {update_data}"
        )
        
        return {
            "status": "success",
            "mongo_id": document_id,
            "modified_count": result.modified_count,
            "collection": "business_dimensions_with_assignments"
        }
        
    except Exception as e:
        logging.error(f"MongoDB update error for dimension assignments: {e}")
        return {"status": "error", "error": str(e)}


def save_project_dimension_mapping(
    project_id: int,
    assignments: dict,
    *,
    user_id: str = "",
    client_id: str = "",
):
    """Save identifier assignments per project"""
    if not check_mongodb_connection():
        return {"status": "error", "error": "MongoDB not connected"}
    try:
        document_id = f"project_{project_id}_dimensions"
        document = {
            "_id": document_id,
            "project_id": project_id,
            "assignments": assignments,
            "updated_at": datetime.utcnow(),
            "user_id": user_id,
            "client_id": client_id,
        }
        result = db["project_dimension_mappings"].replace_one(
            {"_id": document_id}, document, upsert=True
        )
        print(f"📦 Stored in project_dimension_mappings: {document}")
        return {
            "status": "success",
            "mongo_id": document_id,
            "operation": "inserted" if result.upserted_id else "updated",
            "collection": "project_dimension_mappings",
        }
    except Exception as e:
        logging.error(f"MongoDB save error for project mapping: {e}")
        return {"status": "error", "error": str(e)}


def get_project_dimension_mapping(project_id: int):
    """Get saved dimension assignments for the given project."""
    if not check_mongodb_connection():
        return None

    try:
        document_id = f"project_{project_id}_dimensions"
        return db["project_dimension_mappings"].find_one({"_id": document_id})
    except Exception as exc:  # pragma: no cover
        logging.error(f"MongoDB read error for project mapping: {exc}")
        return None


def save_classifier_config_to_mongo(config: dict):
    """Persist column classifier configuration in MongoDB.

    The document is stored in the shared ``trinity_db`` database under the
    ``column_classifier_config`` collection and keyed by the combination of
    client, app and project names. If the collection does not yet exist it is
    created automatically before the document is written.
    """

    if not ensure_mongo_connection():
        return {"status": "error", "error": "MongoDB not connected"}

    assert config_db is not None  # nosec - ensured by ensure_mongo_connection
    try:
        base_id = (
            f"{config.get('client_name', '')}/"
            f"{config.get('app_name', '')}/"
            f"{config.get('project_name', '')}"
        )
        file_name = config.get("file_name") or ""
        safe_file = quote(file_name, safe="") if file_name else ""
        document_id = f"{base_id}::{safe_file}" if file_name else base_id
        document = {
            "_id": document_id,
            "client_name": config.get("client_name", ""),
            "app_name": config.get("app_name", ""),
            "project_name": config.get("project_name", ""),
            "identifiers": config.get("identifiers", []),
            "measures": config.get("measures", []),
            # COMMENTED OUT - dimensions disabled
            # "dimensions": config.get("dimensions", {}),
            "dimensions": {},  # Empty dimensions object
            "file_name": file_name,
            # Preserve any extra metadata such as environment variables
            **{
                k: v
                for k, v in config.items()
                if k
                not in {
                    "client_name",
                    "app_name",
                    "project_name",
                    "identifiers",
                    "measures",
                    "dimensions",  # Still exclude dimensions from extra metadata
                    "file_name",
                }
            },
            "updated_at": datetime.utcnow(),
        }

        coll_name = COLLECTIONS["CLASSIFIER_CONFIGS"]
        coll = config_db[coll_name]
        try:  # pragma: no cover - best effort to ensure collection exists
            if coll_name not in config_db.list_collection_names():
                config_db.create_collection(coll_name)
        except Exception as exc:
            logging.warning(
                f"Could not verify/create {coll_name}: {exc}"
            )
        result = coll.replace_one({"_id": document_id}, document, upsert=True)
        if file_name:
            legacy_document = document.copy()
            legacy_document["_id"] = base_id
            coll.replace_one({"_id": base_id}, legacy_document, upsert=True)
        return {
            "status": "success",
            "mongo_id": document_id,
            "operation": "inserted" if result.upserted_id else "updated",
            "collection": coll_name,
        }
    except Exception as exc:  # pragma: no cover - best effort logging
        logging.error(f"MongoDB save error for classifier config: {exc}")
        return {"status": "error", "error": str(exc)}


def get_classifier_config_from_mongo(
    client: str, app: str, project: str, file_name: str | None = None
):
    """Retrieve saved classifier configuration."""
    if not check_mongodb_connection():
        return None

    try:
        base_id = f"{client}/{app}/{project}"
        coll = config_db[COLLECTIONS["CLASSIFIER_CONFIGS"]]
        if file_name:
            safe_file = quote(file_name, safe="")
            document_id = f"{base_id}::{safe_file}"
            document = coll.find_one({"_id": document_id})
            if document:
                return document
            legacy = coll.find_one({"_id": base_id})
            if legacy:
                stored_file = legacy.get("file_name")
                if not stored_file or stored_file == file_name:
                    return legacy
            return None
        return coll.find_one({"_id": base_id})
    except Exception as exc:
        logging.error(f"MongoDB read error for classifier config: {exc}")
        return None


async def save_classifier_config_to_postgres(config: dict):
    """Persist classifier identifiers/measures/dimensions to Postgres."""
    if asyncpg is None:
        return {"status": "error", "error": "asyncpg not available"}
    try:
        conn = await asyncpg.connect(
            host=POSTGRES_HOST,
            user=POSTGRES_USER,
            password=POSTGRES_PASSWORD,
            database=POSTGRES_DB,
        )
    except Exception as exc:
        logging.error(f"Postgres connection failed: {exc}")
        return {"status": "error", "error": str(exc)}
    try:
        await conn.execute(
            """
            INSERT INTO registry_environment (
                client_name, app_name, project_name,
                envvars, identifiers, measures, dimensions
            ) VALUES ($1,$2,$3,$4,$5,$6,$7)
            ON CONFLICT (client_name, app_name, project_name) DO UPDATE
            SET envvars = $4,
                identifiers = $5,
                measures = $6,
                dimensions = $7,
                updated_at = NOW()
            """,
            config.get("client_name", ""),
            config.get("app_name", ""),
            config.get("project_name", ""),
            asyncpg.Json(config.get("env", {})),
            asyncpg.Json(config.get("identifiers", [])),
            asyncpg.Json(config.get("measures", [])),
            asyncpg.Json(config.get("dimensions", {})),
        )
        return {"status": "success"}
    except Exception as exc:
        logging.error(f"Postgres save error for classifier config: {exc}")
        return {"status": "error", "error": str(exc)}
    finally:
        await conn.close()

