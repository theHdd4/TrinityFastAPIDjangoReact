from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
from typing import List, Optional
import datetime
import time
import numpy as np
import pandas as pd
from urllib.parse import unquote

# MongoDB imports - optional (graceful degradation if not available)
try:
    from .database import column_coll, correlation_coll
    MONGODB_AVAILABLE = True
except ImportError:
    MONGODB_AVAILABLE = False
    print("⚠️ MongoDB collections not available - using fallback mode")

from .matrix_settings import router as matrix_settings_router
from .schema import (
    FilterPayload, 
    BucketCheckResponse,
    FilterAndCorrelateRequest,
    FilterAndCorrelateResponse,
    TimeSeriesRequest,
    TimeSeriesAxisResponse,
    HighestCorrelationResponse,
    TimeSeriesDataResponse,
)
from .service import (
    minio_client,
    check_bucket_and_file,
    load_csv_from_minio, 
    calculate_correlations,
    save_correlation_results_to_db,
    parse_minio_path,
    apply_identifier_filters,
    apply_measure_filters,
    save_filtered_data_to_minio,
    get_unique_values,
    apply_time_aggregation,
    get_time_series_axis_data,
    find_highest_correlation_pair,
    get_filtered_time_series_values
)

# Add flight and data retrieval imports
from app.DataStorageRetrieval.arrow_client import (
    download_dataframe,
    download_table_bytes,
)
from app.DataStorageRetrieval.flight_registry import (
    get_flight_path_for_csv,
    set_ticket,
)
from app.DataStorageRetrieval.db import get_dataset_info
from app.features.data_upload_validate.app.routes import get_object_prefix
from app.features.pipeline.service import record_atom_execution
from app.features.project_state.routes import get_atom_list_configuration

router = APIRouter()
router.include_router(matrix_settings_router, prefix="/matrix-settings")

@router.get("/")
async def root():
    """Root endpoint for correlation backend."""
    return {
        "message": "Correlation backend is running", 
        "endpoints": [
            "/ping",
            "/check-file",
            "/columns",
            "/filter",
            "/filter-and-correlate",
            "/buckets",
            "/column-values",
            "/data-preview",
            "/analyze-dates",
            "/dataframe-validator",
            "/load-dataframe",
            "/time-series-axis",
            "/highest-correlation-pair",
            "/time-series-data",
            "/matrix-settings"
        ]
    }

@router.get("/ping")
async def ping():
    """Health check endpoint for correlation backend."""
    return {"msg": "Correlation backend is alive"}

# ── 1. Check if file exists in MinIO ─────────────────────────────────────
@router.get("/check-file/{file_path:path}")
async def check_file(file_path: str) -> BucketCheckResponse:
    """Check if a file exists in MinIO"""
    result = await check_bucket_and_file(file_path)
    return BucketCheckResponse(**result)

# ── 2. Fetch available identifiers/measures ──────────────────────────────
@router.get("/columns/{validator_atom_id}")
async def get_final_columns(validator_atom_id: str, file_path: str = None):
    """Get final classification columns for a validator atom"""
    try:
        print(f"➡️ correlation get_final_columns: {validator_atom_id}")
        
        # Skip MongoDB entirely - just provide sensible defaults for correlation
        # This avoids authentication issues and works for correlation analysis
        print(f"📋 correlation providing default column classification for validator: {validator_atom_id}")
        
        # Return comprehensive defaults that cover most common column types
        return {
            "identifiers": [
                "date", "time", "timestamp", "id", "identifier", 
                "client", "project", "category", "type", "group",
                "region", "country", "state", "city", "segment",
                "brand", "product", "customer", "user", "account"
            ],
            "measures": [
                "sales", "revenue", "quantity", "amount", "value", 
                "price", "cost", "profit", "count", "volume",
                "rate", "percentage", "score", "rating", "index",
                "total", "sum", "average", "min", "max", "growth"
            ],
            "message": "Using default column classification for correlation analysis",
            "validator_source": "fallback"
        }
        
    except Exception as e:
        print(f"⚠️ correlation get_final_columns error: {e}")
        # Even if everything fails, provide basic column types for correlation
        return {
            "identifiers": ["date", "id", "category"],
            "measures": ["value", "amount", "count"],
            "message": f"Error accessing columns: {str(e)}",
            "validator_source": "emergency_fallback"
        }

# ── 3. Filter data from MinIO file ───────────────────────────────────────
@router.post("/filter")
async def filter_data(payload: FilterPayload):
    """Filter data from MinIO file by selected columns"""
    # Load data
    df = await load_csv_from_minio(payload.file_path)
    original_rows = len(df)
    
    # Apply identifier filters
    if payload.identifier_filters:
        df = apply_identifier_filters(df, payload.identifier_filters)
    
    # Apply measure filters
    if payload.measure_filters:
        df = apply_measure_filters(df, payload.measure_filters)
    
    # Select columns
    cols = (payload.identifier_columns or []) + (payload.measure_columns or [])
    if cols:
        missing_cols = [c for c in cols if c not in df.columns]
        if missing_cols:
            raise HTTPException(400, f"Columns not found: {missing_cols}")
        df = df[cols]
    
    return {
        "file_path": payload.file_path,
        "original_rows": original_rows,
        "filtered_rows": len(df),
        "columns": list(df.columns),
        "data": df.head(payload.limit).to_dict(orient="records")
    }

# ── 4. List available buckets ────────────────────────────────────────────
@router.get("/buckets")
async def list_buckets():
    """List all available MinIO buckets"""
    try:
        buckets = minio_client.list_buckets()
        return {
            "buckets": [
                {
                    "name": bucket.name,
                    "creation_date": bucket.creation_date.isoformat()
                } 
                for bucket in buckets
            ]
        }
    except Exception as e:
        raise HTTPException(500, f"Failed to list buckets: {str(e)}")

# ── 5. List objects in a bucket ──────────────────────────────────────────
@router.get("/bucket/{bucket_name}/objects")
async def list_bucket_objects(
    bucket_name: str, 
    prefix: str = Query("", description="Filter objects by prefix"),
    limit: int = Query(100, description="Maximum number of objects to return")
):
    """List objects in a specific bucket"""
    if not minio_client.bucket_exists(bucket_name):
        raise HTTPException(404, f"Bucket '{bucket_name}' not found")
    
    objects = []
    count = 0
    
    for obj in minio_client.list_objects(bucket_name, prefix=prefix, recursive=True):
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

# ── 6. Combined Filter and Correlation Endpoint ─────────────────────────
@router.post("/filter-and-correlate", response_model=FilterAndCorrelateResponse)
async def filter_and_correlate(request: FilterAndCorrelateRequest):
    """
    Filter data and run correlation analysis in a single operation.
    
    This endpoint:
    1. Loads data from MinIO
    2. Applies identifier and measure filters
    3. Selects specified columns
    4. Runs correlation analysis on the filtered subset
    5. Saves both filtered and correlation results
    6. Returns comprehensive results with optional preview
    """
    print(f"🚀 correlation filter-and-correlate started")
    print(f"📥 request received: {request.model_dump_json()}")
    print(f"🔍 Pipeline tracking params: validator_atom_id={request.validator_atom_id}, card_id={request.card_id}, canvas_position={request.canvas_position}")
    start_time = time.time()
    
    try:
        # Check if file exists
        check = await check_bucket_and_file(request.file_path)
        if not check["exists"]:
            raise HTTPException(404, check["message"])
        
        # Load data
        df = await load_csv_from_minio(request.file_path)
        original_rows = len(df)
        
        # Debug: Log dataframe info
        print(f"🔍 correlation loaded dataframe: {request.file_path}")
        print(f"📊 shape: {df.shape}")
        print(f"📋 columns: {list(df.columns)}")
        print(f"🔢 column dtypes: {df.dtypes.to_dict()}")
        
        # Build filter summary for response
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
            df = apply_identifier_filters(df, request.identifier_filters)
        
        # Apply measure filters
        if request.measure_filters:
            df = apply_measure_filters(df, request.measure_filters)
        
        # Select columns
        columns_to_include = []
        if request.identifier_columns:
            columns_to_include.extend(request.identifier_columns)
        if request.measure_columns:
            columns_to_include.extend(request.measure_columns)
        
        if columns_to_include:
            missing_cols = [c for c in columns_to_include if c not in df.columns]
            if missing_cols:
                raise HTTPException(400, f"Columns not found in data: {missing_cols}")
            df = df[columns_to_include]
        
        filtered_rows = len(df)
        
        # Check if we have enough data for correlation
        if filtered_rows < 2:
            raise HTTPException(
                400, 
                f"Need at least 2 rows for correlation, but got {filtered_rows} after filtering. "
                "Please adjust your filters to include more data."
            )
        
        # Check if we have appropriate columns for the correlation method
        if request.method in ["pearson", "spearman"]:
            numeric_cols = df.select_dtypes(include=['number']).columns.tolist()
            non_numeric_cols = [col for col in df.columns if col not in numeric_cols]
            
            print(f"🔢 numeric columns found: {numeric_cols}")
            print(f"📊 numeric column count: {len(numeric_cols)}")
            print(f"❌ non-numeric columns filtered out: {non_numeric_cols}")
            
            if len(numeric_cols) < 2:
                all_cols_info = [(col, str(dtype)) for col, dtype in zip(df.columns, df.dtypes)]
                raise HTTPException(
                    400, 
                    f"Need at least 2 numeric columns for {request.method} correlation. "
                    f"Found only {len(numeric_cols)} numeric columns: {numeric_cols}. "
                    f"Non-numeric columns (filtered out): {non_numeric_cols}. "
                    f"All columns with types: {all_cols_info}"
                )
        elif request.method in ["phi_coefficient", "cramers_v"]:
            if not request.columns or len(request.columns) != 2:
                raise HTTPException(
                    400,
                    f"{request.method} requires exactly 2 columns to be specified."
                )
        
        # Apply date range filter if requested
        date_filtered_rows = None
        if request.date_range_filter and request.date_column:
            from .service import apply_date_range_filter
            try:
                df = apply_date_range_filter(
                    df, request.date_column, request.date_range_filter
                )
                date_filtered_rows = len(df)
                filtered_rows = date_filtered_rows  # Update filtered rows count
                print(
                    f"🗓️ Date filter applied: {date_filtered_rows} rows remaining"
                )
            except Exception as e:
                print(f"⚠️ Date filtering failed: {e}")

        # Apply time aggregation if requested
        if (
            request.aggregation_level
            and request.aggregation_level.lower() != "none"
            and request.date_column
        ):
            from .service import apply_time_aggregation

            try:
                df = apply_time_aggregation(
                    df, request.date_column, request.aggregation_level
                )
                filtered_rows = len(df)
                print(f"⏱️ Time aggregation applied: {filtered_rows} rows")
            except Exception as e:
                print(f"⚠️ Time aggregation failed: {e}")

        # Perform date analysis if requested
        date_analysis = None
        if request.include_date_analysis:
            from .service import analyze_date_columns

            try:
                date_analysis = analyze_date_columns(df)
                print(
                    f"📅 Date analysis completed: {date_analysis['has_date_data']}"
                )
            except Exception as e:
                print(f"⚠️ Date analysis failed: {e}")
        
        # Save filtered data if requested
        filtered_file_path = None
        if request.save_filtered:
            filter_name = f"filtered-{datetime.datetime.utcnow().strftime('%Y%m%d-%H%M%S')}"
            if request.identifier_filters:
                # Add first filter value to filename for clarity
                filter_name += f"-{request.identifier_filters[0].values[0].lower().replace(' ', '_')}"
            filtered_file_path = await save_filtered_data_to_minio(df, request.file_path, filter_name)
        
        # Run correlation analysis
        correlation_results = calculate_correlations(df, request)

        print(f"🔍 correlation_results type: {type(correlation_results)}")
        print(f"🔍 correlation_results keys: {correlation_results.keys() if isinstance(correlation_results, dict) else 'not dict'}")
        correlation_matrix = correlation_results.get('correlation_matrix', []) if correlation_results else None
        
        # Get the actual numeric columns used in correlation
        numeric_columns_used = correlation_results.get('numeric_columns', []) if correlation_results else []
        print(f"🎯 Numeric columns actually used in correlation: {numeric_columns_used}")
        
        # Print shape if possible
        if isinstance(correlation_matrix, np.ndarray):
            print(f"🔍 correlation_matrix shape: {correlation_matrix.shape}")
            sample = correlation_matrix[:2]
        elif isinstance(correlation_matrix, list):
            print(f"🔍 correlation_matrix shape: ({len(correlation_matrix)},)" if correlation_matrix else "(0,)")
            sample = correlation_matrix[:2]
        elif isinstance(correlation_matrix, dict):
            print(f"🔍 correlation_matrix shape: dict with {len(correlation_matrix)} keys")
            sample = list(correlation_matrix.items())[:2]
        else:
            print(f"🔍 correlation_matrix shape: unknown")
            sample = str(correlation_matrix)[:100]
        print(f"🔍 correlation_matrix sample: {sample if correlation_matrix is not None else 'no matrix'}")
                
        # Save correlation results
        correlation_id = await save_correlation_results_to_db(
            df, correlation_results, request.file_path
        )
        
        # Prepare preview if requested
        preview_data = None
        if request.include_preview:
            df_preview = df.head(request.preview_limit).copy()
            preview_data = df_preview.to_dict(orient="records")
        
        # Calculate processing time
        processing_time_ms = (time.time() - start_time) * 1000
        
        # Store metadata in MongoDB
        metadata = {
            "input_path": request.file_path,
            "filtered_file_path": filtered_file_path,
            "correlation_id": correlation_id,
            "original_rows": original_rows,
            "filtered_rows": filtered_rows,
            "filters_applied": filters_applied,
            "correlation_method": request.method,
            "correlation_results": correlation_results,
            "timestamp": datetime.datetime.utcnow(),
            "processing_time_ms": processing_time_ms
        }
        
        # Try to save metadata to MongoDB (optional - don't fail if MongoDB is unavailable)
        try:
            if MONGODB_AVAILABLE:
                result = await correlation_coll.insert_one(metadata)
                print(f"✅ correlation metadata saved to MongoDB: {result.inserted_id}")
            else:
                print("📝 correlation metadata not saved - MongoDB not available")
        except Exception as mongo_error:
            print(f"⚠️ correlation MongoDB save failed (continuing anyway): {mongo_error}")
        
        # Record pipeline execution if validator_atom_id is provided
        print(f"🔍 Correlation pipeline tracking check: validator_atom_id={request.validator_atom_id}, card_id={request.card_id}, canvas_position={request.canvas_position}")
        if request.validator_atom_id:
            try:
                # Extract client/app/project from file_path
                path_parts = request.file_path.split("/")
                client_name = path_parts[0] if len(path_parts) > 0 else ""
                app_name = path_parts[1] if len(path_parts) > 1 else ""
                project_name = path_parts[2] if len(path_parts) > 2 else ""
                
                print(f"🔍 Correlation pipeline tracking: client={client_name}, app={app_name}, project={project_name}, atom_id={request.validator_atom_id}")
                
                # Get user_id from atom configuration
                user_id = None
                try:
                    atom_config = await get_atom_list_configuration(
                        client_name=client_name,
                        app_name=app_name,
                        project_name=project_name,
                        mode="laboratory"
                    )
                    if atom_config.get("status") == "success":
                        cards = atom_config.get("cards", [])
                        for card in cards:
                            atoms = card.get("atoms", [])
                            atom = next((a for a in atoms if a.get("id") == request.validator_atom_id), None)
                            if atom:
                                user_id = atom.get("user_id")
                                break
                except Exception:
                    pass
                
                # Build configuration for pipeline tracking
                configuration = {
                    "file_path": request.file_path,
                    "file_key": request.file_path,
                    "bucket_name": "trinity",
                    "identifier_columns": request.identifier_columns or [],
                    "measure_columns": request.measure_columns or [],
                    "identifier_filters": [f.dict() if hasattr(f, 'dict') else f for f in (request.identifier_filters or [])],
                    "measure_filters": [f.dict() if hasattr(f, 'dict') else f for f in (request.measure_filters or [])],
                    "method": request.method,
                    "columns": request.columns or [],
                    "save_filtered": request.save_filtered,
                    "date_column": request.date_column,
                    "date_range_filter": request.date_range_filter,
                    "aggregation_level": request.aggregation_level,
                }
                
                # Build API calls
                execution_started_at = datetime.datetime.utcnow()
                api_calls = [
                    {
                        "endpoint": "/correlation/filter-and-correlate",
                        "method": "POST",
                        "timestamp": execution_started_at,
                        "params": configuration.copy(),
                        "response_status": 200,
                        "response_data": {
                            "correlation_id": correlation_id,
                            "filtered_rows": filtered_rows,
                            "original_rows": original_rows,
                        }
                    }
                ]
                
                # Build output files
                output_files = []
                if filtered_file_path:
                    output_files.append({
                        "file_key": filtered_file_path,
                        "file_path": filtered_file_path,
                        "flight_path": filtered_file_path,
                        "save_as_name": filtered_file_path.split("/")[-1],
                        "is_default_name": False,
                        "columns": [],
                        "dtypes": {},
                        "row_count": filtered_rows
                    })
                
                execution_completed_at = datetime.datetime.utcnow()
                execution_status = "success"
                execution_error = None
                
                # Record execution (async, don't wait for it)
                try:
                    await record_atom_execution(
                        client_name=client_name,
                        app_name=app_name,
                        project_name=project_name,
                        atom_instance_id=request.validator_atom_id,
                        card_id=request.card_id or "",
                        atom_type="correlation",
                        atom_title="Correlation Analysis",
                        input_files=[request.file_path],
                        configuration=configuration,
                        api_calls=api_calls,
                        output_files=output_files,
                        execution_started_at=execution_started_at,
                        execution_completed_at=execution_completed_at,
                        execution_status=execution_status,
                        execution_error=execution_error,
                        user_id=user_id or "unknown",
                        mode="laboratory",
                        canvas_position=request.canvas_position or 0
                    )
                except Exception as e:
                    # Don't fail the request if pipeline recording fails
                    print(f"⚠️ Failed to record correlation atom execution for pipeline: {e}")
            except Exception as e:
                # Don't fail the request if pipeline recording fails
                print(f"⚠️ Error setting up pipeline tracking for correlation: {e}")
        
        # Prepare response - use numeric columns instead of all columns
        return FilterAndCorrelateResponse(
            original_rows=original_rows,
            filtered_rows=filtered_rows,
            columns_used=numeric_columns_used,  # Only return numeric columns actually used
            filters_applied=filters_applied,
            filtered_file_path=filtered_file_path,
            correlation_method=request.method,
            correlation_results=correlation_results,
            correlation_id=correlation_id,
            preview_data=preview_data,
            date_analysis=date_analysis,
            date_filtered_rows=date_filtered_rows,
            timestamp=datetime.datetime.utcnow(),
            processing_time_ms=processing_time_ms
        )
        
    except HTTPException as he:
        print(f"❌ correlation HTTPException: {he.status_code} - {he.detail}")
        raise
    except Exception as e:
        print(f"💥 correlation unexpected error: {type(e).__name__}: {str(e)}")
        import traceback
        print(f"🔍 correlation traceback: {traceback.format_exc()}")
        raise HTTPException(500, f"Correlation analysis failed: {str(e)}")

# ── 7. Map dataframe to validator atom ID ──────────────────────────────────
@router.get("/dataframe-validator/{file_path:path}")
async def get_dataframe_validator(file_path: str) -> dict:
    """
    Map a dataframe file path to its corresponding validator atom ID
    This enables column extraction for correlation analysis
    """
    try:
        file_path = unquote(file_path)
        print(f"➡️ correlation dataframe-validator request: {file_path}")
        
        # Extract client/app/project from file path
        path_parts = file_path.strip('/').split('/')
        if len(path_parts) >= 3:
            client_name = path_parts[0]
            app_name = path_parts[1] 
            project_name = path_parts[2]
            
            print(f"🔧 correlation validator lookup: client={client_name}, app={app_name}, project={project_name}")
            
            # Simplified validator ID generation - using file path hash for consistency
            import hashlib
            import uuid
            
            # Create deterministic validator ID based on file path
            path_hash = hashlib.md5(file_path.encode()).hexdigest()[:8]
            validator_id = f"validator-{path_hash}"
            
            print(f"✅ correlation validator ID generated: {validator_id}")
            return {"validatorId": validator_id}
                
    except Exception as e:
        print(f"⚠️ correlation validator error: {e}")
        raise HTTPException(500, f"Failed to get validator ID: {str(e)}")
    
    # Fallback validator ID
    return {"validatorId": "default-validator"}

# ── 8. Load dataframe directly for correlation ──────────────────────────────
@router.get("/load-dataframe/{file_path:path}")
async def load_dataframe_for_correlation(file_path: str) -> dict:
    """
    Load dataframe directly for correlation analysis using Arrow Flight
    Returns numeric columns and sample data
    """
    try:
        file_path = unquote(file_path)
        print(f"➡️ correlation load_dataframe request: {file_path}")
        
        # Extract client/app/project for prefix validation
        parts = file_path.split("/", 3)
        client = parts[0] if len(parts) > 0 else ""
        app = parts[1] if len(parts) > 1 else ""
        project = parts[2] if len(parts) > 2 else ""
        
        # Validate prefix
        prefix = await get_object_prefix(
            client_name=client, app_name=app, project_name=project
        )
        
        try:
            # Try to load via Arrow Flight first
            df = download_dataframe(file_path)
            print(f"✅ correlation loaded via flight: {file_path} rows={len(df)}")
        except Exception as flight_exc:
            print(f"⚠️ correlation flight error for {file_path}: {flight_exc}")
            # Fallback to MinIO if flight fails
            df = await load_csv_from_minio(file_path)
            print(f"✅ correlation loaded via minio: {file_path} rows={len(df)}")
        
        # Analyze columns
        numeric_columns = df.select_dtypes(include=[np.number]).columns.tolist()
        categorical_columns = df.select_dtypes(include=['object', 'category']).columns.tolist()
        
        # Get sample data (first 100 rows)
        sample_data = df.head(100).to_dict(orient='records')
        
        return {
            "numericColumns": numeric_columns,
            "categoricalColumns": categorical_columns,
            "sampleData": sample_data,
            "totalRows": len(df),
            "totalColumns": len(df.columns)
        }
        
    except Exception as e:
        print(f"⚠️ correlation load_dataframe error for {file_path}: {e}")
        raise HTTPException(500, f"Failed to load dataframe: {str(e)}")

# ── 9. Get dataframe as CSV for correlation analysis ─────────────────────────
@router.get("/cached_dataframe")
async def cached_dataframe(object_name: str):
    """Return the saved dataframe as CSV text for correlation analysis.
    Prefers Arrow Flight for the latest data, then falls back to Redis/MinIO."""
    object_name = unquote(object_name)
    print(f"➡️ correlation cached_dataframe request: {object_name}")
    
    parts = object_name.split("/", 3)
    client = parts[0] if len(parts) > 0 else ""
    app = parts[1] if len(parts) > 1 else ""
    project = parts[2] if len(parts) > 2 else ""
    
    prefix = await get_object_prefix(
        client_name=client, app_name=app, project_name=project
    )
    
    if not object_name.startswith(prefix):
        print(f"⚠️ correlation cached_dataframe prefix mismatch: {object_name} (expected {prefix})")
    
    try:
        try:
            df = download_dataframe(object_name)
            csv_text = df.to_csv(index=False)
            return Response(csv_text, media_type="text/csv")
        except Exception as exc:
            print(f"⚠️ correlation flight dataframe error for {object_name}: {exc}")
            # Fallback to MinIO
            df = await load_csv_from_minio(object_name)
            csv_text = df.to_csv(index=False)
            return Response(csv_text, media_type="text/csv")
            
    except Exception as e:
        print(f"⚠️ correlation cached_dataframe error for {object_name}: {e}")
        raise HTTPException(status_code=400, detail=str(e))

# ── 10. Flight table endpoint for Arrow Flight integration ──────────────────
@router.get("/flight_table")
async def flight_table(
    app_name: str,
    object_name: str,
    client_name: str = None,
    project_name: str = None,
    download_id: str = None
):
    """
    Flight table endpoint for correlation analysis - mirrors feature overview pattern
    Returns raw CSV bytes via Arrow Flight for consistent data transport
    """
    object_name = unquote(object_name)
    print(f"➡️ correlation flight_table: app={app_name}, object={object_name}, client={client_name}, project={project_name}")
    
    try:
        prefix = await get_object_prefix(
            client_name=client_name, app_name=app_name, project_name=project_name
        )
        
        # Get flight path for the CSV
        flight_path = get_flight_path_for_csv(
            app_name=app_name,
            filename=object_name,
            client_name=client_name,
            project_name=project_name
        )
        print(f"🛫 correlation flight path: {flight_path}")
        
        # Download table bytes via Arrow Flight
        table_bytes = download_table_bytes(flight_path)
        
        return Response(
            content=table_bytes,
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename={object_name}",
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )
        
    except Exception as e:
        print(f"⚠️ correlation flight_table error: {e}")
        raise HTTPException(status_code=500, detail=f"Flight table error: {str(e)}")

# ── 7. Helper endpoint to get column values ──────────────────────────────
@router.get("/column-values/{file_path:path}")
async def get_column_values(
    file_path: str,
    column: str = Query(..., description="Column name to get unique values"),
    limit: int = Query(100, description="Maximum unique values to return")
):
    """Get unique values for a specific column in the file"""
    unique_values = await get_unique_values(file_path, column, limit)
    
    return {
        "file_path": file_path,
        "column": column,
        "unique_values": unique_values,
        "count": len(unique_values)
    }

# ── 8. Data preview endpoint ─────────────────────────────────────────────
@router.get("/data-preview/{file_path:path}")
async def get_data_preview(file_path: str):
    """Get data preview with column types and unique value counts"""
    df = await load_csv_from_minio(file_path)
    
    column_info = []
    for col in df.columns:
        info = {
            "column": col,
            "dtype": str(df[col].dtype),
            "unique_count": df[col].nunique(),
            "null_count": df[col].isnull().sum(),
            "sample_values": df[col].dropna().unique()[:5].tolist()
        }
        column_info.append(info)
    
    return {
        "file_path": file_path,
        "shape": df.shape,
        "columns": column_info,
        "preview": df.head(10).to_dict(orient="records")
    }


# ── 11. Date Analysis Endpoint ───────────────────────────────────────────
@router.get("/analyze-dates/{file_path:path}")
async def analyze_file_dates(file_path: str):
    """Analyze date columns and ranges in a dataframe"""
    try:
        print(f"🗓️ Date analysis starting for: {file_path}")
        
        # Load dataframe
        df = await load_csv_from_minio(file_path)
        print(f"📊 Loaded dataframe: {df.shape}")
        
        # Analyze date columns
        from .service import analyze_date_columns
        date_analysis = analyze_date_columns(df)
        
        print(f"✅ Date analysis complete: {date_analysis['has_date_data']}")
        return date_analysis
        
    except Exception as e:
        print(f"💥 Date analysis error: {type(e).__name__}: {str(e)}")
        raise HTTPException(500, f"Date analysis failed: {str(e)}")


# ── 12. Time Series Axis Endpoint ────────────────────────────────────────
@router.get("/time-series-axis/{file_path:path}", response_model=TimeSeriesAxisResponse)
async def get_time_series_axis(
    file_path: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    """Get X-axis values for time series chart (datetime or indices)"""
    try:
        print(f"📊 Getting time series axis for: {file_path}")
        
        # Load dataframe
        df = await load_csv_from_minio(file_path)
        print(f"📋 Loaded dataframe: {df.shape}")
        
        # Get axis data
        from .service import get_time_series_axis_data
        axis_data = get_time_series_axis_data(df, start_date, end_date)
        
        print(f"✅ Axis data generated: {axis_data['has_datetime']}")
        return axis_data
        
    except Exception as e:
        print(f"💥 Time series axis error: {type(e).__name__}: {str(e)}")
        raise HTTPException(500, f"Time series axis failed: {str(e)}")


# ── 13. Highest Correlation Pair Endpoint ────────────────────────────────
@router.get("/highest-correlation-pair/{file_path:path}", response_model=HighestCorrelationResponse)
async def get_highest_correlation_pair(file_path: str):
    """Find the two columns with highest correlation coefficient"""
    try:
        print(f"🔍 Finding highest correlation pair for: {file_path}")
        
        # Load dataframe
        df = await load_csv_from_minio(file_path)
        print(f"📋 Loaded dataframe: {df.shape}")
        
        # Find highest correlation pair
        from .service import find_highest_correlation_pair
        pair_data = find_highest_correlation_pair(df)
        
        print(f"✅ Highest correlation pair: {pair_data['column1']} - {pair_data['column2']} ({pair_data['correlation_value']:.3f})")
        return pair_data
        
    except Exception as e:
        print(f"💥 Highest correlation error: {type(e).__name__}: {str(e)}")
        raise HTTPException(500, f"Highest correlation failed: {str(e)}")


# ── 14. Time Series Data Endpoint ────────────────────────────────────────
@router.post("/time-series-data/{file_path:path}", response_model=TimeSeriesDataResponse)
async def get_time_series_data(file_path: str, request: TimeSeriesRequest):
    """Get Y-axis values for time series chart with date averaging"""
    try:
        print(f"📈 Getting time series data for: {file_path}")
        print(f"📊 Columns: {request.column1} vs {request.column2}")
        
        # Load dataframe
        df = await load_csv_from_minio(file_path)
        print(f"📋 Loaded dataframe: {df.shape}")
        
        # Get axis dates to align values with
        expected_dates = None
        if request.datetime_column:
            from .service import get_time_series_axis_data
            axis_data = get_time_series_axis_data(df, request.start_date, request.end_date)
            if axis_data.get('has_datetime') and axis_data.get('x_values'):
                expected_dates = axis_data['x_values']
                print(f"🔗 Retrieved {len(expected_dates)} expected dates for alignment")
        
        # Get time series values with averaging and alignment
        from .service import get_filtered_time_series_values
        series_data = get_filtered_time_series_values(
            df, 
            request.column1, 
            request.column2, 
            request.datetime_column,
            request.start_date, 
            request.end_date,
            expected_dates
        )
        
        print(f"✅ Time series data generated: {series_data['filtered_rows']} rows")
        if series_data['has_duplicates_averaged']:
            print(f"📊 Duplicates averaged for consistent datetime values")
        return series_data
        
    except Exception as e:
        print(f"💥 Time series data error: {type(e).__name__}: {str(e)}")
        raise HTTPException(500, f"Time series data failed: {str(e)}")
