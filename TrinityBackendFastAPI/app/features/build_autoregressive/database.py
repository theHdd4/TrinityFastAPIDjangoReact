import os
import pandas as pd
import numpy as np
from io import StringIO, BytesIO
from typing import List, Dict, Any, Optional
import asyncio
from datetime import datetime, timezone

# PyArrow imports for MinIO storage
import pyarrow as pa
import pyarrow.feather as feather
import pyarrow.ipc as ipc

# MinIO imports
from minio import Minio
from minio.error import S3Error

# MongoDB imports
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorCollection

# Configuration
from .config import settings
from .deps import redis_client, OBJECT_PREFIX, MINIO_BUCKET


# MinIO client initialization
minio_client = Minio(
    settings.minio_url,
    access_key=settings.minio_access_key,
    secret_key=settings.minio_secret_key,
    secure=settings.minio_secure
)

# MongoDB client initialization - lazy loading
mongo_client = None
autoregressive_db = None
autoreg_results_collection = None
autoreg_identifiers_collection = None

def get_mongo_client():
    """Get MongoDB client with lazy initialization."""
    global mongo_client, autoregressive_db, autoreg_results_collection, autoreg_identifiers_collection
    
    if mongo_client is None:
        try:
            # Use the correct MongoDB connection string with authentication
            mongo_uri = "mongodb://root:rootpass@mongo:27017/trinity_prod?authSource=admin"
            
            mongo_client = AsyncIOMotorClient(
                mongo_uri,
                serverSelectionTimeoutMS=5000,
                connectTimeoutMS=5000,
                socketTimeoutMS=5000,
                maxPoolSize=10,
            )
            
            # Autoregressive database and collection
            autoregressive_db = mongo_client["trinity_prod"]  # Use the database from docker-compose
            autoreg_results_collection = autoregressive_db["autoreg_results"]
            autoreg_identifiers_collection = autoregressive_db["autoreg_identifiers"]
            
            
        except Exception as e:
            mongo_client = None
            autoregressive_db = None
            autoreg_results_collection = None
            autoreg_identifiers_collection = None
    
    return mongo_client

# Collection for combination save status (like column_classifier_configs)
combination_save_status_db = None
combination_save_status_collection = None

def get_combination_save_status_collection():
    """Get combination save status collection with lazy initialization."""
    global combination_save_status_db, combination_save_status_collection
    
    if combination_save_status_collection is None:
        try:
            mongo_client = get_mongo_client()
            if mongo_client:
                combination_save_status_db = mongo_client[settings.combination_save_status_database]
                combination_save_status_collection = combination_save_status_db[settings.combination_save_status_collection]
        except Exception as e:
            combination_save_status_db = None
            combination_save_status_collection = None
    
    return combination_save_status_collection

async def save_combination_save_status_to_mongo(
    scope: str,
    atom_id: str,
    save_status_data: dict,
    client_name: str = "",
    app_name: str = "",
    project_name: str = ""
):
    """Save combination save status to MongoDB (like column_classifier_configs)."""
    try:
        collection = get_combination_save_status_collection()
        if collection is None:
            return {"status": "error", "error": "MongoDB connection not available"}
            
        document_id = f"{client_name}/{app_name}/{project_name}/autoregressive_save_status_{scope}_{atom_id}"
        document = {
            "_id": document_id,
            "scope": scope,
            "atom_id": atom_id,
            "client_name": client_name,
            "app_name": app_name,
            "project_name": project_name,
            "save_status": save_status_data,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
        
        result = await collection.replace_one(
            {"_id": document_id},
            document,
            upsert=True
        )
        
        return {
            "status": "success",
            "mongo_id": document_id,
            "operation": "inserted" if result.upserted_id else "updated",
            "collection": settings.combination_save_status_collection,
        }
        
    except Exception as e:
        return {"status": "error", "error": str(e)}

async def get_combination_save_status_from_mongo(
    scope: str,
    atom_id: str,
    client_name: str = "",
    app_name: str = "",
    project_name: str = ""
):
    """Retrieve combination save status from MongoDB (like column_classifier_configs)."""
    try:
        collection = get_combination_save_status_collection()
        if collection is None:
            return None
            
        document_id = f"{client_name}/{app_name}/{project_name}/autoregressive_save_status_{scope}_{atom_id}"
        document = await collection.find_one({"_id": document_id})
        
        if document:
            return document.get("save_status", {})
        else:
            return None
            
    except Exception as e:
        return None

async def update_combination_save_status(
    scope: str,
    atom_id: str,
    saved_combinations: list,
    pending_combinations: list,
    client_name: str = "",
    app_name: str = "",
    project_name: str = "",
    source_file_key: str = None
):
    """Update combination save status with new data."""
    try:
        # If source_file_key is provided, read the file to get all possible combinations
        all_combinations = set()
        if source_file_key and minio_client:
            try:
                # Read the source file to get all combination IDs
                response = minio_client.get_object(MINIO_BUCKET, source_file_key)
                content = response.read()
                response.close()
                response.release_conn()
                
                # Read file based on extension
                if source_file_key.endswith(".csv"):
                    df = pd.read_csv(io.BytesIO(content))
                elif source_file_key.endswith(".xlsx"):
                    df = pd.read_excel(io.BytesIO(content))
                elif source_file_key.endswith(".arrow"):
                    reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
                    df = reader.read_all().to_pandas()
                else:
                    # Default to CSV
                    df = pd.read_csv(io.BytesIO(content))
                
                # Get all unique combination IDs from the file
                if "combination_id" in df.columns:
                    all_combinations = set(df["combination_id"].astype(str).unique())
                elif "combination" in df.columns:
                    all_combinations = set(df["combination"].astype(str).unique())
                elif "combo_id" in df.columns:
                    all_combinations = set(df["combo_id"].astype(str).unique())
                
                
            except Exception as e:
                # Fall back to using provided combinations
                all_combinations = set(saved_combinations + pending_combinations)
        else:
            # Use provided combinations if no source file
            all_combinations = set(saved_combinations + pending_combinations)
        
        # Ensure we have the complete picture
        if all_combinations:
            # Update saved combinations to include any that might be missing
            current_saved = set(saved_combinations)
            current_pending = all_combinations - current_saved
            
            # Update the lists with the complete data
            saved_combinations = list(current_saved)
            pending_combinations = list(current_pending)
        else:
            # Fallback: use provided combinations
            saved_combinations = []
            pending_combinations = all_combinations if all_combinations else []
        
        save_status_data = {
            "total_combinations": len(all_combinations) if all_combinations else (len(saved_combinations) + len(pending_combinations)),
            "saved_combinations": saved_combinations,
            "pending_combinations": pending_combinations,
            "saved_count": len(saved_combinations),
            "pending_count": len(pending_combinations),
            "completion_percentage": round((len(saved_combinations) / len(all_combinations)) * 100, 2) if all_combinations and len(all_combinations) > 0 else 0,
            "last_updated": datetime.now(timezone.utc).isoformat(),
            "source_file": source_file_key
        }
        
        result = await save_combination_save_status_to_mongo(
            scope=scope,
            atom_id=atom_id,
            save_status_data=save_status_data,
            client_name=client_name,
            app_name=app_name,
            project_name=project_name
        )
        
        
        return result
        
    except Exception as e:
        return {"status": "error", "error": str(e)}

async def get_combination_save_status(
    scope: str,
    atom_id: str,
    source_file_key: str,
    client_name: str = "",
    app_name: str = "",
    project_name: str = "",
    force_refresh: bool = False
):
    """Get the complete status of saved combinations for a specific scope and atom."""
    try:
        # First, try to get existing status from MongoDB
        existing_status = await get_combination_save_status_from_mongo(
            scope=scope,
            atom_id=atom_id,
            client_name=client_name,
            app_name=app_name,
            project_name=project_name
        )
        
        # Use cached data only if not forcing refresh and source file matches
        if not force_refresh and existing_status and existing_status.get("source_file") == source_file_key:
            return existing_status
        
        # Always read fresh data from source file to ensure we have the latest combinations
        
        # Otherwise, read the source file to get all combinations
        all_combinations = set()
        if source_file_key and minio_client:
            try:
                # Read the source file to get all combination IDs
                response = minio_client.get_object(MINIO_BUCKET, source_file_key)
                content = response.read()
                response.close()
                response.release_conn()
                
                # Read file based on extension
                if source_file_key.endswith(".csv"):
                    df = pd.read_csv(io.BytesIO(content))
                elif source_file_key.endswith(".xlsx"):
                    df = pd.read_excel(io.BytesIO(content))
                elif source_file_key.endswith(".arrow"):
                    reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
                    df = reader.read_all().to_pandas()
                else:
                    # Default to CSV
                    df = pd.read_csv(io.BytesIO(content))
                
                # Get all unique combination IDs from the file
                if "combination_id" in df.columns:
                    all_combinations = set(df["combination_id"].astype(str).unique())
                elif "combination" in df.columns:
                    all_combinations = set(df["combination"].astype(str).unique())
                elif "combo_id" in df.columns:
                    all_combinations = set(df["combo_id"].astype(str).unique())
                
                
            except Exception as e:
                return {
                    "status": "error",
                    "error": f"Could not read source file: {str(e)}",
                    "scope": scope,
                    "atom_id": atom_id,
                    "total_combinations": 0,
                    "saved_combinations": [],
                    "pending_combinations": [],
                    "saved_count": 0,
                    "pending_count": 0,
                    "completion_percentage": 0
                }
        
        # Get saved combinations from existing status or empty list
        saved_combinations = existing_status.get("saved_combinations", []) if existing_status else []
        saved_set = set(saved_combinations)
        
        # Calculate pending combinations
        pending_combinations = list(all_combinations - saved_set)
        
        # Create complete status
        status_data = {
            "scope": scope,
            "atom_id": atom_id,
            "total_combinations": len(all_combinations),
            "saved_combinations": list(saved_set),
            "pending_combinations": pending_combinations,
            "saved_count": len(saved_set),
            "pending_count": len(pending_combinations),
            "completion_percentage": round((len(saved_set) / len(all_combinations)) * 100, 2) if all_combinations and len(all_combinations) > 0 else 0,
            "source_file": source_file_key,
            "last_updated": datetime.now(timezone.utc).isoformat()
        }
        
        # Update the status in MongoDB
        await update_combination_save_status(
            scope=scope,
            atom_id=atom_id,
            saved_combinations=list(saved_set),
            pending_combinations=pending_combinations,
            client_name=client_name,
            app_name=app_name,
            project_name=project_name,
            source_file_key=source_file_key
        )
        
        return status_data
        
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "scope": scope,
            "atom_id": atom_id,
            "total_combinations": 0,
            "saved_combinations": [],
            "pending_combinations": [],
            "saved_count": 0,
            "pending_count": 0,
            "completion_percentage": 0
        }

async def save_autoregressive_results(scope_id: str, set_name: str, combination_id: str, results: Dict[str, Any]):
    """Save autoregressive model results to MongoDB."""
    get_mongo_client()  # Initialize connection if needed
    if autoreg_results_collection is None:
        return
        
    try:
        document = {
            "scope_id": scope_id,
            "set_name": set_name,
            "combination_id": combination_id,
            "results": results,
            "created_at": datetime.utcnow(),
            "status": "completed"
        }
        
        await autoreg_results_collection.insert_one(document)
        
    except Exception as e:
        raise

async def get_autoregressive_results(scope_id: str, set_name: str) -> List[Dict[str, Any]]:
    """Get autoregressive results for a scope and set."""
    get_mongo_client()  # Initialize connection if needed
    if autoreg_results_collection is None:
        return []
        
    try:
        cursor = autoreg_results_collection.find({
            "scope_id": scope_id,
            "set_name": set_name
        })
        results = await cursor.to_list(length=None)
        return results
    except Exception as e:
        return []

async def save_autoregressive_results_by_run_id(run_id: str, results: Dict[str, Any]):
    """Save autoregressive model results to MongoDB using run_id."""
    get_mongo_client()  # Initialize connection if needed
    if autoreg_results_collection is None:
        return
        
    try:
        document = {
            "run_id": run_id,
            "results": results,
            "created_at": datetime.utcnow(),
            "status": "completed"
        }
        
        await autoreg_results_collection.insert_one(document)
        
    except Exception as e:
        raise

async def get_autoregressive_results_by_run_id(run_id: str) -> Optional[Dict[str, Any]]:
    """Get autoregressive results by run_id."""
    get_mongo_client()  # Initialize connection if needed
    if autoreg_results_collection is None:
        return None
        
    try:
        result = await autoreg_results_collection.find_one({"run_id": run_id})
        return result
    except Exception as e:
        return None

def save_dataframe_to_minio(df: pd.DataFrame, object_name: str, format: str = "csv"):
    """Save dataframe to MinIO."""
    try:
        if format == "csv":
            content = df.to_csv(index=False).encode("utf-8")
            content_type = "text/csv"
        elif format == "arrow":
            buffer = pa.BufferOutputStream()
            table = pa.Table.from_pandas(df)
            with pa.ipc.RecordBatchFileWriter(buffer, table.schema) as writer:
                writer.write_table(table)
            content = buffer.getvalue().to_pybytes()
            content_type = "application/octet-stream"
        else:
            raise ValueError(f"Unsupported format: {format}")
        
        minio_client.put_object(
            MINIO_BUCKET,
            object_name,
            data=BytesIO(content),
            length=len(content),
            content_type=content_type
        )
        
        # Cache in Redis for 1 hour
        if redis_client:
            try:
                redis_client.setex(object_name, 3600, content)
            except Exception as e:
                # Log Redis error but don't fail the operation
                logger.warning(f"Failed to cache in Redis: {e}")
        
        
    except Exception as e:
        raise
