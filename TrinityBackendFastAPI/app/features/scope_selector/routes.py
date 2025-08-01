# routes.py
from fastapi import APIRouter, HTTPException, Depends, Query, Path, Request
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
    ScopeFilterRequest
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

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create router instance
router = APIRouter()

# Initialize settings
settings = get_settings()

@router.get("/unique_values")
async def get_unique_values(
    object_name: str = Query(..., description="Name of the object to get unique values from"),
    column_name: str = Query(..., description="Name of the column to get unique values for")
):
    """
    Get unique values for a specific column in a data source.
    The object_name should be the full path within the MinIO bucket.
    """
    try:
        # Get MinIO client from deps
        minio_client = get_minio_client()
        
        # Log the bucket and object being accessed
        logger.info(f"Accessing MinIO - Bucket: {settings.minio_bucket}, Object: {object_name}")
        
        # Get the object from MinIO
        try:
            # Get the file from MinIO
            response = minio_client.get_object(settings.minio_bucket, object_name)
            file_bytes = response.read()
            
            # Convert to pandas DataFrame based on file extension
            if object_name.lower().endswith('.parquet'):
                df = pd.read_parquet(io.BytesIO(file_bytes))
            elif object_name.lower().endswith(('.arrow', '.feather')):
                df = pd.read_feather(io.BytesIO(file_bytes))
            else:
                # Try to read as parquet first, then fall back to arrow if that fails
                try:
                    df = pd.read_parquet(io.BytesIO(file_bytes))
                except Exception as e:
                    logger.warning(f"Failed to read as Parquet, trying Arrow format: {str(e)}")
                    df = pd.read_feather(io.BytesIO(file_bytes))
            
            # Log the columns in the DataFrame
            logger.info(f"Columns in DataFrame: {df.columns.tolist()}")
            
            # Create a case-insensitive column name mapping
            column_mapping = {col.lower(): col for col in df.columns}
            
            # Get the actual column name with proper case
            actual_column = column_mapping.get(column_name.lower())
            
            if actual_column:
                unique_values = df[actual_column].dropna().astype(str).unique().tolist()
                logger.info(f"Found {len(unique_values)} unique values for column '{actual_column}'")
                return {"unique_values": sorted(unique_values) if unique_values else []}
            else:
                error_msg = f"Column '{column_name}' not found in the data source. Available columns: {', '.join(df.columns)}"
                logger.error(error_msg)
                raise HTTPException(status_code=404, detail=error_msg)
                
        except S3Error as e:
            error_msg = f"Error accessing MinIO object {object_name} in bucket {settings.minio_bucket}: {str(e)}"
            logger.error(error_msg)
            
            # List available buckets for debugging
            try:
                buckets = minio_client.list_buckets()
                bucket_names = [bucket.name for bucket in buckets]
                logger.info(f"Available buckets: {bucket_names}")
                
                # If bucket exists, list objects for debugging
                if settings.minio_bucket in bucket_names:
                    objects = minio_client.list_objects(settings.minio_bucket, recursive=True)
                    object_list = [obj.object_name for obj in objects]
                    logger.info(f"Objects in bucket {settings.minio_bucket}: {object_list}")
            except Exception as list_error:
                logger.error(f"Error listing buckets/objects: {str(list_error)}")
            
            raise HTTPException(status_code=404, detail=error_msg)
            
    except HTTPException:
        raise  # Re-raise HTTP exceptions
        
    except Exception as e:
        error_msg = f"Error getting unique values: {str(e)}"
        logger.error(error_msg, exc_info=True)
        raise HTTPException(status_code=500, detail=error_msg)


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
    """Return unique values for `target_column` only for rows where `filter_column` == `filter_value`."""
    try:
        minio_client = get_minio_client()
        response = minio_client.get_object(settings.minio_bucket, object_name)
        bytes_data = response.read()
        if object_name.lower().endswith('.parquet'):
            df = pd.read_parquet(BytesIO(bytes_data))
        elif object_name.lower().endswith(('.arrow', '.feather')):
            import pyarrow as pa, pyarrow.ipc as ipc
            df = ipc.RecordBatchFileReader(pa.BufferReader(bytes_data)).read_all().to_pandas()
        else:
            df = pd.read_csv(BytesIO(bytes_data))

        col_map = create_column_mapping(df.columns.tolist())
        t_col = col_map.get(target_column.lower())
        f_col = col_map.get(filter_column.lower())
        if not t_col or not f_col:
            raise HTTPException(status_code=404, detail="Column not found")

        filtered_df = df[df[f_col].astype(str) == filter_value]
        uniques = filtered_df[t_col].dropna().astype(str).unique().tolist()
        return {"unique_values": sorted(uniques)}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in unique_values_filtered: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/date_range")
async def get_date_range(
    object_name: str = Query(..., description="Name of the MinIO object (file)"),
    column_name: str = Query(..., description="Name of the date column to analyse")
):
    """Return the minimum and maximum dates contained in the specified column of a dataset.

    Example:
        /date_range?object_name=raw-data/my_file.parquet&column_name=date
    """
    try:
        minio_client = get_minio_client()
        logger.info(f"Fetching object '{object_name}' from bucket '{settings.minio_bucket}' for date range computation")

        response = minio_client.get_object(settings.minio_bucket, object_name)
        file_bytes = response.read()
        df = None

        object_name_lower = object_name.lower()
        try:
            if object_name_lower.endswith('.parquet'):
                df = pd.read_parquet(BytesIO(file_bytes))
            elif object_name_lower.endswith(('.arrow', '.feather')):
                import pyarrow as pa  # local import to avoid mandatory dependency
                import pyarrow.ipc as ipc
                reader = ipc.RecordBatchFileReader(pa.BufferReader(file_bytes))
                df = reader.read_all().to_pandas()
            elif object_name_lower.endswith('.csv'):
                df = pd.read_csv(BytesIO(file_bytes))
            elif object_name_lower.endswith('.json'):
                df = pd.read_json(BytesIO(file_bytes))
            else:
                # Fallback to parquet first, then feather
                try:
                    df = pd.read_parquet(BytesIO(file_bytes))
                except Exception:
                    df = pd.read_feather(BytesIO(file_bytes))
        except Exception as e:
            logger.error(f"Failed to load file '{object_name}': {e}")
            raise HTTPException(status_code=500, detail=f"Unable to read data file: {e}")

        if df is None:
            raise HTTPException(status_code=500, detail="Unable to load dataset – unsupported format or read error")

        # Case-insensitive column matching
        column_mapping = create_column_mapping(df.columns.tolist())
        actual_col = column_mapping.get(column_name.lower())
        if not actual_col:
            raise HTTPException(status_code=404, detail=f"Column '{column_name}' not found in dataset")

        # Attempt to parse dates
        try:
            date_series = pd.to_datetime(df[actual_col], errors='coerce').dropna()
        except Exception as e:
            logger.error(f"Failed to convert column '{actual_col}' to datetime: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to parse dates in column '{actual_col}': {e}")

        if date_series.empty:
            raise HTTPException(status_code=404, detail=f"No valid dates found in column '{actual_col}'")

        min_date = date_series.min().date().isoformat()
        max_date = date_series.max().date().isoformat()

        logger.info(f"Date range for '{actual_col}' – min: {min_date}, max: {max_date}")
        return {"min_date": min_date, "max_date": max_date}

    except S3Error as e:
        logger.error(f"MinIO error retrieving '{object_name}': {e}")
        raise HTTPException(status_code=500, detail=f"Error accessing MinIO object: {e}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error computing date range: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error obtaining date range: {e}")

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
#                 "host": "10.2.1.65:9005",
#                 "auth_source": "admin"
#             }
#         }
        
#     except ServerSelectionTimeoutError:
#         return {
#             "status": "timeout",
#             "error": "MongoDB server selection timeout - server may be down",
#             "host": "10.2.1.65:9005"
#         }
#     except ConnectionFailure as e:
#         return {
#             "status": "connection_failed",
#             "error": f"MongoDB connection failed: {str(e)}",
#             "host": "10.2.1.65:9005"
#         }
#     except Exception as e:
#         return {
#             "status": "error",
#             "error": f"MongoDB error: {str(e)}",
#             "host": "10.2.1.65:9005"
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
#                 "host": "10.2.1.65:9005",
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
            
def create_column_mapping(df_columns: List[str]) -> Dict[str, str]:
    """
    Create a case-insensitive mapping from lowercase column names to actual column names.
    
    Args:
        df_columns: List of actual column names from DataFrame
        
    Returns:
        Dictionary mapping lowercase names to actual column names
    """
    column_mapping = {}
    for col in df_columns:
        column_mapping[col.lower()] = col
    return column_mapping

def create_column_mapping(df_columns: List[str]) -> Dict[str, str]:
    """
    Create a case-insensitive mapping from lowercase column names to actual column names.
    """
    column_mapping = {}
    for col in df_columns:
        column_mapping[col.lower()] = col
    return column_mapping

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
        base_scope = {
            "validator_id": "placeholder_validator",
            "time_column": "date"
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
        time_column = base_scope.get("time_column")
        actual_time_column = None
        
        if any_time_filter:
            if not time_column:
                raise HTTPException(
                    status_code=400, 
                    detail="Base scope must have time_column defined for date-based filtering"
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
        new_scope_id = f"{base_scope['validator_id']}_multifilter_{timestamp}"
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
                
                # Generate filename for this combination
                combination_name_parts = []
                for col_name, value in combination_filter.items():
                    clean_value = str(value).replace(" ", "_").replace("/", "_").replace("\\", "_")
                    combination_name_parts.append(f"{col_name}_{clean_value}")

                combination_filename = f"{set_name}_{'_'.join(combination_name_parts)}"

                # Get the standard prefix using get_object_prefix
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