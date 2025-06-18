# app/database.py - MongoDB operations for Validator Atom System

from pymongo import MongoClient
from datetime import datetime
import logging
import os

# MongoDB Configuration
MONGODB_URL = os.getenv("MONGO_URI", "mongodb://mongo:27017/trinity")
DATABASE_NAME = "validator_atoms_db"

# Collection Names
COLLECTIONS = {
    "VALIDATOR_ATOMS": "validator_atoms",
    "COLUMN_CLASSIFICATIONS": "column_classifications", 
    "BUSINESS_DIMENSIONS": "business_dimensions_with_assignments",
    "VALIDATION_LOGS": "validation_logs",
    "VALIDATION_CONFIG": "validation_config"
}

# Initialize MongoDB client with timeout
try:
    mongo_client = MongoClient(MONGODB_URL, serverSelectionTimeoutMS=5000)
    db = mongo_client[DATABASE_NAME]
    
    # Test connection
    mongo_client.admin.command('ping')
    print(f"✅ Connected to MongoDB at {MONGODB_URL}")
    
except Exception as e:
    print(f"❌ MongoDB connection failed: {e}")
    mongo_client = None
    db = None

def check_mongodb_connection():
    """Check if MongoDB is available"""
    return mongo_client is not None and db is not None

def save_classification_to_mongo(validator_atom_id: str, file_key: str, classification_data: dict):
    """Save column classification to MongoDB"""
    if not check_mongodb_connection():
        return {"status": "error", "error": "MongoDB not connected"}
    
    try:
        document_id = f"{validator_atom_id}_{file_key}_classification"
        document = {
            "_id": document_id,
            "validator_atom_id": validator_atom_id,
            "file_key": file_key,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            **classification_data
        }
        
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

def save_validator_atom_to_mongo(validator_atom_id: str, validator_data: dict):
    """Save validator atom configuration to MongoDB"""
    if not check_mongodb_connection():
        return {"status": "error", "error": "MongoDB not connected"}
    
    try:
        document = {
            "_id": validator_atom_id,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            **validator_data
        }
        
        result = db[COLLECTIONS["VALIDATOR_ATOMS"]].replace_one(
            {"_id": validator_atom_id}, 
            document, 
            upsert=True
        )
        
        return {
            "status": "success", 
            "mongo_id": validator_atom_id,
            "operation": "inserted" if result.upserted_id else "updated",
            "collection": COLLECTIONS["VALIDATOR_ATOMS"]
        }
        
    except Exception as e:
        logging.error(f"MongoDB save error for validator atom: {e}")
        return {"status": "error", "error": str(e)}

def save_validation_log_to_mongo(validation_data: dict):
    """Save validation transaction log to MongoDB"""
    if not check_mongodb_connection():
        return {"status": "error", "error": "MongoDB not connected"}
    
    try:
        document = {
            "validation_timestamp": datetime.utcnow(),
            **validation_data
        }
        
        result = db[COLLECTIONS["VALIDATION_LOGS"]].insert_one(document)
        
        return {
            "status": "success", 
            "mongo_id": str(result.inserted_id),
            "collection": COLLECTIONS["VALIDATION_LOGS"]
        }
        
    except Exception as e:
        logging.error(f"MongoDB save error for validation log: {e}")
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
            "collections": collections
        }
        
    except Exception as e:
        return {
            "status": "error",
            "message": f"MongoDB test failed: {str(e)}",
            "mongodb_url": MONGODB_URL
        }



def get_validator_atom_from_mongo(validator_atom_id: str):
    """Get validator atom data from MongoDB"""
    if not check_mongodb_connection():
        return None
    
    try:
        result = db[COLLECTIONS["VALIDATOR_ATOMS"]].find_one({"_id": validator_atom_id})
        return result
        
    except Exception as e:
        logging.error(f"MongoDB read error for validator atom: {e}")
        return None


def update_validator_atom_in_mongo(validator_atom_id: str, update_data: dict):
    """Update validator atom document in MongoDB"""
    if not check_mongodb_connection():
        return {"status": "error", "error": "MongoDB not connected"}
    
    try:
        result = db[COLLECTIONS["VALIDATOR_ATOMS"]].update_one(
            {"_id": validator_atom_id},
            {
                "$set": {
                    **update_data,
                    "updated_at": datetime.utcnow()
                }
            }
        )
        
        if result.matched_count == 0:
            return {"status": "error", "error": "Validator atom not found"}
        
        return {
            "status": "success",
            "modified_count": result.modified_count,
            "matched_count": result.matched_count
        }
        
    except Exception as e:
        logging.error(f"MongoDB update error for validator atom: {e}")
        return {"status": "error", "error": str(e)}



def save_business_dimensions_to_mongo(validator_atom_id: str, file_key: str, dimensions_data: dict):
    """Save business dimensions to MongoDB"""
    if not check_mongodb_connection():
        return {"status": "error", "error": "MongoDB not connected"}
    
    try:
        document_id = f"{validator_atom_id}_{file_key}_dimensions"
        
        # Convert dimensions dict to array format for MongoDB
        dimensions_array = []
        for dim_id, dim_data in dimensions_data.items():
            dimensions_array.append({
                "dimension_id": dim_id,
                "dimension_name": dim_data.get("name", dim_id),
                "description": dim_data.get("description", ""),
                "assigned_identifiers": []  # Empty initially, filled by assign_identifiers endpoint
            })
        
        document = {
            "_id": document_id,
            "validator_atom_id": validator_atom_id,
            "file_key": file_key,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "dimensions": dimensions_array,
            "total_dimensions": len(dimensions_array)
        }
        
        result = db[COLLECTIONS["BUSINESS_DIMENSIONS"]].replace_one(
            {"_id": document_id}, 
            document, 
            upsert=True
        )
        
        return {
            "status": "success", 
            "mongo_id": document_id,
            "operation": "inserted" if result.upserted_id else "updated",
            "collection": COLLECTIONS["BUSINESS_DIMENSIONS"]
        }
        
    except Exception as e:
        logging.error(f"MongoDB save error for business dimensions: {e}")
        return {"status": "error", "error": str(e)}



def get_business_dimensions_from_mongo(validator_atom_id: str, file_key: str):
    """Get business dimensions data from MongoDB"""
    if not check_mongodb_connection():
        return None
    
    try:
        document_id = f"{validator_atom_id}_{file_key}_dimensions"
        result = db[COLLECTIONS["BUSINESS_DIMENSIONS"]].find_one({"_id": document_id})
        return result
        
    except Exception as e:
        logging.error(f"MongoDB read error for business dimensions: {e}")
        return None

def update_business_dimensions_assignments_in_mongo(validator_atom_id: str, file_key: str, assignments: dict):
    """Update business dimensions with identifier assignments in MongoDB"""
    if not check_mongodb_connection():
        return {"status": "error", "error": "MongoDB not connected"}
    
    try:
        document_id = f"{validator_atom_id}_{file_key}_dimensions"
        
        # ✅ SIMPLER APPROACH: Get document, modify, and replace
        existing_doc = db[COLLECTIONS["BUSINESS_DIMENSIONS"]].find_one({"_id": document_id})
        
        if not existing_doc:
            return {"status": "error", "error": "Business dimensions document not found"}
        
        # Update the dimensions array with assignments
        updated_dimensions = existing_doc.get("dimensions", [])
        for dimension in updated_dimensions:
            dim_id = dimension.get("dimension_id")
            if dim_id in assignments:
                dimension["assigned_identifiers"] = assignments[dim_id]
        
        # Replace the entire document
        result = db[COLLECTIONS["BUSINESS_DIMENSIONS"]].replace_one(
            {"_id": document_id},
            {
                **existing_doc,
                "dimensions": updated_dimensions,
                "updated_at": datetime.utcnow()
            }
        )
        
        print(f"🔍 MongoDB update result: matched={result.matched_count}, modified={result.modified_count}")
        
        return {
            "status": "success",
            "modified_count": result.modified_count,
            "matched_count": result.matched_count
        }
        
    except Exception as e:
        logging.error(f"MongoDB update error for business dimensions assignments: {e}")
        return {"status": "error", "error": str(e)}



# ✅ UPDATE: save_validation_config_to_mongo function in app/database.py
def save_validation_config_to_mongo(validator_atom_id: str, file_key: str, config_data: dict):
    """Save validation config to MongoDB with optional column frequencies"""
    if not check_mongodb_connection():
        return {"status": "error", "error": "MongoDB not connected"}
    
    try:
        document_id = f"{validator_atom_id}_{file_key}_validation_config"
        
        # ✅ UPDATED: Include column_frequencies in document
        document = {
            "_id": document_id,
            "validator_atom_id": validator_atom_id,
            "file_key": file_key,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "column_conditions": config_data.get("column_conditions", {}),
            "column_frequencies": config_data.get("column_frequencies", {}),  # ✅ ADD THIS
            "total_conditions": sum(len(cond_list) for cond_list in config_data.get("column_conditions", {}).values()),
            "columns_with_conditions": list(config_data.get("column_conditions", {}).keys()),
            "columns_with_frequencies": list(config_data.get("column_frequencies", {}).keys())  # ✅ ADD THIS
        }
        
        result = db[COLLECTIONS["VALIDATION_CONFIG"]].replace_one(
            {"_id": document_id}, 
            document, 
            upsert=True
        )
        
        return {
            "status": "success", 
            "mongo_id": document_id,
            "operation": "inserted" if result.upserted_id else "updated",
            "collection": COLLECTIONS["VALIDATION_CONFIG"]
        }
        
    except Exception as e:
        logging.error(f"MongoDB save error for validation config: {e}")
        return {"status": "error", "error": str(e)}


def get_validation_config_from_mongo(validator_atom_id: str, file_key: str):
    """Get validation config from MongoDB"""
    if not check_mongodb_connection():
        return None
    
    try:
        document_id = f"{validator_atom_id}_{file_key}_validation_config"
        result = db[COLLECTIONS["VALIDATION_CONFIG"]].find_one({"_id": document_id})
        return result
        
    except Exception as e:
        logging.error(f"MongoDB read error for validation config: {e}")
        return None