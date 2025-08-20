# routes.py - Explore Atom Routes - Complete Implementation
from fastapi import APIRouter, HTTPException, Form, Query, UploadFile, File
# ✅ Add this import:
# UPDATE your existing import from database to include the new functions:
from app.features.explore.app.database import (
    get_dimensions_from_mongo,
    get_measures_from_mongo,
    save_explore_atom_to_mongo,
    get_explore_atom_from_mongo,
    update_explore_atom_in_mongo,
    save_chart_result_to_mongo,
    get_chart_result_from_mongo,
    get_latest_chart_results_for_atom
)

# Import column classifier functions for integration
from app.features.column_classifier.database import (
    get_classifier_config_from_mongo,
    save_classifier_config_to_mongo
)
from app.features.feature_overview.deps import redis_client
from app.core.utils import get_env_vars
from app.features.chart_maker.service import chart_service
# from app.features.column_classifier.database import get_all_classifier_configs_from_mongo

from app.features.explore.app.redis_config import get_redis_client, REDIS_HOST, REDIS_PORT
import json
import hashlib
import io

from typing import Dict, Any, Optional, List
from datetime import datetime, date
import pandas as pd
import pyarrow as pa
import pyarrow.ipc as ipc
from minio import Minio
from minio.error import S3Error
from urllib.parse import unquote
import os

# Create router
router = APIRouter()

# Global storage for explore atom configurations (in-memory backup)
explore_atoms = {}

# MinIO client initialization
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "admin_dev")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "pass_dev")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "trinity")
OBJECT_PREFIX = os.getenv("OBJECT_PREFIX", "qmmqq/sales/")

minio_client = Minio(
    MINIO_ENDPOINT,
    access_key=MINIO_ACCESS_KEY,
    secret_key=MINIO_SECRET_KEY,
    secure=False
)

# Removed unused endpoint: /numerical-columns


@router.get("/columns")
async def get_columns(object_name: str):
    """Return column names for a saved dataframe."""
    object_name = unquote(object_name)
    print(f"➡️ explore columns request: {object_name}")
    
    try:
        if not object_name.endswith(".arrow"):
            raise ValueError("Unsupported file format")
        
        content = minio_client.get_object(MINIO_BUCKET, object_name).read()
        reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
        df = reader.read_all().to_pandas()

        # Return column names
        columns = list(df.columns)
        print(f"✅ Found {len(columns)} columns: {columns}")
        
        return {
            "columns": columns,
            "column_count": len(columns),
            "file_name": object_name
        }
        
    except S3Error as e:
        error_code = getattr(e, "code", "")
        if error_code in {"NoSuchKey", "NoSuchBucket"}:
            raise HTTPException(status_code=404, detail="File not found")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        print(f"⚠️ explore columns error for {object_name}: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/column_summary")
async def column_summary(object_name: str):
    """Return enhanced column summary statistics for a saved dataframe."""
    object_name = unquote(object_name)
    print(f"➡️ explore column_summary request: {object_name}")
    if not object_name.startswith(OBJECT_PREFIX):
        print(
            f"⚠️ explore column_summary prefix mismatch: {object_name} (expected {OBJECT_PREFIX})"
        )
    try:
        if not object_name.endswith(".arrow"):
            raise ValueError("Unsupported file format")
        
        content = minio_client.get_object(MINIO_BUCKET, object_name).read()
        reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
        df = reader.read_all().to_pandas()

        df.columns = df.columns.str.lower()
        summary = []
        for col in df.columns:
            column_series = df[col].dropna()
            try:
                vals = column_series.unique()
            except TypeError:
                vals = column_series.astype(str).unique()

            def _serialize(v):
                if isinstance(v, (pd.Timestamp, datetime, date)):
                    return pd.to_datetime(v).isoformat()
                return str(v)

            # Check if column is numerical
            is_numerical = pd.api.types.is_numeric_dtype(df[col])
            
            # For numerical columns, include all unique values (up to 1000 for filtering)
            # For non-numerical columns, include all unique values (up to 200 for filtering)
            max_values = 1000 if is_numerical else 200
            safe_vals = [_serialize(v) for v in vals[:max_values]]
            entries = safe_vals
            
            print(f"🔍 Column {col}: is_numerical={is_numerical}, unique_count={len(vals)}, returning {len(safe_vals)} values")
            if is_numerical and len(vals) > 0:
                print(f"🔍 Numerical column {col} sample values: {safe_vals[:5]}")
            
            summary.append(
                {
                "column": col,
                    "data_type": str(df[col].dtype),
                    "unique_count": int(len(vals)),
                    "entries": entries,  # Unique value names
                    "unique_values": safe_vals,  # Keep for backward compatibility
                    "is_numerical": is_numerical,  # Flag to identify numerical columns
                }
            )
        return {"summary": summary}
    except S3Error as e:
        error_code = getattr(e, "code", "")
        if error_code in {"NoSuchKey", "NoSuchBucket"}:
            raise HTTPException(status_code=404, detail="File not found")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        print(f"⚠️ explore column_summary error for {object_name}: {e}")
        raise HTTPException(status_code=400, detail=str(e))



# Removed unused endpoint: / (root endpoint)



@router.get("/get-dimensions-and-identifiers/{validator_atom_id}")
async def get_dimensions_and_identifiers(
    validator_atom_id: str,
    client_name: str = Query(None, description="Client name for column classifier lookup"),
    app_name: str = Query(None, description="App name for column classifier lookup"),
    project_name: str = Query(None, description="Project name for column classifier lookup"),
    file_key: str = Query(None, description="Specific file key to fetch dimensions for")
):
    """
    Get all business dimensions with assignments from SOURCE database (validator_atoms_db)
    Enhanced with robust column classifier integration - tries column classifier first, falls back to original logic
    """
    # If column classifier parameters are provided, try to fetch from column classifier first
    if client_name and app_name and project_name:
        try:
            # Try Redis first (fast lookup)
            key = f"{client_name}/{app_name}/{project_name}/column_classifier_config"
            cached = redis_client.get(key)
            
            if cached:
                config_data = json.loads(cached)
                print(f"✅ Found column classifier config in Redis for {key}")
                
                # Extract dimensions and identifiers from column classifier config
                dimensions = config_data.get("dimensions", {})
                identifiers = config_data.get("identifiers", [])
                
                # Transform to match explore atom format
                # Use provided file_key or default to "file"
                actual_file_key = file_key if file_key else "file"
                dimensions_data = {actual_file_key: {}}
                
                for dimension_name, identifiers_list in dimensions.items():
                    dimensions_data[actual_file_key][dimension_name] = {
                        "dimension_name": dimension_name,
                        "identifiers": identifiers_list,
                        "description": f"Dimension: {dimension_name}",
                        "source": "column_classifier",
                        "config_key": key
                    }
                
                return {
                    "status": "success",
                    "validator_atom_id": validator_atom_id,
                    "source": "column_classifier_redis",
                    "dimensions_structure": dimensions_data,
                    "column_classifier_config": {
                        "client_name": client_name,
                        "app_name": app_name,
                        "project_name": project_name,
                        "redis_key": key,
                        "total_dimensions": len(dimensions),
                        "total_identifiers": len(identifiers)
                    },
                    "summary": {
                        "file_keys": [actual_file_key],
                        "total_dimensions": len(dimensions_data[actual_file_key]),
                        "total_identifiers": len(identifiers),
                        "available_dimensions": list(dimensions.keys()),
                        "available_identifiers": identifiers
                    }
                }
            
            # If not in Redis, try MongoDB
            mongo_data = get_classifier_config_from_mongo(client_name, app_name, project_name)
            if mongo_data:
                # Cache back to Redis
                redis_client.setex(key, 3600, json.dumps(mongo_data, default=str))
                print(f"✅ Found column classifier config in MongoDB for {client_name}/{app_name}/{project_name}")
                
                # Extract dimensions and identifiers from column classifier config
                dimensions = mongo_data.get("dimensions", {})
                identifiers = mongo_data.get("identifiers", [])
                
                # Transform to match explore atom format
                actual_file_key = file_key if file_key else "file"
                dimensions_data = {actual_file_key: {}}
                
                for dimension_name, identifiers_list in dimensions.items():
                    dimensions_data[actual_file_key][dimension_name] = {
                        "dimension_name": dimension_name,
                        "identifiers": identifiers_list,
                        "description": f"Dimension: {dimension_name}",
                        "source": "column_classifier",
                        "config_key": key
                    }
                
                return {
                    "status": "success",
                    "validator_atom_id": validator_atom_id,
                    "source": "column_classifier_mongo",
                    "dimensions_structure": dimensions_data,
                    "column_classifier_config": {
                        "client_name": client_name,
                        "app_name": app_name,
                        "project_name": project_name,
                        "mongo_id": f"{client_name}/{app_name}/{project_name}",
                        "total_dimensions": len(dimensions),
                        "total_identifiers": len(identifiers)
                    },
                    "summary": {
                        "file_keys": [actual_file_key],
                        "total_dimensions": len(dimensions_data[actual_file_key]),
                        "total_identifiers": len(identifiers),
                        "available_dimensions": list(dimensions.keys()),
                        "available_identifiers": identifiers
                    }
                }
        except Exception as e:
            print(f"⚠️ Column classifier lookup failed: {e}")
            # Continue to fallback logic
    
    # Fallback to original logic
    result = get_dimensions_from_mongo(validator_atom_id)
    
    if result["status"] == "error":
        raise HTTPException(status_code=404, detail=result["message"])
    
    return result


@router.get("/get-measures/{validator_atom_id}")
async def get_measures(
    validator_atom_id: str,
    client_name: str = Query(None, description="Client name for column classifier lookup"),
    app_name: str = Query(None, description="App name for column classifier lookup"),
    project_name: str = Query(None, description="Project name for column classifier lookup"),
    file_key: str = Query(None, description="Specific file key to fetch measures for")
):
    """
    Get column classifications from SOURCE database (validator_atoms_db) to get available measures
    Enhanced with robust column classifier integration - tries column classifier first, falls back to original logic
    """
    # If column classifier parameters are provided, try to fetch from column classifier first
    if client_name and app_name and project_name:
        try:
            # Try Redis first (fast lookup)
            key = f"{client_name}/{app_name}/{project_name}/column_classifier_config"
            cached = redis_client.get(key)
            
            if cached:
                config_data = json.loads(cached)
                print(f"✅ Found column classifier config in Redis for {key}")
                
                # Extract measures and identifiers from column classifier config
                measures = config_data.get("measures", [])
                identifiers = config_data.get("identifiers", [])
                
                # Transform to match explore atom format
                actual_file_key = file_key if file_key else "file"
                measures_data = {
                    actual_file_key: {
                        "measures": measures,
                        "identifiers": identifiers,
                        "source": "column_classifier",
                        "config_key": key
                    }
                }
                
                return {
                    "status": "success",
                    "validator_atom_id": validator_atom_id,
                    "source": "column_classifier_redis",
                    "measures_structure": measures_data,
                    "column_classifier_config": {
                        "client_name": client_name,
                        "app_name": app_name,
                        "project_name": project_name,
                        "redis_key": key,
                        "total_measures": len(measures),
                        "total_identifiers": len(identifiers)
                    },
                    "summary": {
                        "file_keys": [actual_file_key],
                        "total_measures": len(measures),
                        "total_identifiers": len(identifiers),
                        "available_measures": measures,
                        "available_identifiers": identifiers
                    }
                }
            
            # If not in Redis, try MongoDB
            mongo_data = get_classifier_config_from_mongo(client_name, app_name, project_name)
            if mongo_data:
                # Cache back to Redis
                redis_client.setex(key, 3600, json.dumps(mongo_data, default=str))
                print(f"✅ Found column classifier config in MongoDB for {client_name}/{app_name}/{project_name}")
                
                # Extract measures and identifiers from column classifier config
                measures = mongo_data.get("measures", [])
                identifiers = mongo_data.get("identifiers", [])
                
                # Transform to match explore atom format
                actual_file_key = file_key if file_key else "file"
                measures_data = {
                    actual_file_key: {
                        "measures": measures,
                        "identifiers": identifiers,
                        "source": "column_classifier",
                        "config_key": key
                    }
                }
                
                return {
                    "status": "success",
                    "validator_atom_id": validator_atom_id,
                    "source": "column_classifier_mongo",
                    "measures_structure": measures_data,
                    "column_classifier_config": {
                        "client_name": client_name,
                        "app_name": app_name,
                        "project_name": project_name,
                        "mongo_id": f"{client_name}/{app_name}/{project_name}",
                        "total_measures": len(measures),
                        "total_identifiers": len(identifiers)
                    },
                    "summary": {
                        "file_keys": [actual_file_key],
                        "total_measures": len(measures),
                        "total_identifiers": len(identifiers),
                        "available_measures": measures,
                        "available_identifiers": identifiers
                    }
                }
        except Exception as e:
            print(f"⚠️ Column classifier lookup failed: {e}")
            # Continue to fallback logic
    
    # Fallback to original logic
    result = get_measures_from_mongo(validator_atom_id)
    
    if result["status"] == "error":
        raise HTTPException(status_code=404, detail=result["message"])
    
    return result


@router.post("/select-dimensions-and-measures")
async def select_dimensions_and_measures(
    validator_atom_id: str = Form(...),
    atom_name: str = Form(...),
    selected_dimensions: str = Form(...),  # JSON: {"file": {"product": ["Brand", "Variant"], "market": ["Channel"]}}
    selected_measures: str = Form(...)     # JSON: {"file": ["sales_value", "volume"]}
):
    """
    User selects which dimensions/identifiers and measures to use for analysis
    Saves configuration to DESTINATION database (Explore_atom)
    """
    try:
        dims = json.loads(selected_dimensions)
        measures = json.loads(selected_measures)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON format: {str(e)}")
    
    # Validate input structure
    if not isinstance(dims, dict) or not isinstance(measures, dict):
        raise HTTPException(status_code=400, detail="Both dimensions and measures must be JSON objects")
    
    # Generate explore atom ID
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    explore_atom_id = f"explore_{timestamp}"
    
    # ✅ PREPARE: Data for MongoDB
    explore_atom_data = {
        "explore_atom_id": explore_atom_id,
        "atom_name": atom_name,
        "validator_atom_id": validator_atom_id,
        "selected_dimensions": dims,
        "selected_measures": measures,
        "operations": {},
        "created_at": datetime.now().isoformat(),
        "status": "dimensions_and_measures_selected"
    }
    
    # ✅ SAVE TO: Explore_atom database (using database.py function)
    mongo_result = save_explore_atom_to_mongo(explore_atom_data)
    
    # ✅ BACKUP: Also store in memory for quick access
    explore_atoms[explore_atom_id] = explore_atom_data
    
    return {
        "status": "success",
        "message": f"Explore atom '{atom_name}' created and saved successfully",
        "explore_atom_id": explore_atom_id,
        "validator_atom_id": validator_atom_id,
        "selected_dimensions": dims,
        "selected_measures": measures,
        "summary": {
            "dimensions_selected": sum(len(dim_ids) for file_data in dims.values() for dim_ids in file_data.values()) if dims else 0,
            "measures_selected": sum(len(measure_list) for measure_list in measures.values()),
            "file_keys": list(dims.keys())
        },
        "mongodb_saved": mongo_result["status"] == "success",
        "mongo_id": mongo_result.get("mongo_id", ""),
        "next_step": f"Define operations using POST /explore/specify-operations with explore_atom_id: {explore_atom_id}"
    }



# Removed unused endpoint: /test-connection

@router.get("/column-classifier/configs")
async def list_column_classifier_configs():
    """
    List all available column classifier configurations
    Returns a list of client/app/project combinations that have saved configs
    """
    try:
        # Column classifier integration is disabled
        # Return empty config list since this feature is not being used
        config_list = []
        
        return {
            "status": "success",
            "configs": config_list,
            "total_configs": len(config_list)
        }
        
    except Exception as e:
        print(f"❌ Error listing column classifier configs: {e}")
        return {
            "status": "error",
            "message": f"Failed to list configurations: {str(e)}",
            "configs": []
        }


@router.get("/column-classifier/config/{client_name}/{app_name}/{project_name}")
async def get_column_classifier_config(
    client_name: str,
    app_name: str,
    project_name: str
):
    """
    Get column classifier configuration for a specific client/app/project combination
    This endpoint provides direct access to the column classifier data
    """
    try:
        # Try Redis first (fast lookup)
        key = f"{client_name}/{app_name}/{project_name}/column_classifier_config"
        cached = redis_client.get(key)
        
        if cached:
            config_data = json.loads(cached)
            print(f"✅ Found column classifier config in Redis for {key}")
            
            return {
                "status": "success",
                "source": "redis",
                "config": config_data,
                "redis_key": key,
                "summary": {
                    "client_name": client_name,
                    "app_name": app_name,
                    "project_name": project_name,
                    "identifiers": config_data.get("identifiers", []),
                    "measures": config_data.get("measures", []),
                    "dimensions": config_data.get("dimensions", {}),
                    "total_identifiers": len(config_data.get("identifiers", [])),
                    "total_measures": len(config_data.get("measures", [])),
                    "total_dimensions": len(config_data.get("dimensions", {}))
                }
            }
        
        # If not in Redis, try MongoDB
        mongo_data = get_classifier_config_from_mongo(client_name, app_name, project_name)
        if mongo_data:
            # Cache back to Redis
            redis_client.setex(key, 3600, json.dumps(mongo_data, default=str))
            print(f"✅ Found column classifier config in MongoDB for {client_name}/{app_name}/{project_name}")
            
            return {
                "status": "success",
                "source": "mongodb",
                "config": mongo_data,
                "mongo_id": f"{client_name}/{app_name}/{project_name}",
                "summary": {
                    "client_name": client_name,
                    "app_name": app_name,
                    "project_name": project_name,
                    "identifiers": mongo_data.get("identifiers", []),
                    "measures": mongo_data.get("measures", []),
                    "dimensions": mongo_data.get("dimensions", {}),
                    "total_identifiers": len(mongo_data.get("identifiers", [])),
                    "total_measures": len(mongo_data.get("measures", [])),
                    "total_dimensions": len(mongo_data.get("dimensions", {}))
                }
            }
        
        # Configuration not found
        return {
            "status": "error",
            "message": "Configuration not found",
            "details": {
                "client_name": client_name,
                "app_name": app_name,
                "project_name": project_name,
                "redis_key": key,
                "mongo_id": f"{client_name}/{app_name}/{project_name}"
            }
        }
        
    except Exception as e:
        print(f"❌ Error fetching column classifier config: {e}")
        return {
            "status": "error",
            "message": f"Failed to fetch configuration: {str(e)}",
            "details": {
                "client_name": client_name,
                "app_name": app_name,
                "project_name": project_name
            }
        }


# Removed unused endpoint: /list-saved-atoms




# Accept both with and without trailing slash for robustness
@router.post("/specify-operations")
async def specify_operations(
    explore_atom_id: str = Form(...),
    operations: str = Form(...)
):
    """
    Specify operations for data processing
    Now with weighted average support and validation
    """
    try:
        ops = json.loads(operations)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON format for operations: {str(e)}")
    
    # ✅ Check both memory AND MongoDB for explore atom
    explore_atom_data = None
    
    # First check in-memory
    if explore_atom_id in explore_atoms:
        explore_atom_data = explore_atoms[explore_atom_id]

    else:
        # If not in memory, check MongoDB
        mongo_atom = get_explore_atom_from_mongo(explore_atom_id)
        if mongo_atom:
            explore_atoms[explore_atom_id] = mongo_atom
            explore_atom_data = mongo_atom
    
    # If still not found, raise error
    if not explore_atom_data:
        raise HTTPException(status_code=404, detail=f"Explore atom '{explore_atom_id}' not found in memory or database")
    
    # Validate operations structure
    required_keys = ["file_key", "filters", "group_by", "measures_config", "chart_type"]
    for key in required_keys:
        if key not in ops:
            raise HTTPException(status_code=400, detail=f"Missing required operation key: '{key}'")
    
            # Validate chart type
        valid_chart_types = ["bar_chart", "stacked_bar_chart", "line_chart", "pie_chart", "table"]
        if ops["chart_type"] not in valid_chart_types:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid chart_type '{ops['chart_type']}'. Valid options: {valid_chart_types}"
            )
    
    # Validate aggregations
    valid_aggregations = ["sum", "avg", "count", "min", "max", "weighted_avg", "null", "no_aggregation"]
    for measure, agg_type in ops["measures_config"].items():
        if agg_type not in valid_aggregations:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid aggregation '{agg_type}' for measure '{measure}'. Valid options: {valid_aggregations}"
            )
    
    # ✅ NEW: Validate weighted average requirements
    has_weighted_avg = any(agg_type == "weighted_avg" for agg_type in ops["measures_config"].values())
    
    if has_weighted_avg:
        # Check if weight_column is provided
        if "weight_column" not in ops:
            raise HTTPException(
                status_code=400,
                detail="'weight_column' is required when using 'weighted_avg' aggregation"
            )
        
        # Validate weight_column is not empty
        weight_column = ops["weight_column"]
        if not weight_column or not isinstance(weight_column, str):
            raise HTTPException(
                status_code=400,
                detail="'weight_column' must be a non-empty string"
            )
        
        print(f"✅ Weighted average validation passed: weight_column='{weight_column}'")
    
    # ✅ NEW: Validate x_axis for line charts
    if ops["chart_type"] == "line_chart":
        if "x_axis" not in ops:
            raise HTTPException(
                status_code=400,
                detail=f"'x_axis' is required for {ops['chart_type']} type"
            )
        
        x_axis = ops["x_axis"]
        if x_axis not in ops["group_by"]:
            raise HTTPException(
                status_code=400,
                detail=f"'x_axis' value '{x_axis}' must be in 'group_by' list: {ops['group_by']}"
            )
        
        print(f"✅ {ops['chart_type']} validation passed: x_axis='{x_axis}'")
    
    # Update explore atom in memory
    explore_atoms[explore_atom_id]["operations"] = ops
    explore_atoms[explore_atom_id]["status"] = "ready_for_processing"
    explore_atoms[explore_atom_id]["updated_at"] = datetime.now().isoformat()
    
    # ✅ REPLACE with this:
    mongo_result = update_explore_atom_in_mongo(explore_atom_id, ops)

    
    # ✅ Enhanced operation summary
    operation_summary = {
        "file_key": ops["file_key"],
        "filters_count": len(ops["filters"]),
        "group_by_dimensions": ops["group_by"],
        "measures_count": len(ops["measures_config"]),
        "chart_type": ops["chart_type"]
    }
    
    # Add weighted average info if present
    if has_weighted_avg:
        operation_summary["weighted_avg_used"] = True
        operation_summary["weight_column"] = ops["weight_column"]
    
    # Add x_axis info if line chart
    if ops["chart_type"] == "line_chart":
        operation_summary["x_axis"] = ops["x_axis"]
    
    return {
        "status": "success",
        "message": "Operations specified successfully",
        "explore_atom_id": explore_atom_id,
        "operations": ops,
        "data_source": "MongoDB" if explore_atom_id not in explore_atoms else "Memory",
        "mongodb_updated": mongo_result["status"] == "success",
        "operation_summary": operation_summary,
        "validation_passed": {
            "weighted_avg_validation": has_weighted_avg,
            "line_chart_validation": ops["chart_type"] == "line_chart"
        },
        "next_step": f"Get chart data using GET /explore/chart-data-multidim/{explore_atom_id}"
    }

# Removed unused endpoint: /minio-files




@router.get("/chart-data-multidim/{explore_atom_id}")
async def chart_data_multidim(explore_atom_id: str):
    """
    Multi-dimensional grouping with dynamic x-axis selection and weighted average support
    NOW WITH REDIS CACHING AND MONGODB STORAGE
    """
    print(f"🔍 chart_data_multidim: Starting for explore_atom_id: {explore_atom_id}")
    
    # Get explore atom configuration
    explore_atom_data = None
    
    if explore_atom_id in explore_atoms:
        explore_atom_data = explore_atoms[explore_atom_id]
    else:
        mongo_atom = get_explore_atom_from_mongo(explore_atom_id)
        if mongo_atom:
            explore_atoms[explore_atom_id] = mongo_atom
            explore_atom_data = mongo_atom
    
    if not explore_atom_data:
        raise HTTPException(status_code=404, detail=f"Explore atom not found")
    
    # Extract operations with x_axis and weight_column support
    operations = explore_atom_data.get("operations", {})
    chart_type = operations.get("chart_type", "table")
    print(f"🔍 Backend: Received chart_type: {chart_type}")
    print(f"🔍 Backend: Operations: {operations}")
    group_by = operations.get("group_by", [])
    filters = operations.get("filters", {})
    # Frontend may send filters as list of {column, values}
    if isinstance(filters, list):
        normalized_filters = {}
        for flt in filters:
            col = flt.get("column")
            vals = flt.get("values", [])
            if not col:
                continue
            # Ensure vals is list for consistent processing
            if isinstance(vals, (list, tuple, set)):
                normalized_filters[col] = list(vals)
            else:
                normalized_filters[col] = [vals]
        filters = normalized_filters
    measures_config = operations.get("measures_config", {})
    x_axis = operations.get("x_axis", group_by[0] if group_by else None)
    weight_column = operations.get("weight_column", None)
    
    # Initialize chart metadata for legend-based charts
    chart_metadata = {}
    
    # Determine file key to fetch data
    # Determine file key to fetch data – prefer operations['file_key'] if provided
    file_key: str = operations.get("file_key")
    if not file_key:
        file_keys = list(explore_atom_data.get("selected_dimensions", {}).keys())
        if not file_keys:
            raise HTTPException(status_code=400, detail="No file key found in explore atom configuration")
        file_key = file_keys[0]
        
    # Smart caching function
    def fetch_data_with_redis_cache(explore_atom_id: str, operations: dict, file_key: str):
        """Smart caching: Check Redis first, fallback to MinIO"""
        import json
        import hashlib
        import io
        
        # Step 1: Generate cache key
        cache_data = {
            "explore_atom_id": explore_atom_id,
            "operations": operations
        }
        cache_string = json.dumps(cache_data, sort_keys=True)
        cache_key = f"csv_cache_{hashlib.md5(cache_string.encode()).hexdigest()}"
        
        print(f"📋 Cache key: {cache_key}")
        
        # Step 2: Try Redis cache first
        redis_client = get_redis_client()
        if redis_client:
            try:
                print(f"🔍 Trying Redis cache for key: {cache_key}")
                cached_csv = redis_client.get(cache_key)
                if cached_csv:
                    # Cache hit - load from Redis
                    if file_key.endswith('.arrow'):
                        reader = ipc.RecordBatchFileReader(pa.BufferReader(cached_csv))
                        df = reader.read_all().to_pandas()
                    else:
                        df = pd.read_csv(io.BytesIO(cached_csv))
                    print(f"⚡ CACHE HIT: Data from Redis cache: {df.shape[0]} rows")
                    return df, True, cache_key  # df, cache_hit, cache_key
                else:
                    print(f"📋 Cache miss for key: {cache_key}")
            except Exception as e:
                print(f"⚠️ Redis cache read error: {e}")
        else:
            print(f"⚠️ Redis client not available, skipping cache")
        
        # Step 3: Cache miss - fetch from MinIO
        print(f"📁 CACHE MISS: Fetching from MinIO...")
        try:
            from minio import Minio
            
            minio_client = Minio(
                MINIO_ENDPOINT,
                access_key=MINIO_ACCESS_KEY,
                secret_key=MINIO_SECRET_KEY,
                secure=False
            )
            
            bucket_name = MINIO_BUCKET
            object_name = file_key
            
            print(f"📁 Fetching {object_name} from MinIO...")
            obj = minio_client.get_object(bucket_name, object_name)
            csv_bytes = obj.read()
            obj.close()
            print(f"📁 MinIO fetch completed, size: {len(csv_bytes)} bytes")
            
            # Step 4: Cache the result in Redis
            if redis_client:
                try:
                    redis_client.setex(cache_key, 1800, csv_bytes)  # Cache for 30 minutes
                    print(f"💾 Cached CSV data in Redis for 30 minutes")
                except Exception as e:
                    print(f"⚠️ Redis cache write error: {e}")
            
            # Step 5: Load into DataFrame depending on file type
            if object_name.endswith('.arrow'):
                reader = ipc.RecordBatchFileReader(pa.BufferReader(csv_bytes))
                df = reader.read_all().to_pandas()
            else:
                df = pd.read_csv(io.BytesIO(csv_bytes))
            print(f"📁 CACHE MISS: Data from MinIO: {df.shape[0]} rows")
            return df, False, cache_key  # df, cache_hit, cache_key
            
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to fetch data: {str(e)}")

    # Fetch data with smart caching
    try:
        import pandas as pd
        
        print(f"⏱️ Starting data fetch at: {datetime.now()}")
        
        # Smart caching with Redis
        df, cache_hit, cache_key = fetch_data_with_redis_cache(explore_atom_id, operations, file_key)
        
        print(f"✅ Data loaded: {df.shape[0]} rows, {df.shape[1]} columns")
        print(f"📊 Cache status: {'HIT' if cache_hit else 'MISS'}")
        print(f"🔍 Debug: df columns: {list(df.columns)}")
        print(f"🔍 Debug: df head: {df.head(2).to_dict('records')}")
        
        # Performance optimization: Sample data for large datasets
        if len(df) > 100000:  # If more than 100k rows
            print(f"📊 Large dataset detected ({len(df)} rows), sampling for faster processing...")
            sample_size = min(100000, len(df))
            df = df.sample(n=sample_size, random_state=42)
            print(f"📊 Sampled to {len(df)} rows for faster processing")
        
        print(f"⏱️ Data fetch completed at: {datetime.now()}")
        
    except Exception as e:
        print(f"❌ Error fetching data: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch data: {str(e)}")
    
    # Case-insensitive column matching
    def find_column(search_name, available_columns):
        search_lower = search_name.lower()
        for col in available_columns:
            if col.lower() == search_lower:
                return col
        return None
    
    # Apply filters with smart matching and date range filtering
    print(f"⏱️ Starting data processing at: {datetime.now()}")
    processed_df = df.copy()
    filter_debug = {}
    
    for filter_key, filter_value in filters.items():
        # filter_value can be list or str
        filter_values = filter_value if isinstance(filter_value, list) else [filter_value]

        actual_column = find_column(filter_key, df.columns)
        if actual_column:
            # Check if this is a date column and we have date range filters
            if len(filter_values) == 2 and all(isinstance(v, str) and '-' in v for v in filter_values):
                try:
                    # Try to parse as date range filter
                    from_date = pd.to_datetime(filter_values[0])
                    to_date = pd.to_datetime(filter_values[1])
                    
                    # Convert column to datetime if it's not already
                    if not pd.api.types.is_datetime64_any_dtype(processed_df[actual_column]):
                        processed_df[actual_column] = pd.to_datetime(processed_df[actual_column], errors='coerce')
                    
                    # Apply date range filter
                    original_count = len(processed_df)
                    processed_df = processed_df[
                        (processed_df[actual_column] >= from_date) & 
                        (processed_df[actual_column] <= to_date)
                    ]
                    
                    filter_debug[filter_key] = {
                        "type": "date_range",
                        "from_date": from_date.isoformat(),
                        "to_date": to_date.isoformat(),
                        "rows_before": original_count,
                        "rows_after": len(processed_df)
                    }
                    print(f"✅ Date range filter applied: {actual_column} from {from_date.date()} to {to_date.date()}, rows: {original_count} → {len(processed_df)}")
                    continue
                except (ValueError, TypeError):
                    # Not a valid date range, treat as regular filter
                    pass
            
            # Regular value matching (case insensitive)
            unique_values = processed_df[actual_column].unique()
            matched_values = []
            
            for val in unique_values:
                if str(val).lower() in [v.lower() for v in filter_values]:
                    matched_values.append(val)
            
            if matched_values:
                original_count = len(processed_df)
                processed_df = processed_df[processed_df[actual_column].isin(matched_values)]
                filter_debug[filter_key] = {
                    "type": "value_match",
                    "matched_values": matched_values,
                    "rows_before": original_count,
                    "rows_after": len(processed_df)
                }
                print(f"✅ Filter applied: {actual_column}={matched_values}, rows: {original_count} → {len(processed_df)}")
            else:
                filter_debug[filter_key] = {
                    "type": "no_match",
                    "status": "no_match_found",
                    "available_values": unique_values[:5].tolist()
                }
                print(f"❌ No match for {filter_value} in {actual_column}")
        else:
            filter_debug[filter_key] = {"type": "error", "status": "column_not_found"}
    
    # Check if any data remains after filtering
    if len(processed_df) == 0:
        return {
            "status": "success",
            "chart_type": chart_type,
            "data": [],
            "metadata": {
                "message": "No data remaining after filters",
                "original_rows": len(df),
                "filtered_rows": 0,
                "filters_applied": filter_debug
            }
        }
    
    # Validate x_axis exists in group_by
    if x_axis and x_axis not in group_by:
        raise HTTPException(
            status_code=400, 
            detail=f"x_axis '{x_axis}' must be in group_by list {group_by}"
        )

    # Multi-dimensional grouping
    actual_group_cols = []
    for group_col in group_by:
        actual_col = find_column(group_col, df.columns)
        if actual_col:
            actual_group_cols.append(actual_col)
            print(f"✅ Group by: {group_col} → {actual_col}")
        else:
            print(f"❌ Group by column '{group_col}' not found")
    
    if not actual_group_cols:
        raise HTTPException(status_code=400, detail="No valid group by columns found")

    # Get measure column - now can be either identifier or measure
    primary_measure = list(measures_config.keys())[0] if measures_config else "Volume"
    actual_measure = find_column(primary_measure, df.columns)
    
    if not actual_measure:
        raise HTTPException(status_code=400, detail=f"Column '{primary_measure}' not found")

    # Check if we have multiple measures for dual Y-axes
    multiple_measures = []
    if measures_config and len(measures_config) > 1:
        # We have multiple measures, collect them all
        for measure_name, agg_type in measures_config.items():
            actual_col = find_column(measure_name, df.columns)
            if actual_col:
                multiple_measures.append({
                    'name': measure_name,
                    'column': actual_col,
                    'agg_type': agg_type
                })
                print(f"✅ Multiple measure found: {measure_name} → {actual_col} ({agg_type})")
    
    # If no multiple measures found, use the primary measure
    if not multiple_measures:
        multiple_measures = [{
            'name': primary_measure,
            'column': actual_measure,
            'agg_type': measures_config.get(primary_measure, "sum") if measures_config else "sum"
        }]
        print(f"✅ Using single measure: {primary_measure} → {actual_measure}")

    # Enhanced Group and aggregate with weighted average support
    agg_type = measures_config.get(primary_measure, "sum") if measures_config else "sum"
    
    print(f"🔍 Backend: Received aggregation type: '{agg_type}' for measure '{primary_measure}'")
    print(f"🔍 Backend: Measures config: {measures_config}")
    print(f"🔍 Backend: Primary measure: '{primary_measure}'")
    print(f"🔍 Backend: Actual measure column: '{actual_measure}'")
    
    # Handle "no_aggregation" case
    if agg_type == "no_aggregation":
        print(f"✅ No aggregation requested for '{actual_measure}' - using raw values")
        agg_type = "null"  # Use null aggregation to get raw values
    
    # Initialize weight column variable
    actual_weight = None
    
    # Data type validation and cleaning
    try:
        # Check if the measure column is numeric (for aggregation) or categorical
        is_numeric = pd.api.types.is_numeric_dtype(processed_df[actual_measure])
        
        # Check if this is an identifier (categorical data) being used as Y-axis
        # For "no_aggregation" or "null", we want to show actual values regardless of data type
        is_identifier = (not is_numeric and agg_type not in ["count", "null"]) or (agg_type in ["null", "no_aggregation"])
        
        if is_numeric and agg_type not in ["null", "no_aggregation"]:
            # If numeric and not no_aggregation, ensure it's properly formatted for aggregation
            processed_df[actual_measure] = pd.to_numeric(processed_df[actual_measure], errors='coerce')
            print(f"✅ Numeric column '{actual_measure}' ready for aggregation")
        elif is_identifier:
            # If identifier is used as Y-axis or no_aggregation is requested, keep original values
            print(f"✅ Identifier column '{actual_measure}' used as Y-axis - will show actual values")
            # Don't change agg_type, let it remain as requested
        elif agg_type == "null":
            # If no aggregation requested, keep as string and don't override
            print(f"✅ No aggregation requested for '{actual_measure}' - keeping original values")
            # Don't change agg_type, let it remain "null"
        else:
            # If categorical, we'll use count aggregation
            print(f"✅ Categorical column '{actual_measure}' - will use count aggregation")
            agg_type = "count"  # Override aggregation type for categorical data
        
        # If using weighted average, ensure weight column is numeric
        if agg_type == "weighted_avg":
            if not weight_column:
                raise HTTPException(status_code=400, detail="weight_column required for weighted_avg")
            
            actual_weight = find_column(weight_column, df.columns)
            if not actual_weight:
                raise HTTPException(status_code=400, detail=f"Weight column '{weight_column}' not found")
            
            processed_df[actual_weight] = pd.to_numeric(processed_df[actual_weight], errors='coerce')
            
            # Remove rows with NaN in measure or weight
            processed_df = processed_df.dropna(subset=[actual_measure, actual_weight])
        else:
            # For other aggregations, just remove NaN in measure
            processed_df = processed_df.dropna(subset=[actual_measure])
        
        print(f"✅ Data cleaning: {len(processed_df)} rows after removing NaN")
        
    except Exception as e:
        print(f"⚠️ Data cleaning warning: {e}")

    # Perform aggregation
    try:
        # Handle multiple measures for dual Y-axes
        if len(multiple_measures) > 1:
            print(f"🔍 Backend: Processing multiple measures for dual Y-axes")
            
            # Start with the first measure as the base
            first_measure = multiple_measures[0]
            agg_type = first_measure['agg_type']
            actual_measure = first_measure['column']
            
            # Perform aggregation for the first measure
            if agg_type == "sum":
                grouped_result = processed_df.groupby(actual_group_cols)[actual_measure].sum().reset_index()
            elif agg_type == "avg":
                grouped_result = processed_df.groupby(actual_group_cols)[actual_measure].mean().reset_index()
            elif agg_type == "count":
                grouped_result = processed_df.groupby(actual_group_cols)[actual_measure].count().reset_index()
            elif agg_type == "min":
                grouped_result = processed_df.groupby(actual_group_cols)[actual_measure].min().reset_index()
            elif agg_type == "max":
                grouped_result = processed_df.groupby(actual_group_cols)[actual_measure].max().reset_index()
            elif agg_type == "weighted_avg":
                def weighted_avg_func(group):
                    numerator = (group[actual_measure] * group[actual_weight]).sum()
                    denominator = group[actual_weight].sum()
                    return numerator / denominator if denominator != 0 else 0
                grouped_result = processed_df.groupby(actual_group_cols).apply(weighted_avg_func).reset_index()
                grouped_result.columns = actual_group_cols + [actual_measure]
            elif agg_type == "null":
                if not pd.api.types.is_numeric_dtype(processed_df[actual_measure]):
                    grouped_result = processed_df.groupby(actual_group_cols)[actual_measure].apply(lambda x: list(x.unique())).reset_index()
                    grouped_result[actual_measure] = grouped_result[actual_measure].apply(lambda x: x[0] if len(x) > 0 else "Unknown")
                else:
                    grouped_result = processed_df.groupby(actual_group_cols)[actual_measure].apply(lambda x: list(x.unique())).reset_index()
                    grouped_result[actual_measure] = grouped_result[actual_measure].apply(lambda x: x[0] if len(x) > 0 else "Unknown")
            else:
                grouped_result = processed_df.groupby(actual_group_cols)[actual_measure].sum().reset_index()
            
            # Now add the additional measures
            for i, measure_info in enumerate(multiple_measures[1:], 1):
                measure_col = measure_info['column']
                measure_agg_type = measure_info['agg_type']
                
                print(f"🔍 Backend: Adding measure {i+1}: {measure_info['name']} → {measure_col} ({measure_agg_type})")
                
                # Perform aggregation for this measure
                if measure_agg_type == "sum":
                    measure_result = processed_df.groupby(actual_group_cols)[measure_col].sum().reset_index()
                elif measure_agg_type == "avg":
                    measure_result = processed_df.groupby(actual_group_cols)[measure_col].mean().reset_index()
                elif measure_agg_type == "count":
                    measure_result = processed_df.groupby(actual_group_cols)[measure_col].count().reset_index()
                elif measure_agg_type == "min":
                    measure_result = processed_df.groupby(actual_group_cols)[measure_col].min().reset_index()
                elif measure_agg_type == "max":
                    measure_result = processed_df.groupby(actual_group_cols)[measure_col].max().reset_index()
                elif measure_agg_type == "weighted_avg":
                    # For weighted average, we need to ensure the weight column is available
                    if not actual_weight:
                        raise HTTPException(status_code=400, detail="weight_column required for weighted_avg")
                    
                    def weighted_avg_func(group):
                        numerator = (group[measure_col] * group[actual_weight]).sum()
                        denominator = group[actual_weight].sum()
                        return numerator / denominator if denominator != 0 else 0
                    measure_result = processed_df.groupby(actual_group_cols).apply(weighted_avg_func).reset_index()
                    measure_result.columns = actual_group_cols + [measure_col]
                elif measure_agg_type == "null":
                    if not pd.api.types.is_numeric_dtype(processed_df[measure_col]):
                        measure_result = processed_df.groupby(actual_group_cols)[measure_col].apply(lambda x: list(x.unique())).reset_index()
                        measure_result[measure_col] = measure_result[measure_col].apply(lambda x: x[0] if len(x) > 0 else "Unknown")
                    else:
                        measure_result = processed_df.groupby(actual_group_cols)[measure_col].apply(lambda x: list(x.unique())).reset_index()
                        measure_result[measure_col] = measure_result[measure_col].apply(lambda x: x[0] if len(x) > 0 else "Unknown")
                else:
                    measure_result = processed_df.groupby(actual_group_cols)[measure_col].sum().reset_index()
                
                # Merge with the main result
                grouped_result = grouped_result.merge(measure_result, on=actual_group_cols, how='left')
            
            print(f"✅ Multiple measures aggregation completed: {len(grouped_result)} combinations")
            
        else:
            # Single measure aggregation (existing logic)
            if agg_type == "sum":
                grouped_result = processed_df.groupby(actual_group_cols)[actual_measure].sum().reset_index()
            
            elif agg_type == "avg":
                grouped_result = processed_df.groupby(actual_group_cols)[actual_measure].mean().reset_index()
            
            elif agg_type == "count":
                # For count aggregation, we can count any column (including categorical)
                grouped_result = processed_df.groupby(actual_group_cols)[actual_measure].count().reset_index()
                print(f"✅ Count aggregation applied to '{actual_measure}'")
            
            elif agg_type == "min":
                grouped_result = processed_df.groupby(actual_group_cols)[actual_measure].min().reset_index()
            
            elif agg_type == "max":
                grouped_result = processed_df.groupby(actual_group_cols)[actual_measure].max().reset_index()
            
            # Note: "no_aggregation" is converted to "null" earlier, so it's handled in the "null" section below
            
            elif agg_type == "weighted_avg":
                # Weighted average implementation
                if not actual_weight:
                    raise HTTPException(status_code=400, detail="weight_column required for weighted_avg")
                
                def weighted_avg_func(group):
                    numerator = (group[actual_measure] * group[actual_weight]).sum()
                    denominator = group[actual_weight].sum()
                    return numerator / denominator if denominator != 0 else 0
                
                # Apply weighted average calculation
                grouped_result = processed_df.groupby(actual_group_cols).apply(weighted_avg_func).reset_index()
                grouped_result.columns = actual_group_cols + [actual_measure]
                
                print(f"✅ Weighted average calculated using {actual_weight} as weight")
            
            elif agg_type == "null":
                # No aggregation - for identifiers, we want to show the actual values
                # Check if this is an identifier (categorical data) or numeric identifier (like year)
                print(f"🔍 Backend: Processing 'null' aggregation for '{actual_measure}'")
                print(f"🔍 Backend: Data type of '{actual_measure}': {processed_df[actual_measure].dtype}")
                print(f"🔍 Backend: Sample values of '{actual_measure}': {processed_df[actual_measure].head().tolist()}")
                
                if not pd.api.types.is_numeric_dtype(processed_df[actual_measure]):
                    # For categorical identifiers, we want to show the distinct values, not aggregated
                    # Group by the X-axis and show the Y-axis values as they are
                    grouped_result = processed_df.groupby(actual_group_cols)[actual_measure].apply(lambda x: list(x.unique())).reset_index()
                    # Flatten the list of unique values for each group
                    grouped_result[actual_measure] = grouped_result[actual_measure].apply(lambda x: x[0] if len(x) > 0 else "Unknown")
                    print(f"✅ No aggregation applied for categorical identifier '{actual_measure}' - using distinct values")
                    print(f"🔍 Backend: Sample data after processing: {grouped_result.head().to_dict()}")
                else:
                    # For numeric identifiers (like year), we want to show the actual values, not aggregated
                    # Group by the X-axis and show the Y-axis values as they are
                    grouped_result = processed_df.groupby(actual_group_cols)[actual_measure].apply(lambda x: list(x.unique())).reset_index()
                    # Flatten the list of unique values for each group
                    grouped_result[actual_measure] = grouped_result[actual_measure].apply(lambda x: x[0] if len(x) > 0 else "Unknown")
                    print(f"✅ No aggregation applied for numeric identifier '{actual_measure}' - using distinct values")
                    print(f"🔍 Backend: Sample data after processing: {grouped_result.head().to_dict()}")
            
            else:
                # Default to sum
                grouped_result = processed_df.groupby(actual_group_cols)[actual_measure].sum().reset_index()
            
            print(f"✅ Single measure aggregation ({agg_type}): {len(grouped_result)} combinations")
        
        # Handle empty results
        if len(grouped_result) == 0:
            print("⚠️ GroupBy returned empty result")
            grouped_result = pd.DataFrame(columns=actual_group_cols + [actual_measure])
        
    except Exception as e:
        print(f"❌ GroupBy error: {str(e)}")
        print(f"Data types: {processed_df.dtypes}")
        print(f"Group columns: {actual_group_cols}")
        print(f"Measure column: {actual_measure}")
        print(f"Data shape: {processed_df.shape}")
        raise HTTPException(status_code=500, detail=f"Grouping failed: {str(e)}")

    # Format data based on chart type
    if chart_type == "line_chart" and x_axis:
        # Line chart specific processing
        actual_x_axis = find_column(x_axis, df.columns)
        
        if not actual_x_axis:
            raise HTTPException(status_code=400, detail=f"X-axis column '{x_axis}' not found")
        
        # Get non-x-axis columns for line differentiation
        line_id_cols = [col for col in actual_group_cols if col != actual_x_axis]
        
        # Create line identifiers
        if line_id_cols:
            grouped_result['line_id'] = grouped_result[line_id_cols].astype(str).agg(' | '.join, axis=1)
        else:
            grouped_result['line_id'] = 'Total'
        
        # Convert to line chart format
        chart_data = []
        
        # Check if we have multiple measures for dual Y-axes
        if len(multiple_measures) > 1:
            print(f"🔍 Backend: Generating line chart with multiple measures for dual Y-axes")
            
            # For multiple measures, we need to create individual data points for each x-axis value
            for line_name in grouped_result['line_id'].unique():
                line_data = grouped_result[grouped_result['line_id'] == line_name].sort_values(actual_x_axis)
                
                # Create a data point for each row in the line data
                for _, row in line_data.iterrows():
                    data_point = {
                        actual_x_axis: str(row[actual_x_axis])
                    }
                    
                    # Add each measure as a separate field
                    for measure_info in multiple_measures:
                        measure_name = measure_info['name']
                        measure_col = measure_info['column']
                        
                        if measure_col in row.index:
                            y_value = row[measure_col]
                            if pd.api.types.is_numeric_dtype(line_data[measure_col]):
                                data_point[measure_name] = float(y_value) if pd.notna(y_value) else 0
                            else:
                                data_point[measure_name] = str(y_value) if pd.notna(y_value) else "Unknown"
                    
                    chart_data.append(data_point)
            
            print(f"✅ Line chart with multiple measures: {len(chart_data)} data points generated")
            
        else:
            # Single measure line chart with legend field support
            if line_id_cols:
                # Determine the legend field from group columns
                legend_field = None
                for col in line_id_cols:
                    if col != actual_x_axis:
                        legend_field = col
                        break
                if not legend_field and line_id_cols:
                    legend_field = line_id_cols[0]

                # Try to use chart maker service for pivoting
                try:
                    pivoted_data, unique_legend_values = chart_service._pivot_data_for_legend(
                        grouped_result,
                        actual_x_axis,
                        actual_measure,
                        legend_field,
                        agg_type if agg_type != "null" else "sum"
                    )

                    chart_data = pivoted_data
                    chart_metadata = {
                        "is_pivoted": True,
                        "legend_field": legend_field,
                        "legend_values": unique_legend_values,
                        "x_axis": actual_x_axis,
                        "y_axis": actual_measure
                    }
                    print(
                        f"✅ Chart maker service pivoting: {len(chart_data)} data points with {len(unique_legend_values)} legend values"
                    )
                except Exception as e:
                    print(f"⚠️ Chart maker service pivoting failed, falling back to manual method: {e}")
                    # Manual pivoting by legend values
                    pivot_data: Dict[str, Dict[str, Any]] = {}
                    legend_values: List[str] = []

                    for _, row in grouped_result.sort_values(actual_x_axis).iterrows():
                        x_value = str(row[actual_x_axis])
                        legend_val = str(row[legend_field]) if legend_field in row else str(row.get("line_id", "Unknown"))
                        y_value = row[actual_measure]

                        if pd.api.types.is_numeric_dtype(grouped_result[actual_measure]):
                            y_value = float(y_value) if pd.notna(y_value) else 0
                        else:
                            y_value = str(y_value) if pd.notna(y_value) else "Unknown"

                        if x_value not in pivot_data:
                            pivot_data[x_value] = {actual_x_axis: x_value}

                        pivot_data[x_value][legend_val] = y_value
                        if legend_val not in legend_values:
                            legend_values.append(legend_val)

                    chart_data = list(pivot_data.values())
                    try:
                        chart_data.sort(
                            key=lambda x: float(x[actual_x_axis])
                            if str(x[actual_x_axis]).replace('.', '').replace('-', '').isdigit()
                            else x[actual_x_axis]
                        )
                    except (ValueError, TypeError):
                        chart_data.sort(key=lambda x: str(x[actual_x_axis]))

                    chart_metadata = {
                        "legend_field": legend_field,
                        "legend_values": legend_values,
                    }
                    print(
                        f"✅ Fallback manual legend-based line chart: {len(chart_data)} data points generated with {len(legend_values)} legend values"
                    )
            else:
                # Fallback to original logic for non-legend charts
                for line_name in grouped_result['line_id'].unique():
                    line_data = grouped_result[grouped_result['line_id'] == line_name].sort_values(actual_x_axis)
                    
                    # Create individual data points for each x-y pair
                    for _, row in line_data.iterrows():
                        # Handle both numeric and categorical Y-axis values
                        y_value = row[actual_measure]
                        if pd.api.types.is_numeric_dtype(grouped_result[actual_measure]):
                            y_value = float(y_value) if pd.notna(y_value) else 0
                        else:
                            y_value = str(y_value) if pd.notna(y_value) else "Unknown"
                        
                        chart_data.append({
                            actual_x_axis: str(row[actual_x_axis]),
                            actual_measure: y_value,
                            "series": line_name
                        })
                
                print(f"✅ Single line chart: {len(chart_data)} data points generated")

    elif chart_type == "bar_chart":
        print(f"🔍 Backend: Processing BAR CHART branch")
        # Bar chart specific processing
        chart_data = []
        
        # Check if we have multiple measures for dual Y-axes
        if len(multiple_measures) > 1:
            print(f"🔍 Backend: Generating bar chart with multiple measures for dual Y-axes")
            
            # Sort by the first measure value (descending) for better bar chart visualization
            first_measure_col = multiple_measures[0]['column']
            sorted_result = grouped_result.sort_values(first_measure_col, ascending=False)
            
            for _, row in sorted_result.iterrows():
                # Create bar chart data point with actual field names
                data_point = {
                    actual_group_cols[0] if actual_group_cols else "category": str(row[actual_group_cols[0]]) if actual_group_cols else "Category",
                    "category": str(row[actual_group_cols[0]]) if actual_group_cols else "Category"
                }
                
                # Add each measure as a separate field
                for measure_info in multiple_measures:
                    measure_name = measure_info['name']
                    measure_col = measure_info['column']
                    
                    if measure_col in row.index:
                        y_value = row[measure_col]
                        if pd.api.types.is_numeric_dtype(grouped_result[measure_col]):
                            data_point[measure_name] = float(y_value) if pd.notna(y_value) else 0
                        else:
                            data_point[measure_name] = str(y_value) if pd.notna(y_value) else "Unknown"
                
                # Add additional grouping dimensions as labels if available
                if len(actual_group_cols) > 1:
                    data_point["label"] = " | ".join([str(row[col]) for col in actual_group_cols[1:]])
                
                chart_data.append(data_point)
            
            print(f"✅ Bar chart with multiple measures: {len(chart_data)} bars generated")
            
        else:
            # Single measure bar chart (existing logic)
            # Sort by measure value (descending) for better bar chart visualization
            sorted_result = grouped_result.sort_values(actual_measure, ascending=False)

            if len(actual_group_cols) > 1:
                # Legend field present - pivot so each unique legend value becomes its own bar series
                legend_field = actual_group_cols[1]
                pivot_data = {}
                legend_values = []

                for _, row in sorted_result.iterrows():
                    x_val = str(row[actual_group_cols[0]]) if actual_group_cols else "Category"
                    legend_val = str(row[legend_field])
                    y_val = row[actual_measure]
                    if pd.api.types.is_numeric_dtype(grouped_result[actual_measure]):
                        y_val = float(y_val) if pd.notna(y_val) else 0
                    else:
                        y_val = str(y_val) if pd.notna(y_val) else "Unknown"

                    if x_val not in pivot_data:
                        pivot_data[x_val] = {actual_group_cols[0]: x_val, "category": x_val}
                    pivot_data[x_val][legend_val] = y_val
                    if legend_val not in legend_values:
                        legend_values.append(legend_val)

                chart_data = list(pivot_data.values())
                chart_metadata = {
                    "legend_field": legend_field,
                    "legend_values": legend_values
                }
                print(f"✅ Bar chart with legend field '{legend_field}': {len(chart_data)} bars generated")
            else:
                for _, row in sorted_result.iterrows():
                    # Create bar chart data point
                    # Handle both numeric and categorical Y-axis values
                    y_value = row[actual_measure]
                    if pd.api.types.is_numeric_dtype(grouped_result[actual_measure]):
                        y_value = float(y_value) if pd.notna(y_value) else 0
                    else:
                        y_value = str(y_value) if pd.notna(y_value) else "Unknown"

                    data_point = {
                        actual_group_cols[0] if actual_group_cols else "category": str(row[actual_group_cols[0]]) if actual_group_cols else "Category",
                        actual_measure: y_value,
                        "category": str(row[actual_group_cols[0]]) if actual_group_cols else "Category"
                    }

                    # Add additional grouping dimensions as labels if available
                    if len(actual_group_cols) > 1:
                        data_point["label"] = " | ".join([str(row[col]) for col in actual_group_cols[1:]])

                    chart_data.append(data_point)

                print(f"✅ Bar chart: {len(chart_data)} bars generated")

    elif chart_type == "stacked_bar_chart":
        print(f"🔍 Backend: Processing STACKED BAR CHART branch")
        # Stacked bar chart specific processing
        chart_data = []
        
        # Check if we have multiple measures for stacked bars
        if len(multiple_measures) > 1:
            print(f"🔍 Backend: Generating stacked bar chart with multiple measures")
            
            # Sort by the first measure value (descending) for better stacked bar chart visualization
            first_measure_col = multiple_measures[0]['column']
            sorted_result = grouped_result.sort_values(first_measure_col, ascending=False)
            
            for _, row in sorted_result.iterrows():
                # Create stacked bar chart data point with actual field names
                data_point = {
                    "x": str(row[actual_group_cols[0]]) if actual_group_cols else "Category",
                    "category": str(row[actual_group_cols[0]]) if actual_group_cols else "Category"
                }
                
                # Add each measure as a separate field for stacking
                for measure_info in multiple_measures:
                    measure_name = measure_info['name']
                    measure_col = measure_info['column']
                    
                    if measure_col in row.index:
                        y_value = row[measure_col]
                        if pd.api.types.is_numeric_dtype(grouped_result[measure_col]):
                            data_point[measure_name] = float(y_value) if pd.notna(y_value) else 0
                        else:
                            data_point[measure_name] = str(y_value) if pd.notna(y_value) else "Unknown"
                
                # Add additional grouping dimensions as labels if available
                if len(actual_group_cols) > 1:
                    data_point["label"] = " | ".join([str(row[col]) for col in actual_group_cols[1:]])
                
                chart_data.append(data_point)
            
            print(f"✅ Stacked bar chart with multiple measures: {len(chart_data)} stacked bars generated")
            print(f"🔍 Backend: Sample stacked bar data structure:", chart_data[:2] if chart_data else "No data")
            print(f"🔍 Backend: Measure fields in data:", [key for key in chart_data[0].keys() if key not in ['x', 'category', 'label']] if chart_data else "No data")
            
        else:
            # Single measure stacked bar chart (same as regular bar chart but with stacking capability)
            # Sort by measure value (descending) for better stacked bar chart visualization
            sorted_result = grouped_result.sort_values(actual_measure, ascending=False)
            
            for _, row in sorted_result.iterrows():
                # Create stacked bar chart data point
                # Handle both numeric and categorical Y-axis values
                y_value = row[actual_measure]
                if pd.api.types.is_numeric_dtype(grouped_result[actual_measure]):
                    y_value = float(y_value) if pd.notna(y_value) else 0
                else:
                    y_value = str(y_value) if pd.notna(y_value) else "Unknown"
                
                data_point = {
                    "x": str(row[actual_group_cols[0]]) if actual_group_cols else "Category",
                    "y": y_value,
                    "category": str(row[actual_group_cols[0]]) if actual_group_cols else "Category"
                }
                
                # Add additional grouping dimensions as labels if available
                if len(actual_group_cols[1:]):
                    data_point["label"] = " | ".join([str(row[col]) for col in actual_group_cols[1:]])
                
                chart_data.append(data_point)
            
            print(f"✅ Stacked bar chart: {len(chart_data)} stacked bars generated")
            print(f"🔍 Backend: Sample stacked bar data:", chart_data[:2] if chart_data else "No data")

    elif chart_type == "pie_chart":
        print(f"🔍 Backend: Processing PIE CHART branch")
        # Pie chart specific processing
        chart_data = []
        
        # Check if we have multiple measures for dual Y-axes
        if len(multiple_measures) > 1:
            print(f"🔍 Backend: Generating pie chart with multiple measures for dual Y-axes")
            
            # Sort by the first measure value (descending) for better pie chart visualization
            first_measure_col = multiple_measures[0]['column']
            sorted_result = grouped_result.sort_values(first_measure_col, ascending=False)
            
            for _, row in sorted_result.iterrows():
                # Create pie chart data point with actual field names
                data_point = {
                    "label": str(row[actual_group_cols[0]]) if actual_group_cols else "Category",
                    "category": str(row[actual_group_cols[0]]) if actual_group_cols else "Category"
                }
                
                # Add each measure as a separate field
                for measure_info in multiple_measures:
                    measure_name = measure_info['name']
                    measure_col = measure_info['column']
                    
                    if measure_col in row.index:
                        value = row[measure_col]
                        if pd.api.types.is_numeric_dtype(grouped_result[measure_col]):
                            data_point[measure_name] = float(value) if pd.notna(value) else 0
                        else:
                            data_point[measure_name] = str(value) if pd.notna(value) else "Unknown"
                
                # Add additional grouping dimensions as labels if available
                if len(actual_group_cols) > 1:
                    data_point["full_label"] = " | ".join([str(row[col]) for col in actual_group_cols])
                
                chart_data.append(data_point)
            
            print(f"✅ Pie chart with multiple measures: {len(chart_data)} slices generated")
            
        else:
            # Single measure pie chart (existing logic)
            # Sort by measure value (descending) for better pie chart visualization
            sorted_result = grouped_result.sort_values(actual_measure, ascending=False)

            if len(actual_group_cols) > 1:
                # Legend field present - build separate pie data for each legend value
                legend_field = actual_group_cols[1]
                pie_data = {}
                legend_values = []

                for _, row in sorted_result.iterrows():
                    x_val = str(row[actual_group_cols[0]]) if actual_group_cols else "Category"
                    legend_val = str(row[legend_field])
                    y_val = row[actual_measure]
                    if pd.api.types.is_numeric_dtype(grouped_result[actual_measure]):
                        y_val = float(y_val) if pd.notna(y_val) else 0
                    else:
                        y_val = str(y_val) if pd.notna(y_val) else "Unknown"

                    if legend_val not in pie_data:
                        pie_data[legend_val] = []
                        legend_values.append(legend_val)
                    pie_data[legend_val].append({actual_group_cols[0]: x_val, actual_measure: y_val})

                chart_data = pie_data
                chart_metadata = {
                    "legend_field": legend_field,
                    "legend_values": legend_values
                }
                print(f"✅ Pie charts generated for legend field '{legend_field}' with {len(legend_values)} unique values")
            else:
                for _, row in sorted_result.iterrows():
                    # Create pie chart data point
                    # Handle both numeric and categorical Y-axis values
                    value = row[actual_measure]
                    if pd.api.types.is_numeric_dtype(grouped_result[actual_measure]):
                        value = float(value) if pd.notna(value) else 0
                    else:
                        value = str(value) if pd.notna(value) else "Unknown"

                    data_point = {
                        "label": str(row[actual_group_cols[0]]) if actual_group_cols else "Category",
                        "value": value,
                        "category": str(row[actual_group_cols[0]]) if actual_group_cols else "Category"
                    }

                    # Add additional grouping dimensions as labels if available
                    if len(actual_group_cols) > 1:
                        data_point["full_label"] = " | ".join([str(row[col]) for col in actual_group_cols])

                    chart_data.append(data_point)

                print(f"✅ Pie chart: {len(chart_data)} slices generated")

    else:
        print(f"🔍 Backend: Processing DEFAULT/ELSE branch for chart_type: {chart_type}")
        # Table format for other chart types
        chart_data = []
        
        # Check if we have multiple measures for dual Y-axes
        if len(multiple_measures) > 1:
            print(f"🔍 Backend: Generating table with multiple measures for dual Y-axes")
            
            for _, row in grouped_result.iterrows():
                data_point = {}
                
                # Add all grouping dimensions
                for col in actual_group_cols:
                    data_point[col.lower()] = str(row[col])
                
                # Add each measure value
                for measure_info in multiple_measures:
                    measure_name = measure_info['name']
                    measure_col = measure_info['column']
                    
                    if measure_col in row.index:
                        data_point[measure_name.lower()] = float(row[measure_col]) if pd.notna(row[measure_col]) else 0
                
                chart_data.append(data_point)
            
            print(f"✅ Table with multiple measures: {len(chart_data)} rows generated")
            
        else:
            # Single measure table (existing logic)
            for _, row in grouped_result.iterrows():
                data_point = {}
                
                # Add all grouping dimensions
                for col in actual_group_cols:
                    data_point[col.lower()] = str(row[col])
                
                # Add measure value
                data_point[primary_measure.lower()] = float(row[actual_measure]) if pd.notna(row[actual_measure]) else 0
                
                chart_data.append(data_point)
            
            print(f"✅ Table data: {len(chart_data)} rows (top 20)")
        
        # Sort by the first measure value (descending) and limit results
        if len(multiple_measures) > 1:
            first_measure_name = multiple_measures[0]['name'].lower()
            chart_data = sorted(chart_data, key=lambda x: x.get(first_measure_name, 0), reverse=True)[:20]
        else:
            chart_data = sorted(chart_data, key=lambda x: x[primary_measure.lower()], reverse=True)[:20]

    # Convert numpy types to Python types before returning
    def convert_numpy_types(obj):
        """Convert numpy types to native Python types for JSON serialization"""
        if isinstance(obj, dict):
            return {key: convert_numpy_types(value) for key, value in obj.items()}
        elif isinstance(obj, list):
            return [convert_numpy_types(item) for item in obj]
        elif hasattr(obj, 'item'):  # numpy scalar
            return obj.item()
        elif hasattr(obj, 'tolist'):  # numpy array
            return obj.tolist()
        else:
            return obj

    # Prepare data for saving and returning
    print(f"⏱️ Chart data generation completed at: {datetime.now()}")
    print(f"🔍 Debug: chart_data length: {len(chart_data) if chart_data else 0}")
    print(f"🔍 Debug: chart_data sample: {chart_data[:2] if chart_data else 'No data'}")
    converted_chart_data = convert_numpy_types(chart_data)
    print(f"🔍 Debug: converted_chart_data length: {len(converted_chart_data) if converted_chart_data else 0}")
    
    metadata = {
        "x_axis": x_axis,
        "weight_column": weight_column,
        "grouped_by": [str(col) for col in actual_group_cols],
        "measure": str(actual_measure),
        "aggregation": agg_type,
        "original_rows": int(len(df)),
        "filtered_rows": int(len(processed_df)),
        "grouped_combinations": int(len(grouped_result)),
        "filter_debug": convert_numpy_types(filter_debug),
        "chart_data_points": int(len(chart_data)),
        "chart_type": chart_type,
        "operations": operations,
        "multiple_measures": len(multiple_measures) > 1,
        "measure_count": len(multiple_measures),
        "measure_names": [measure_info['name'] for measure_info in multiple_measures] if len(multiple_measures) > 1 else [primary_measure]
    }
    
    # Add chart metadata if it exists (for legend-based charts)
    if 'chart_metadata' in locals():
        metadata.update(chart_metadata)
    
    # Save chart result to MongoDB
    save_result = save_chart_result_to_mongo(
        explore_atom_id=explore_atom_id,
        chart_data=converted_chart_data,
        metadata=metadata
    )

    # Transform chart data to a Recharts-friendly structure
    # Recharts expects a simple array of objects format
    if chart_type == "line_chart":
        # Line chart data: Preserve original field names instead of converting to generic keys
        # This ensures consistency with bar charts and other chart types
        recharts_data = []
        for item in converted_chart_data:
            if isinstance(item, dict):
                # Keep the original structure with actual field names
                recharts_data.append(item)
            else:
                # If it's not a dict, use it as is
                recharts_data.append(item)
    elif chart_type == "bar_chart":
        # Bar chart data: Handle both single and dual Y-axes
        recharts_data = []
        for item in converted_chart_data:
            if isinstance(item, dict):
                # Check if this is dual Y-axes data (has actual measure names as fields)
                if len(multiple_measures) > 1:
                    # Dual Y-axes: Keep the original structure with actual field names
                    recharts_data.append(item)
                else:
                    # Single Y-axis: Preserve original field names instead of converting to generic keys
                    # This fixes the issue where 'Year'/'Volume' was being converted to 'name'/'value'
                    recharts_data.append(item)  # Keep the original structure with actual field names
            else:
                recharts_data.append(item)
    elif chart_type == "stacked_bar_chart":
        # Stacked bar chart data: Handle both single and dual Y-axes
        print(f"🔍 Backend: Processing stacked bar chart Recharts data transformation")
        print(f"🔍 Backend: multiple_measures count: {len(multiple_measures)}")
        print(f"🔍 Backend: Sample converted_chart_data:", converted_chart_data[:2] if converted_chart_data else "No data")
        
        recharts_data = []
        for item in converted_chart_data:
            if isinstance(item, dict):
                # Check if this is dual Y-axes data (has actual measure names as fields)
                if len(multiple_measures) > 1:
                    # Dual Y-axes: Keep the original structure with actual field names for stacking
                    recharts_data.append(item)
                else:
                    # Single Y-axis: Preserve original field names for stacked bar charts
                    # This fixes the issue where original field names were being converted to generic keys
                    recharts_data.append(item)  # Keep the original structure with actual field names
            else:
                recharts_data.append(item)
        
        print(f"🔍 Backend: Final recharts_data for stacked bar:", recharts_data[:2] if recharts_data else "No data")
    elif chart_type == "pie_chart":
        # Pie chart data: Handle both single and dual Y-axes and legend-based multiple pies
        if isinstance(converted_chart_data, dict):
            # Data already structured by legend value -> list of slices
            recharts_data = converted_chart_data
        else:
            recharts_data = []
            for item in converted_chart_data:
                if isinstance(item, dict):
                    # Check if this is dual Y-axes data (has actual measure names as fields)
                    if len(multiple_measures) > 1:
                        # Dual Y-axes: Keep the original structure with actual field names
                        recharts_data.append(item)
                    else:
                        # Single Y-axis: Preserve original field names for pie charts
                        # This fixes the issue where original field names were being converted to generic keys
                        recharts_data.append(item)  # Keep the original structure with actual field names
                else:
                    recharts_data.append(item)
    else:
        # For other chart types, use the data as is
        recharts_data = converted_chart_data

    # Enhanced return statement with cache and MongoDB info
    return {
        "status": "success",
        "explore_atom_id": explore_atom_id,
        "chart_type": chart_type,
        "data": recharts_data,
        "metadata": metadata,
        "cache_info": {
            "redis_enabled": get_redis_client() is not None,
            "cache_hit": cache_hit,
            "cache_key": cache_key,
            "redis_host": "10.2.1.65:9002"
        },
        "saved_to_mongodb": save_result["status"] == "success",
        "chart_result_id": save_result.get("chart_result_id", ""),
        "mongo_save_message": save_result.get("message", "")
    }

#   New endpoint: fetch min / max date in a CSV object for frontend controls
# -----------------------------------------------------------------------------

@router.get("/date-range")
async def date_range(
    object_name: Optional[str] = Query(None, description="Full MinIO object path e.g. qmmqq/sales/myfile.arrow"),
    file_key: Optional[str] = Query(None, description="Alias for object_name used by older frontend builds"),
    date_column: Optional[str] = Query(None, description="Name of the date column to analyse (optional)")
):
    """Return ISO-formatted min & max dates for a dataset.

    If *date_column* is not supplied, the API will attempt to automatically
    detect the first column that can successfully be parsed as a date.
    """
    from urllib.parse import unquote
    import pandas as pd

    # ------------------------------------------------------------------
    # Decode params & fetch object from MinIO
    # ------------------------------------------------------------------
    object_name = unquote(object_name)
    print(f"🔍 [date_range] object_name={object_name}, date_column={date_column}")

    if not object_name.endswith(".arrow"):
        raise HTTPException(status_code=400, detail="Only Apache Arrow files are currently supported")

    try:
        content = minio_client.get_object(MINIO_BUCKET, object_name).read()
    except S3Error as e:
        error_code = getattr(e, "code", "")
        if error_code in {"NoSuchKey", "NoSuchBucket"}:
            raise HTTPException(status_code=404, detail="File not found")
        raise HTTPException(status_code=500, detail=str(e))

    reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
    df = reader.read_all().to_pandas()
    df.columns = df.columns.str.lower()

    # ------------------------------------------------------------------
    # Detect suitable date column
    # ------------------------------------------------------------------
    search_order = []
    if date_column:
        search_order.append(date_column.lower())
    # common synonyms added to search path
    search_order.extend(["date", "caldate", "period", "timestamp", "time", "day"])

    # deduplicate while preserving order
    seen = set()
    search_order = [c for c in search_order if not (c in seen or seen.add(c))]

    chosen_col = None
    parsed_series = None

    for col in search_order + list(df.columns):
        if col in df.columns:
            candidate = pd.to_datetime(df[col], errors="coerce").dropna()
            if not candidate.empty:
                chosen_col = col
                parsed_series = candidate
                break

    if parsed_series is None or parsed_series.empty:
        raise HTTPException(status_code=400, detail="No valid date column found in file")

    # ------------------------------------------------------------------
    # Build success response
    # ------------------------------------------------------------------
    return {
        "status": "success",
        "bucket": MINIO_BUCKET,
        "file_key": object_name,
        "date_column": chosen_col,
        "min_date": parsed_series.min().isoformat(),
        "max_date": parsed_series.max().isoformat(),
        "row_count": int(len(df))
    }


# Removed unused endpoint: /redis-health


# Removed unused endpoint: /cached_dataframe


# Removed unused endpoint: /list_saved_dataframes


# Removed unused endpoint: /test-columns


# Removed unused endpoint: /test-date-column


# Removed unused endpoint: /chart-ready-data/{file_key}