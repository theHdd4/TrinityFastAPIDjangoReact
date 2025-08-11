from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
import datetime
import time
from .database import column_coll, correlation_coll
from .schema import (
    FilterPayload, 
    BucketCheckResponse,
    FilterAndCorrelateRequest,
    FilterAndCorrelateResponse,
)
from .service import (
    minio_client,
    check_bucket_and_file,
    load_csv_from_minio, 
    calculate_correlations,
    save_correlation_results_to_minio,
    parse_minio_path,
    apply_identifier_filters,
    apply_measure_filters,
    save_filtered_data_to_minio,
    get_unique_values
)

router = APIRouter()

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
            "/data-preview"
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
async def get_final_columns(validator_atom_id: str):
    """Get final classification columns for a validator atom"""
    doc = await column_coll.find_one({"validator_atom_id": validator_atom_id})
    if not doc:
        raise HTTPException(404, "validator_atom not found")
    return {
        "identifiers": doc["final_classification"]["identifiers"],
        "measures": doc["final_classification"]["measures"]
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
    start_time = time.time()
    
    try:
        # Check if file exists
        check = await check_bucket_and_file(request.file_path)
        if not check["exists"]:
            raise HTTPException(404, check["message"])
        
        # Load data
        df = await load_csv_from_minio(request.file_path)
        original_rows = len(df)
        
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
            if len(numeric_cols) < 2:
                raise HTTPException(
                    400, 
                    f"Need at least 2 numeric columns for {request.method} correlation. "
                    f"Found only {len(numeric_cols)} numeric columns."
                )
        elif request.method in ["phi_coefficient", "cramers_v"]:
            if not request.columns or len(request.columns) != 2:
                raise HTTPException(
                    400,
                    f"{request.method} requires exactly 2 columns to be specified."
                )
        
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
        
        # Save correlation results
        correlation_file_path = save_correlation_results_to_minio(df, correlation_results, request.file_path)
        
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
            "correlation_file_path": correlation_file_path,
            "original_rows": original_rows,
            "filtered_rows": filtered_rows,
            "filters_applied": filters_applied,
            "correlation_method": request.method,
            "correlation_results": correlation_results,
            "timestamp": datetime.datetime.utcnow(),
            "processing_time_ms": processing_time_ms
        }
        result = await correlation_coll.insert_one(metadata)
        
        # Prepare response
        return FilterAndCorrelateResponse(
            original_rows=original_rows,
            filtered_rows=filtered_rows,
            columns_used=list(df.columns),
            filters_applied=filters_applied,
            filtered_file_path=filtered_file_path,
            correlation_method=request.method,
            correlation_results=correlation_results,
            correlation_file_path=correlation_file_path,
            preview_data=preview_data,
            timestamp=datetime.datetime.utcnow(),
            processing_time_ms=processing_time_ms
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Correlation analysis failed: {str(e)}")

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
