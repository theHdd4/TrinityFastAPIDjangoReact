# schema.py - Schema Operations for Explore Atom (CORRECTED)
from pymongo import MongoClient
from datetime import datetime
from typing import Dict, Any, Optional, List

# =============================================================================
# CONFIGURATION
# =============================================================================

MONGO_URI = "mongodb://10.2.1.65:9005/"
SOURCE_DATABASE = "validator_atoms_db"

def get_mongo_client():
    """Get MongoDB client connection with ping test"""
    try:
        client = MongoClient(MONGO_URI)
        client.admin.command('ping')
        return client
    except Exception as e:
        print(f"MongoDB connection error: {e}")
        return None

# =============================================================================
# ACTUAL SCHEMA OPERATIONS (Based on Your Real Structure)
# =============================================================================

def get_validator_atom_structure(validator_atom_id: str):
    """
    Get the actual validator atom structure from your MongoDB
    Based on your real document patterns
    """
    try:
        client = get_mongo_client()
        if not client:
            return {"status": "error", "message": "Failed to connect to MongoDB"}
        
        source_db = client[SOURCE_DATABASE]
        
        # ✅ CORRECT: Use your actual document ID pattern
        document_id = f"{validator_atom_id}_media_dimensions"
        
        # Search all collections for this document (like in database.py)
        found_document = None
        found_collection = None
        
        for collection_name in source_db.list_collection_names():
            try:
                document = source_db[collection_name].find_one({"_id": document_id})
                if document:
                    found_document = document
                    found_collection = collection_name
                    break
            except Exception:
                continue
        
        client.close()
        
        if not found_document:
            return {
                "status": "error",
                "message": f"Document with ID '{document_id}' not found"
            }
        
        # ✅ CORRECT: Extract actual fields from your structure
        return {
            "status": "success",
            "validator_atom_id": validator_atom_id,
            "document_id": document_id,
            "found_in_collection": found_collection,
            "structure": {
                "file_key": found_document.get("file_key"),
                "dimensions": found_document.get("dimensions", []),
                "has_dimensions": len(found_document.get("dimensions", [])) > 0
            }
        }
        
    except Exception as e:
        return {"status": "error", "message": f"Failed to get structure: {str(e)}"}

def get_column_classifications_structure(validator_atom_id: str):
    """
    Get column classifications from your actual collection structure
    """
    try:
        client = get_mongo_client()
        if not client:
            return {"status": "error", "message": "Failed to connect to MongoDB"}
        
        source_db = client[SOURCE_DATABASE]
        
        # ✅ CORRECT: Use your actual column_classifications query
        classifications_cursor = source_db.column_classifications.find({"validator_atom_id": validator_atom_id})
        classifications_data = {}
        found_any = False
        
        for classification_record in classifications_cursor:
            found_any = True
            file_key = classification_record.get("file_key")
            final_classification = classification_record.get("final_classification", {})
            
            measures = final_classification.get("measures", [])
            identifiers = final_classification.get("identifiers", [])
            
            classifications_data[file_key] = {
                "measures": measures,
                "identifiers": identifiers,
                "total_columns": len(measures) + len(identifiers)
            }
        
        client.close()
        
        if not found_any:
            return {
                "status": "error",
                "message": f"No column classifications found for {validator_atom_id}"
            }
        
        return {
            "status": "success",
            "validator_atom_id": validator_atom_id,
            "classifications": classifications_data,
            "summary": {
                "file_keys": list(classifications_data.keys()),
                "total_measures": sum(len(data["measures"]) for data in classifications_data.values()),
                "total_identifiers": sum(len(data["identifiers"]) for data in classifications_data.values())
            }
        }
        
    except Exception as e:
        return {"status": "error", "message": f"Failed to get classifications: {str(e)}"}

def get_complete_validator_schema(validator_atom_id: str):
    """
    Get complete schema information combining dimensions and classifications
    Based on your actual MongoDB structure
    """
    try:
        # Get dimensions structure
        dimensions_result = get_validator_atom_structure(validator_atom_id)
        
        # Get classifications structure  
        classifications_result = get_column_classifications_structure(validator_atom_id)
        
        if dimensions_result["status"] == "error" and classifications_result["status"] == "error":
            return {
                "status": "error",
                "message": "No schema data found for this validator atom"
            }
        
        complete_schema = {
            "status": "success",
            "validator_atom_id": validator_atom_id,
            "has_dimensions": dimensions_result["status"] == "success",
            "has_classifications": classifications_result["status"] == "success"
        }
        
        if dimensions_result["status"] == "success":
            complete_schema["dimensions_info"] = dimensions_result["structure"]
        
        if classifications_result["status"] == "success":
            complete_schema["classifications_info"] = classifications_result["classifications"]
            complete_schema["summary"] = classifications_result["summary"]
        
        return complete_schema
        
    except Exception as e:
        return {"status": "error", "message": f"Failed to get complete schema: {str(e)}"}

def search_columns_in_validator(validator_atom_id: str, search_term: str):
    """
    Search for columns in your actual classifications structure
    """
    try:
        classifications_result = get_column_classifications_structure(validator_atom_id)
        
        if classifications_result["status"] == "error":
            return classifications_result
        
        search_results = {
            "status": "success",
            "validator_atom_id": validator_atom_id,
            "search_term": search_term,
            "matches": []
        }
        
        for file_key, data in classifications_result["classifications"].items():
            matching_measures = [col for col in data["measures"] if search_term.lower() in col.lower()]
            matching_identifiers = [col for col in data["identifiers"] if search_term.lower() in col.lower()]
            
            if matching_measures or matching_identifiers:
                search_results["matches"].append({
                    "file_key": file_key,
                    "matching_measures": matching_measures,
                    "matching_identifiers": matching_identifiers,
                    "total_matches": len(matching_measures) + len(matching_identifiers)
                })
        
        search_results["total_matches"] = sum(match["total_matches"] for match in search_results["matches"])
        
        return search_results
        
    except Exception as e:
        return {"status": "error", "message": f"Column search failed: {str(e)}"}