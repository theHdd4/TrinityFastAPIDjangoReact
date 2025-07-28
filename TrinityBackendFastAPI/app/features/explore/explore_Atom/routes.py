# routes.py - Explore Atom Routes - Complete Implementation
from fastapi import APIRouter, HTTPException, Form
# ✅ Add this import:
# UPDATE your existing import from database to include the new functions:
from app.features.explore.explore_Atom.database import (
    get_dimensions_from_mongo,
    get_measures_from_mongo,
    save_explore_atom_to_mongo,
    get_explore_atom_from_mongo,
    update_explore_atom_in_mongo,
    list_saved_explore_atoms,
    test_database_connections,
    save_chart_result_to_mongo,           # ✅ ADD THIS
    get_chart_result_from_mongo,          # ✅ ADD THIS
    get_latest_chart_results_for_atom     # ✅ ADD THIS
)

from app.features.explore.explore_Atom.redis_config import get_redis_client, test_redis_connection, REDIS_HOST, REDIS_PORT
import json
import hashlib
import io

from typing import Dict, Any, Optional
import json
from datetime import datetime

# Create router
router = APIRouter()



# Global storage for explore atom configurations (in-memory backup)
explore_atoms = {}




@router.get("/")
async def explore_root():
    """Root endpoint for Explore Atom"""
    return {
        "message": "Explore Atom API Active",
        "system": "explore_atom",
        "version": "1.0.0",
        "status": "operational",
        "architecture": "dual_database_setup",
        "working_endpoints": [
            "GET /explore/get-dimensions-and-identifiers/{validator_atom_id} - Get available dimensions ✅",
            "GET /explore/get-measures/{validator_atom_id} - Get available measures ✅", 
            "POST /explore/select-dimensions-and-measures - Select dimensions & measures ✅",
            "POST /explore/specify-operations - Define data operations ✅",
            "GET /explore/chart-data-multidim/{explore_atom_id} - Get processed chart data ✅",
            "GET /explore/test-connection - Test database connectivity ✅",
            "GET /explore/list-saved-atoms - List all saved explore atoms ✅"
        ],
        "features": [
            "Multi-dimensional data grouping",
            "Weighted average calculations", 
            "Multiple chart types (line, bar, pie, table)",
            "Case-insensitive column matching",
            "Real-time data processing"
        ]
    }



@router.get("/get-dimensions-and-identifiers/{validator_atom_id}")
async def get_dimensions_and_identifiers(validator_atom_id: str):
    """
    Get all business dimensions with assignments from SOURCE database (validator_atoms_db)
    """
    result = get_dimensions_from_mongo(validator_atom_id)
    
    if result["status"] == "error":
        raise HTTPException(status_code=404, detail=result["message"])
    
    return result


@router.get("/get-measures/{validator_atom_id}")
async def get_measures(validator_atom_id: str):
    """
    Get column classifications from SOURCE database (validator_atoms_db) to get available measures
    """
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



@router.get("/test-connection")
async def test_connection():
    """Test both database connections"""
    result = test_database_connections()
    
    if result["status"] == "error":
        raise HTTPException(status_code=500, detail=result["message"])
    
    return result


@router.get("/list-saved-atoms")
async def list_saved_atoms():
    """List all saved explore atoms from destination database"""
    result = list_saved_explore_atoms()
    
    if result["status"] == "error":
        raise HTTPException(status_code=500, detail=result["message"])
    
    return result




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
    valid_chart_types = ["bar_chart", "line_chart", "pie_chart", "table"]
    if ops["chart_type"] not in valid_chart_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid chart_type '{ops['chart_type']}'. Valid options: {valid_chart_types}"
        )
    
    # Validate aggregations
    valid_aggregations = ["sum", "avg", "count", "min", "max", "weighted_avg"]
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
                detail="'x_axis' is required for line_chart type"
            )
        
        x_axis = ops["x_axis"]
        if x_axis not in ops["group_by"]:
            raise HTTPException(
                status_code=400,
                detail=f"'x_axis' value '{x_axis}' must be in 'group_by' list: {ops['group_by']}"
            )
        
        print(f"✅ Line chart validation passed: x_axis='{x_axis}'")
    
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

@router.get("/minio-files")
async def list_minio_files(
    collection_path: str = Query(default="qmmqq/sales/", description="Path in the bucket"),
    bucket_name: str = Query(default="validated-d1", description="MinIO bucket name")
):
    """
    List files in a MinIO collection
    """
    try:
        from minio import Minio
        
        # Initialize MinIO client
        minio_client = Minio(
            "10.2.1.65:9003",
            access_key="minio",
            secret_key="minio123",
            secure=False
        )
        
        # List objects
        objects = minio_client.list_objects(
            bucket_name,
            prefix=collection_path,
            recursive=True
        )
        
        # Collect file information
        files = []
        for obj in objects:
            if not obj.object_name.endswith('/'):  # Skip directories
                files.append({
                    "file_name": obj.object_name.split('/')[-1],
                    "full_path": obj.object_name,
                    "size": obj.size,
                    "last_modified": obj.last_modified.isoformat()
                })
        
        return {
            "status": "success",
            "bucket": bucket_name,
            "collection_path": collection_path,
            "file_count": len(files),
            "files": files
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list MinIO files: {str(e)}"
        )




@router.get("/chart-data-multidim/{explore_atom_id}")
async def chart_data_multidim(explore_atom_id: str):
    """
    Multi-dimensional grouping with dynamic x-axis selection and weighted average support
    NOW WITH REDIS CACHING AND MONGODB STORAGE
    """
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
    group_by = operations.get("group_by", [])
    filters = operations.get("filters", {})
    measures_config = operations.get("measures_config", {})
    x_axis = operations.get("x_axis", group_by[0] if group_by else None)
    weight_column = operations.get("weight_column", None)
    
    # Smart caching function
    def fetch_data_with_redis_cache(explore_atom_id: str, operations: dict):
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
                cached_csv = redis_client.get(cache_key)
                if cached_csv:
                    # Cache hit - load from Redis
                    df = pd.read_csv(io.BytesIO(cached_csv))
                    print(f"⚡ CACHE HIT: Data from Redis cache: {df.shape[0]} rows")
                    return df, True, cache_key  # df, cache_hit, cache_key
            except Exception as e:
                print(f"⚠️ Redis cache read error: {e}")
        
        # Step 3: Cache miss - fetch from MinIO
        print(f"📁 CACHE MISS: Fetching from MinIO...")
        try:
            from minio import Minio
            
            minio_client = Minio(
                "10.2.1.65:9003",
                access_key="minio",
                secret_key="minio123",
                secure=False
            )
            
            bucket_name = "validated-d1"
            object_name = "qmmqq/sales/20250605_115309_updated_dataset_with_base_price (14).csv"
            
            obj = minio_client.get_object(bucket_name, object_name)
            csv_bytes = obj.read()
            obj.close()
            
            # Step 4: Cache the result in Redis
            if redis_client:
                try:
                    redis_client.setex(cache_key, 1800, csv_bytes)  # Cache for 30 minutes
                    print(f"💾 Cached CSV data in Redis for 30 minutes")
                except Exception as e:
                    print(f"⚠️ Redis cache write error: {e}")
            
            # Step 5: Load into DataFrame
            df = pd.read_csv(io.BytesIO(csv_bytes))
            print(f"📁 CACHE MISS: Data from MinIO: {df.shape[0]} rows")
            return df, False, cache_key  # df, cache_hit, cache_key
            
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to fetch data: {str(e)}")

    # Fetch data with smart caching
    try:
        import pandas as pd
        
        # Smart caching with Redis
        df, cache_hit, cache_key = fetch_data_with_redis_cache(explore_atom_id, operations)
        
        print(f"✅ Data loaded: {df.shape[0]} rows, {df.shape[1]} columns")
        print(f"📊 Cache status: {'HIT' if cache_hit else 'MISS'}")
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch data: {str(e)}")
    
    # Case-insensitive column matching
    def find_column(search_name, available_columns):
        search_lower = search_name.lower()
        for col in available_columns:
            if col.lower() == search_lower:
                return col
        return None
    
    # Apply filters with smart matching
    processed_df = df.copy()
    filter_debug = {}
    
    for filter_key, filter_value in filters.items():
        actual_column = find_column(filter_key, df.columns)
        if actual_column:
            # Smart value matching (case insensitive)
            unique_values = processed_df[actual_column].unique()
            matched_value = None
            
            for val in unique_values:
                if str(val).lower() == filter_value.lower():
                    matched_value = val
                    break
            
            if matched_value:
                original_count = len(processed_df)
                processed_df = processed_df[processed_df[actual_column] == matched_value]
                filter_debug[filter_key] = {
                    "matched_value": matched_value,
                    "rows_before": original_count,
                    "rows_after": len(processed_df)
                }
                print(f"✅ Filter applied: {actual_column}={matched_value}, rows: {original_count} → {len(processed_df)}")
            else:
                filter_debug[filter_key] = {
                    "status": "no_match_found",
                    "available_values": unique_values[:5].tolist()
                }
                print(f"❌ No match for {filter_value} in {actual_column}")
        else:
            filter_debug[filter_key] = {"status": "column_not_found"}
    
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

    # Get measure column
    primary_measure = list(measures_config.keys())[0] if measures_config else "Volume"
    actual_measure = find_column(primary_measure, df.columns)
    
    if not actual_measure:
        raise HTTPException(status_code=400, detail=f"Measure column '{primary_measure}' not found")

    # Enhanced Group and aggregate with weighted average support
    agg_type = measures_config.get(primary_measure, "sum")
    
    # Data type validation and cleaning
    try:
        # Ensure measure column is numeric
        processed_df[actual_measure] = pd.to_numeric(processed_df[actual_measure], errors='coerce')
        
        # If using weighted average, ensure weight column is numeric
        actual_weight = None
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
            # Weighted average implementation
            def weighted_avg_func(group):
                numerator = (group[actual_measure] * group[actual_weight]).sum()
                denominator = group[actual_weight].sum()
                return numerator / denominator if denominator != 0 else 0
            
            # Apply weighted average calculation
            grouped_result = processed_df.groupby(actual_group_cols).apply(weighted_avg_func).reset_index()
            grouped_result.columns = actual_group_cols + [actual_measure]
            
            print(f"✅ Weighted average calculated using {actual_weight} as weight")
        
        else:
            # Default to sum
            grouped_result = processed_df.groupby(actual_group_cols)[actual_measure].sum().reset_index()
        
        print(f"✅ Aggregation ({agg_type}): {len(grouped_result)} combinations")
        
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
        
        for line_name in grouped_result['line_id'].unique():
            line_data = grouped_result[grouped_result['line_id'] == line_name].sort_values(actual_x_axis)
            
            chart_data.append({
                "x": line_data[actual_x_axis].tolist(),
                "y": line_data[actual_measure].tolist(),
                "name": line_name,
                "type": "scatter",
                "mode": "lines+markers"
            })
        
        print(f"✅ Line chart: {len(chart_data)} lines generated")

    else:
        # Table format
        chart_data = []
        
        for _, row in grouped_result.iterrows():
            data_point = {}
            
            # Add all grouping dimensions
            for col in actual_group_cols:
                data_point[col.lower()] = str(row[col])
            
            # Add measure value
            data_point[primary_measure.lower()] = float(row[actual_measure]) if pd.notna(row[actual_measure]) else 0
            
            chart_data.append(data_point)
        
        # Sort by measure value (descending) and limit results
        chart_data = sorted(chart_data, key=lambda x: x[primary_measure.lower()], reverse=True)[:20]
        
        print(f"✅ Table data: {len(chart_data)} rows (top 20)")

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
    converted_chart_data = convert_numpy_types(chart_data)
    
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
        "operations": operations
    }
    
    # Save chart result to MongoDB
    save_result = save_chart_result_to_mongo(
        explore_atom_id=explore_atom_id,
        chart_data=converted_chart_data,
        metadata=metadata
    )

    # Enhanced return statement with cache and MongoDB info
    return {
        "status": "success",
        "explore_atom_id": explore_atom_id,
        "chart_type": chart_type,
        "data": converted_chart_data,
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




@router.get("/redis-health")
async def redis_health_check():
    """Check Redis connection health"""
    result = test_redis_connection()
    
    if result["status"] == "error":
        raise HTTPException(status_code=503, detail=result)
    
    return result
