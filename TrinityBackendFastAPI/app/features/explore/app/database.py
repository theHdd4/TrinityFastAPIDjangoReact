# database.py - MongoDB Database Operations for Explore Atom
from pymongo import MongoClient
from datetime import datetime
from typing import Dict, Any, Optional

# =============================================================================
# DATABASE CONFIGURATION
# =============================================================================

# MongoDB connection configuration
MONGO_URI = "mongodb://mongo:27017/"

# Database names
SOURCE_DATABASE = "validator_atoms_db"  # Read existing data from validator atoms
EXPLORE_DATABASE = "Explore_atom"       # Save explore atom configs  
EXPLORE_COLLECTION = "selected_dimensions_measures"

# =============================================================================
# CONNECTION MANAGEMENT
# =============================================================================

def get_mongo_client():
    """
    Get MongoDB client connection with ping test
    Returns: MongoClient or None if connection fails
    """
    try:
        client = MongoClient(MONGO_URI)
        client.admin.command('ping')
        return client
    except Exception as e:
        print(f"MongoDB connection error: {e}")
        return None

def test_database_connections():
    """
    Test both source and destination database connections
    Returns: Dict with connection status and collection info
    """
    try:
        client = get_mongo_client()
        if not client:
            return {"status": "error", "message": "Failed to connect to MongoDB"}
        
        # Test source database
        source_db = client[SOURCE_DATABASE]
        source_collections = {}
        for collection_name in source_db.list_collection_names():
            count = source_db[collection_name].count_documents({})
            source_collections[collection_name] = count
        
        # Test destination database
        explore_db = client[EXPLORE_DATABASE]
        explore_collections = {}
        for collection_name in explore_db.list_collection_names():
            count = explore_db[collection_name].count_documents({})
            explore_collections[collection_name] = count
        
        client.close()
        
        return {
            "status": "success",
            "message": "Both database connections successful",
            "source_database": {
                "name": SOURCE_DATABASE,
                "collections": source_collections
            },
            "destination_database": {
                "name": EXPLORE_DATABASE,
                "collections": explore_collections
            }
        }
        
    except Exception as e:
        return {"status": "error", "message": f"Connection test failed: {str(e)}"}

# =============================================================================
# SOURCE DATABASE OPERATIONS (READ VALIDATOR ATOMS DATA)
# =============================================================================

def get_dimensions_from_mongo(validator_atom_id: str):
    """
    Get all business dimensions with assignments from SOURCE database
    
    Args:
        validator_atom_id: ID of the validator atom to fetch dimensions for
        
    Returns:
        Dict with dimensions data or error message
    """
    try:
        client = get_mongo_client()
        if not client:
            return {"status": "error", "message": "Failed to connect to MongoDB"}
        
        # Read from validator_atoms_db
        source_db = client[SOURCE_DATABASE]
        
        # Use exact document ID pattern
        document_id = f"{validator_atom_id}_sales_dimensions"
        
        # Search all collections for this document
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
                "message": f"Document with ID '{document_id}' not found in {SOURCE_DATABASE}"
            }
        
        # Parse dimensions
        file_key = found_document.get("file_key", "file")
        dimensions_data = {file_key: {}}
        
        for dimension_obj in found_document.get("dimensions", []):
            dim_id = dimension_obj.get("dimension_id")
            dimensions_data[file_key][dim_id] = {
                "dimension_name": dimension_obj.get("dimension_name", dim_id),
                "identifiers": dimension_obj.get("assigned_identifiers", []),
                "description": dimension_obj.get("description", "")
            }
        
        return {
            "status": "success",
            "validator_atom_id": validator_atom_id,
            "source_database": SOURCE_DATABASE,
            "found_in_collection": found_collection,
            "dimensions_structure": dimensions_data,
            "summary": {
                "file_keys": [file_key],
                "total_dimensions": len(dimensions_data[file_key])
            }
        }
        
    except Exception as e:
        return {"status": "error", "message": f"Failed to get dimensions: {str(e)}"}

def get_measures_from_mongo(validator_atom_id: str):
    """
    Get column classifications from SOURCE database to identify available measures
    
    Args:
        validator_atom_id: ID of the validator atom to fetch measures for
        
    Returns:
        Dict with measures data or error message
    """
    try:
        client = get_mongo_client()
        if not client:
            return {"status": "error", "message": "Failed to connect to MongoDB"}
        
        # Read from validator_atoms_db
        source_db = client[SOURCE_DATABASE]
        
        # Search for column classifications
        classifications_cursor = source_db.column_classifications.find({"validator_atom_id": validator_atom_id})
        measures_data = {}
        found_any = False
        
        for classification_record in classifications_cursor:
            found_any = True
            file_key = classification_record.get("file_key")
            final_classification = classification_record.get("final_classification", {})
            
            measures = final_classification.get("measures", [])
            identifiers = final_classification.get("identifiers", [])
            
            measures_data[file_key] = {
                "measures": measures,
                "identifiers": identifiers
            }
        
        client.close()
        
        if not found_any:
            return {
                "status": "error",
                "message": f"No column classifications found for validator_atom_id: {validator_atom_id} in {SOURCE_DATABASE}"
            }
        
        return {
            "status": "success",
            "validator_atom_id": validator_atom_id,
            "source_database": SOURCE_DATABASE,
            "measures_structure": measures_data,
            "summary": {
                "file_keys": list(measures_data.keys()),
                "total_measures": sum(len(data["measures"]) for data in measures_data.values()),
                "total_identifiers": sum(len(data["identifiers"]) for data in measures_data.values())
            }
        }
        
    except Exception as e:
        return {"status": "error", "message": f"Failed to get measures: {str(e)}"}

# =============================================================================
# DESTINATION DATABASE OPERATIONS (EXPLORE ATOM CONFIGURATIONS)
# =============================================================================

def save_explore_atom_to_mongo(explore_atom_data: dict):
    """
    Save new explore atom configuration to DESTINATION database
    
    Args:
        explore_atom_data: Complete explore atom configuration dict
        
    Returns:
        Dict with save status and MongoDB ID
    """
    try:
        client = get_mongo_client()
        if not client:
            return {"status": "error", "message": "Failed to connect to MongoDB"}
        
        # Save to Explore_atom database
        explore_db = client[EXPLORE_DATABASE]
        collection = explore_db[EXPLORE_COLLECTION]
        
        result = collection.insert_one(explore_atom_data)
        
        client.close()
        
        return {
            "status": "success",
            "message": f"Explore atom saved to {EXPLORE_DATABASE} database",
            "mongo_id": str(result.inserted_id)
        }
        
    except Exception as e:
        return {"status": "error", "message": f"Failed to save: {str(e)}"}

def get_explore_atom_from_mongo(explore_atom_id: str):
    """
    Retrieve explore atom configuration from DESTINATION database
    
    Args:
        explore_atom_id: ID of the explore atom to retrieve
        
    Returns:
        Dict with explore atom data or None if not found
    """
    try:
        client = get_mongo_client()
        if not client:
            return None
        
        explore_db = client[EXPLORE_DATABASE]
        collection = explore_db[EXPLORE_COLLECTION]
        
        # Find the explore atom in MongoDB
        mongo_atom = collection.find_one({"explore_atom_id": explore_atom_id})
        
        client.close()
        
        if mongo_atom:
            # Convert ObjectId to string for JSON compatibility
            if '_id' in mongo_atom:
                mongo_atom['_id'] = str(mongo_atom['_id'])
            return mongo_atom
        
        return None
        
    except Exception as e:
        print(f"Error getting explore atom from MongoDB: {e}")
        return None

def update_explore_atom_in_mongo(explore_atom_id: str, operations: dict):
    """
    Update explore atom operations in DESTINATION database
    
    Args:
        explore_atom_id: ID of the explore atom to update
        operations: Operations configuration dict
        
    Returns:
        Dict with update status
    """
    try:
        client = get_mongo_client()
        if not client:
            return {"status": "error", "message": "Failed to connect to MongoDB"}
        
        explore_db = client[EXPLORE_DATABASE]
        collection = explore_db[EXPLORE_COLLECTION]
        
        # Update the document with new operations
        update_result = collection.update_one(
            {"explore_atom_id": explore_atom_id},
            {
                "$set": {
                    "operations": operations,
                    "status": "ready_for_processing",
                    "updated_at": datetime.now().isoformat()
                }
            }
        )
        
        client.close()
        
        if update_result.modified_count > 0:
            return {"status": "success", "message": "Operations saved to MongoDB"}
        else:
            return {"status": "warning", "message": "No document updated in MongoDB"}
    
    except Exception as e:
        return {"status": "error", "message": f"Failed to update MongoDB: {str(e)}"}

def list_saved_explore_atoms():
    """
    List all saved explore atoms from DESTINATION database
    
    Returns:
        Dict with list of all explore atoms or error message
    """
    try:
        client = get_mongo_client()
        if not client:
            return {"status": "error", "message": "Failed to connect to MongoDB"}
        
        explore_db = client[EXPLORE_DATABASE]
        collection = explore_db[EXPLORE_COLLECTION]
        
        # Get all saved explore atoms
        atoms_cursor = collection.find({})
        atoms_list = []
        
        for atom in atoms_cursor:
            if '_id' in atom:
                atom['_id'] = str(atom['_id'])
            atoms_list.append(atom)
        
        client.close()
        
        return {
            "status": "success",
            "destination_database": EXPLORE_DATABASE,
            "total_saved_atoms": len(atoms_list),
            "saved_atoms": atoms_list
        }
        
    except Exception as e:
        return {"status": "error", "message": f"Failed to list saved atoms: {str(e)}"}

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

def delete_explore_atom_from_mongo(explore_atom_id: str):
    """
    Delete an explore atom from DESTINATION database
    
    Args:
        explore_atom_id: ID of the explore atom to delete
        
    Returns:
        Dict with deletion status
    """
    try:
        client = get_mongo_client()
        if not client:
            return {"status": "error", "message": "Failed to connect to MongoDB"}
        
        explore_db = client[EXPLORE_DATABASE]
        collection = explore_db[EXPLORE_COLLECTION]
        
        delete_result = collection.delete_one({"explore_atom_id": explore_atom_id})
        
        client.close()
        
        if delete_result.deleted_count > 0:
            return {"status": "success", "message": f"Explore atom {explore_atom_id} deleted successfully"}
        else:
            return {"status": "warning", "message": f"No explore atom found with ID {explore_atom_id}"}
    
    except Exception as e:
        return {"status": "error", "message": f"Failed to delete explore atom: {str(e)}"}

def get_explore_atoms_by_validator_id(validator_atom_id: str):
    """
    Get all explore atoms created from a specific validator atom
    
    Args:
        validator_atom_id: ID of the validator atom
        
    Returns:
        Dict with list of related explore atoms
    """
    try:
        client = get_mongo_client()
        if not client:
            return {"status": "error", "message": "Failed to connect to MongoDB"}
        
        explore_db = client[EXPLORE_DATABASE]
        collection = explore_db[EXPLORE_COLLECTION]
        
        # Find all explore atoms with this validator_atom_id
        atoms_cursor = collection.find({"validator_atom_id": validator_atom_id})
        atoms_list = []
        
        for atom in atoms_cursor:
            if '_id' in atom:
                atom['_id'] = str(atom['_id'])
            atoms_list.append(atom)
        
        client.close()
        
        return {
            "status": "success",
            "validator_atom_id": validator_atom_id,
            "total_explore_atoms": len(atoms_list),
            "explore_atoms": atoms_list
        }
        
    except Exception as e:
        return {"status": "error", "message": f"Failed to get explore atoms: {str(e)}"}


# =============================================================================
# ADD TO EXISTING database.py - CHART RESULTS OPERATIONS
# =============================================================================

# Add this constant with your existing collection constants
CHART_RESULTS_COLLECTION = "chart_results"

# =============================================================================
# REPLACE save_chart_result_to_mongo in database.py with this IMPROVED version:
# =============================================================================

def save_chart_result_to_mongo(explore_atom_id: str, chart_data: dict, metadata: dict):
    """
    Save chart processing results to MongoDB with improved structure
    Optimized for frontend consumption
    """
    try:
        client = get_mongo_client()
        if not client:
            return {"status": "error", "message": "Failed to connect to MongoDB"}
        
        explore_db = client[EXPLORE_DATABASE]
        collection = explore_db[CHART_RESULTS_COLLECTION]
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        chart_result_id = f"chart_result_{timestamp}"
        
        # ✅ IMPROVED: Better structured document for frontend
        chart_document = {
            "chart_result_id": chart_result_id,
            "explore_atom_id": explore_atom_id,
            "created_at": datetime.now().isoformat(),
            
            # ✅ Chart info at top level - Frontend needs this immediately
            "chart_type": metadata.get("chart_type", "table"),
            "data_format": "line_series" if metadata.get("chart_type") == "line_chart" else "table_rows",
            
            # ✅ Data section with clear structure
            "data": {
                "chart_data": chart_data,
                "row_count": len(chart_data) if isinstance(chart_data, list) else 0,
                "columns": list(chart_data[0].keys()) if chart_data and isinstance(chart_data, list) and len(chart_data) > 0 else []
            },
            
            # ✅ Display configuration - Everything needed to render the chart
            "display_config": {
                "x_axis": metadata.get("x_axis"),
                "y_axis": metadata.get("measure"),
                "grouped_by": metadata.get("grouped_by", []),
                "aggregation": metadata.get("aggregation", "sum"),
                "weight_column": metadata.get("weight_column")
            },
            
            # ✅ Processing info - Metadata about data processing
            "processing_info": {
                "original_rows": metadata.get("original_rows", 0),
                "filtered_rows": metadata.get("filtered_rows", 0),
                "grouped_combinations": metadata.get("grouped_combinations", 0),
                "filters_applied": metadata.get("operations", {}).get("filters", {})
            },
            
            # ✅ Debug info - For troubleshooting (optional for frontend)
            "debug_info": {
                "filter_debug": metadata.get("filter_debug", {}),
                "operations": metadata.get("operations", {})
            }
        }
        
        result = collection.insert_one(chart_document)
        
        client.close()
        
        return {
            "status": "success",
            "message": "Chart result saved successfully",
            "chart_result_id": chart_result_id,
            "mongo_id": str(result.inserted_id)
        }
        
    except Exception as e:
        return {"status": "error", "message": f"Failed to save chart result: {str(e)}"}


def get_chart_result_from_mongo(chart_result_id: str):
    """
    Retrieve a specific chart result from MongoDB
    
    Args:
        chart_result_id: ID of the chart result to retrieve
        
    Returns:
        Dict with chart result data or None
    """
    try:
        client = get_mongo_client()
        if not client:
            return None
        
        explore_db = client[EXPLORE_DATABASE]
        collection = explore_db[CHART_RESULTS_COLLECTION]
        
        chart_result = collection.find_one({"chart_result_id": chart_result_id})
        
        client.close()
        
        if chart_result:
            if '_id' in chart_result:
                chart_result['_id'] = str(chart_result['_id'])
            return chart_result
        
        return None
        
    except Exception as e:
        print(f"Error getting chart result: {e}")
        return None

def get_latest_chart_results_for_atom(explore_atom_id: str, limit: int = 5):
    """
    Get the latest chart results for a specific explore atom
    
    Args:
        explore_atom_id: ID of the explore atom
        limit: Maximum number of results to return
        
    Returns:
        Dict with list of chart results
    """
    try:
        client = get_mongo_client()
        if not client:
            return {"status": "error", "message": "Failed to connect to MongoDB"}
        
        explore_db = client[EXPLORE_DATABASE]
        collection = explore_db[CHART_RESULTS_COLLECTION]
        
        # Find latest results, sorted by creation date
        cursor = collection.find(
            {"explore_atom_id": explore_atom_id}
        ).sort("created_at", -1).limit(limit)
        
        results = []
        for result in cursor:
            if '_id' in result:
                result['_id'] = str(result['_id'])
            results.append(result)
        
        client.close()
        
        return {
            "status": "success",
            "explore_atom_id": explore_atom_id,
            "chart_results": results,
            "count": len(results)
        }
        
    except Exception as e:
        return {"status": "error", "message": f"Failed to get chart results: {str(e)}"}