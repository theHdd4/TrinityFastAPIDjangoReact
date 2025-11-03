# database.py - MongoDB operations for Molecule API

from pymongo import MongoClient
from datetime import datetime
import logging
import os
from typing import Dict, Any, List, Optional
from .config import settings

# MongoDB Configuration - Use same credentials as scenario planner
MONGODB_URL = "mongodb://root:rootpass@mongo:27017/trinity_db?authSource=admin"

# Accept both MONGO_USERNAME and legacy MONGO_USER for credentials
MONGO_USER = "root"
MONGO_PASSWORD = "rootpass"
MONGO_AUTH_DB = "admin"

DATABASE_NAME = settings.molecule_database
COLLECTION_NAME = settings.molecules_config_collection
WORKFLOW_COLLECTION_NAME = "workflow_model_molecule_configuration"

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
    collection = db[COLLECTION_NAME]
    workflow_collection = db[WORKFLOW_COLLECTION_NAME]

    # Test connection
    mongo_client.admin.command('ping')
    print(f"✅ Connected to MongoDB: {DATABASE_NAME}")
    print(f"✅ Collection: {COLLECTION_NAME}")
    print(f"✅ Workflow Collection: {WORKFLOW_COLLECTION_NAME}")
    
    # Ensure collections exist
    try:
        if COLLECTION_NAME not in db.list_collection_names():
            db.create_collection(COLLECTION_NAME)
            print(f"✅ Created collection {COLLECTION_NAME} in {DATABASE_NAME}")
        if WORKFLOW_COLLECTION_NAME not in db.list_collection_names():
            db.create_collection(WORKFLOW_COLLECTION_NAME)
            print(f"✅ Created collection {WORKFLOW_COLLECTION_NAME} in {DATABASE_NAME}")
    except Exception as exc:
        logging.warning(f"Could not verify/create collections: {exc}")
    
except Exception as e:
    print(f"❌ MongoDB connection failed: {e}")
    mongo_client = None
    db = None
    collection = None
    workflow_collection = None

def ensure_mongo_connection() -> bool:
    """Ensure a live connection to MongoDB."""
    global mongo_client, db, collection, workflow_collection

    if mongo_client is not None and db is not None and collection is not None and workflow_collection is not None:
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
        collection = db[COLLECTION_NAME]
        workflow_collection = db[WORKFLOW_COLLECTION_NAME]
        mongo_client.admin.command("ping")
        
        # Ensure collections exist
        try:
            if COLLECTION_NAME not in db.list_collection_names():
                db.create_collection(COLLECTION_NAME)
            if WORKFLOW_COLLECTION_NAME not in db.list_collection_names():
                db.create_collection(WORKFLOW_COLLECTION_NAME)
        except Exception as exc:
            logging.warning(f"Could not verify/create collections: {exc}")
        return True
    except Exception as exc:
        logging.error(f"MongoDB reconnection failed: {exc}")
        mongo_client = None
        db = None
        collection = None
        workflow_collection = None
        return False

def check_mongodb_connection() -> bool:
    """Check if MongoDB is available, attempting reconnection if necessary."""
    return ensure_mongo_connection()

def save_molecule_to_mongo(
    molecule_data: Dict[str, Any],
    *,
    user_id: str = "",
    client_id: str = "",
    app_id: str = "",
    project_id: Optional[int] = None,
) -> Dict[str, Any]:
    """Save molecule configuration to MongoDB."""
    if not check_mongodb_connection():
        return {"status": "error", "error": "MongoDB not connected"}
    
    try:
        # Create document with metadata
        document = {
            "_id": molecule_data.get("id"),  # Use molecule ID as MongoDB _id
            "title": molecule_data.get("title"),
            "type": molecule_data.get("type", ""),
            "subtitle": molecule_data.get("subtitle", ""),
            "tag": molecule_data.get("tag", ""),
            "atoms": molecule_data.get("atoms", []),
            "atom_order": molecule_data.get("atomOrder", []),
            "selected_atoms": molecule_data.get("selectedAtoms", {}),
            "connections": molecule_data.get("connections", []),
            "position": molecule_data.get("position", {"x": 0, "y": 0}),
            "molecule_type": "client_molecule",  # Distinguish from QM molecules
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "user_id": user_id,
            "client_id": client_id,
            "app_id": app_id,
            "project_id": project_id,
        }
        
        # Save to MongoDB
        result = collection.replace_one(
            {"_id": document["_id"]},
            document,
            upsert=True
        )
        
        print(f"📦 Stored molecule in {COLLECTION_NAME}: {document['_id']}")
        
        return {
            "status": "success",
            "mongo_id": document["_id"],
            "operation": "inserted" if result.upserted_id else "updated",
            "collection": COLLECTION_NAME,
            "molecule_id": document["_id"]
        }
        
    except Exception as e:
        logging.error(f"MongoDB save error for molecule: {e}")
        return {"status": "error", "error": str(e)}

def get_molecules_from_mongo(
    *,
    user_id: Optional[str] = None,
    client_id: Optional[str] = None,
    project_id: Optional[int] = None,
    molecule_type: str = "client_molecule"
) -> List[Dict[str, Any]]:
    """Get molecules from MongoDB with optional filtering."""
    if not check_mongodb_connection():
        return []
    
    try:
        # Build query filter
        query_filter = {"molecule_type": molecule_type}
        
        if user_id:
            query_filter["user_id"] = user_id
        if client_id:
            query_filter["client_id"] = client_id
        if project_id:
            query_filter["project_id"] = project_id
        
        # Fetch molecules
        cursor = collection.find(query_filter).sort("created_at", -1)
        molecules = list(cursor)
        
        # Convert MongoDB documents back to molecule format
        result = []
        for doc in molecules:
            molecule = {
                "id": doc.get("_id"),  # Use MongoDB _id as molecule ID
                "title": doc.get("title"),
                "type": doc.get("type", ""),
                "subtitle": doc.get("subtitle", ""),
                "tag": doc.get("tag", ""),
                "atoms": doc.get("atoms", []),
                "atomOrder": doc.get("atom_order", []),
                "selectedAtoms": doc.get("selected_atoms", {}),
                "connections": doc.get("connections", []),
                "position": doc.get("position", {"x": 0, "y": 0}),
                "created_at": doc.get("created_at"),
                "updated_at": doc.get("updated_at"),
                "user_id": doc.get("user_id"),
                "client_id": doc.get("client_id"),
                "app_id": doc.get("app_id"),
                "project_id": doc.get("project_id"),
            }
            result.append(molecule)
        
        print(f"📦 Retrieved {len(result)} molecules from {COLLECTION_NAME}")
        return result
        
    except Exception as e:
        logging.error(f"MongoDB read error for molecules: {e}")
        return []

def get_molecule_by_id(molecule_id: str) -> Optional[Dict[str, Any]]:
    """Get a specific molecule by ID from MongoDB."""
    if not check_mongodb_connection():
        return None
    
    try:
        doc = collection.find_one({"_id": molecule_id})
        if not doc:
            return None
        
        molecule = {
            "id": doc.get("_id"),  # Use MongoDB _id as molecule ID
            "title": doc.get("title"),
            "type": doc.get("type", ""),
            "subtitle": doc.get("subtitle", ""),
            "tag": doc.get("tag", ""),
            "atoms": doc.get("atoms", []),
            "atomOrder": doc.get("atom_order", []),
            "selectedAtoms": doc.get("selected_atoms", {}),
            "connections": doc.get("connections", []),
            "position": doc.get("position", {"x": 0, "y": 0}),
            "created_at": doc.get("created_at"),
            "updated_at": doc.get("updated_at"),
            "user_id": doc.get("user_id"),
            "client_id": doc.get("client_id"),
            "app_id": doc.get("app_id"),
            "project_id": doc.get("project_id"),
        }
        
        return molecule
        
    except Exception as e:
        logging.error(f"MongoDB read error for molecule {molecule_id}: {e}")
        return None

def delete_molecule_from_mongo(molecule_id: str) -> Dict[str, Any]:
    """Delete a molecule from MongoDB."""
    if not check_mongodb_connection():
        return {"status": "error", "error": "MongoDB not connected"}
    
    try:
        result = collection.delete_one({"_id": molecule_id})
        
        if result.deleted_count > 0:
            print(f"🗑️ Deleted molecule {molecule_id} from {COLLECTION_NAME}")
            return {
                "status": "success",
                "molecule_id": molecule_id,
                "deleted_count": result.deleted_count,
                "collection": COLLECTION_NAME
            }
        else:
            return {
                "status": "error",
                "error": "Molecule not found",
                "molecule_id": molecule_id
            }
        
    except Exception as e:
        logging.error(f"MongoDB delete error for molecule {molecule_id}: {e}")
        return {"status": "error", "error": str(e)}

def test_mongodb_operations() -> Dict[str, Any]:
    """Test MongoDB connection and basic operations."""
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
        
        # Count documents in our collection
        doc_count = collection.count_documents({})
        
        return {
            "status": "success",
            "message": "MongoDB operations working",
            "mongodb_url": MONGODB_URL,
            "database": DATABASE_NAME,
            "collection": COLLECTION_NAME,
            "available_databases": databases,
            "collections": collections,
            "document_count": doc_count
        }
        
    except Exception as e:
        return {
            "status": "error",
            "message": f"MongoDB test failed: {str(e)}",
            "mongodb_url": MONGODB_URL
        }

# =============================================================================
# WORKFLOW CONFIGURATION FUNCTIONS
# =============================================================================

def save_workflow_to_mongo(
    canvas_molecules: List[Dict[str, Any]],
    custom_molecules: List[Dict[str, Any]],
    standalone_cards: Optional[List[Dict[str, Any]]] = None,
    workflow_name: Optional[str] = None,
    *,
    user_id: str = "",
    client_name: str = "",
    app_name: str = "",
    project_name: str = "",
) -> Dict[str, Any]:
    """Save workflow mode configuration to MongoDB."""
    if not check_mongodb_connection():
        return {"status": "error", "error": "MongoDB not connected"}
    
    try:
        # Generate workflow ID based on client_name, app_name, and project_name
        workflow_id = f"{client_name}/{app_name}/{project_name}"
        
        # Create document with metadata
        document = {
            "_id": workflow_id,
            "canvas_molecules": canvas_molecules,
            "custom_molecules": custom_molecules,
            "standalone_cards": standalone_cards or [],
            "workflow_name": workflow_name,
            "user_id": user_id,
            "client_name": client_name,
            "app_name": app_name,
            "project_name": project_name,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "workflow_type": "workflow_mode_configuration"
        }
        
        # Save to MongoDB workflow collection
        result = workflow_collection.replace_one(
            {"_id": workflow_id},
            document,
            upsert=True
        )
        
        print(f"📦 Stored workflow configuration in {WORKFLOW_COLLECTION_NAME}: {workflow_id}")
        
        return {
            "status": "success",
            "workflow_id": workflow_id,
            "operation": "inserted" if result.upserted_id else "updated",
            "collection": WORKFLOW_COLLECTION_NAME,
            "canvas_molecules_count": len(canvas_molecules),
            "custom_molecules_count": len(custom_molecules)
        }
        
    except Exception as e:
        logging.error(f"MongoDB save error for workflow configuration: {e}")
        return {"status": "error", "error": str(e)}

def get_workflow_from_mongo(
    *,
    user_id: Optional[str] = None,
    client_name: Optional[str] = None,
    app_name: Optional[str] = None,
    project_name: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Get workflow configuration from MongoDB."""
    if not check_mongodb_connection():
        return None
    
    try:
        # Build query filter - be more flexible with matching
        query_filter = {"workflow_type": "workflow_mode_configuration"}
        
        # Only add filters if they have meaningful values (not defaults)
        if user_id and user_id.strip():
            query_filter["user_id"] = user_id
        if client_name and client_name.strip() and client_name != 'default_client':
            query_filter["client_name"] = client_name
        if app_name and app_name.strip() and app_name != 'default_app':
            query_filter["app_name"] = app_name
        if project_name and project_name.strip() and project_name != 'default_project':
            query_filter["project_name"] = project_name
        
        print(f"🔍 MongoDB query filter: {query_filter}")
        
        # Fetch workflow configuration
        doc = workflow_collection.find_one(query_filter)
        
        if not doc:
            print(f"❌ No workflow found with filter: {query_filter}")
            return None
        
        # Convert MongoDB document back to workflow format
        workflow_data = {
            "workflow_id": doc.get("_id"),
            "workflow_name": doc.get("workflow_name"),
            "canvas_molecules": doc.get("canvas_molecules", []),
            "custom_molecules": doc.get("custom_molecules", []),
            "standalone_cards": doc.get("standalone_cards", []),
            "created_at": doc.get("created_at"),
            "updated_at": doc.get("updated_at"),
            "user_id": doc.get("user_id"),
            "client_name": doc.get("client_name"),
            "app_name": doc.get("app_name"),
            "project_name": doc.get("project_name"),
        }
        
        print(f"📦 Retrieved workflow configuration from {WORKFLOW_COLLECTION_NAME}: {workflow_data['workflow_id']}")
        return workflow_data
        
    except Exception as e:
        logging.error(f"MongoDB read error for workflow configuration: {e}")
        return None

def get_workflow_by_id_from_mongo(workflow_id: str) -> Optional[Dict[str, Any]]:
    """Get a specific workflow configuration by ID from MongoDB."""
    if not check_mongodb_connection():
        return None
    
    try:
        doc = workflow_collection.find_one({"_id": workflow_id})
        if not doc:
            return None
        
        workflow_data = {
            "workflow_id": doc.get("_id"),
            "workflow_name": doc.get("workflow_name"),
            "canvas_molecules": doc.get("canvas_molecules", []),
            "custom_molecules": doc.get("custom_molecules", []),
            "standalone_cards": doc.get("standalone_cards", []),
            "created_at": doc.get("created_at"),
            "updated_at": doc.get("updated_at"),
            "user_id": doc.get("user_id"),
            "client_id": doc.get("client_id"),
            "app_id": doc.get("app_id"),
            "project_id": doc.get("project_id"),
        }
        
        return workflow_data
        
    except Exception as e:
        logging.error(f"MongoDB read error for workflow {workflow_id}: {e}")
        return None
