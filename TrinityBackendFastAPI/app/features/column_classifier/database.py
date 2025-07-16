# app/database.py - MongoDB operations for Data Classification API

from pymongo import MongoClient
from datetime import datetime
import logging
from .config import settings

# MongoDB Configuration
MONGODB_URL = settings.mongo_uri
DATABASE_NAME = settings.classification_database

# Collection Names - ONLY the ones you specified
# Use settings for consistency
COLLECTIONS = {
    "VALIDATOR_ATOMS": settings.validator_atoms_collection,
    "COLUMN_CLASSIFICATIONS": settings.column_classifications_collection, 
    "BUSINESS_DIMENSIONS": settings.business_dimensions_collection
}

# Initialize MongoDB client with timeout
try:
    mongo_client = MongoClient(MONGODB_URL, serverSelectionTimeoutMS=5000)
    db = mongo_client[DATABASE_NAME]
    
    # Test connection
    mongo_client.admin.command('ping')
    print(f"✅ Connected to MongoDB: {DATABASE_NAME}")
    
except Exception as e:
    print(f"❌ MongoDB connection failed: {e}")
    mongo_client = None
    db = None

def check_mongodb_connection():
    """Check if MongoDB is available"""
    return mongo_client is not None and db is not None

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

def save_classification_to_mongo(validator_atom_id: str, file_key: str, classification_data: dict):
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
            **classification_data
        }
        
        # Save to column_classifications collection
        result = db[COLLECTIONS["COLUMN_CLASSIFICATIONS"]].replace_one(
            {"_id": document_id}, 
            document, 
            upsert=True
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

def save_business_dimension_to_mongo(dimension_data: dict):
    """Save business dimension data to MongoDB"""
    if not check_mongodb_connection():
        return {"status": "error", "error": "MongoDB not connected"}
    
    try:
        document = {
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            **dimension_data
        }
        
        # Save to business_dimensions collection
        result = db[COLLECTIONS["BUSINESS_DIMENSIONS"]].insert_one(document)
        
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
        }
        
        result = db["business_dimensions_with_assignments"].update_one(
            {"_id": document_id},
            {"$set": update_data}
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


def save_project_dimension_mapping(project_id: int, assignments: dict):
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
        }
        result = db["project_dimension_mappings"].replace_one(
            {"_id": document_id}, document, upsert=True
        )
        return {
            "status": "success",
            "mongo_id": document_id,
            "operation": "inserted" if result.upserted_id else "updated",
            "collection": "project_dimension_mappings",
        }
    except Exception as e:
        logging.error(f"MongoDB save error for project mapping: {e}")
        return {"status": "error", "error": str(e)}