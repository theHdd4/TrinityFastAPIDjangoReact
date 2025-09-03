from fastapi import APIRouter, HTTPException, Query, Body, Request
from typing import List, Optional
import datetime
import time
import pandas as pd
import io
import os
from minio.error import S3Error
from .database import (
    column_coll, 
    cluster_coll,
    save_clustering_config,
    save_clustering_results,
    save_clustering_metadata,
    get_clustering_config_from_mongo,
    get_clustering_results_from_mongo,
    get_clustering_metadata_from_mongo
)
from .schemas import (
    FilterPayload, 
    ClusteringRequest, 
    BucketCheckResponse,
    FilterAndClusterRequest,
    FilterAndClusterResponse,
    ClusterStats
)
from .clustering_logic import (
    get_minio_client,
    check_bucket_and_file,
    load_csv_from_minio, 
    cluster_dataframe, 
    cluster_dataframe_with_auto_save,
    parse_minio_path,
    apply_identifier_filters,
    apply_measure_filters,
    calculate_cluster_stats,
    get_unique_values, 
    get_output_dataframe, 
    get_object_prefix,
    auto_save_clustering_data
)
from .config import settings
from fastapi.responses import StreamingResponse
import uuid
import pyarrow as pa
import pyarrow.ipc as ipc
import json

router = APIRouter()

@router.get("/")
async def root():
    """Root endpoint for clustering backend."""
    return {
        "message": "Clustering backend is running", 
        "endpoints": [
            "/ping", 
            "/test", 
            "/available-dates", 
            "/debug-columns", 
            "/filter-and-cluster", 
            "/unique_values", 
            "/export_csv", 
            "/export_excel", 
            "/save", 
            "/rename",
            "/save_clustering_config",
            "/save_clustering_results",
            "/save_clustering_metadata",
            "/save-config-mongo",
            "/save-results-mongo", 
            "/save-metadata-mongo",
            "/get-config-mongo",
            "/get-results-mongo",
            "/get-metadata-mongo",
            "/test-mongo",
            "/test-auto-save"
        ]
    }

@router.get("/ping")
async def ping():
    """Health check endpoint for clustering backend."""
    return {"msg": "Clustering backend is alive"}

@router.post("/test")
async def test_endpoint(request: dict = Body(...)):
    """Test endpoint to verify request handling."""
    return {
        "message": "Test endpoint working",
        "received_data": request,
        "timestamp": datetime.datetime.now().isoformat()
    }

# # ── 1. Check if file exists in MinIO ─────────────────────────────────────
# @router.get("/check-file/{file_path:path}")
# async def check_file(file_path: str) -> BucketCheckResponse:
#     """Check if a file exists in MinIO"""
#     result = await check_bucket_and_file(file_path)
#     return BucketCheckResponse(**result)

# # ── 2. Fetch available identifiers/measures ──────────────────────────────
# @router.get("/columns/{validator_atom_id}")
# async def get_final_columns(validator_atom_id: str):
#     """Get final classification columns for a validator atom"""
#     doc = await column_coll.find_one({"validator_atom_id": validator_atom_id})
#     if not doc:
#         raise HTTPException(404, "validator_atom not found")
#     return {
#         "identifiers": doc["final_classification"]["identifiers"],
#         "measures": doc["final_classification"]["measures"]
#     }

# ── 2.1. Fetch available dates from data file ────────────────────────────
@router.get("/available-dates")
async def get_available_dates(object_name: str = Query(..., description="Name of the data file")):
    """Get available dates from the data file for date range selection"""
    try:
        df = await load_csv_from_minio(object_name)
        lower_cols = {col.lower(): col for col in df.columns}
        possible_names = ["date"]

        found_date_col = next((lower_cols[name] for name in possible_names if name in lower_cols), None)

        if not found_date_col:
            return {
                "date_column": None,
                "date_values": [],
                "min_date": None,
                "max_date": None
            }

        df[found_date_col] = pd.to_datetime(df[found_date_col], errors="coerce")
        unique_dates = df[found_date_col].dropna().dt.date.unique()
        unique_dates = sorted(unique_dates)

        date_values = [d.strftime("%Y-%m-%d") for d in unique_dates]

        return {
            "date_column": found_date_col,
            "date_values": date_values,
            "min_date": date_values[0] if date_values else None,
            "max_date": date_values[-1] if date_values else None
        }

    except Exception as e:
        print(f"Error fetching available dates: {e}")
    return {
            "date_column": None,
            "date_values": [],
            "min_date": None,
            "max_date": None
        }

# ── 2.2. Debug endpoint to see what columns exist ────────────────────────────
@router.get("/debug-columns")
async def debug_columns(object_name: str = Query(..., description="Name of the data file")):
    """Debug endpoint to see what columns are actually in the data file"""
    try:
        df = await load_csv_from_minio(object_name)
        return {
            "total_columns": len(df.columns),
            "columns": df.columns.tolist(),
            "data_shape": df.shape,
            "sample_data": df.head(2).to_dict(orient="records")
        }
    except Exception as e:
        print(f"Error debugging columns: {e}")
        return {"error": str(e)}

# # ── 3. Filter data from MinIO file ───────────────────────────────────────
# @router.post("/filter")
# async def filter_data(payload: FilterPayload):
#     """Filter data from MinIO file by selected columns"""
#     # Load data
#     df = await load_csv_from_minio(payload.file_path)
#     original_rows = len(df)
    
#     # Apply identifier filters
#     if payload.identifier_filters:
#         df = apply_identifier_filters(df, payload.identifier_filters)
    
#     # Apply measure filters
#     if payload.measure_filters:
#         df = apply_measure_filters(df, payload.measure_filters)
    
#     # Select columns
#     cols = (payload.identifier_columns or []) + (payload.measure_columns or [])
#     if cols:
#         missing_cols = [c for c in cols if c not in df.columns]
#         if missing_cols:
#             raise HTTPException(400, f"Columns not found: {missing_cols}")
#         df = df[cols]
    
#     return {
#         "file_path": payload.file_path,
#         "original_rows": original_rows,
#         "filtered_rows": len(df),
#         "columns": list(df.columns),
#         "data": df.head(payload.limit).to_dict(orient="records")
#     }

# # ── 4. Run clustering and save results ───────────────────────────────────
# @router.post("/cluster")
# async def run_clustering(req: ClusteringRequest):
#     """Run clustering algorithm on data and save results"""
#     check = await check_bucket_and_file(req.file_path)
#     if not check["exists"]:
#         raise HTTPException(404, check["message"])
    
#     df = await load_csv_from_minio(req.file_path)
#     labels = cluster_dataframe(df, req)
#     output_path = save_clusters_to_minio(df, labels, req.file_path)
    
#     record = {
#         "input_path": req.file_path,
#         "output_path": output_path,
#         "algorithm": req.algorithm,
#         "params": req.model_dump(exclude={"file_path"}),
#         "n_clusters_found": len(set(labels)) - (1 if -1 in labels else 0),
#         "timestamp": datetime.datetime.utcnow()
#     }
#     result = await cluster_coll.insert_one(record)
    
#     return {
#         "cluster_result_id": str(result.inserted_id),
#         "input_path": req.file_path,
#         "output_path": output_path,
#         "n_clusters": record["n_clusters_found"],
#         "message": "Clustering completed successfully"
#     }



# ── 6. List objects in a bucket ──────────────────────────────────────────
@router.get("/bucket/{bucket_name}/objects")
async def list_bucket_objects(
    bucket_name: str, 
    prefix: str = Query("", description="Filter objects by prefix"),
    limit: int = Query(100, description="Maximum number of objects to return")
):
    """List objects in a specific bucket"""
    if not get_minio_client().bucket_exists(bucket_name):
        raise HTTPException(404, f"Bucket '{bucket_name}' not found")
    
    objects = []
    count = 0
    
    for obj in get_minio_client().list_objects(bucket_name, prefix=prefix, recursive=True):
        if count >= limit:
            break
        objects.append({
            "name": obj.object_name,
            "size": obj.size,
            "last_modified": obj.last_modified.isoformat(),
            "path": f"{bucket_name}/{obj.object_name}"
        })
        count += 1
    
    return {
        "bucket": bucket_name,
        "prefix": prefix,
        "count": len(objects),
        "objects": objects
    }

@router.post("/filter-and-cluster", response_model=FilterAndClusterResponse)
async def filter_and_cluster(request: FilterAndClusterRequest):
    start_time = time.time()

    # ===== REQUEST LOGGING =====
    print("🔍 ===== CLUSTERING REQUEST RECEIVED =====")
    print(f"📅 Timestamp: {datetime.datetime.utcnow()}")
    print(f"📁 File Path: {request.file_path}")
    print(f"🔢 Algorithm: {request.algorithm}")
    print(f"📊 N Clusters: {request.n_clusters}")
    print(f"🎯 Identifier Columns: {request.identifier_columns}")
    print(f"📈 Measure Columns: {request.measure_columns}")
    print(f"🔍 Identifier Filters: {request.identifier_filters}")
    print(f"📏 Measure Filters: {request.measure_filters}")
    print(f"📅 Date Range: {request.date_range}")
    print(f"👁️ Include Preview: {request.include_preview}")
    print(f"📋 Preview Limit: {request.preview_limit}")

    try:
        # Validate request against schema
        validated_request = FilterAndClusterRequest(**request.model_dump())
        print("✅ Request validation: PASSED - Schema validation successful")

        df = await load_csv_from_minio(request.file_path)
        original_rows = len(df)
        
        # Validate that the dataframe has data
        if df.empty:
            error_msg = "The loaded dataset is empty. Please check your data source."
            raise HTTPException(400, error_msg)
        
        print(f"✅ Data loaded successfully: {df.shape[0]} rows, {df.shape[1]} columns")
        print(f"🔍 Available columns: {list(df.columns)}")
        
        # Apply date range filter if provided
        if request.date_range and request.date_range.column and request.date_range.from_date and request.date_range.to_date:
            try:
                # Convert string dates to datetime objects
                from_date = pd.to_datetime(request.date_range.from_date)
                to_date = pd.to_datetime(request.date_range.to_date)
                
                print(f"🔍 Converted dates - from_date: {from_date}, to_date: {to_date}")
                
                # Check if the date column exists in the dataframe
                if request.date_range.column not in df.columns:
                    error_msg = f"Date column '{request.date_range.column}' not found in data. Available columns: {list(df.columns)}"
                    raise HTTPException(400, error_msg)
                
                # Convert the column to datetime for comparison
                df[request.date_range.column] = pd.to_datetime(df[request.date_range.column], errors='coerce')
                
                # Apply the date range filter
                df = df[(df[request.date_range.column] >= from_date) & (df[request.date_range.column] <= to_date)]
                
                print(f"✅ Date range filter applied: {len(df)} rows remaining")
                
            except Exception as e:
                error_msg = f"Error applying date range filter: {str(e)}"
                print(f"❌ Date range filter error: {error_msg}")
                raise HTTPException(400, error_msg)
        else:
            print("ℹ️ No date range filter provided - clustering will proceed without date filtering")
            print(f"ℹ️ Dataset shape after loading: {df.shape[0]} rows, {df.shape[1]} columns")


            
        # First, select the columns we want to work with
        columns_to_include = []
        if request.identifier_columns:
            columns_to_include.extend(request.identifier_columns)
        if request.measure_columns:
            columns_to_include.extend(request.measure_columns)

        if columns_to_include:
            actual_columns = []
            for col in columns_to_include:
                found_col = None
                for actual_col in df.columns:
                    if actual_col.lower() == col.lower():
                        found_col = actual_col
                        break
                if found_col:
                    actual_columns.append(found_col)
                else:
                    print(f"DEBUG: Column '{col}' not found in data")

            missing_cols = [c for c in columns_to_include if c.lower() not in [col.lower() for col in df.columns]]
            if missing_cols:
                error_msg = f"Columns not found in data: {missing_cols}"
                raise HTTPException(400, error_msg)

            # Select only the columns we need BEFORE applying filters
            df = df[actual_columns]
            print(f"🔍 Selected columns: {df.columns.tolist()}")

        # Now apply filters on the selected columns
        filters_applied = {
            "identifier_filters": [f.dict() for f in request.identifier_filters] if request.identifier_filters else [],
            "measure_filters": [f.dict() for f in request.measure_filters] if request.measure_filters else [],
            "columns_selected": {
                "identifiers": request.identifier_columns or [],
                "measures": request.measure_columns or []
            }
        }

        # Apply identifier filters
        if request.identifier_filters:
            print(f"🔍 Applying identifier filters: {request.identifier_filters}")
            print(f"🔍 Available columns in dataframe: {df.columns.tolist()}")
            df_before_filter = len(df)
            df = apply_identifier_filters(df, request.identifier_filters)
            df_after_filter = len(df)
            print(f"✅ Identifier filtering: {df_before_filter} → {df_after_filter} rows")
            
            # Debug: Show sample data after filtering
            if df_after_filter > 0:
                print(f"🔍 Sample data after identifier filtering:")
                print(df.head(3).to_dict(orient="records"))

        # Apply measure filters
        if request.measure_filters:
            print(f"🔍 Applying measure filters: {request.measure_filters}")
            df_before_filter = len(df)
            df = apply_measure_filters(df, request.measure_filters)
            df_after_filter = len(df)
            print(f"✅ Measure filtering: {df_before_filter} → {df_after_filter} rows")
            
            # Debug: Show sample data after filtering
            if df_after_filter > 0:
                print(f"🔍 Sample data after measure filtering:")
                print(df.head(3).to_dict(orient="records"))

        filtered_rows = len(df)

        if filtered_rows < 2:
            error_msg = f"Need at least 2 rows for clustering, but got {filtered_rows} after filtering. Please adjust your filters to include more data."
            print(f"❌ Clustering Error: {error_msg}")
            raise HTTPException(400, error_msg)

        numeric_cols = df.select_dtypes(include=['number']).columns.tolist()
        if not numeric_cols:
            error_msg = "No numeric columns found in the filtered data. Clustering requires at least one numeric column."
            print(f"❌ Clustering Error: {error_msg}")
            raise HTTPException(400, error_msg)

        print(f"📊 Data Processing Summary:")
        print(f"   📈 Original Rows: {original_rows}")
        print(f"   🔍 Filtered Rows: {filtered_rows}")
        print(f"   📋 Columns Used: {df.columns.tolist()}")
        print(f"   🔢 Numeric Columns: {numeric_cols}")

        # No automatic saving - data will only be saved when user presses Save DataFrame button
        print("🔍 Running clustering algorithm...")
        print(f"🔍 Algorithm: {request.algorithm}")
        print(f"🔍 K-selection method: {request.k_selection}")
        if request.k_selection == 'manual':
            print(f"🔍 Manual clusters: {request.n_clusters}")
        else:
            print(f"🔍 Auto-K range: {request.k_min} to {request.k_max}")
            if request.k_selection == 'gap':
                print(f"🔍 Gap statistic bootstrap samples: {request.gap_b}")
        print(f"🔍 Legacy use_elbow: {request.use_elbow}")
        
        try:
            # Auto-save clustering configuration before running algorithm
            config_data = {
                "algorithm": request.algorithm,
                "k_selection": request.k_selection,
                "n_clusters": request.n_clusters,
                "k_min": request.k_min,
                "k_max": request.k_max,
                "eps": request.eps,
                "min_samples": request.min_samples,
                "linkage": request.linkage,
                "threshold": request.threshold,
                "covariance_type": request.covariance_type,
                "random_state": request.random_state,
                "n_init": request.n_init,
                "identifier_columns": request.identifier_columns,
                "measure_columns": request.measure_columns,
                "filters_applied": filters_applied,
                "file_path": request.file_path,
                "timestamp": datetime.datetime.utcnow().isoformat()
            }
            
            # Get environment variables for auto-save
            client_name = os.getenv("CLIENT_NAME", "default_client")
            app_name = os.getenv("APP_NAME", "default_app")
            project_name = os.getenv("PROJECT_NAME", "default_project")
            user_id = os.getenv("USER_ID", "")
            
            # Handle PROJECT_ID - it should be a numeric ID, not a string
            # If PROJECT_ID is set to a string like "New Forecasting Analysis Project 2_10",
            # that should actually be PROJECT_NAME, not PROJECT_ID
            project_id_env = os.getenv("PROJECT_ID")
            if project_id_env and project_id_env.isdigit():
                project_id = int(project_id_env)
            else:
                # If PROJECT_ID is not a valid number, it might be a project name
                # In that case, use it as project_name and set project_id to None
                if project_id_env and not project_id_env.isdigit():
                    print(f"⚠️ Warning: PROJECT_ID environment variable contains non-numeric value: '{project_id_env}'")
                    print(f"⚠️ This should probably be PROJECT_NAME instead of PROJECT_ID")
                    print(f"⚠️ Setting project_id to None and using '{project_id_env}' as project_name")
                    project_name = project_id_env
                project_id = None
            
            # Auto-save configuration
            await auto_save_clustering_data(
                client_name=client_name,
                app_name=app_name,
                project_name=project_name,
                operation_type="config",
                clustering_data=config_data,
                user_id=user_id,
                project_id=project_id
            )
            
            # Run clustering with auto-save
            labels = await cluster_dataframe_with_auto_save(
                df, 
                request, 
                client_name=client_name,
                app_name=app_name,
                project_name=project_name,
                user_id=user_id,
                project_id=project_id
            )
            print(f"✅ Clustering completed successfully. Labels shape: {labels.shape}")
        except Exception as e:
            print(f"❌ Clustering algorithm failed: {str(e)}")
            raise HTTPException(500, f"Clustering algorithm failed: {str(e)}")

        print("🔍 Calculating cluster statistics...")
        try:
            cluster_stats = calculate_cluster_stats(df, labels)
            print(f"✅ Cluster statistics calculated: {len(cluster_stats)} clusters found")
            print(f"🔍 Final cluster count: {len(cluster_stats)} (auto-selected by {request.k_selection} method)")
        except Exception as e:
            raise HTTPException(500, f"Cluster statistics calculation failed: {str(e)}")

        cluster_sizes = {str(stat["cluster_id"]): stat["size"] for stat in cluster_stats}
        
        # Get full output dataframe with cluster IDs (but don't save automatically)
        output_df = get_output_dataframe(df, labels)
        output_data = output_df.to_dict(orient="records")
        print(f"✅ Output data created with {len(output_data)} rows, including cluster IDs")
        
        # Create preview data from output data
        preview_data = None
        if request.include_preview:
            preview_data = output_data[:request.preview_limit]
            print(f"✅ Preview data created with {len(preview_data)} rows from output data")

        # Metadata is now handled by auto-save functions - no need for duplicate saving
        print("ℹ️ Metadata saving handled by auto-save functions")

        print("🔍 ===== CREATING RESPONSE =====")

        response_data = FilterAndClusterResponse(
            original_rows=original_rows,
            filtered_rows=filtered_rows,
            columns_used=df.columns.tolist(),
            filters_applied=filters_applied,
            filtered_file_path=None,  # No automatic saving
            algorithm_used=request.algorithm,
            n_clusters_found=len(cluster_stats),
            cluster_sizes=cluster_sizes,
            cluster_stats=cluster_stats,
            clustered_file_path=None,  # No automatic saving
            output_data=output_data,
            preview_data=preview_data,
            timestamp=datetime.datetime.utcnow()
        )

        # Validate response against schema
        validated_response = FilterAndClusterResponse(**response_data.model_dump())
        print("✅ Response validation: PASSED - Schema validation successful")
        
        # Auto-save final clustering results
        try:
            final_results_data = {
                "input_path": request.file_path,  # The file used for clustering
                "algorithm": request.algorithm,
                "n_clusters_found": len(cluster_stats),
                "cluster_stats": cluster_stats,
                "cluster_sizes": cluster_sizes,
                "data_shape": df.shape,
                "processing_time": time.time() - start_time,
                "filters_applied": filters_applied,
                "columns_used": df.columns.tolist(),
                "timestamp": datetime.datetime.utcnow().isoformat()
            }
            
            # Auto-save final results
            await auto_save_clustering_data(
                client_name=client_name,
                app_name=app_name,
                project_name=project_name,
                operation_type="results",
                clustering_data=final_results_data,
                user_id=user_id,
                project_id=project_id
            )
            
            print(f"✅ Final results auto-saved to MongoDB")
        except Exception as e:
            print(f"⚠️ Auto-save of final results failed: {str(e)}")

        print(f"📤 Response Summary:")
        print(f"   📊 Original Rows: {response_data.original_rows}")
        print(f"   🔍 Filtered Rows: {response_data.filtered_rows}")
        print(f"   🔢 Clusters Found: {response_data.n_clusters_found}")
        print(f"   📋 Columns Used: {len(response_data.columns_used)} columns")
        print(f"   📁 Filtered File: {response_data.filtered_file_path}")
        print(f"   📁 Clustered File: {response_data.clustered_file_path}")
        print("🔍 ===== CLUSTERING REQUEST COMPLETED =====")

        return response_data

    except HTTPException as e:
        print(f"❌ HTTP Exception raised: {e}")
        raise  # re-raise HTTP exceptions to FastAPI

    except Exception as e:
        error_msg = f"Clustering failed: {str(e)}"
        print(f"❌ ===== CLUSTERING ERROR =====")
        print(f"   🚨 Error: {error_msg}")
        print(f"   🔍 Type: {type(e)}")
        import traceback
        print(f"   📋 Traceback: {traceback.format_exc()}")
        print(f"❌ ===== END ERROR =====")
        raise HTTPException(500, error_msg)


        
# ── 6. Get unique values for a column ────────────────────────────────────
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
        
        # Get bucket and object path
        bucket_name, object_path = parse_minio_path(object_name)
        
        # Get the object from MinIO
        try:
            # Get the file from MinIO
            response = minio_client.get_object(bucket_name, object_path)
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
                    # Try Arrow format if Parquet fails
                    df = pd.read_feather(io.BytesIO(file_bytes))
            
            # Create a case-insensitive column name mapping
            column_mapping = {col.lower(): col for col in df.columns}
            
            # Get the actual column name with proper case
            actual_column = column_mapping.get(column_name.lower())
            
            if actual_column:
                unique_values = df[actual_column].dropna().astype(str).unique().tolist()
                return {"unique_values": sorted(unique_values) if unique_values else []}
            else:
                error_msg = f"Column '{column_name}' not found in the data source. Available columns: {', '.join(df.columns)}"
                raise HTTPException(status_code=404, detail=error_msg)
                
        except S3Error as e:
            error_msg = f"Error accessing MinIO object {object_name} in bucket {bucket_name}: {str(e)}"
            
            # List available buckets for debugging
            try:
                buckets = minio_client.list_buckets()
                bucket_names = [bucket.name for bucket in buckets]
                
                # If bucket exists, list objects for debugging
                if bucket_name in bucket_names:
                    objects = minio_client.list_objects(bucket_name, recursive=True)
                    object_list = [obj.object_name for obj in objects]
            except Exception as list_error:
                pass
            
            raise HTTPException(status_code=404, detail=error_msg)
            
    except HTTPException:
        raise  # Re-raise HTTP exceptions
        
    except Exception as e:
        error_msg = f"Error getting unique values: {str(e)}"
        raise HTTPException(status_code=500, detail=error_msg)


# ── 7. Export clustering results as CSV ────────────────────────────────────
@router.get("/export_csv")
async def export_csv(object_name: str):
    """Export clustering results as CSV file."""
    from urllib.parse import unquote
    import pyarrow as pa
    import pyarrow.ipc as ipc
    
    object_name = unquote(object_name)
    print(f"➡️ export_csv request: {object_name}")
    
    try:
        # Try Redis cache first
        import redis
        redis_client = redis.Redis(host='localhost', port=6379, db=0, decode_responses=False)
        content = redis_client.get(object_name)
        
        if content is None:
            # Fallback to MinIO
            minio_client = get_minio_client()
            bucket_name, object_path = parse_minio_path(object_name)
            response = minio_client.get_object(bucket_name, object_path)
            content = response.read()
            # Cache in Redis for 1 hour
            redis_client.setex(object_name, 3600, content)

        # Convert Arrow to DataFrame
        if object_name.endswith(".arrow"):
            reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
            df = reader.read_all().to_pandas()
        else:
            # Handle CSV files directly
            df = pd.read_csv(io.BytesIO(content))

        # Convert to CSV
        csv_buffer = io.StringIO()
        df.to_csv(csv_buffer, index=False)
        csv_content = csv_buffer.getvalue()

        # Return as downloadable file
        return StreamingResponse(
            io.BytesIO(csv_content.encode('utf-8')),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=clustering_result_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
            }
        )

    except S3Error as e:
        error_code = getattr(e, "code", "")
        if error_code in {"NoSuchKey", "NoSuchBucket"}:
            if 'redis_client' in locals():
                redis_client.delete(object_name)
            raise HTTPException(status_code=404, detail="File not found")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        print(f"⚠️ export_csv error for {object_name}: {e}")
        raise HTTPException(status_code=400, detail=str(e))


# ── 8. Export clustering results as Excel ────────────────────────────────────
@router.get("/export_excel")
async def export_excel(object_name: str):
    """Export clustering results as Excel file."""
    from urllib.parse import unquote
    import pyarrow as pa
    import pyarrow.ipc as ipc
    
    object_name = unquote(object_name)
    print(f"➡️ export_excel request: {object_name}")
    
    try:
        # Try Redis cache first
        import redis
        redis_client = redis.Redis(host='localhost', port=6379, db=0, decode_responses=False)
        content = redis_client.get(object_name)
        
        if content is None:
            # Fallback to MinIO
            minio_client = get_minio_client()
            bucket_name, object_path = parse_minio_path(object_name)
            response = minio_client.get_object(bucket_name, object_path)
            content = response.read()
            # Cache in Redis for 1 hour
            redis_client.setex(object_name, 3600, content)

        # Convert Arrow to DataFrame
        if object_name.endswith(".arrow"):
            reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
            df = reader.read_all().to_pandas()
        else:
            # Handle CSV files directly
            df = pd.read_csv(io.BytesIO(content))

        # Convert to Excel
        excel_buffer = io.BytesIO()
        with pd.ExcelWriter(excel_buffer, engine='openpyxl') as writer:
            df.to_excel(writer, sheet_name='Clustering Results', index=False)
        
        excel_buffer.seek(0)
        excel_content = excel_buffer.getvalue()

        # Return as downloadable file
        return StreamingResponse(
            io.BytesIO(excel_content),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f"attachment; filename=clustering_result_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
            }
        )

    except S3Error as e:
        error_code = getattr(e, "code", "")
        if error_code in {"NoSuchKey", "NoSuchBucket"}:
            if 'redis_client' in locals():
                redis_client.delete(object_name)
            raise HTTPException(status_code=404, detail="File not found")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        print(f"⚠️ export_excel error for {object_name}: {e}")
        raise HTTPException(status_code=400, detail=str(e))




from minio.commonconfig import CopySource

# ── 10. Rename clustering result file ────────────────────────────────────────────
@router.post("/rename")
async def rename_clustering_file(
    request: dict = Body(...)
):
    """Rename a saved clustering result file."""
    try:
        # Debug: Print received request data
        print(f"🔍 Rename request received: {request}")
        print(f"🔍 Request type: {type(request)}")
        print(f"🔍 Request keys: {list(request.keys()) if isinstance(request, dict) else 'Not a dict'}")
        
        # Validate request structure
        if not isinstance(request, dict):
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid request format. Expected dict, got {type(request)}"
            )
        
        # Extract parameters from request body
        old_path = request.get('old_path', '')
        new_filename = request.get('new_filename', '')
        
        print(f"🔍 Extracted old_path: '{old_path}' (type: {type(old_path)})")
        print(f"🔍 Extracted new_filename: '{new_filename}' (type: {type(new_filename)})")
        
        if not old_path or not new_filename:
            raise HTTPException(
                status_code=400, 
                detail=f"Missing required parameters. Received: old_path='{old_path}', new_filename='{new_filename}'"
            )
        
        print(f"🔍 Processing rename: {old_path} -> {new_filename}")
        
        # 1. Get MinIO client
        minio_client = get_minio_client()
        
        # 2. Parse the old path to get the directory
        if not old_path.endswith('.arrow'):
            old_path += '.arrow'
            
        # 3. Get the directory from old path
        old_dir = '/'.join(old_path.split('/')[:-1])  # Remove filename, keep directory
        new_filename = new_filename.strip()
        if not new_filename.endswith('.arrow'):
            new_filename += '.arrow'
            
        new_path = f"{old_dir}/{new_filename}"
        
        print(f"🔍 New path will be: {new_path}")
        
        # 4. Check if old file exists
        try:
            old_obj = minio_client.stat_object(settings.minio_bucket, old_path)
            print(f"✅ Old file exists: {old_path}")
        except S3Error as e:
            if e.code == "NoSuchKey":
                raise HTTPException(status_code=404, detail=f"Original file not found: {old_path}")
            raise HTTPException(status_code=500, detail=f"Error checking file: {str(e)}")
        
        # 5. Copy object with new name
        try:
            # Fix: Use proper MinIO copy_object method
            # The source should be in the format: bucket_name/object_name
            source = f"{settings.minio_bucket}/{old_path}"
            print(f"🔍 Copying from source: {source}")
            
            # Use the correct copy_object method signature
            minio_client.copy_object(
                bucket_name=settings.minio_bucket,
                object_name=new_path,
                source=CopySource(settings.minio_bucket, old_path)
            )
            print(f"✅ File copied to new location: {new_path}")
            
            # 6. Delete old object
            minio_client.remove_object(settings.minio_bucket, old_path)
            print(f"✅ Old file deleted: {old_path}")
            
            # 7. Update Redis cache if it exists
            try:
                import redis
                redis_client = redis.Redis(host='localhost', port=6379, db=0, decode_responses=False)
                
                # Get old data and cache with new key
                old_data = redis_client.get(old_path)
                if old_data:
                    redis_client.setex(new_path, 3600, old_data)
                    redis_client.delete(old_path)
                    print(f"✅ Updated Redis cache: {old_path} -> {new_path}")
            except Exception as e:
                print(f"⚠️ Redis cache update failed: {e}")
            
            return {
                "success": True,
                "old_path": old_path,
                "new_path": new_path,
                "message": "File renamed successfully"
            }
            
        except S3Error as e:
            raise HTTPException(status_code=500, detail=f"Error renaming file: {str(e)}")
            
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        print(f"⚠️ rename_clustering_file error: {e}")
        print(f"⚠️ Error type: {type(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=f"Unexpected error: {str(e)}")


# ── 9. Save clustering dataframe ────────────────────────────────────────────
@router.post("/save")
async def save_clustering_dataframe(
    csv_data: str = Body(..., embed=True),
    filename: str = Body("", embed=True)
):
    """Save full clustering dataframe to MinIO as Arrow (mirrors concat save)."""
    import uuid
    
    try:
        # 1. Load dataframe from CSV payload (expected full data, not a preview)
        df = pd.read_csv(io.StringIO(csv_data))

        # 2. Determine output filename with standard prefix
        if not filename:
            clustering_id = str(uuid.uuid4())[:8]
            filename = f"{clustering_id}_clustering.arrow"
        if not filename.endswith(".arrow"):
            filename += ".arrow"
            
        # Get standard prefix and create full path (following concat atom pattern exactly)
        prefix = await get_object_prefix()
        filename = f"{prefix}clustering-data/{filename}"
        print(f"🔍 Filename: {filename}")

        # 3. Convert to Arrow bytes
        table = pa.Table.from_pandas(df)
        buf = pa.BufferOutputStream()
        with ipc.new_file(buf, table.schema) as writer:
            writer.write_table(table)
        arrow_bytes = buf.getvalue().to_pybytes()

        # 4. Upload to MinIO & cache in Redis
        minio_client = get_minio_client()
        minio_client.put_object(
            settings.minio_bucket,
            filename,
            data=io.BytesIO(arrow_bytes),
            length=len(arrow_bytes),
            content_type="application/octet-stream",
        )
        
        # Cache in Redis for 1 hour
        try:
            import redis
            redis_client = redis.Redis(host='localhost', port=6379, db=0, decode_responses=False)
            redis_client.setex(filename, 3600, arrow_bytes)
            print(f"✅ Cached clustering data in Redis: {filename}")
        except Exception as e:
            print(f"⚠️ Redis caching failed: {e}")

        return {
            "result_file": filename,
            "shape": df.shape,
            "columns": list(df.columns),
            "message": "Clustering DataFrame saved successfully"
        }
    except Exception as e:
        print(f"⚠️ save_clustering_dataframe error: {e}")
        raise HTTPException(status_code=400, detail=str(e))


# ── 11. Save clustering config ────────────────────────────────────────────
@router.post("/save_clustering_config")
async def save_clustering_config_endpoint(
    request: Request,
    config_data: str = Body(..., embed=True),
    filename: str = Body("", embed=True)
):
    """Save clustering configuration to MinIO."""
    try:
        # 1. Load config data from JSON payload
        config_dict = json.loads(config_data)

        # 2. Determine output filename with standard prefix
        if not filename:
            clustering_id = str(uuid.uuid4())[:8]
            filename = f"{clustering_id}_clustering_config.json"
        if not filename.endswith(".json"):
            filename += ".json"
            
        # Get standard prefix and create full path (following concat atom pattern exactly)
        prefix = await get_object_prefix()
        filename = f"{prefix}clustering-data/{filename}"
        print(f"🔍 Filename: {filename}")

        # 3. Convert to JSON bytes
        json_bytes = json.dumps(config_dict).encode('utf-8')

        # 4. Upload to MinIO & cache in Redis
        minio_client = get_minio_client()
        minio_client.put_object(
            settings.minio_bucket,
            filename,
            data=io.BytesIO(json_bytes),
            length=len(json_bytes),
            content_type="application/json",
        )
        
        # Cache in Redis for 1 hour
        try:
            import redis
            redis_client = redis.Redis(host='localhost', port=6379, db=0, decode_responses=False)
            redis_client.setex(filename, 3600, json_bytes)
            print(f"✅ Cached clustering config in Redis: {filename}")
        except Exception as e:
            print(f"⚠️ Redis caching failed: {e}")

        return {
            "result_file": filename,
            "message": "Clustering config saved successfully"
        }
    except Exception as e:
        print(f"⚠️ save_clustering_config_endpoint error: {e}")
        raise HTTPException(status_code=400, detail=str(e))


# ── 12. Save clustering results ────────────────────────────────────────────
@router.post("/save_clustering_results")
async def save_clustering_results_endpoint(
    request: Request,
    results_data: str = Body(..., embed=True),
    filename: str = Body("", embed=True)
):
    """Save clustering results to MinIO."""
    try:
        # 1. Load results data from JSON payload
        results_dict = json.loads(results_data)

        # 2. Determine output filename with standard prefix
        if not filename:
            clustering_id = str(uuid.uuid4())[:8]
            filename = f"{clustering_id}_clustering_results.json"
        if not filename.endswith(".json"):
            filename += ".json"
            
        # Get standard prefix and create full path (following concat atom pattern exactly)
        prefix = await get_object_prefix()
        filename = f"{prefix}clustering-data/{filename}"
        print(f"🔍 Filename: {filename}")

        # 3. Convert to JSON bytes
        json_bytes = json.dumps(results_dict).encode('utf-8')

        # 4. Upload to MinIO & cache in Redis
        minio_client = get_minio_client()
        minio_client.put_object(
            settings.minio_bucket,
            filename,
            data=io.BytesIO(json_bytes),
            length=len(json_bytes),
            content_type="application/json",
        )
        
        # Cache in Redis for 1 hour
        try:
            import redis
            redis_client = redis.Redis(host='localhost', port=6379, db=0, decode_responses=False)
            redis_client.setex(filename, 3600, json_bytes)
            print(f"✅ Cached clustering results in Redis: {filename}")
        except Exception as e:
            print(f"⚠️ Redis caching failed: {e}")

        return {
            "result_file": filename,
            "message": "Clustering results saved successfully"
        }
    except Exception as e:
        print(f"⚠️ save_clustering_results_endpoint error: {e}")
        raise HTTPException(status_code=400, detail=str(e))


# ── 13. Save clustering metadata ────────────────────────────────────────────
@router.post("/save_clustering_metadata")
async def save_clustering_metadata_endpoint(
    request: Request,
    metadata_data: str = Body(..., embed=True),
    filename: str = Body("", embed=True)
):
    """Save clustering metadata to MinIO."""
    try:
        # 1. Load metadata data from JSON payload
        metadata_dict = json.loads(metadata_data)

        # 2. Determine output filename with standard prefix
        if not filename:
            clustering_id = str(uuid.uuid4())[:8]
            filename = f"{clustering_id}_clustering_metadata.json"
        if not filename.endswith(".json"):
            filename += ".json"
            
        # Get standard prefix and create full path (following concat atom pattern exactly)
        prefix = await get_object_prefix()
        filename = f"{prefix}clustering-data/{filename}"
        print(f"🔍 Filename: {filename}")

        # 3. Convert to JSON bytes
        json_bytes = json.dumps(metadata_dict).encode('utf-8')

        # 4. Upload to MinIO & cache in Redis
        minio_client = get_minio_client()
        minio_client.put_object(
            settings.minio_bucket,
            filename,
            data=io.BytesIO(json_bytes),
            length=len(json_bytes),
            content_type="application/json",
        )
        
        # Cache in Redis for 1 hour
        try:
            import redis
            redis_client = redis.Redis(host='localhost', port=6379, db=0, decode_responses=False)
            redis_client.setex(filename, 3600, json_bytes)
            print(f"✅ Cached clustering metadata in Redis: {filename}")
        except Exception as e:
            print(f"⚠️ Redis caching failed: {e}")

        return {
            "result_file": filename,
            "message": "Clustering metadata saved successfully"
        }
    except Exception as e:
        print(f"⚠️ save_clustering_metadata_endpoint error: {e}")
        raise HTTPException(status_code=400, detail=str(e))


# ── 14. Save clustering configuration to MongoDB ────────────────────────────────────────────
@router.post("/save-config-mongo")
async def save_clustering_configuration_mongo(
    request: Request,
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name"),
    user_id: str = Query("", description="User ID"),
    project_id: int = Query(None, description="Project ID")
):
    """Save clustering configuration data to MongoDB - used by SAVE CONFIG button"""
    print(f"🔍 DEBUG: /save-config-mongo endpoint called")
    print(f"🔍 DEBUG: client_name = {client_name}")
    print(f"🔍 DEBUG: app_name = {app_name}")
    print(f"🔍 DEBUG: project_name = {project_name}")
    print(f"🔍 DEBUG: user_id = {user_id}")
    print(f"🔍 DEBUG: project_id = {project_id}")
    
    try:
        # Get the request body
        body = await request.json()
        print(f"🔍 DEBUG: request body = {body}")
        
        # Save clustering configuration data
        result = await save_clustering_config(
            client_name=client_name,
            app_name=app_name,
            project_name=project_name,
            clustering_data=body,
            user_id=user_id,
            project_id=project_id
        )
        
        print(f"🔍 DEBUG: save_clustering_config result = {result}")
        
        if result["status"] == "success":
            return {
                "success": True,
                "message": f"Clustering configuration saved successfully",
                "mongo_id": result["mongo_id"],
                "operation": result["operation"],
                "collection": result["collection"]
            }
        else:
            raise HTTPException(status_code=500, detail=f"Failed to save clustering configuration: {result['error']}")
            
    except Exception as e:
        print(f"Error saving clustering configuration: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to save clustering configuration: {str(e)}")


# ── 15. Save clustering results to MongoDB ────────────────────────────────────────────
@router.post("/save-results-mongo")
async def save_clustering_results_mongo(
    request: Request,
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name"),
    user_id: str = Query("", description="User ID"),
    project_id: int = Query(None, description="Project ID")
):
    """Save clustering results data to MongoDB - used by SAVE RESULTS button"""
    print(f"🔍 DEBUG: /save-results-mongo endpoint called")
    print(f"🔍 DEBUG: client_name = {client_name}")
    print(f"🔍 DEBUG: app_name = {app_name}")
    print(f"🔍 DEBUG: project_name = {project_name}")
    print(f"🔍 DEBUG: user_id = {user_id}")
    print(f"🔍 DEBUG: project_id = {project_id}")
    
    try:
        # Get the request body
        body = await request.json()
        print(f"🔍 DEBUG: request body = {body}")
        
        # Save clustering results data
        result = await save_clustering_results(
            client_name=client_name,
            app_name=app_name,
            project_name=project_name,
            clustering_results=body,
            user_id=user_id,
            project_id=project_id
        )
        
        print(f"🔍 DEBUG: save_clustering_results result = {result}")
        
        if result["status"] == "success":
            return {
                "success": True,
                "message": f"Clustering results saved successfully",
                "mongo_id": result["mongo_id"],
                "operation": result["operation"],
                "collection": result["collection"]
            }
        else:
            raise HTTPException(status_code=500, detail=f"Failed to save clustering results: {result['error']}")
            
    except Exception as e:
        print(f"Error saving clustering results: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to save clustering results: {str(e)}")


# ── 16. Save clustering metadata to MongoDB ────────────────────────────────────────────
@router.post("/save-metadata-mongo")
async def save_clustering_metadata_mongo(
    request: Request,
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name"),
    user_id: str = Query(..., description="User ID"),
    project_id: int = Query(None, description="Project ID")
):
    """Save clustering metadata to MongoDB - used for tracking operations"""
    print(f"🔍 DEBUG: /save-metadata-mongo endpoint called")
    print(f"🔍 DEBUG: client_name = {client_name}")
    print(f"🔍 DEBUG: app_name = {app_name}")
    print(f"🔍 DEBUG: project_name = {project_name}")
    print(f"🔍 DEBUG: user_id = {user_id}")
    print(f"🔍 DEBUG: project_id = {project_id}")
    
    try:
        # Get the request body
        body = await request.json()
        print(f"🔍 DEBUG: request body = {body}")
        
        # Save clustering metadata
        result = await save_clustering_metadata(
            client_name=client_name,
            app_name=app_name,
            project_name=project_name,
            metadata=body,
            user_id=user_id,
            project_id=project_id
        )
        
        print(f"🔍 DEBUG: save_clustering_metadata result = {result}")
        
        if result["status"] == "success":
            return {
                "success": True,
                "message": f"Clustering metadata saved successfully",
                "mongo_id": result["mongo_id"],
                "operation": result["operation"],
                "collection": result["collection"]
            }
        else:
            raise HTTPException(status_code=500, detail=f"Failed to save clustering metadata: {result['error']}")
            
    except Exception as e:
        print(f"Error saving clustering metadata: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to save clustering metadata: {str(e)}")


# ── 17. Get clustering configuration from MongoDB ────────────────────────────────────────────
@router.get("/get-config-mongo")
async def get_clustering_configuration_mongo(
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name")
):
    """Retrieve saved clustering configuration from MongoDB."""
    try:
        result = await get_clustering_config_from_mongo(client_name, app_name, project_name)
        
        if result:
            return {
                "success": True,
                "data": result
            }
        else:
            return {
                "success": False,
                "message": "No clustering configuration found",
                "data": None
            }
            
    except Exception as e:
        print(f"Error retrieving clustering configuration: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve clustering configuration: {str(e)}")


# ── 18. Get clustering results from MongoDB ────────────────────────────────────────────
@router.get("/get-results-mongo")
async def get_clustering_results_mongo(
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name")
):
    """Retrieve saved clustering results from MongoDB."""
    try:
        result = await get_clustering_results_from_mongo(client_name, app_name, project_name)
        
        if result:
            return {
                "success": True,
                "data": result
            }
        else:
            return {
                "success": False,
                "message": "No clustering results found",
                "data": None
            }
            
    except Exception as e:
        print(f"Error retrieving clustering results: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve clustering results: {str(e)}")


# ── 19. Get clustering metadata from MongoDB ────────────────────────────────────────────
@router.get("/get-metadata-mongo")
async def get_clustering_metadata_mongo(
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name"),
    limit: int = Query(10, description="Number of metadata entries to retrieve")
):
    """Retrieve clustering metadata history from MongoDB."""
    try:
        results = await get_clustering_metadata_from_mongo(client_name, app_name, project_name, limit)
        
        return {
            "success": True,
            "data": results,
            "count": len(results)
        }
            
    except Exception as e:
        print(f"Error retrieving clustering metadata: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve clustering metadata: {str(e)}")


# ── 20. Test MongoDB connection ────────────────────────────────────────────
@router.get("/test-mongo")
async def test_mongo_connection():
    """Test MongoDB connection and list databases"""
    try:
        from .database import client
        print(f"🔍 DEBUG: Testing MongoDB connection")
        
        # List all databases
        databases = await client.list_database_names()
        print(f"🔍 DEBUG: Available databases: {databases}")
        
        # Check if trinity_prod exists
        if "trinity_prod" in databases:
            print(f"🔍 DEBUG: trinity_prod database exists")
            # List collections in trinity_prod
            collections = await client["trinity_prod"].list_collection_names()
            print(f"🔍 DEBUG: Collections in trinity_prod: {collections}")
        else:
            print(f"🔍 DEBUG: trinity_prod database does not exist")
        
        return {
            "success": True,
            "databases": databases,
            "trinity_prod_exists": "trinity_prod" in databases,
            "collections_in_trinity_prod": collections if "trinity_prod" in databases else []
        }
        
    except Exception as e:
        print(f"Error testing MongoDB connection: {str(e)}")
        return {
            "success": False,
            "error": str(e)
        }