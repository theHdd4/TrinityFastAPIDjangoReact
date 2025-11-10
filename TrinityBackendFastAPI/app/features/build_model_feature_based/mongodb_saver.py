# app/features/build_model_feature_based/mongodb_saver.py

import os
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
import logging

from app.core.mongo import build_host_mongo_uri

# Configure logging
logger = logging.getLogger(__name__)

DEFAULT_MONGO_URI = build_host_mongo_uri()
MONGO_URI = os.getenv("MONGO_URI", DEFAULT_MONGO_URI)
MONGO_DB = os.getenv("MONGO_DB", "trinity_db")
client = AsyncIOMotorClient(MONGO_URI)
db = client[MONGO_DB]

async def save_build_config(
    client_name: str,
    app_name: str,
    project_name: str,
    build_data: dict,
    *,
    user_id: str = "",
    project_id: int | None = None,
):
    """Save build model configuration data to MongoDB build-model_featurebased_configs collection.
    Always overwrites the entire document for the given document_id (no merging)."""
    try:
        document_id = f"{client_name}/{app_name}/{project_name}"
        
        # Create document - always overwrites existing document completely
        document = {
            "_id": document_id,
            "client_name": client_name,
            "app_name": app_name,
            "project_name": project_name,
            "operation_type": "build_model_feature_based",
            "updated_at": datetime.utcnow(),
            "user_id": user_id,
            "project_id": project_id,
            **build_data,
        }
        
        # Use replace_one with upsert=True to overwrite if exists, insert if not exists
        result = await db["build-model_featurebased_configs"].replace_one(
            {"_id": document_id},
            document,
            upsert=True
        )
        
        # Determine operation type based on result
        operation = "updated" if result.matched_count > 0 else "inserted"
        
        logger.info(f"📦 {'Overwritten' if operation == 'updated' else 'Inserted'} document in build-model_featurebased_configs: {document_id}")
        
        return {
            "status": "success", 
            "mongo_id": document_id,
            "operation": operation,
            "collection": "build-model_featurebased_configs"
        }
        
    except Exception as e:
        logger.error(f"❌ MongoDB save error for build-model_featurebased_configs: {e}")
        return {"status": "error", "error": str(e)}

async def save_mmm_model_results(
    scope_id: str,
    scope_name: str,
    set_name: str,
    combination_results: list,
    x_variables: list,
    y_variable: str,
    price_column: str = None,
    standardization: str = "mmm_per_variable",
    test_size: float = 0.2,
    run_id: str = None,
    all_variable_stats: dict = None,
    combo_config: dict = None
):
    """Save all MMM model results to MongoDB build-model_featurebased_configs collection in a single document"""
    try:
        # Create document ID based on scope (all combinations in one document)
        document_id = f"{scope_id}_all_combinations"
        
        # Prepare the document structure with all combinations
        document = {
            "_id": document_id,
            "scope_id": scope_id,
            "scope_name": scope_name,
            "set_name": set_name,
            "combination_results": combination_results,  # All combinations in one document
            "x_variables": x_variables,
            "y_variable": y_variable,
            "price_column": price_column,
            "standardization": standardization,
            "test_size": test_size,
            "run_id": run_id,
            "all_variable_stats": all_variable_stats or {},
            "combo_config": combo_config or {},
            "operation_type": "mmm_model_results",
            "total_combinations": len(combination_results),
            "total_models": sum(len(combo.get("model_results", [])) for combo in combination_results),
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        
        # Check if document already exists
        existing_doc = await db["build-model_featurebased_configs"].find_one({"_id": document_id})
        
        if existing_doc:
            # Update existing document
            result = await db["build-model_featurebased_configs"].replace_one(
                {"_id": document_id},
                document
            )
            operation = "updated"
        else:
            # Insert new document
            result = await db["build-model_featurebased_configs"].insert_one(document)
            operation = "inserted"
        
        logger.info(f"📦 Stored all MMM model results in build-model_featurebased_configs: {document_id}")
        
        return {
            "status": "success",
            "mongo_id": document_id,
            "operation": operation,
            "collection": "build-model_featurebased_configs",
            "total_combinations": len(combination_results),
            "total_models": sum(len(combo.get("model_results", [])) for combo in combination_results)
        }
        
    except Exception as e:
        logger.error(f"❌ MongoDB save error for MMM model results: {e}")
        return {"status": "error", "error": str(e)}

async def get_build_config_from_mongo(client_name: str, app_name: str, project_name: str):
    """Retrieve saved build configuration."""
    try:
        document_id = f"{client_name}/{app_name}/{project_name}"
        result = await db["build-model_featurebased_configs"].find_one({"_id": document_id})
        return result
    except Exception as e:
        logger.error(f"MongoDB read error for build-model_featurebased_configs: {e}")
        return None

async def get_scope_config_from_mongo(client_name: str, app_name: str, project_name: str):
    """Retrieve saved scope configuration from scopeselector_configs collection."""
    try:
        document_id = f"{client_name}/{app_name}/{project_name}"
        result = await client["trinity_db"]["scopeselector_configs"].find_one({"_id": document_id})
        return result
    except Exception as e:
        logger.error(f"❌ MongoDB read error for scopeselector_configs: {e}")
        return None

async def get_column_classifier_config_from_mongo(client_name: str, app_name: str, project_name: str):
    """Retrieve column classifier configuration from column_classifier_config collection."""
    try:
        document_id = f"{client_name}/{app_name}/{project_name}"
        result = await client["trinity_db"]["column_classifier_config"].find_one({"_id": document_id})
        return result
    except Exception as e:
        logger.error(f"❌ MongoDB read error for column_classifier_config: {e}")
        return None

async def get_combination_column_values(minio_client, bucket_name: str, file_key: str, identifiers: list):
    """Get unique column values for identifiers from a source file."""
    try:
        import pandas as pd
        import pyarrow as pa
        import pyarrow.feather as feather
        from io import BytesIO
        
        # Get the file from MinIO
        response = minio_client.get_object(bucket_name, file_key)
        file_data = response.read()
        response.close()
        response.release_conn()
        
        # Determine file type and read accordingly
        if file_key.endswith('.arrow') or file_key.endswith('.feather'):
            # Read Arrow/Feather file
            buffer = BytesIO(file_data)
            df = feather.read_feather(buffer)  # Already returns pandas DataFrame
        elif file_key.endswith('.csv'):
            # Read CSV file
            buffer = BytesIO(file_data)
            df = pd.read_csv(buffer)
        else:
            logger.warning(f"Unsupported file format: {file_key}")
            return {}
        
        # Extract unique values for each identifier column
        column_values = {}
        for identifier in identifiers:
            if identifier in df.columns:
                unique_values = df[identifier].dropna().unique().tolist()
                # Convert to string and limit to first value if multiple exist
                if unique_values:
                    column_values[identifier] = str(unique_values[0])  # Only first value as requested
                else:
                    column_values[identifier] = "Unknown"
            else:
                column_values[identifier] = "Unknown"
        
        return column_values
        
    except Exception as e:
        logger.error(f"Error getting column values from {file_key}: {e}")
        return {identifier: "Unknown" for identifier in identifiers}
