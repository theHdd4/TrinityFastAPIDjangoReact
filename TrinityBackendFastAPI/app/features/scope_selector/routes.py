# routes.py
from fastapi import APIRouter, HTTPException, Depends, Query, Path, Request, Body
from fastapi.responses import JSONResponse
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime
import logging
import pandas as pd
import io
import json
from io import BytesIO
from itertools import product

from minio import Minio
from minio.error import S3Error
from motor.motor_asyncio import AsyncIOMotorCollection
from pymongo import MongoClient

from app.core.task_queue import celery_task_client, format_task_response

from .config import get_settings, Settings
from .schemas import (
    ScopeRequest, 
    ScopeResponse,
    MultiFilterScopeRequest,
    MultiFilterScopeResponse,
    FilterSetResult,
    CombinationFileInfo,
    ValidatorAtomRequest,
    ValidatorAtomResponse,
    ColumnClassification,
    ClassificationSummary,
    ScopeFilterResponse,
    ScopeFilterRequest,
    CriteriaSettings
)
from ..data_upload_validate.app.routes import get_object_prefix
from .deps import (
    get_minio_client,
    get_redis_client,
    get_validator_atoms_collection,
    get_scopes_collection,
    get_processing_jobs_collection
)
from .database import ValidatorAtomRepository
from .mongodb_saver import save_scope_config, get_scope_config_from_mongo

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Helper to fetch Redis client (module-level)
try:
    _redis_client = get_redis_client()
except Exception as exc:
    logger.warning(f"Redis unavailable: {exc}")
    _redis_client = None

# TTL for caching classifier config in Redis (seconds)
CLASSIFIER_CFG_TTL = 3600
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create router instance
router = APIRouter()

# ============================================================================
# IDENTIFIER OPTIONS ENDPOINT
# ============================================================================

from app.features.column_classifier.database import get_classifier_config_from_mongo  # import here to avoid circular deps

@router.get("/identifier_options")
async def identifier_options(
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name"),
    file_name: Optional[str] = Query(None, description="Specific file name for file-specific lookup"),
):
    """Return identifier column names using Redis ▶ Mongo ▶ fallback logic.

    1. Attempt to read JSON config from Redis key
       `<client>/<app>/<project>/column_classifier_config` (or file-specific key if file_name provided).
    2. If missing, fetch from Mongo (`column_classifier_config` collection).
       Cache the document back into Redis.
    3. If still unavailable, return empty list – the frontend will
       fall back to its existing column_summary extraction flow.
    """
    # Use file-specific key if file_name is provided, otherwise use project-level key
    if file_name:
        # Use the same URL-safe encoding as column classifier
        from urllib.parse import quote
        safe_file = quote(file_name, safe="")
        key = f"{client_name}/{app_name}/{project_name}/column_classifier_config:{safe_file}"
    else:
        key = f"{client_name}/{app_name}/{project_name}/column_classifier_config"
    
    cfg: dict[str, Any] | None = None

    # --- Redis lookup BYPASSED - Always fetch fresh from MongoDB -------------------------------------------------------
    # if _redis_client is not None:
    #     try:
    #         cached = _redis_client.get(key)
    #         if cached:
    #             cfg = json.loads(cached)
    #     except Exception as exc:
    #         logger.warning(f"Redis read error for {key}: {exc}")

    # --- Always fetch from Mongo (Redis caching bypassed) ------------------------------------------------------
    cfg = get_classifier_config_from_mongo(client_name, app_name, project_name, file_name)
    if cfg and _redis_client is not None:
        try:
            _redis_client.setex(key, CLASSIFIER_CFG_TTL, json.dumps(cfg, default=str))
        except Exception as exc:
            logger.warning(f"Redis write error for {key}: {exc}")

    # Return identifiers that are assigned to dimensions from the classifier config
    # Exclude identifiers assigned to "unattributed" dimension
    dimension_identifiers: list[str] = []
    if cfg and isinstance(cfg.get("dimensions"), dict):
        # Extract identifiers from all dimensions (dimensions is Dict[str, List[str]])
        # Skip "unattributed" dimension as those columns shouldn't be used for scoping
        for dimension_name, identifiers in cfg["dimensions"].items():
            if isinstance(identifiers, list) and dimension_name.lower() != "unattributed":
                dimension_identifiers.extend(identifiers)
        # Remove duplicates while preserving order
        dimension_identifiers = list(dict.fromkeys(dimension_identifiers))
    elif cfg and isinstance(cfg.get("identifiers"), list):
        # Fallback to all identifiers if dimensions dict is not available
        dimension_identifiers = cfg["identifiers"]

    return {"identifiers": dimension_identifiers}


# Initialize settings
settings = get_settings()

@router.get("/unique_values")
async def get_unique_values(
    object_name: str = Query(..., description="Name of the object to get unique values from"),
    column_name: str = Query(..., description="Name of the column to get unique values for")
):
    submission = celery_task_client.submit_callable(
        name="scope_selector.unique_values",
        dotted_path="app.features.scope_selector.service.fetch_unique_values",
        kwargs={"object_name": object_name, "column_name": column_name},
        metadata={
            "feature": "scope_selector",
            "operation": "unique_values",
            "object_name": object_name,
            "column_name": column_name,
        },
    )
    return format_task_response(submission)


# =============================================================================
# DATE RANGE ENDPOINT
# =============================================================================

@router.get("/unique_values_filtered")
async def get_unique_values_filtered(
    object_name: str = Query(..., description="MinIO object name"),
    target_column: str = Query(..., description="Column to return unique values for"),
    filter_column: str = Query(..., description="Column to apply filter on"),
    filter_value: str = Query(..., description="Value of filter_column to restrict rows")
):
    submission = celery_task_client.submit_callable(
        name="scope_selector.unique_values_filtered",
        dotted_path="app.features.scope_selector.service.fetch_unique_values_filtered",
        kwargs={
            "object_name": object_name,
            "target_column": target_column,
            "filter_column": filter_column,
            "filter_value": filter_value,
        },
        metadata={
            "feature": "scope_selector",
            "operation": "unique_values_filtered",
            "object_name": object_name,
            "target_column": target_column,
            "filter_column": filter_column,
        },
    )
    return format_task_response(submission)

@router.get("/date_range")
async def get_date_range(
    object_name: str = Query(..., description="Name of the MinIO object (file)"),
    column_name: str = Query(..., description="Name of the date column to analyse")
):
    submission = celery_task_client.submit_callable(
        name="scope_selector.date_range",
        dotted_path="app.features.scope_selector.service.compute_date_range",
        kwargs={"object_name": object_name, "column_name": column_name},
        metadata={
            "feature": "scope_selector",
            "operation": "date_range",
            "object_name": object_name,
            "column_name": column_name,
        },
    )
    return format_task_response(submission)

# =============================================================================
# PERCENTILE CHECK PREVIEW ENDPOINT
# =============================================================================

@router.post("/percentile_check")
async def percentile_check(request: ScopeFilterRequest,
                          percentile: int = Query(..., ge=0, le=100, description="Percentile to compute e.g. 90 for 90th"),
                          threshold_pct: float = Query(..., ge=0, le=100, description="Threshold as percent of base value. e.g. 10 means 10%"),
                          base: str = Query("max", regex="^(max|min|mean|dist)$", description="Base measure: max|min|mean|dist (max-min)"),
                          column: str = Query(..., description="Numeric column to evaluate")):
    submission = celery_task_client.submit_callable(
        name="scope_selector.percentile_check",
        dotted_path="app.features.scope_selector.service.evaluate_percentile",
        kwargs={
            "payload": request.model_dump(),
            "percentile": percentile,
            "threshold_pct": threshold_pct,
            "base": base,
            "column": column,
        },
        metadata={
            "feature": "scope_selector",
            "operation": "percentile_check",
            "file_key": request.file_key,
            "column": column,
        },
    )
    return format_task_response(submission)

# =============================================================================
# ROW COUNT PREVIEW ENDPOINT
# =============================================================================

@router.post("/row_count")
async def get_row_count(request: ScopeFilterRequest):
    submission = celery_task_client.submit_callable(
        name="scope_selector.row_count",
        dotted_path="app.features.scope_selector.service.preview_row_count",
        kwargs={"payload": request.model_dump()},
        metadata={
            "feature": "scope_selector",
            "operation": "row_count",
            "file_key": request.file_key,
        },
    )
    return format_task_response(submission)

# =============================================================================
# BASIC HEALTH CHECK ENDPOINTS
# =============================================================================

# @router.get("/health")
# async def basic_health_check():
#     """Basic API health check - no external dependencies"""
#     return {
#         "status": "healthy",
#         "service": "Scope Selector Atom API",
#         "version": "2.0.0",
#         "timestamp": datetime.now().isoformat(),
#         "environment": "development"
#     }

# @router.get("/health/detailed")
# async def detailed_health_check(settings: Settings = Depends(get_settings)):
#     """Comprehensive health check for all services"""
#     results = {
#         "timestamp": datetime.now().isoformat(),
#         "overall_status": "healthy",
#         "services": {},
#         "configuration": {
#             "environment": settings.environment,
#             "debug_mode": settings.debug,
#             "api_version": settings.app_version
#         }
#     }
    
#     # Check MongoDB
#     mongo_result = await check_mongodb_health(settings)
#     results["services"]["mongodb"] = mongo_result
    
#     # Check Redis
#     redis_result = await check_redis_health(settings)
#     results["services"]["redis"] = redis_result
    
#     # Check MinIO
#     minio_result = await check_minio_health(settings)
#     results["services"]["minio"] = minio_result
    
#     # Determine overall status
#     failed_services = [
#         service for service, status in results["services"].items() 
#         if status["status"] != "connected"
#     ]
    
#     if failed_services:
#         results["overall_status"] = "degraded"
#         results["failed_services"] = failed_services
#         results["warning"] = f"Services with issues: {', '.join(failed_services)}"
    
#     return results

# # =============================================================================
# # MONGODB HEALTH CHECKS
# # =============================================================================

# @router.get("/health/mongodb")
# async def check_mongodb_health(settings: Settings = Depends(get_settings)):
#     """Check MongoDB connection and database access"""
#     try:
#         client = MongoClient(
#             settings.mongo_uri,
#             serverSelectionTimeoutMS=5000,
#             connectTimeoutMS=5000
#         )
        
#         # Test connection
#         client.server_info()
        
#         # Check both databases
#         validator_db = client[settings.mongo_source_database]
#         scope_db = client[settings.mongo_scope_database]
        
#         # Get collection info
#         validator_collections = validator_db.list_collection_names()
#         scope_collections = scope_db.list_collection_names()
        
#         # Check specific collections exist
#         required_collections = {
#             settings.mongo_source_database: [settings.mongo_column_classifications_collection],
#             settings.mongo_scope_database: [settings.mongo_scopes_collection, settings.mongo_processing_jobs_collection]
#         }
        
#         missing_collections = []
#         for db_name, collections in required_collections.items():
#             existing = validator_collections if db_name == settings.mongo_source_database else scope_collections
#             for collection in collections:
#                 if collection not in existing:
#                     missing_collections.append(f"{db_name}.{collection}")
        
#         client.close()
        
#         return {
#             "status": "connected",
#             "databases": {
#                 settings.mongo_source_database: {
#                     "collections": validator_collections,
#                     "count": len(validator_collections)
#                 },
#                 settings.mongo_scope_database: {
#                     "collections": scope_collections,
#                     "count": len(scope_collections)
#                 }
#             },
#             "missing_collections": missing_collections,
#             "connection_details": {
#                 "host": "10.2.4.48:9005",
#                 "auth_source": "admin"
#             }
#         }
        
#     except ServerSelectionTimeoutError:
#         return {
#             "status": "timeout",
#             "error": "MongoDB server selection timeout - server may be down",
#             "host": "10.2.4.48:9005"
#         }
#     except ConnectionFailure as e:
#         return {
#             "status": "connection_failed",
#             "error": f"MongoDB connection failed: {str(e)}",
#             "host": "10.2.4.48:9005"
#         }
#     except Exception as e:
#         return {
#             "status": "error",
#             "error": f"MongoDB error: {str(e)}",
#             "host": "10.2.4.48:9005"
#         }

# # =============================================================================
# # REDIS HEALTH CHECKS  
# # =============================================================================

# @router.get("/health/redis")
# async def check_redis_health(settings: Settings = Depends(get_settings)):
#     """Check Redis connection and cache functionality"""
#     try:
#         redis_client = redis.Redis(
#             host=settings.redis_host,
#             port=settings.redis_port,
#             db=settings.redis_db,
#             password=settings.redis_password,
#             decode_responses=settings.redis_decode_responses,
#             socket_connect_timeout=3,
#             socket_timeout=3
#         )
        
#         # Test basic connection
#         redis_client.ping()
        
#         # Get Redis info
#         redis_info = redis_client.info()
        
#         # Test cache operations
#         test_key = "health_check_test"
#         redis_client.set(test_key, "ok", ex=10)  # Expires in 10 seconds
#         test_value = redis_client.get(test_key)
#         redis_client.delete(test_key)
        
#         redis_client.close()
        
#         return {
#             "status": "connected",
#             "connection_details": {
#                 "host": f"{settings.redis_host}:{settings.redis_port}",
#                 "database": settings.redis_db,
#                 "max_connections": settings.redis_max_connections
#             },
#             "server_info": {
#                 "version": redis_info.get("redis_version", "unknown"),
#                 "memory_used": redis_info.get("used_memory_human", "unknown"),
#                 "connected_clients": redis_info.get("connected_clients", 0),
#                 "total_connections": redis_info.get("total_connections_received", 0)
#             },
#             "cache_test": "success" if test_value == "ok" else "failed",
#             "ttl_settings": {
#                 "default_ttl": settings.redis_default_ttl,
#                 "stats_ttl": settings.redis_stats_ttl,
#                 "results_ttl": settings.redis_results_ttl
#             }
#         }
        
#     except redis.ConnectionError as e:
#         return {
#             "status": "connection_failed",
#             "error": f"Redis connection failed: {str(e)}",
#             "host": f"{settings.redis_host}:{settings.redis_port}"
#         }
#     except redis.TimeoutError as e:
#         return {
#             "status": "timeout",
#             "error": f"Redis connection timeout: {str(e)}",
#             "host": f"{settings.redis_host}:{settings.redis_port}"
#         }
#     except Exception as e:
#         return {
#             "status": "error",
#             "error": f"Redis error: {str(e)}",
#             "host": f"{settings.redis_host}:{settings.redis_port}"
#         }

# # =============================================================================
# # MINIO HEALTH CHECKS
# # =============================================================================

# @router.get("/health/minio")
# async def check_minio_health(settings: Settings = Depends(get_settings)):
#     """Check MinIO connection and bucket access"""
#     try:
#         # Initialize MinIO client
#         minio_client = Minio(
#             settings.minio_endpoint,
#             access_key=settings.minio_access_key,
#             secret_key=settings.minio_secret_key,
#             secure=settings.minio_use_ssl
#         )
        
#         # Check if main bucket exists
#         bucket_exists = minio_client.bucket_exists(settings.minio_bucket)
        
#         # Get bucket information
#         bucket_info = {"exists": bucket_exists}
#         if bucket_exists:
#             try:
#                 # Count objects by prefix
#                 raw_data_count = len(list(minio_client.list_objects(
#                     settings.minio_bucket, 
#                     prefix=settings.minio_raw_data_prefix,
#                     recursive=True
#                 )))
                
#                 filtered_data_count = len(list(minio_client.list_objects(
#                     settings.minio_bucket,
#                     prefix=settings.minio_filtered_data_prefix, 
#                     recursive=True
#                 )))
                
#                 processed_data_count = len(list(minio_client.list_objects(
#                     settings.minio_bucket,
#                     prefix=settings.minio_processed_data_prefix,
#                     recursive=True
#                 )))
                
#                 bucket_info.update({
#                     "data_structure": {
#                         "raw_data_objects": raw_data_count,
#                         "filtered_data_objects": filtered_data_count,
#                         "processed_data_objects": processed_data_count,
#                         "total_objects": raw_data_count + filtered_data_count + processed_data_count
#                     }
#                 })
                
#             except Exception as e:
#                 bucket_info["list_error"] = f"Could not list objects: {str(e)}"
        
#         return {
#             "status": "connected",
#             "connection_details": {
#                 "endpoint": settings.minio_endpoint,
#                 "bucket": settings.minio_bucket,
#                 "ssl_enabled": settings.minio_use_ssl,
#                 "secure_url": settings.minio_secure_url
#             },
#             "bucket_info": bucket_info,
#             "data_prefixes": {
#                 "raw_data": settings.minio_raw_data_prefix,
#                 "filtered_data": settings.minio_filtered_data_prefix,
#                 "processed_data": settings.minio_processed_data_prefix
#             }
#         }
        
#     except S3Error as e:
#         return {
#             "status": "s3_error",
#             "error": f"MinIO S3 error: {str(e)}",
#             "endpoint": settings.minio_endpoint,
#             "bucket": settings.minio_bucket
#         }
#     except Exception as e:
#         return {
#             "status": "error",
#             "error": f"MinIO error: {str(e)}",
#             "endpoint": settings.minio_endpoint
#         }

# # =============================================================================
# # SYSTEM INFORMATION ENDPOINTS
# # =============================================================================

# @router.get("/health/system-info")
# async def get_system_info(settings: Settings = Depends(get_settings)):
#     """Get comprehensive system configuration information"""
#     return {
#         "application": {
#             "name": settings.app_name,
#             "version": settings.app_version,
#             "environment": settings.environment,
#             "debug_mode": settings.debug
#         },
#         "api_configuration": {
#             "host": settings.api_host,
#             "port": settings.api_port,
#             "reload_enabled": settings.api_reload
#         },
#         "infrastructure": {
#             "mongodb": {
#                 "host": "10.2.4.48:9005",
#                 "source_database": settings.mongo_source_database,
#                 "scope_database": settings.mongo_scope_database
#             },
#             "redis": {
#                 "host": f"{settings.redis_host}:{settings.redis_port}",
#                 "database": settings.redis_db,
#                 "url": settings.redis_url
#             },
#             "minio": {
#                 "endpoint": settings.minio_endpoint,
#                 "bucket": settings.minio_bucket,
#                 "secure_url": settings.minio_secure_url
#             }
#         },
#         "data_pipeline": {
#             "workflow_stages": ["raw-data", "filtered-data", "processed-data"],
#             "cache_strategy": "Redis → MinIO → MongoDB fallback"
#         }
#     }


# ###########################################################################################

# @router.get(
#     "/validator-atoms/{validator_atom_id}/classifications",
#     response_model=ValidatorAtomResponse,
#     tags=["Column Classifications"]
# )
# async def get_column_classifications(
#     validator_atom_id: str = Path(..., description="Validator atom identifier"),
#     include_metadata: bool = Query(True, description="Include classification metadata"),
#     settings: Settings = Depends(get_settings)
# ):
#     """
#     Get classified columns for a specific validator atom ID.
#     Classification summary now only shows identifiers.
#     """
#     try:
#         # Initialize repository
#         repo = ValidatorAtomRepository(settings)
        
#         # Get classifications from MongoDB
#         classification_data = await repo.get_column_classifications(validator_atom_id)
        
#         if not classification_data:
#             raise HTTPException(
#                 status_code=404,
#                 detail=f"No column classifications found for validator_atom_id: '{validator_atom_id}'"
#             )
        
#         # Extract classification details
#         final_classification = classification_data.get("final_classification", {})
        
#         # Get ONLY identifiers for the summary
#         identifiers = final_classification.get("identifiers", [])
        
#         # Get all columns for detailed classifications (if needed elsewhere)
#         all_columns = final_classification.get("all_columns", {})
#         detailed_classifications = []
        
#         for column_name, column_info in all_columns.items():
#             detailed_classifications.append(
#                 ColumnClassification(
#                     column_name=column_name,
#                     data_type=column_info.get("data_type", "unknown"),
#                     classification_type=column_info.get("classification", "other"),
#                     confidence_score=column_info.get("confidence_score"),
#                     sample_values=column_info.get("sample_values", [])[:5]
#                 )
#             )
        
#         # Create SIMPLIFIED classification summary - ONLY identifiers
#         classification_summary = ClassificationSummary(
#             total_columns=len(all_columns),
#             identifiers=identifiers  # ONLY this field now
#         )
        
#         # Prepare metadata if requested
#         metadata = None
#         if include_metadata:
#             metadata = {
#                 "file_key": classification_data.get("file_key"),
#                 "created_at": classification_data.get("created_at"),
#                 "updated_at": classification_data.get("updated_at"),
#                 "classification_metadata": classification_data.get("classification_metadata", {})
#             }
        
#         # Return response with simplified summary
#         return ValidatorAtomResponse(
#             validator_atom_id=validator_atom_id,
#             classification_status=classification_data.get("status", "unknown"),
#             file_key=classification_data.get("file_key"),
#             total_columns=len(all_columns),
#             classification_summary=classification_summary,  # Now only contains identifiers
#             detailed_classifications=detailed_classifications,
#             metadata=metadata,
#             retrieved_at=datetime.now()
#         )
        
#     except HTTPException:
#         raise
#     except Exception as e:
#         logger.error(f"Error retrieving column classifications: {str(e)}")
#         raise HTTPException(
#             status_code=500,
#             detail=f"Internal server error: {str(e)}"
#         )


# @router.post("/scopes/{validator_id}", response_model=ScopeResponse)
# async def create_scope(
#     validator_id: str,
#     request: ScopeRequest,
#     settings: Settings = Depends(get_settings)
# ):
#     """
#     Create a scope by selecting identifiers and time column.
#     Updated to match actual MongoDB document structure.
    
#     Saves to: Database 'Scope_selection' -> Collection 'Scopes'
    
#     Example: POST /scopes/heinz_validated
#     """
#     client = None
#     try:
#         # Connect to MongoDB using updated config
#         client = MongoClient(settings.mongo_uri, serverSelectionTimeoutMS=5000)
        
#         # Get validator atom data from source database
#         source_db = client[settings.mongo_source_database]  # validator_atoms_db
#         classifications = source_db[settings.mongo_column_classifications_collection]  # column_classifications
        
#         validator_data = classifications.find_one(
#             {"validator_atom_id": validator_id},
#             {"_id": 0, "auto_classification": 1, "file_key": 1}  # Changed from final_classification
#         )
        
#         if not validator_data:
#             raise HTTPException(
#                 status_code=404, 
#                 detail=f"Validator '{validator_id}' not found"
#             )
        
#         # Get available identifiers from auto_classification (matches your MongoDB structure)
#         auto_classification = validator_data.get("auto_classification", {})
#         available_identifiers = auto_classification.get("identifiers", [])
        
#         # Debug logging to see what we actually get
#         logger.info(f"Available identifiers: {available_identifiers}")
        
#         # Validate selected identifiers
#         invalid_ids = [id_name for id_name in request.identifiers if id_name not in available_identifiers]
#         if invalid_ids:
#             raise HTTPException(
#                 status_code=400, 
#                 detail=f"Invalid identifiers: {invalid_ids}. Available: {available_identifiers}"
#             )
        
#         # For time column validation - check against the same identifiers list
#         # Since your MongoDB structure shows columns like "date", "year", "month" in identifiers
#         if request.time_column and request.time_column not in available_identifiers:
#             raise HTTPException(
#                 status_code=400,
#                 detail=f"Invalid time column: '{request.time_column}'. Available columns: {available_identifiers}"
#             )
        
#         # Generate unique scope ID
#         timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
#         scope_id = f"{validator_id}_{timestamp}"
        
#         # Create scope document
#         scope_doc = {
#             "scope_id": scope_id,
#             "name": request.name,
#             "description": request.description,
#             "validator_id": validator_id,
#             "file_key": validator_data.get("file_key"),
#             "identifiers": request.identifiers,
#             "time_column": request.time_column,
#             "status": "created",
# 
#             "environment": settings.environment,
# 
#         }
        
#         # Save to scopes database using updated config
#         scope_db = client[settings.mongo_scope_database]  # Scope_selection
#         scopes_collection = scope_db[settings.mongo_scopes_collection]  # Scopes
        
#         result = scopes_collection.insert_one(scope_doc)
        
#         logger.info(f"Scope created successfully: {scope_id} with MongoDB ID: {result.inserted_id}")
        
#         return ScopeResponse(
#             success=True,
#             scope_id=scope_id,
#             name=request.name,
#             identifiers=request.identifiers,
#             time_column=request.time_column,
#             created_at=scope_doc["created_at"]
#         )
        
#     except HTTPException:
#         raise
#     except Exception as e:
#         logger.error(f"Error creating scope: {str(e)}")
#         raise HTTPException(
#             status_code=500, 
#             detail=f"Failed to create scope: {str(e)}"
#         )
#     finally:
#         if client:
#             client.close()
            
def validate_identifier_filters_lowercase(
    identifier_filters: Dict[str, List[str]], 
    df_columns: List[str]
) -> Tuple[Dict[str, List[str]], List[str]]:
    """
    Simple lowercase validation for identifier filters.
    """
    # Convert all DataFrame columns to lowercase for comparison
    lowercase_df_columns = [col.lower() for col in df_columns]
    
    validated_filters = {}
    missing_columns = []
    
    for requested_col, values in identifier_filters.items():
        requested_col_lower = requested_col.lower()
        
        if requested_col_lower in lowercase_df_columns:
            # Find the original column name to use for filtering
            original_col_index = lowercase_df_columns.index(requested_col_lower)
            original_col_name = df_columns[original_col_index]
            validated_filters[original_col_name] = values
        else:
            missing_columns.append(requested_col)
    
    return validated_filters, missing_columns



@router.post("/scopes/{scope_id}/create-multi-filtered-scope", response_model=MultiFilterScopeResponse)
async def create_multi_filtered_scope(
    scope_id: str,
    request: MultiFilterScopeRequest,
    settings: Settings = Depends(get_settings)
):
    """
    Create multiple filtered scopes with different identifier and optional time combinations.
    Time filtering is now optional - works with or without date ranges.
    
    Example: POST /scopes/heinz_validated_20241218_123045/create-multi-filtered-scope
    """
    client = None
    minio_client = None
    
    try:
        # Connect to MinIO (MongoDB access temporarily disabled)
        # NOTE: MongoDB operations are commented out due to authentication problems.
        # client = MongoClient(settings.mongo_uri, serverSelectionTimeoutMS=5000)
        # scope_db = client[settings.mongo_scope_database]
        # scopes_collection = scope_db[settings.mongo_scopes_collection]
        client = MongoClient(settings.mongo_uri, serverSelectionTimeoutMS=5000)
        scope_db = client[settings.mongo_scope_database]
        scopes_collection = scope_db[settings.mongo_scopes_collection]
        
        # base_scope lookup disabled – use a minimal placeholder
        # time_column is now optional and will be detected dynamically if needed
        base_scope = {
            "validator_id": "scopedata",
            "time_column": None  # Will be detected dynamically from DataFrame if date filtering is used
        }  # scopes_collection.find_one({"scope_id": scope_id})
        if not base_scope:
            raise HTTPException(status_code=404, detail=f"Base scope '{scope_id}' not found")
        
        minio_client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_use_ssl
        )
        
        # Download and read the original file
        file_key = request.file_key
        
        try:
            response = minio_client.get_object(settings.minio_bucket, file_key)
            file_data = response.read()
            response.close()
        except Exception as e:
            raise HTTPException(status_code=404, detail=f"File not found: {file_key}. Error: {str(e)}")
        
        # Read file into DataFrame
        try:
            if file_key.endswith('.csv'):
                df = pd.read_csv(BytesIO(file_data))
            elif file_key.endswith('.parquet'):
                df = pd.read_parquet(BytesIO(file_data))
            elif file_key.endswith('.arrow'):
                import pyarrow as pa
                import pyarrow.ipc as ipc
                reader = ipc.RecordBatchFileReader(pa.BufferReader(file_data))
                df = reader.read_all().to_pandas()
            elif file_key.endswith('.json'):
                df = pd.read_json(BytesIO(file_data))
            else:
                raise HTTPException(status_code=400, detail=f"Unsupported file format: {file_key}")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error reading file: {str(e)}")
        
        original_records_count = len(df)
        logger.info(f"Original dataset has {original_records_count} records")
        
        # Extract filter sets from flat structure
        filter_sets = []
        for i in range(1, 6):  # Support up to 5 filter sets
            identifier_filters = getattr(request, f'identifier_filters_{i}', None)
            start_date = getattr(request, f'start_date_{i}', None)
            end_date = getattr(request, f'end_date_{i}', None)
            
            # Check if we have identifier filters (required)
            if identifier_filters:
                # Validate dates if provided - both must be present or both absent
                if (start_date and not end_date) or (end_date and not start_date):
                    raise HTTPException(
                        status_code=400,
                        detail=f"Filter set {i}: Both start_date and end_date must be provided together or both omitted"
                    )
                
                auto_set_name = f"Scope_{i}"
                
                filter_sets.append({
                    'set_name': auto_set_name,
                    'identifier_filters': identifier_filters,
                    'start_date': start_date,
                    'end_date': end_date,
                    'has_time_filter': bool(start_date and end_date)
                })
        
        if not filter_sets:
            raise HTTPException(status_code=400, detail="At least one filter set with identifier filters is required")
        
        # Check if any filter set requires time filtering
        any_time_filter = any(fs['has_time_filter'] for fs in filter_sets)
        
        # Handle time column setup if needed
        actual_time_column = None
        
        if any_time_filter:
            # Dynamically detect date column from DataFrame instead of using hardcoded "date"
            time_column = None
            
            # Priority 1: Try to get from base_scope if available
            if base_scope and base_scope.get("time_column"):
                time_column = base_scope.get("time_column")
            
            # Priority 2: Detect date column from DataFrame
            if not time_column:
                # Look for exact "date" match (case-insensitive)
                df_columns_lower = [col.lower() for col in df.columns]
                if 'date' in df_columns_lower:
                    time_column = df.columns[df_columns_lower.index('date')]
                else:
                    # Look for datetime columns
                    datetime_cols = [col for col in df.columns if pd.api.types.is_datetime64_any_dtype(df[col])]
                    if datetime_cols:
                        time_column = datetime_cols[0]
                    else:
                        # Look for columns with "date" in the name
                        date_like_cols = [col for col in df.columns if "date" in str(col).lower()]
                        if date_like_cols:
                            time_column = date_like_cols[0]
            
            if not time_column:
                raise HTTPException(
                    status_code=400, 
                    detail="No date column found in data. Date filtering requires a date/datetime column."
                )
            
            # Case-insensitive time column validation
            time_column_lower = time_column.lower()
            df_columns_lower = [col.lower() for col in df.columns]
            
            if time_column_lower not in df_columns_lower:
                raise HTTPException(status_code=400, detail=f"Time column '{time_column}' not found in data")
            
            # Find actual time column name
            original_time_col_index = df_columns_lower.index(time_column_lower)
            actual_time_column = df.columns[original_time_col_index]
            
            # Convert to datetime if needed
            if not pd.api.types.is_datetime64_any_dtype(df[actual_time_column]):
                df[actual_time_column] = pd.to_datetime(df[actual_time_column], errors='coerce')
        
        # Generate scope ID and prepare results
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        new_scope_id = f"{base_scope['validator_id']}_{timestamp}"
        filter_set_results = []
        overall_filtered_records = 0
        
        # Process each filter set
        for filter_set in filter_sets:
            set_name = filter_set['set_name']
            identifier_filters = filter_set['identifier_filters']
            has_time_filter = filter_set['has_time_filter']
            
            logger.info(f"Processing filter set: {set_name} (time filter: {has_time_filter})")
            
            # Validate and map identifier columns for this set
            mapped_identifier_filters, missing_columns = validate_identifier_filters_lowercase(
                identifier_filters, list(df.columns)
            )
            
            if missing_columns:
                available_lowercase = [col.lower() for col in df.columns]
                raise HTTPException(
                    status_code=400,
                    detail=f"Columns not found in set '{set_name}': {missing_columns}. Available: {available_lowercase}"
                )
            
            # Start with full dataframe
            working_df = df.copy()
            
            # Apply time filtering if dates are provided
            if has_time_filter:
                start_date = filter_set['start_date']
                end_date = filter_set['end_date']
                start_dt = pd.to_datetime(start_date)
                end_dt = pd.to_datetime(end_date)
                
                working_df = working_df[
                    (working_df[actual_time_column] >= start_dt) & 
                    (working_df[actual_time_column] <= end_dt)
                ]
                
                if len(working_df) == 0:
                    logger.warning(f"No records found for time range in set '{set_name}'")
                    continue
            
            # Generate combinations for this filter set
            identifier_names = list(mapped_identifier_filters.keys())
            identifier_value_lists = list(mapped_identifier_filters.values())
            combinations = list(product(*identifier_value_lists))
            
            # Create combination files for this filter set
            set_combination_files = []
            set_filtered_records = 0


            for combination in combinations:
                combination_filter = dict(zip(identifier_names, combination))
                
                # Filter for this specific combination
                combination_df = working_df.copy()
                for col_name, value in combination_filter.items():
                    combination_df = combination_df[combination_df[col_name] == value]
                
                if len(combination_df) == 0:
                    continue
                
                logger.info(f"Processing combination: {combination_filter} with {len(combination_df)} records")
                
                # Check criteria before saving
                criteria_result = check_combination_criteria(combination_df, request.criteria, df)
                logger.info(f"Criteria check result for {combination_filter}: {criteria_result}")
                
                if not criteria_result:
                    logger.info(f"Skipping combination {combination_filter} - does not meet criteria")
                    continue
                
                logger.info(f"Saving combination {combination_filter} - meets all criteria")
                
                # Generate filename for this combination
                combination_name_parts = []
                for col_name, value in combination_filter.items():
                    clean_value = str(value).replace(" ", "_").replace("/", "_").replace("\\", "_")
                    combination_name_parts.append(clean_value)

                combination_filename = f"{set_name}_{'_'.join(combination_name_parts)}"

                # Get the standard prefix using get_object_prefix with client/app/project names
                # Extract client, app, project from file_key for proper prefix resolution
                file_key_parts = request.file_key.split('/')
                if len(file_key_parts) >= 3:
                    client_name = file_key_parts[0]
                    app_name = file_key_parts[1]
                    project_name = file_key_parts[2]
                    prefix = await get_object_prefix(
                        client_name=client_name,
                        app_name=app_name,
                        project_name=project_name
                    )
                else:
                    # Fallback to default prefix if file_key structure is unexpected
                    prefix = await get_object_prefix()
                
                # Construct the full path with the standard structure
                combination_file_key = f"{prefix}filtered-data/{new_scope_id}/{combination_filename}_{timestamp}.arrow"

                # Save combination file to MinIO as Arrow
                try:
                    import pyarrow as pa
                    import pyarrow.feather as feather

                    arrow_buffer = BytesIO()
                    table = pa.Table.from_pandas(combination_df)
                    feather.write_feather(table, arrow_buffer)
                    arrow_buffer.seek(0)

                    minio_client.put_object(
                        settings.minio_bucket,
                        combination_file_key,
                        arrow_buffer,
                        length=arrow_buffer.getbuffer().nbytes,
                        content_type='application/vnd.apache.arrow.file'
                    )
                    
                    # Track this file
                    set_combination_files.append(CombinationFileInfo(
                        combination=combination_filter,
                        file_key=combination_file_key,
                        filename=f"{combination_filename}_{timestamp}.arrow",
                        record_count=len(combination_df),
                        low_data_warning=len(combination_df) < 12 
                    ))
                    
                    set_filtered_records += len(combination_df)
                    
                except Exception as e:
                    logger.error(f"Error saving combination file: {str(e)}")
                    continue
            
            # Add this filter set's results
            if set_combination_files:
                filter_set_results.append(FilterSetResult(
                    set_name=set_name,
                    identifier_filters=mapped_identifier_filters,
                    start_date=filter_set.get('start_date'),
                    end_date=filter_set.get('end_date'),
                    combination_files=set_combination_files,
                    filtered_records_count=set_filtered_records
                ))
                overall_filtered_records += set_filtered_records
        
        if not filter_set_results:
            raise HTTPException(status_code=400, detail="No valid filter sets produced results")
        
        # Generate scope name
        set_names = [result.set_name for result in filter_set_results]
        auto_generated_name = f"MultiFilter_{'_'.join(set_names[:3])}{'_etc' if len(set_names) > 3 else ''}_{timestamp}"
        
        # Create scope document
        created_at = datetime.now().isoformat()

        logger.info(f"Multi-filter scope generated (not persisted): {new_scope_id}")

        # Save the scope configuration to MongoDB
        try:
            # Extract client, app, project from file_key
            # file_key format: "default_client/default_app/default_project/20250814_135348_D0.arrow"
            file_key_parts = request.file_key.split('/')
            if len(file_key_parts) >= 3:
                client_name = file_key_parts[0]
                app_name = file_key_parts[1]
                project_name = file_key_parts[2]
                
                # Prepare scope configuration data
                scope_config_data = {
                    "scope_id": new_scope_id,
                    "scope_name": auto_generated_name,
                    "file_key": request.file_key,
                    "identifiers": list(set([col for result in filter_set_results for col in result.identifier_filters.keys()])),
                    "filter_set_results": [result.dict() for result in filter_set_results],
                    "total_filter_sets": len(filter_set_results),
                    "overall_filtered_records": overall_filtered_records,
                    "original_records_count": original_records_count,
                    "created_at": created_at,
                    "description": request.description,
                    "criteria": request.criteria.dict() if request.criteria else None
                }
                
                # Save to MongoDB
                mongo_result = await save_scope_config(
                    client_name=client_name,
                    app_name=app_name,
                    project_name=project_name,
                    scope_data=scope_config_data,
                    user_id="",  # You can add user_id if available
                    project_id=None  # You can add project_id if available
                )
                

                
                if mongo_result["status"] == "success":
                    logger.info(f"📦 Scope configuration saved to MongoDB: {mongo_result['mongo_id']}")
                else:
                    logger.error(f"❌ Failed to save scope configuration to MongoDB: {mongo_result['error']}")
            else:
                logger.warning(f"⚠️ Could not extract client/app/project from file_key: {request.file_key}")
                
        except Exception as e:
            logger.error(f"❌ Error saving scope configuration to MongoDB: {str(e)}")
            # Don't fail the entire request if MongoDB save fails

        return MultiFilterScopeResponse(
            success=True,
            scope_id=new_scope_id,
            scope_name=auto_generated_name,
            filter_set_results=filter_set_results,
            total_filter_sets=len(filter_set_results),
            overall_filtered_records=overall_filtered_records,
            original_records_count=original_records_count,
            created_at=created_at
        )

        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating multi-filter scope: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create multi-filter scope: {str(e)}")
    finally:
        if client:
            client.close()

def check_combination_criteria(
    combination_df: pd.DataFrame,
    criteria: Optional[CriteriaSettings],
    original_df: pd.DataFrame
) -> bool:
    """
    Check if a combination meets all the specified criteria.
    Returns True if the combination should be saved, False otherwise.
    """
    logger.info(f"Checking criteria for combination with {len(combination_df)} records")
    logger.info(f"Criteria object: {criteria}")
    
    if not criteria:
        logger.info("No criteria specified, saving all combinations")
        return True  # No criteria specified, save all combinations
    
    # Check minimum datapoints criteria
    if criteria.min_datapoints_enabled:
        logger.info(f"Checking min datapoints: {len(combination_df)} >= {criteria.min_datapoints}")
        if len(combination_df) < criteria.min_datapoints:
            logger.info(f"Combination rejected: {len(combination_df)} datapoints < {criteria.min_datapoints} minimum")
            return False
        else:
            logger.info(f"Min datapoints criteria passed: {len(combination_df)} >= {criteria.min_datapoints}")
    
    # Check percentile criteria
    if criteria.pct90_enabled and criteria.pct_column:
        logger.info(f"Checking percentile criteria: {criteria.pct_percentile}th percentile of {criteria.pct_column} > {criteria.pct_threshold}% of {criteria.pct_base}")
        try:
            # Get the column for percentile calculation
            if criteria.pct_column not in combination_df.columns:
                logger.warning(f"Percentile column '{criteria.pct_column}' not found in combination data")
                return True  # Skip this criteria if column not found
            
            # Calculate the percentile value
            percentile_value = combination_df[criteria.pct_column].quantile(criteria.pct_percentile / 100)
            logger.info(f"Percentile value: {percentile_value}")
            
            # Calculate the base value based on the specified base
            if criteria.pct_base == "max":
                base_value = original_df[criteria.pct_column].max()
            elif criteria.pct_base == "min":
                base_value = original_df[criteria.pct_column].min()
            elif criteria.pct_base == "mean":
                base_value = original_df[criteria.pct_column].mean()
            elif criteria.pct_base == "dist":
                # Use the distribution (total sum) of the column
                base_value = original_df[criteria.pct_column].sum()
            else:
                logger.warning(f"Unknown pct_base: {criteria.pct_base}, using max")
                base_value = original_df[criteria.pct_column].max()
            
            logger.info(f"Base value ({criteria.pct_base}): {base_value}")
            
            # Calculate the percentage
            if base_value != 0:
                percentage = (percentile_value / base_value) * 100
                logger.info(f"Calculated percentage: {percentage:.2f}%")
                if percentage <= criteria.pct_threshold:
                    logger.info(f"Combination rejected: {percentage:.2f}% <= {criteria.pct_threshold}% threshold")
                    return False
                else:
                    logger.info(f"Percentile criteria passed: {percentage:.2f}% > {criteria.pct_threshold}%")
            else:
                logger.warning(f"Base value is 0 for column {criteria.pct_column}, skipping percentile check")
                
        except Exception as e:
            logger.error(f"Error checking percentile criteria: {str(e)}")
            return True  # Skip this criteria if there's an error
    
    logger.info("All criteria passed, combination will be saved")
    return True

# ============================================================================
# SAVE ENDPOINTS
# ============================================================================

@router.post("/save-scope-config")
async def save_scope_configuration(
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name"),
    scope_data: dict = Body(..., description="Scope configuration data to save"),
    user_id: str = Query("", description="User ID"),
    project_id: int = Query(None, description="Project ID")
):
    """Save scope configuration to MongoDB"""
    try:
        result = await save_scope_config(
            client_name=client_name,
            app_name=app_name,
            project_name=project_name,
            scope_data=scope_data,
            user_id=user_id,
            project_id=project_id
        )
        
        if result["status"] == "success":
            return {
                "success": True,
                "message": f"Scope configuration saved successfully",
                "mongo_id": result["mongo_id"],
                "operation": result["operation"],
                "collection": result["collection"]
            }
        else:
            raise HTTPException(status_code=500, detail=f"Failed to save scope configuration: {result['error']}")
            
    except Exception as e:
        logger.error(f"Error saving scope configuration: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to save scope configuration: {str(e)}")

@router.get("/get-scope-config")
async def get_scope_configuration(
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name")
):
    """Retrieve saved scope configuration from MongoDB"""
    try:
        result = await get_scope_config_from_mongo(client_name, app_name, project_name)
        
        if result:
            return {
                "success": True,
                "data": result
            }
        else:
            return {
                "success": False,
                "message": "No scope configuration found",
                "data": None
            }
            
    except Exception as e:
        logger.error(f"Error retrieving scope configuration: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve scope configuration: {str(e)}")



@router.post("/save")
async def save_scope_data(
    request: Request,
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name"),
    user_id: str = Query("", description="User ID"),
    project_id: int = Query(None, description="Project ID")
):
    """General save endpoint for scope data - used by SAVE button"""
    
    try:
        # Get the request body
        body = await request.json()
        
        # Save scope configuration data
        result = await save_scope_config(
            client_name=client_name,
            app_name=app_name,
            project_name=project_name,
            scope_data=body,
            user_id=user_id,
            project_id=project_id
        )
        
        if result["status"] == "success":
            return {
                "success": True,
                "message": f"Scope data saved successfully",
                "mongo_id": result["mongo_id"],
                "operation": result["operation"],
                "collection": result["collection"]
            }
        else:
            raise HTTPException(status_code=500, detail=f"Failed to save scope data: {result['error']}")
            
    except Exception as e:
        logger.error(f"Error saving scope data: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to save scope data: {str(e)}")

@router.get("/test-mongo")
async def test_mongo_connection():
    """Test MongoDB connection and list databases"""
    try:
        from .mongodb_saver import client
        
        # List all databases
        databases = await client.list_database_names()
        
        # Check if trinity_db exists
        if "trinity_db" in databases:
            # List collections in trinity_db
            collections = await client["trinity_db"].list_collection_names()
        else:
            logger.warning("trinity_db database does not exist")
        
        return {
            "success": True,
            "databases": databases,
            "trinity_db_exists": "trinity_db" in databases,
            "collections_in_trinity_db": collections if "trinity_db" in databases else []
        }
        
    except Exception as e:
        logger.error(f"Error testing MongoDB connection: {str(e)}")
        return {
            "success": False,
            "error": str(e)
        }
