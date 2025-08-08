# app/database.py - MongoDB operations for Data Classification API

from pymongo import MongoClient
from datetime import datetime
import logging
import os
from .config import settings

try:
    import asyncpg  # type: ignore
except ModuleNotFoundError:  # pragma: no cover
    asyncpg = None

POSTGRES_HOST = os.getenv("POSTGRES_HOST", "postgres")
POSTGRES_DB = os.getenv("POSTGRES_DB", "trinity_prod")
POSTGRES_USER = os.getenv("POSTGRES_USER", "trinity_user")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "trinity_pass")

# MongoDB Configuration
MONGODB_URL = settings.mongo_uri
DATABASE_NAME = settings.classification_database

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
    mongo_client = MongoClient(MONGODB_URL, serverSelectionTimeoutMS=5000)
    db = mongo_client[DATABASE_NAME]
    config_db = mongo_client[settings.classifier_configs_database]
    
    # Test connection
    mongo_client.admin.command('ping')
    print(f"✅ Connected to MongoDB: {DATABASE_NAME}")
    print(f"✅ Config DB: {settings.classifier_configs_database}")
    
except Exception as e:
    print(f"❌ MongoDB connection failed: {e}")
    mongo_client = None
    db = None
    config_db = None

def check_mongodb_connection():
    """Check if MongoDB is available"""
    return mongo_client is not None and db is not None and config_db is not None

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
    """Persist column classifier configuration."""
    if not check_mongodb_connection():
        return {"status": "error", "error": "MongoDB not connected"}

    try:
        document_id = (
            f"{config.get('client_name','')}/"
            f"{config.get('app_name','')}/"
            f"{config.get('project_name','')}"
        )
        document = {
            "_id": document_id,
            **config,
            "updated_at": datetime.utcnow(),
        }
        result = config_db[COLLECTIONS["CLASSIFIER_CONFIGS"]].replace_one(
            {"_id": document_id}, document, upsert=True
        )
        return {
            "status": "success",
            "mongo_id": document_id,
            "operation": "inserted" if result.upserted_id else "updated",
            "collection": COLLECTIONS["CLASSIFIER_CONFIGS"],
        }
    except Exception as exc:
        logging.error(f"MongoDB save error for classifier config: {exc}")
        return {"status": "error", "error": str(exc)}


def get_classifier_config_from_mongo(client: str, app: str, project: str):
    """Retrieve saved classifier configuration."""
    if not check_mongodb_connection():
        return None

    try:
        document_id = f"{client}/{app}/{project}"
        return config_db[COLLECTIONS["CLASSIFIER_CONFIGS"]].find_one({"_id": document_id})
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