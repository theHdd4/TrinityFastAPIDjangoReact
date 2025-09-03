# app/routes.py

from fastapi import APIRouter, HTTPException, Depends, Query, Path, Body
from typing import List, Optional
from datetime import datetime
import logging
import pandas as pd
import io, re, json
from bson import ObjectId
import numpy as np
from typing import Dict, Any

from .database import (
    scopes_collection,
    select_configs_collection,
    get_select_configs_collection,
    minio_client,
    check_database_health,
    extract_unique_combinations,
    get_filter_options,
    get_presigned_url,
    get_file_info,
    list_files_in_bucket,
    db,
    client,
    get_transformation_metadata,
    get_model_by_transform_and_id  
)

# Import get_object_prefix for dynamic path construction
from ..data_upload_validate.app.routes import get_object_prefix

from .schemas import (
    CombinationSelectionOptions,
    UniqueCombination,
    SelectedCombinationDetails,
    HealthCheck,
    FileDownloadResponse,
    FilteredModel,
    ModelFilterRequest,
    ModelVariablesResponse,
    VariableContribution,
    WeightedEnsembleRequest,
    ComboResult,
    WeightedEnsembleResponse,
    ModelPerformanceMetrics,
    ActualVsPredicted,
    GenericModelSelectionRequest,
    SavedModelResponse,
    SavedCombinationsStatusResponse
)

from .database import MINIO_BUCKET, MONGO_URI, MONGO_DB, OBJECT_PREFIX, SELECT_CONFIGS_COLLECTION_NAME

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/health", response_model=HealthCheck, tags=["Health"])
async def health_check():
    """Enhanced health check with detailed diagnostics."""
    health_status = await check_database_health()
    
    return HealthCheck(
        status="healthy" if all(service["status"] for service in health_status.values()) else "unhealthy",
        timestamp=datetime.now(),
        services=health_status,
        version="1.0.0",
        database_details={
            "endpoint": MONGO_URI.split('@')[1] if '@' in MONGO_URI else MONGO_URI,
            "database": MONGO_DB,
            "collection": "validator_atoms"
        },
        minio_details={
            "url": "minio:9000",
            "bucket": MINIO_BUCKET
        }
    )

@router.get("/debug/mongodb", tags=["Debug"])
async def debug_mongodb():
    """Debug endpoint to check MongoDB connection and collections."""
    try:
        # Check basic connection
        if db is None:
            return {"status": "error", "message": "Database connection is None"}
        
        # Check select_configs collection
        select_configs_coll = get_select_configs_collection()
        if select_configs_coll is None:
            return {"status": "error", "message": "select_configs collection is None"}
        
        # Try to ping MongoDB
        await client.admin.command('ping')
        
        # Check if collection exists and is accessible
        collection_info = await db.list_collection_names()
        
        return {
            "status": "success",
            "message": "MongoDB connection working",
            "database": MONGO_DB,
            "collections": collection_info,
            "select_configs_collection": SELECT_CONFIGS_COLLECTION_NAME,
            "collection_accessible": select_configs_coll is not None
        }
        
    except Exception as e:
        return {
            "status": "error",
            "message": f"MongoDB connection failed: {str(e)}",
            "error_type": type(e).__name__,
            "database": MONGO_DB
        }

@router.get("/combination-ids", tags=["Combinations"])
async def get_unique_combination_ids(
    file_key: str = Query(..., description="MinIO file key for the model results file (CSV/Arrow/Feather)")
):
    """
    Get unique combination_id values from a model results file.
    Returns a list of unique combination_id values for dropdown selection.
    """
    logger.info(f"🔧 COMBINATION-IDS ENDPOINT CALLED with file_key: {file_key}")
    
    if not minio_client:
        logger.error("❌ MinIO client is not available")
        raise HTTPException(status_code=503, detail="MinIO connection is not available.")

    try:
        # Use the same pattern as merge/concat atoms - construct full path with OBJECT_PREFIX
        # Check if file_key already contains the prefix pattern
        if file_key.startswith(OBJECT_PREFIX):
            full_file_key = file_key
        else:
            full_file_key = f"{OBJECT_PREFIX}{file_key}"
        
        logger.info(f"Original file_key: {file_key}")
        logger.info(f"OBJECT_PREFIX: {OBJECT_PREFIX}")
        logger.info(f"Final full_file_key: {full_file_key}")
        response = minio_client.get_object(MINIO_BUCKET, full_file_key)
        content = response.read()
        
        # Read file based on extension (same pattern as merge/concat)
        if file_key.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
            logger.info(f"Successfully read CSV file. Columns: {list(df.columns)}")
        elif file_key.endswith(".xlsx"):
            df = pd.read_excel(io.BytesIO(content))
            logger.info(f"Successfully read Excel file. Columns: {list(df.columns)}")
        elif file_key.endswith(".arrow"):
            import pyarrow as pa
            import pyarrow.ipc as ipc
            reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
            df = reader.read_all().to_pandas()
            logger.info(f"Successfully read Arrow file. Columns: {list(df.columns)}")
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {file_key}")

        # Check if combination_id column exists - more robust detection
        combination_id_columns = []
        logger.info(f"Checking for combination_id columns in: {list(df.columns)}")
        
        for col in df.columns:
            col_lower = col.lower()
            logger.info(f"Checking column: '{col}' (lowercase: '{col_lower}')")
            
            # Check for various combination_id patterns
            if (col_lower == 'combination_id' or 
                col_lower == 'combo_id' or 
                col_lower == 'combinationid' or
                col_lower == 'combo_id' or
                'combination_id' in col_lower or 
                'combo_id' in col_lower or 
                'combination' in col_lower):
                combination_id_columns.append(col)
                logger.info(f"Found matching column: '{col}'")

        if not combination_id_columns:
            # Log available columns for debugging
            logger.info(f"Available columns in file: {list(df.columns)}")
            raise HTTPException(
                status_code=404, 
                detail=f"No combination_id column found. Available columns: {', '.join(df.columns[:10])}"
            )

        # Use the first matching column
        combination_id_col = combination_id_columns[0]
        
        # Get unique values, excluding NaN/None
        unique_values = df[combination_id_col].dropna().unique().tolist()
        
        # Convert to strings and sort
        unique_values = sorted([str(val) for val in unique_values if val is not None and str(val).strip()])
        
        if not unique_values:
            raise HTTPException(
                status_code=404,
                detail=f"No valid combination_id values found in column '{combination_id_col}'"
            )

        return {
            "file_key": file_key,
            "combination_id_column": combination_id_col,
            "unique_combination_ids": unique_values,
            "total_unique_values": len(unique_values),
            "total_rows_in_file": len(df)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting unique combination IDs: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")

@router.get("/models/contribution", tags=["Models"])
async def get_model_contribution(
    file_key: str = Query(..., description="MinIO file key for the model results file (CSV/Arrow/Feather)"),
    combination_id: str = Query(..., description="Combination ID to filter by"),
    model_name: str = Query(..., description="Model name to get contribution for")
):
    """
    Get contribution data for a specific model and combination.
    Returns data from columns that end with _contribution for pie chart.
    """
    if not minio_client:
        raise HTTPException(status_code=503, detail="MinIO connection is not available.")

    try:
        # Download file from MinIO
        response = minio_client.get_object(MINIO_BUCKET, file_key)
        content = response.read()
        response.close()
        response.release_conn()
        
        # Read file based on extension
        if file_key.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        elif file_key.endswith(".xlsx"):
            df = pd.read_excel(io.BytesIO(content))
        elif file_key.endswith(".arrow"):
            import pyarrow as pa
            import pyarrow.ipc as ipc
            reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
            df = reader.read_all().to_pandas()
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {file_key}")

        # Find combination_id column
        combination_id_column = None
        for col in df.columns:
            col_lower = col.lower()
            if (col_lower == 'combination_id' or 
                col_lower == 'combo_id' or 
                col_lower == 'combinationid' or
                'combination_id' in col_lower or 
                'combo_id' in col_lower or 
                'combination' in col_lower):
                combination_id_column = col
                break
        
        if not combination_id_column:
            raise HTTPException(status_code=404, detail="No combination_id column found")

        # Find model_name column
        model_name_column = None
        possible_model_columns = ['model_name', 'Model', 'model', 'MODEL_NAME', 'ModelName', 'model_id', 'Model_Name']
        
        for col_name in possible_model_columns:
            if col_name in df.columns:
                model_name_column = col_name
                break
        
        if not model_name_column:
            raise HTTPException(status_code=404, detail="No model_name column found")

        # Filter by combination_id and model_name
        filtered_df = df[(df[combination_id_column] == combination_id) & (df[model_name_column] == model_name)]
        
        if filtered_df.empty:
            raise HTTPException(status_code=404, detail=f"No data found for combination_id: {combination_id} and model_name: {model_name}")

        # Get the first (and should be only) row
        model_row = filtered_df.iloc[0]

        # Find columns that end with _contribution
        contribution_columns = []
        for col in df.columns:
            if col.lower().endswith('_contribution'):
                contribution_columns.append(col)
        
        if not contribution_columns:
            raise HTTPException(status_code=404, detail="No contribution columns found (columns ending with _contribution)")

        # Extract contribution data
        contribution_data = []
        for col in contribution_columns:
            value = model_row[col]
            if pd.notna(value):  # Check if value is not NaN
                # Extract variable name from column (remove _contribution suffix)
                variable_name = col.replace('_contribution', '').replace('_Contribution', '')
                contribution_data.append({
                    "name": variable_name,
                    "value": float(value)
                })

        if not contribution_data:
            raise HTTPException(status_code=404, detail="No valid contribution data found")

        return {
            "file_key": file_key,
            "combination_id": combination_id,
            "model_name": model_name,
            "contribution_data": contribution_data
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting model contribution: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")

@router.get("/models/performance", tags=["Models"])
async def get_model_performance(
    file_key: str = Query(..., description="MinIO file key for the model results file (CSV/Arrow/Feather)"),
    combination_id: str = Query(..., description="Combination ID to filter by"),
    model_name: str = Query(..., description="Model name to get performance for")
):
    """
    Get performance metrics for a specific model and combination.
    Returns mape_train, mape_test, r2_train, r2_test, aic, bic values.
    """
    if not minio_client:
        raise HTTPException(status_code=503, detail="MinIO connection is not available.")

    try:
        # Download file from MinIO
        response = minio_client.get_object(MINIO_BUCKET, file_key)
        content = response.read()
        response.close()
        response.release_conn()
        
        # Read file based on extension
        if file_key.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        elif file_key.endswith(".xlsx"):
            df = pd.read_excel(io.BytesIO(content))
        elif file_key.endswith(".arrow"):
            import pyarrow as pa
            import pyarrow.ipc as ipc
            reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
            df = reader.read_all().to_pandas()
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {file_key}")

        # Find combination_id column
        combination_id_column = None
        for col in df.columns:
            col_lower = col.lower()
            if (col_lower == 'combination_id' or 
                col_lower == 'combo_id' or 
                col_lower == 'combinationid' or
                'combination_id' in col_lower or 
                'combo_id' in col_lower or 
                'combination' in col_lower):
                combination_id_column = col
                break
        
        if not combination_id_column:
            raise HTTPException(status_code=404, detail="No combination_id column found")

        # Find model_name column
        model_name_column = None
        possible_model_columns = ['model_name', 'Model', 'model', 'MODEL_NAME', 'ModelName', 'model_id', 'Model_Name']
        
        for col_name in possible_model_columns:
            if col_name in df.columns:
                model_name_column = col_name
                break
        
        if not model_name_column:
            raise HTTPException(status_code=404, detail="No model_name column found")

        # Filter by combination_id and model_name
        filtered_df = df[(df[combination_id_column] == combination_id) & (df[model_name_column] == model_name)]
        
        if filtered_df.empty:
            raise HTTPException(status_code=404, detail=f"No data found for combination_id: {combination_id} and model_name: {model_name}")

        # Get the first (and should be only) row
        model_row = filtered_df.iloc[0]

        # Define the metric columns we want to check
        metric_columns = {
            'mape_train': ['mape_train', 'MAPE_train', 'Mape_train'],
            'mape_test': ['mape_test', 'MAPE_test', 'Mape_test'],
            'r2_train': ['r2_train', 'R2_train', 'R2_Train'],
            'r2_test': ['r2_test', 'R2_test', 'R2_Test'],
            'aic': ['aic', 'AIC', 'Aic'],
            'bic': ['bic', 'BIC', 'Bic']
        }

        performance_metrics = {}
        
        for metric_name, possible_columns in metric_columns.items():
            found_value = None
            for col in possible_columns:
                if col in model_row.index:
                    value = model_row[col]
                    if pd.notna(value):  # Check if value is not NaN
                        found_value = float(value)
                        break
            
            performance_metrics[metric_name] = found_value if found_value is not None else None

        return {
            "file_key": file_key,
            "combination_id": combination_id,
            "model_name": model_name,
            "performance_metrics": performance_metrics
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting model performance: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")

@router.get("/models/filters", tags=["Models"])
async def get_available_filters(
    file_key: str = Query(..., description="MinIO file key for the model results file (CSV/Arrow/Feather)"),
    combination_id: str = Query(..., description="Combination ID to filter by"),
    variable: str = Query(..., description="Variable name to get filters for")
):
    """
    Get available filter ranges for a specific combination and variable.
    Returns min/max values for mape_train, mape_test, r2_train, r2_test, aic, bic.
    """
    if not minio_client:
        raise HTTPException(status_code=503, detail="MinIO connection is not available.")

    try:
        # Download file from MinIO
        response = minio_client.get_object(MINIO_BUCKET, file_key)
        content = response.read()
        response.close()
        response.release_conn()
        
        # Read file based on extension
        if file_key.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        elif file_key.endswith(".xlsx"):
            df = pd.read_excel(io.BytesIO(content))
        elif file_key.endswith(".arrow"):
            import pyarrow as pa
            import pyarrow.ipc as ipc
            reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
            df = reader.read_all().to_pandas()
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {file_key}")

        # Find combination_id column
        combination_id_column = None
        for col in df.columns:
            col_lower = col.lower()
            if (col_lower == 'combination_id' or 
                col_lower == 'combo_id' or 
                col_lower == 'combinationid' or
                'combination_id' in col_lower or 
                'combo_id' in col_lower or 
                'combination' in col_lower):
                combination_id_column = col
                break
        
        if not combination_id_column:
            raise HTTPException(status_code=404, detail="No combination_id column found")

        # Filter by combination_id
        filtered_df = df[df[combination_id_column] == combination_id]
        
        if filtered_df.empty:
            raise HTTPException(status_code=404, detail=f"No data found for combination_id: {combination_id}")

        # Define the filter columns we want to check
        filter_columns = {
            'mape_train': ['mape_train', 'MAPE_train', 'Mape_train'],
            'mape_test': ['mape_test', 'MAPE_test', 'Mape_test'],
            'r2_train': ['r2_train', 'R2_train', 'R2_Train'],
            'r2_test': ['r2_test', 'R2_test', 'R2_Test'],
            'aic': ['aic', 'AIC', 'Aic'],
            'bic': ['bic', 'BIC', 'Bic']
        }

        available_filters = {}
        
        for filter_name, possible_columns in filter_columns.items():
            found_column = None
            for col in possible_columns:
                if col in filtered_df.columns:
                    found_column = col
                    break
            
            if found_column:
                # Get min and max values, excluding NaN
                valid_values = filtered_df[found_column].dropna()
                if len(valid_values) > 0:
                    available_filters[filter_name] = {
                        'column_name': found_column,
                        'min': float(valid_values.min()),
                        'max': float(valid_values.max()),
                        'current_min': float(valid_values.min()),
                        'current_max': float(valid_values.max())
                    }

        return {
            "file_key": file_key,
            "combination_id": combination_id,
            "variable": variable,
            "available_filters": available_filters,
            "total_models": len(filtered_df)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting available filters: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")

@router.get("/models/variable-ranges", tags=["Models"])
async def get_variable_ranges(
    file_key: str = Query(..., description="MinIO file key for the model results file (CSV/Arrow/Feather)"),
    combination_id: str = Query(..., description="Combination ID to filter by"),
    variables: str = Query(..., description="Comma-separated list of variables"),
    method: str = Query("elasticity", description="Method type: elasticity, beta, or average")
):
    """
    Get min/max ranges for multiple variables based on the selected method.
    Returns ranges for each variable's method values (e.g., elasticity, beta, average).
    """
    if not minio_client:
        raise HTTPException(status_code=503, detail="MinIO connection is not available.")

    try:
        # Download file from MinIO
        response = minio_client.get_object(MINIO_BUCKET, file_key)
        content = response.read()
        response.close()
        response.release_conn()
        
        # Read file based on extension
        if file_key.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        elif file_key.endswith(".xlsx"):
            df = pd.read_excel(io.BytesIO(content))
        elif file_key.endswith(".arrow"):
            import pyarrow as pa
            import pyarrow.ipc as ipc
            reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
            df = reader.read_all().to_pandas()
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {file_key}")

        # Find combination_id column
        combination_id_column = None
        for col in df.columns:
            col_lower = col.lower()
            if (col_lower == 'combination_id' or 
                col_lower == 'combo_id' or 
                col_lower == 'combinationid' or
                'combination_id' in col_lower or 
                'combo_id' in col_lower or 
                'combination' in col_lower):
                combination_id_column = col
                break
        
        if not combination_id_column:
            raise HTTPException(status_code=404, detail="No combination_id column found")

        # Filter by combination_id
        filtered_df = df[df[combination_id_column] == combination_id]
        
        if filtered_df.empty:
            raise HTTPException(status_code=404, detail=f"No data found for combination_id: {combination_id}")

        # Parse variables list
        variable_list = [v.strip() for v in variables.split(',') if v.strip()]
        
        # Handle method suffix
        method_suffix = "avg" if method.lower() == "average" else method.lower()
        
        variable_ranges = {}
        
        for variable in variable_list:
            # Look for method column with pattern: {variable}_{method}
            method_column = None
            for col in filtered_df.columns:
                if col.lower() == f"{variable.lower()}_{method_suffix}":
                    method_column = col
                    break
            
            if method_column and method_column in filtered_df.columns:
                # Get min and max values, excluding NaN
                valid_values = filtered_df[method_column].dropna()
                if len(valid_values) > 0:
                    variable_ranges[variable] = {
                        'column_name': method_column,
                        'min': float(valid_values.min()),
                        'max': float(valid_values.max()),
                        'current_min': float(valid_values.min()),
                        'current_max': float(valid_values.max())
                    }
                else:
                    variable_ranges[variable] = {
                        'column_name': method_column,
                        'min': 0.0,
                        'max': 0.0,
                        'current_min': 0.0,
                        'current_max': 0.0
                    }
            else:
                # Variable not found, provide default values
                variable_ranges[variable] = {
                    'column_name': f"{variable}_{method_suffix}",
                    'min': 0.0,
                    'max': 0.0,
                    'current_min': 0.0,
                    'current_max': 0.0
                }

        return {
            "file_key": file_key,
            "combination_id": combination_id,
            "variables": variable_list,
            "method": method,
            "variable_ranges": variable_ranges,
            "total_models": len(filtered_df)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting variable ranges: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")

@router.get("/models/variables", response_model=ModelVariablesResponse, tags=["Models"])
async def list_variables_in_model_file(
    file_key: str = Query(..., description="MinIO file key for the model results file (CSV/Arrow/Feather)"),
    mode: str = Query("columns", pattern="^(columns|base)$",
                      description="Return raw beta columns ('columns') or deduped base predictor names ('base')"),
    include_intercept: bool = Query(False, description="Whether to include intercept-like beta columns"),
):
    """
    Return model variables with beta coefficients.

    Supports beta patterns:
      - Weighted_Beta_<x>
      - Beta_<x>
      - <x>_beta

    `mode='columns'`  -> raw column names that contain beta
    `mode='base'`     -> deduped base predictor names extracted from the above patterns
    """
    if not minio_client:
        raise HTTPException(status_code=503, detail="MinIO connection is not available.")

    # ---- load file (CSV first, Arrow/Feather fallback)
    try:
        obj = minio_client.get_object(MINIO_BUCKET, file_key)
        blob = obj.read()
        obj.close()
        obj.release_conn()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"MinIO read error: {e}")

    try:
        df = pd.read_csv(io.BytesIO(blob))
    except Exception:
        try:
            import pyarrow.feather as feather
            import pyarrow.ipc as ipc
            try:
                table = feather.read_table(io.BytesIO(blob))
            except Exception:
                table = ipc.RecordBatchFileReader(io.BytesIO(blob)).read_all()
            df = table.to_pandas()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Unsupported file format (CSV/Arrow only): {e}")

    cols = [str(c) for c in df.columns]

    # ---- find beta columns (case-insensitive)
    beta_cols = []
    for c in cols:
        lc = c.lower()
        if "beta" in lc:
            beta_cols.append(c)

    if not include_intercept:
        # filter out common intercept names
        intercept_like = {"beta_intercept", "intercept", "const", "weighted_b0"}
        beta_cols = [c for c in beta_cols if c.lower() not in intercept_like]

    if not beta_cols:
        raise HTTPException(status_code=404, detail="No variables with beta coefficients found in the file.")

    if mode == "columns":
        variables = beta_cols
    else:
        # mode = "base": extract deduped predictor names from patterns
        bases = set()
        for c in beta_cols:
            name = str(c)
            low  = name.lower()
            if low.startswith("weighted_beta_"):
                base = name[len("Weighted_Beta_"):]
            elif low.startswith("beta_"):
                base = name[len("Beta_"):]
            elif low.endswith("_beta"):
                base = name[:-5]
            else:
                # fallback: keep original if weirdly named
                base = name
            # strip any accidental leftover whitespace
            base = base.strip()
            if not include_intercept and base.lower() in {"intercept", "const"}:
                continue
            bases.add(base)
        variables = sorted(bases)

    return ModelVariablesResponse(
        file_key=file_key,
        variables=variables,
        total_variables=len(variables)
    )

@router.post("/models/filter-filtered", response_model=List[FilteredModel], tags=["Models"])
async def filter_models_by_variable_and_metrics_with_filters(filter_req: ModelFilterRequest):
    """
    Filter models using a selected variable (column) and metric ranges.
    This endpoint is specifically for when filters are applied.
    Returns model name and self-elasticity for that variable.
    """
    if not minio_client:
        raise HTTPException(status_code=503, detail="MinIO connection is not available.")

    try:
        # Download file from MinIO
        response = minio_client.get_object(MINIO_BUCKET, filter_req.file_key)
        content = response.read()
        response.close()
        response.release_conn()

        # Read file based on extension (same pattern as combination-ids endpoint)
        if filter_req.file_key.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
            logger.info(f"Successfully read CSV file. Columns: {list(df.columns)}")
        elif filter_req.file_key.endswith(".xlsx"):
            df = pd.read_excel(io.BytesIO(content))
            logger.info(f"Successfully read Excel file. Columns: {list(df.columns)}")
        elif filter_req.file_key.endswith(".arrow"):
            import pyarrow as pa
            import pyarrow.ipc as ipc
            reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
            df = reader.read_all().to_pandas()
            logger.info(f"Successfully read Arrow file. Columns: {list(df.columns)}")
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {filter_req.file_key}")

        # Find the method column for the selected variable
        method_column = None
        method_type = filter_req.method or "elasticity"
        logger.info(f"Looking for {method_type} column for variable: {filter_req.variable}")
        logger.info(f"Available columns: {list(df.columns)}")
        
        # Look for method column with pattern: {variable}_{method}
        # Handle special case for "average" method which uses "avg" in column names
        method_suffix = "avg" if method_type.lower() == "average" else method_type.lower()
        
        for col in df.columns:
            if col.lower() == f"{filter_req.variable.lower()}_{method_suffix}":
                method_column = col
                logger.info(f"Found {method_type} column: '{col}'")
                break
        
        if not method_column:
            expected_column = f"{filter_req.variable}_{method_suffix}"
            raise HTTPException(
                status_code=400, 
                detail=f"No {method_type} column found for variable '{filter_req.variable}'. Expected column: '{expected_column}'. Available columns: {list(df.columns)[:20]}..."
            )

        # Check for model column with flexible naming
        model_column = None
        possible_model_columns = ['model_name', 'Model', 'model', 'MODEL_NAME', 'ModelName', 'model_id', 'Model_Name']
        
        for col_name in possible_model_columns:
            if col_name in df.columns:
                model_column = col_name
                break
        
        if not model_column:
            raise HTTPException(
                status_code=400,
                detail=f"No model identifier column found. Expected one of: {possible_model_columns}. Found columns: {list(df.columns)[:20]}..."
            )

        # Log the detected model column for debugging
        logger.info(f"Using model column: {model_column}")

        # Prepare a DataFrame with model column and the method column
        columns_to_select = [model_column, method_column]
        
        # Add combination_id column if filtering by combination
        combination_id_column = None
        if filter_req.combination_id:
            # Find combination_id column
            for col in df.columns:
                col_lower = col.lower()
                if (col_lower == 'combination_id' or 
                    col_lower == 'combo_id' or 
                    col_lower == 'combinationid' or
                    'combination_id' in col_lower or 
                    'combo_id' in col_lower or 
                    'combination' in col_lower):
                    combination_id_column = col
                    logger.info(f"Found combination_id column: '{col}'")
                    break
            
            if combination_id_column:
                columns_to_select.append(combination_id_column)
            else:
                logger.warning(f"Combination ID filtering requested but no combination_id column found")
        
        # Add metric columns if they exist
        metric_columns = ['MAPE', 'Test_R2', 'SelfElasticity', 'R2', 'r2', 'Test_r2', 'mape_train', 'mape_test', 'r2_train', 'r2_test', 'aic', 'bic', 'AIC', 'BIC']
        existing_metric_columns = []
        
        for col in metric_columns:
            if col in df.columns:
                columns_to_select.append(col)
                existing_metric_columns.append(col)
        
        # Select only the columns we need
        filtered = df[columns_to_select].copy()
        
        # Filter by combination_id if specified
        if filter_req.combination_id and combination_id_column:
            logger.info(f"Filtering by combination_id: {filter_req.combination_id}")
            filtered = filtered[filtered[combination_id_column] == filter_req.combination_id]
            logger.info(f"After combination filtering: {len(filtered)} rows")
        
        # Rename columns for consistent processing
        filtered = filtered.rename(columns={
            model_column: 'model_name',
            method_column: 'selected_variable_value'
        })

        # Apply metric filters based on what exists
        # MAPE filtering
        mape_col = None
        for col in ['MAPE', 'mape', 'Mape']:
            if col in existing_metric_columns:
                mape_col = col
                break
        
        if mape_col and mape_col in filtered.columns:
            if filter_req.min_mape is not None:
                filtered = filtered[filtered[mape_col] >= filter_req.min_mape]
            if filter_req.max_mape is not None:
                filtered = filtered[filtered[mape_col] <= filter_req.max_mape]
        
        # R2 filtering
        r2_col = None
        for col in ['Test_R2', 'R2', 'r2', 'Test_r2']:
            if col in existing_metric_columns:
                r2_col = col
                break
                
        if r2_col and r2_col in filtered.columns:
            if filter_req.min_r2 is not None:
                filtered = filtered[filtered[r2_col] >= filter_req.min_r2]
            if filter_req.max_r2 is not None:
                filtered = filtered[filtered[r2_col] <= filter_req.max_r2]
        
        # Filter by the selected variable's values (self-elasticity)
        if filter_req.min_self_elasticity is not None:
            filtered = filtered[filtered['selected_variable_value'] >= filter_req.min_self_elasticity]
        if filter_req.max_self_elasticity is not None:
            filtered = filtered[filtered['selected_variable_value'] <= filter_req.max_self_elasticity]

        # MAPE Train filtering
        mape_train_col = None
        for col in ['mape_train', 'MAPE_train', 'Mape_train']:
            if col in existing_metric_columns:
                mape_train_col = col
                break
        
        if mape_train_col and mape_train_col in filtered.columns:
            if filter_req.min_mape_train is not None:
                filtered = filtered[filtered[mape_train_col] >= filter_req.min_mape_train]
            if filter_req.max_mape_train is not None:
                filtered = filtered[filtered[mape_train_col] <= filter_req.max_mape_train]

        # MAPE Test filtering
        mape_test_col = None
        for col in ['mape_test', 'MAPE_test', 'Mape_test']:
            if col in existing_metric_columns:
                mape_test_col = col
                break
        
        if mape_test_col and mape_test_col in filtered.columns:
            if filter_req.min_mape_test is not None:
                filtered = filtered[filtered[mape_test_col] >= filter_req.min_mape_test]
            if filter_req.max_mape_test is not None:
                filtered = filtered[filtered[mape_test_col] <= filter_req.max_mape_test]

        # R2 Train filtering
        r2_train_col = None
        for col in ['r2_train', 'R2_train', 'R2_Train']:
            if col in existing_metric_columns:
                r2_train_col = col
                break
        
        if r2_train_col and r2_train_col in filtered.columns:
            if filter_req.min_r2_train is not None:
                filtered = filtered[filtered[r2_train_col] >= filter_req.min_r2_train]
            if filter_req.max_r2_train is not None:
                filtered = filtered[filtered[r2_train_col] <= filter_req.max_r2_train]

        # R2 Test filtering
        r2_test_col = None
        for col in ['r2_test', 'R2_test', 'R2_Test']:
            if col in existing_metric_columns:
                r2_test_col = col
                break
        
        if r2_test_col and r2_test_col in filtered.columns:
            if filter_req.min_r2_test is not None:
                filtered = filtered[filtered[r2_test_col] >= filter_req.min_r2_test]
            if filter_req.max_r2_test is not None:
                filtered = filtered[filtered[r2_test_col] <= filter_req.max_r2_test]

        # AIC filtering
        aic_col = None
        for col in ['aic', 'AIC', 'Aic']:
            if col in existing_metric_columns:
                aic_col = col
                break
        
        if aic_col and aic_col in filtered.columns:
            if filter_req.min_aic is not None:
                filtered = filtered[filtered[aic_col] >= filter_req.min_aic]
            if filter_req.max_aic is not None:
                filtered = filtered[filtered[aic_col] <= filter_req.max_aic]

        # BIC filtering
        bic_col = None
        for col in ['bic', 'BIC', 'Bic']:
            if col in existing_metric_columns:
                bic_col = col
                break
        
        if bic_col and bic_col in filtered.columns:
            if filter_req.min_bic is not None:
                filtered = filtered[filtered[bic_col] >= filter_req.min_bic]
            if filter_req.max_bic is not None:
                filtered = filtered[filtered[bic_col] <= filter_req.max_bic]

        # Per-variable filtering for multiple variables
        if filter_req.variable_filters:
            for variable_name, variable_filter in filter_req.variable_filters.items():
                # For the current variable being processed, filter by selected_variable_value
                # For other variables, we need to find their specific columns
                if variable_name.lower() == filter_req.variable.lower():
                    # This is the current variable being processed
                    # Filter by selected_variable_value column
                    min_val = variable_filter.get('min')
                    max_val = variable_filter.get('max')
                    
                    if min_val is not None:
                        filtered = filtered[filtered['selected_variable_value'] >= min_val]
                    if max_val is not None:
                        filtered = filtered[filtered['selected_variable_value'] <= max_val]
                else:
                    # This is a different variable, need to find its specific column
                    var_method_column = None
                    method_suffix = "avg" if method_type.lower() == "average" else method_type.lower()
                    
                    # Try exact match first
                    for col in df.columns:
                        if col.lower() == f"{variable_name.lower()}_{method_suffix}":
                            var_method_column = col
                            break
                    
                    # If not found, try case-insensitive partial match
                    if not var_method_column:
                        for col in df.columns:
                            col_lower = col.lower()
                            if (variable_name.lower() in col_lower and method_suffix in col_lower):
                                var_method_column = col
                                break
                    
                    if var_method_column and var_method_column in filtered.columns:
                        min_val = variable_filter.get('min')
                        max_val = variable_filter.get('max')
                        
                        if min_val is not None:
                            filtered = filtered[filtered[var_method_column] >= min_val]
                        if max_val is not None:
                            filtered = filtered[filtered[var_method_column] <= max_val]

        # Remove rows with NaN values in critical columns
        filtered = filtered.dropna(subset=['model_name', 'selected_variable_value'])

        # Filter out ensemble models
        filtered = filtered[~filtered['model_name'].str.lower().str.contains('ensemble', na=False)]

        # Prepare response
        result = []
        for _, row in filtered.iterrows():
            model_data = {
                "model_name": str(row["model_name"]),  # Convert to string to handle any data type
                "self_elasticity": float(row["selected_variable_value"])  # Ensure it's a float
            }
            
            # Add method-specific field based on the method type
            if method_type == "beta":
                model_data["self_beta"] = float(row["selected_variable_value"])
            elif method_type == "average":
                model_data["self_avg"] = float(row["selected_variable_value"])
            
            result.append(FilteredModel(**model_data))
        
        if not result:
            # Provide more helpful error message
            total_models = len(df)
            filtered_by_metrics = len(filtered)
            raise HTTPException(
                status_code=404, 
                detail=f"No models found matching the criteria. Total models: {total_models}, After filtering: {filtered_by_metrics}"
            )
        
        logger.info(f"Found {len(result)} models matching the criteria")
        return result
        
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        # Log the full error for debugging
        import traceback
        error_detail = f"Error processing file: {str(e)}\nTraceback: {traceback.format_exc()}"
        logger.error(error_detail)
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")

@router.post("/models/filter", response_model=List[FilteredModel], tags=["Models"])
async def filter_models_by_variable_and_metrics(filter_req: ModelFilterRequest):
    """
    Filter models using a selected variable (column) and metric ranges.
    This endpoint is for initial data fetch without filters applied.
    Returns model name and self-elasticity for that variable.
    """
    if not minio_client:
        raise HTTPException(status_code=503, detail="MinIO connection is not available.")

    try:
        # Download file from MinIO
        response = minio_client.get_object(MINIO_BUCKET, filter_req.file_key)
        content = response.read()
        response.close()
        response.release_conn()

        # Read file based on extension (same pattern as combination-ids endpoint)
        if filter_req.file_key.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
            logger.info(f"Successfully read CSV file. Columns: {list(df.columns)}")
        elif filter_req.file_key.endswith(".xlsx"):
            df = pd.read_excel(io.BytesIO(content))
            logger.info(f"Successfully read Excel file. Columns: {list(df.columns)}")
        elif filter_req.file_key.endswith(".arrow"):
            import pyarrow as pa
            import pyarrow.ipc as ipc
            reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
            df = reader.read_all().to_pandas()
            logger.info(f"Successfully read Arrow file. Columns: {list(df.columns)}")
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {filter_req.file_key}")

        # Find the method column for the selected variable
        method_column = None
        method_type = filter_req.method or "elasticity"
        logger.info(f"Looking for {method_type} column for variable: {filter_req.variable}")
        logger.info(f"Available columns: {list(df.columns)}")
        
        # Look for method column with pattern: {variable}_{method}
        # Handle special case for "average" method which uses "avg" in column names
        method_suffix = "avg" if method_type.lower() == "average" else method_type.lower()
        
        for col in df.columns:
            if col.lower() == f"{filter_req.variable.lower()}_{method_suffix}":
                method_column = col
                logger.info(f"Found {method_type} column: '{col}'")
                break
        
        if not method_column:
            expected_column = f"{filter_req.variable}_{method_suffix}"
            raise HTTPException(
                status_code=400, 
                detail=f"No {method_type} column found for variable '{filter_req.variable}'. Expected column: '{expected_column}'. Available columns: {list(df.columns)[:20]}..."
            )

        # Check for model column with flexible naming
        model_column = None
        possible_model_columns = ['model_name', 'Model', 'model', 'MODEL_NAME', 'ModelName', 'model_id', 'Model_Name']
        
        for col_name in possible_model_columns:
            if col_name in df.columns:
                model_column = col_name
                break
        
        if not model_column:
            raise HTTPException(
                status_code=400,
                detail=f"No model identifier column found. Expected one of: {possible_model_columns}. Found columns: {list(df.columns)[:20]}..."
            )

        # Log the detected model column for debugging
        logger.info(f"Using model column: {model_column}")

        # Prepare a DataFrame with model column and the method column
        columns_to_select = [model_column, method_column]
        
        # Add combination_id column if filtering by combination
        combination_id_column = None
        if filter_req.combination_id:
            # Find combination_id column
            for col in df.columns:
                col_lower = col.lower()
                if (col_lower == 'combination_id' or 
                    col_lower == 'combo_id' or 
                    col_lower == 'combinationid' or
                    'combination_id' in col_lower or 
                    'combo_id' in col_lower or 
                    'combination' in col_lower):
                    combination_id_column = col
                    logger.info(f"Found combination_id column: '{col}'")
                    break
            
            if combination_id_column:
                columns_to_select.append(combination_id_column)
            else:
                logger.warning(f"Combination ID filtering requested but no combination_id column found")
        
        # Add metric columns if they exist
        metric_columns = ['MAPE', 'Test_R2', 'SelfElasticity', 'R2', 'r2', 'Test_r2', 'mape_train', 'mape_test', 'r2_train', 'r2_test', 'aic', 'bic', 'AIC', 'BIC']
        existing_metric_columns = []
        
        for col in metric_columns:
            if col in df.columns:
                columns_to_select.append(col)
                existing_metric_columns.append(col)
        
        # Select only the columns we need
        filtered = df[columns_to_select].copy()
        
        # Filter by combination_id if specified
        if filter_req.combination_id and combination_id_column:
            logger.info(f"Filtering by combination_id: {filter_req.combination_id}")
            filtered = filtered[filtered[combination_id_column] == filter_req.combination_id]
            logger.info(f"After combination filtering: {len(filtered)} rows")
        
        # Rename columns for consistent processing
        filtered = filtered.rename(columns={
            model_column: 'model_name',
            method_column: 'selected_variable_value'
        })

        # Apply metric filters based on what exists
        # MAPE filtering
        mape_col = None
        for col in ['MAPE', 'mape', 'Mape']:
            if col in existing_metric_columns:
                mape_col = col
                break
        
        if mape_col and mape_col in filtered.columns:
            if filter_req.min_mape is not None:
                filtered = filtered[filtered[mape_col] >= filter_req.min_mape]
            if filter_req.max_mape is not None:
                filtered = filtered[filtered[mape_col] <= filter_req.max_mape]
        
        # R2 filtering
        r2_col = None
        for col in ['Test_R2', 'R2', 'r2', 'Test_r2']:
            if col in existing_metric_columns:
                r2_col = col
                break
                
        if r2_col and r2_col in filtered.columns:
            if filter_req.min_r2 is not None:
                filtered = filtered[filtered[r2_col] >= filter_req.min_r2]
            if filter_req.max_r2 is not None:
                filtered = filtered[filtered[r2_col] <= filter_req.max_r2]
        
        # Filter by the selected variable's values (self-elasticity)
        if filter_req.min_self_elasticity is not None:
            filtered = filtered[filtered['selected_variable_value'] >= filter_req.min_self_elasticity]
        if filter_req.max_self_elasticity is not None:
            filtered = filtered[filtered['selected_variable_value'] <= filter_req.max_self_elasticity]

        # MAPE Train filtering
        mape_train_col = None
        for col in ['mape_train', 'MAPE_train', 'Mape_train']:
            if col in existing_metric_columns:
                mape_train_col = col
                break
        
        if mape_train_col and mape_train_col in filtered.columns:
            if filter_req.min_mape_train is not None:
                filtered = filtered[filtered[mape_train_col] >= filter_req.min_mape_train]
            if filter_req.max_mape_train is not None:
                filtered = filtered[filtered[mape_train_col] <= filter_req.max_mape_train]

        # MAPE Test filtering
        mape_test_col = None
        for col in ['mape_test', 'MAPE_test', 'Mape_test']:
            if col in existing_metric_columns:
                mape_test_col = col
                break
        
        if mape_test_col and mape_test_col in filtered.columns:
            if filter_req.min_mape_test is not None:
                filtered = filtered[filtered[mape_test_col] >= filter_req.min_mape_test]
            if filter_req.max_mape_test is not None:
                filtered = filtered[filtered[mape_test_col] <= filter_req.max_mape_test]

        # R2 Train filtering
        r2_train_col = None
        for col in ['r2_train', 'R2_train', 'R2_Train']:
            if col in existing_metric_columns:
                r2_train_col = col
                break
        
        if r2_train_col and r2_train_col in filtered.columns:
            if filter_req.min_r2_train is not None:
                filtered = filtered[filtered[r2_train_col] >= filter_req.min_r2_train]
            if filter_req.max_r2_train is not None:
                filtered = filtered[filtered[r2_train_col] <= filter_req.max_r2_train]

        # R2 Test filtering
        r2_test_col = None
        for col in ['r2_test', 'R2_test', 'R2_Test']:
            if col in existing_metric_columns:
                r2_test_col = col
                break
        
        if r2_test_col and r2_test_col in filtered.columns:
            if filter_req.min_r2_test is not None:
                filtered = filtered[filtered[r2_test_col] >= filter_req.min_r2_test]
            if filter_req.max_r2_test is not None:
                filtered = filtered[filtered[r2_test_col] <= filter_req.max_r2_test]

        # AIC filtering
        aic_col = None
        for col in ['aic', 'AIC', 'Aic']:
            if col in existing_metric_columns:
                aic_col = col
                break
        
        if aic_col and aic_col in filtered.columns:
            if filter_req.min_aic is not None:
                filtered = filtered[filtered[aic_col] >= filter_req.min_aic]
            if filter_req.max_aic is not None:
                filtered = filtered[filtered[aic_col] <= filter_req.max_aic]

        # BIC filtering
        bic_col = None
        for col in ['bic', 'BIC', 'Bic']:
            if col in existing_metric_columns:
                bic_col = col
                break
        
        if bic_col and bic_col in filtered.columns:
            if filter_req.min_bic is not None:
                filtered = filtered[filtered[bic_col] >= filter_req.min_bic]
            if filter_req.max_bic is not None:
                filtered = filtered[filtered[bic_col] <= filter_req.max_bic]

        # Remove rows with NaN values in critical columns
        filtered = filtered.dropna(subset=['model_name', 'selected_variable_value'])

        # Filter out ensemble models
        filtered = filtered[~filtered['model_name'].str.lower().str.contains('ensemble', na=False)]

        # Prepare response
        result = []
        for _, row in filtered.iterrows():
            model_data = {
                "model_name": str(row["model_name"]),  # Convert to string to handle any data type
                "self_elasticity": float(row["selected_variable_value"])  # Ensure it's a float
            }
            
            # Add method-specific field based on the method type
            if method_type == "beta":
                model_data["self_beta"] = float(row["selected_variable_value"])
            elif method_type == "average":
                model_data["self_avg"] = float(row["selected_variable_value"])
            
            result.append(FilteredModel(**model_data))
        
        if not result:
            # Provide more helpful error message
            total_models = len(df)
            filtered_by_metrics = len(filtered)
            raise HTTPException(
                status_code=404, 
                detail=f"No models found matching the criteria. Total models: {total_models}, After filtering: {filtered_by_metrics}"
            )
        
        logger.info(f"Found {len(result)} models matching the criteria")
        return result
        
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        # Log the full error for debugging
        import traceback
        error_detail = f"Error processing file: {str(e)}\nTraceback: {traceback.format_exc()}"
        logger.error(error_detail)
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")

@router.post("/models/select-save-generic", response_model=SavedModelResponse, tags=["Models"])
async def select_and_save_model_generic(selection_req: GenericModelSelectionRequest):
    """
    Select a specific model from CSV results and save it to MongoDB.
    Also adds a 'selected_models' column to the source file indicating which combinations were selected.
    
    You can select a model by either:
    1. Row index (0-based)
    2. Filter criteria (dictionary of column:value pairs)
    """
    if not minio_client:
        raise HTTPException(status_code=503, detail="MinIO connection is not available.")
    
    if db is None:
        raise HTTPException(status_code=503, detail="MongoDB connection is not available.")
    
    try:
        # Download file from MinIO
        response = minio_client.get_object(MINIO_BUCKET, selection_req.file_key)
        content = response.read()
        response.close()
        response.release_conn()
        
        # Read file based on extension
        if selection_req.file_key.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        elif selection_req.file_key.endswith(".xlsx"):
            df = pd.read_excel(io.BytesIO(content))
        elif selection_req.file_key.endswith(".arrow"):
            import pyarrow as pa
            import pyarrow.ipc as ipc
            reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
            df = reader.read_all().to_pandas()
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {selection_req.file_key}")
        
        # Check if this is an ensemble model selection first
        is_ensemble = False
        selected_combination_id = None
        
        if selection_req.filter_criteria and 'model_name' in selection_req.filter_criteria:
            model_name = selection_req.filter_criteria['model_name']
            if 'ensemble' in model_name.lower() or model_name.lower() == 'ensemble':
                is_ensemble = True
                logger.info(f"🔍 DEBUG: Detected ensemble model selection: {model_name}")
                # For ensemble, get the combination_id from filter criteria
                if 'combination_id' in selection_req.filter_criteria:
                    selected_combination_id = selection_req.filter_criteria['combination_id']
                    logger.info(f"🔍 DEBUG: Ensemble combination_id: {selected_combination_id}")
                # For ensemble, we don't need to find existing data, we'll create new
                model_data = None
            else:
                # Select the row for non-ensemble models
                if selection_req.row_index is not None:
                    # Select by index
                    if selection_req.row_index >= len(df) or selection_req.row_index < 0:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Row index {selection_req.row_index} out of range. File has {len(df)} rows."
                        )
                    model_data = df.iloc[selection_req.row_index]
                    
                elif selection_req.filter_criteria:
                    # Select by filter criteria - use simple string comparison to avoid array issues
                    mask = pd.Series([True] * len(df))
                    for col, value in selection_req.filter_criteria.items():
                        if col not in df.columns:
                            raise HTTPException(
                                status_code=400,
                                detail=f"Column '{col}' not found in file. Available columns: {df.columns.tolist()}"
                            )
                        # Convert both column and value to strings to avoid array comparison issues
                        col_str = df[col].astype(str)
                        value_str = str(value)
                        mask &= (col_str == value_str)
                    
                    filtered_df = df[mask]
                    if filtered_df.empty:
                        raise HTTPException(
                            status_code=404,
                            detail=f"No rows found matching criteria: {selection_req.filter_criteria}"
                        )
                    if len(filtered_df) > 1:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Multiple rows ({len(filtered_df)}) found matching criteria. Please be more specific."
                        )
                    
                    model_data = filtered_df.iloc[0]
                else:
                    raise HTTPException(
                        status_code=400,
                        detail="Either row_index or filter_criteria must be provided"
                    )
        else:
            # Handle case where no model_name in filter_criteria
            if selection_req.row_index is not None:
                # Select by index
                if selection_req.row_index >= len(df) or selection_req.row_index < 0:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Row index {selection_req.row_index} out of range. File has {len(df)} rows."
                    )
                model_data = df.iloc[selection_req.row_index]
            
            elif selection_req.filter_criteria:
                # Select by filter criteria - use simple string comparison to avoid array issues
                mask = pd.Series([True] * len(df))
                for col, value in selection_req.filter_criteria.items():
                    if col not in df.columns:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Column '{col}' not found in file. Available columns: {df.columns.tolist()}"
                        )
                    # Convert both column and value to strings to avoid array comparison issues
                    col_str = df[col].astype(str)
                    value_str = str(value)
                    mask &= (col_str == value_str)
                
                filtered_df = df[mask]
                if filtered_df.empty:
                    raise HTTPException(
                        status_code=404,
                        detail=f"No rows found matching criteria: {selection_req.filter_criteria}"
                    )
                if len(filtered_df) > 1:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Multiple rows ({len(filtered_df)}) found matching criteria. Please be more specific."
                    )
                
                model_data = filtered_df.iloc[0]
            else:
                raise HTTPException(
                    status_code=400,
                    detail="Either row_index or filter_criteria must be provided"
                )
        
        # Convert to dictionary and handle special values
        if is_ensemble:
            # For ensemble, fetch the actual ensemble metrics data
            logger.info(f"🔍 DEBUG: Fetching ensemble metrics for combination_id: {selected_combination_id}")
            
            try:
                # Create ensemble request to get weighted metrics
                from .schemas import WeightedEnsembleRequest
                ensemble_req = WeightedEnsembleRequest(
                    file_key=selection_req.file_key,
                    grouping_keys=["combination_id"],
                    filter_criteria={"combination_id": selected_combination_id}
                )
                
                logger.info(f"🔍 DEBUG: Ensemble request: {ensemble_req}")
                
                # Call the weighted ensemble endpoint to get actual metrics
                ensemble_result = await weighted_ensemble(ensemble_req)
                
                logger.info(f"🔍 DEBUG: Ensemble result: {ensemble_result}")
                logger.info(f"🔍 DEBUG: Ensemble result type: {type(ensemble_result)}")
                
                if ensemble_result and hasattr(ensemble_result, 'results') and ensemble_result.results:
                    logger.info(f"🔍 DEBUG: Number of ensemble results: {len(ensemble_result.results)}")
                    ensemble_data = ensemble_result.results[0]  # Get the first (and should be only) result
                    logger.info(f"🔍 DEBUG: Ensemble data: {ensemble_data}")
                    
                    if hasattr(ensemble_data, 'weighted'):
                        weighted_metrics = ensemble_data.weighted
                        logger.info(f"🔍 DEBUG: Found ensemble metrics: {weighted_metrics}")
                    else:
                        logger.warning(f"⚠️ WARNING: No 'weighted' attribute in ensemble data")
                        weighted_metrics = {}
                else:
                    logger.warning(f"⚠️ WARNING: No ensemble results found")
                    weighted_metrics = {}
                
                # Handle x_variables properly - convert numpy array to string
                x_vars = df['x_variables'].iloc[0] if len(df) > 0 else '[]'
                if isinstance(x_vars, (list, np.ndarray)):
                    x_vars_str = str(list(x_vars)) if isinstance(x_vars, np.ndarray) else str(x_vars)
                else:
                    x_vars_str = str(x_vars)
                
                # Create ensemble model_dict with actual metrics
                model_dict = {
                    'model_name': 'Ensemble',
                    'combination_id': selected_combination_id,
                    'Scope': df['Scope'].iloc[0] if len(df) > 0 else 'Scope_1',
                    'y_variable': df['y_variable'].iloc[0] if len(df) > 0 else 'Volume',
                    'x_variables': x_vars_str,
                    'mape_train': weighted_metrics.get('mape_train', 0.0),
                    'mape_test': weighted_metrics.get('mape_test', 0.0),
                    'r2_train': weighted_metrics.get('r2_train', 0.0),
                    'r2_test': weighted_metrics.get('r2_test', 0.0),
                    'aic': weighted_metrics.get('aic', 0.0),
                    'bic': weighted_metrics.get('bic', 0.0),
                    'intercept': weighted_metrics.get('intercept', 0.0),  # Use 'intercept' directly, not 'b0'
                    'n_parameters': weighted_metrics.get('n_parameters', 0),
                    'price_elasticity': weighted_metrics.get('price_elasticity', 0.0),  # Use 'price_elasticity' directly
                    'run_id': f"ensemble_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
                    'timestamp': datetime.now().isoformat()
                }
                
                # Add all the weighted metrics to the model_dict
                logger.info(f"🔍 DEBUG: Adding weighted metrics to model_dict. Keys: {list(weighted_metrics.keys())}")
                for key, value in weighted_metrics.items():
                    if key not in model_dict:
                        model_dict[key] = value
                        logger.info(f"🔍 DEBUG: Added {key} = {value}")
                    else:
                        logger.info(f"🔍 DEBUG: Skipped {key} (already exists in model_dict)")
                
                cleaned_dict = model_dict
                logger.info(f"🔍 DEBUG: Created ensemble model_dict with actual metrics")
                logger.info(f"🔍 DEBUG: Final model_dict keys: {list(model_dict.keys())}")
                logger.info(f"🔍 DEBUG: Final model_dict values: {model_dict}")
                    
            except Exception as e:
                logger.error(f"❌ Error fetching ensemble metrics: {str(e)}")
                # Fallback to default values if ensemble fetch fails
                x_vars = df['x_variables'].iloc[0] if len(df) > 0 else '[]'
                if isinstance(x_vars, (list, np.ndarray)):
                    x_vars_str = str(list(x_vars)) if isinstance(x_vars, np.ndarray) else str(x_vars)
                else:
                    x_vars_str = str(x_vars)
                
                model_dict = {
                    'model_name': 'Ensemble',
                    'combination_id': selected_combination_id,
                    'Scope': df['Scope'].iloc[0] if len(df) > 0 else 'Scope_1',
                    'y_variable': df['y_variable'].iloc[0] if len(df) > 0 else 'Volume',
                    'x_variables': x_vars_str,
                    'mape_train': 0.0,
                    'mape_test': 0.0,
                    'r2_train': 0.0,
                    'r2_test': 0.0,
                    'aic': 0.0,
                    'bic': 0.0,
                    'intercept': 0.0,
                    'n_parameters': 0,
                    'price_elasticity': 0.0,
                    'run_id': f"ensemble_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
                    'timestamp': datetime.now().isoformat()
                }
                cleaned_dict = model_dict
        else:
            # For regular models, process the existing data
            model_dict = model_data.to_dict()
        
        # Clean the data - convert numpy types and handle NaN/Inf
        cleaned_dict = {}
        for key, value in model_dict.items():
            try:
                # Handle arrays/lists by converting to string
                if isinstance(value, (list, np.ndarray)):
                    cleaned_dict[key] = str(value)
                elif pd.isna(value):
                    cleaned_dict[key] = None
                elif isinstance(value, (np.integer, np.floating)):
                    if np.isinf(value):
                        cleaned_dict[key] = "inf" if value > 0 else "-inf"
                    else:
                        cleaned_dict[key] = float(value)
                else:
                    cleaned_dict[key] = value
            except Exception as e:
                # If any error occurs, convert to string as fallback
                cleaned_dict[key] = str(value)
        
        # Prepare document for MongoDB
        document = {
            # Model data (all columns from CSV)
            "model_data": cleaned_dict,
            
            # Metadata
            "model_name": selection_req.model_name or f"model_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            "source_file": selection_req.file_key,
            "selection_criteria": {
                "row_index": selection_req.row_index,
                "filter_criteria": selection_req.filter_criteria
            },
            
            # User metadata
            "tags": selection_req.tags,
            "description": selection_req.description,
            
            # Timestamps
            "created_at": datetime.now(),
            "updated_at": datetime.now(),
            
            # Additional info
            "column_names": df.columns.tolist(),
            "total_rows_in_file": len(df)
        }
        
        # Get saved_models_generic collection reference (required by code but not saved to MongoDB)
        saved_models_collection = db.get_collection("saved_models_generic")
        
        # Create a mock result object to maintain compatibility
        class MockResult:
            def __init__(self):
                self.inserted_id = "mock_id_not_saved_to_mongo"
        
        result = MockResult()
        
        # Note: Not actually saving to saved_models_generic collection in MongoDB
        # Only saving to select_configs collection
        
        # Also save to select_configs collection with metadata and model results
        try:
            # Log the available fields for debugging
            logger.info(f"🔍 DEBUG: Available fields in cleaned_dict: {list(cleaned_dict.keys())}")
            
            # Get client, app, and project from object prefix (like build atom)
            try:
                object_prefix = await get_object_prefix()
                prefix_parts = object_prefix.strip('/').split('/')
                
                if len(prefix_parts) >= 2:
                    client_name = prefix_parts[0]
                    app_name = prefix_parts[1]
                    project_name = prefix_parts[2] if len(prefix_parts) > 2 else "default_project"
                    logger.info(f"✅ Extracted client: {client_name}, app: {app_name}, project: {project_name}")
                else:
                    client_name = "default_client"
                    app_name = "default_app"
                    project_name = "default_project"
                    logger.warning(f"⚠️ Could not extract client/app/project from prefix: {object_prefix}")
            except Exception as e:
                logger.warning(f"⚠️ Failed to get object prefix: {e}")
                client_name = "default_client"
                app_name = "default_app"
                project_name = "default_project"
            
            # Get combination_id for creating unique _id
            combination_id = cleaned_dict.get("combination_id") or cleaned_dict.get("Combination_ID") or cleaned_dict.get("combination") or "unknown"
            
            # Create unique _id like build atom: client_name/app_name/project_name/combination_id
            document_id = f"{client_name}/{app_name}/{project_name}/{combination_id}"
            
            # Prepare document for select_configs collection with client/app/project structure
            select_config_document = {
                # Custom _id like build atom
                "_id": document_id,
                
                # Client/App/Project structure (like build atom)
                "client_name": client_name,
                "app_name": app_name,
                "project_name": project_name,
                
                # Metadata from the selection - use get() with fallbacks
                "combination_id": combination_id,
                "scope": cleaned_dict.get("Scope") or cleaned_dict.get("scope") or cleaned_dict.get("scope_name") or "unknown",
                "y_variable": cleaned_dict.get("y_variable") or cleaned_dict.get("Y_Variable") or cleaned_dict.get("target") or "unknown",
                "x_variables": cleaned_dict.get("x_variables") or cleaned_dict.get("X_Variables") or cleaned_dict.get("features") or "unknown",
                "model_name": cleaned_dict.get("model_name") or cleaned_dict.get("Model_Name") or cleaned_dict.get("Model") or "unknown",
                
                # Model performance metrics - use get() with fallbacks
                "mape_train": cleaned_dict.get("mape_train") or cleaned_dict.get("MAPE_Train") or cleaned_dict.get("train_mape") or None,
                "mape_test": cleaned_dict.get("mape_test") or cleaned_dict.get("MAPE_Test") or cleaned_dict.get("test_mape") or None,
                "r2_train": cleaned_dict.get("r2_train") or cleaned_dict.get("R2_Train") or cleaned_dict.get("train_r2") or None,
                "r2_test": cleaned_dict.get("r2_test") or cleaned_dict.get("R2_Test") or cleaned_dict.get("test_r2") or None,
                "aic": cleaned_dict.get("aic") or cleaned_dict.get("AIC") or None,
                "bic": cleaned_dict.get("bic") or cleaned_dict.get("BIC") or None,
                "intercept": cleaned_dict.get("intercept") or cleaned_dict.get("Intercept") or None,
                "n_parameters": cleaned_dict.get("n_parameters") or cleaned_dict.get("N_Parameters") or cleaned_dict.get("parameters") or None,
                "price_elasticity": cleaned_dict.get("price_elasticity") or cleaned_dict.get("Price_Elasticity") or cleaned_dict.get("elasticity") or None,
                
                # Additional metadata
                "run_id": cleaned_dict.get("run_id") or cleaned_dict.get("Run_ID") or cleaned_dict.get("run") or None,
                "timestamp": cleaned_dict.get("timestamp") or cleaned_dict.get("Timestamp") or cleaned_dict.get("date") or None,
                "source_file": selection_req.file_key,
                "selection_criteria": {
                    "row_index": selection_req.row_index,
                    "filter_criteria": selection_req.filter_criteria
                },
                "tags": selection_req.tags,
                "description": selection_req.description,
                
                # Timestamps
                "created_at": datetime.now(),
                "updated_at": datetime.now(),
                
                # Reference to the saved model
                "saved_model_id": str(result.inserted_id),
                "saved_model_collection": "saved_models_generic",
                
                # Store the complete cleaned_dict for reference
                "complete_model_data": cleaned_dict
            }
            
            # Get the select_configs collection dynamically
            select_configs_coll = get_select_configs_collection()
            if select_configs_coll is None:
                logger.error("❌ Failed to get select_configs collection - cannot save metadata")
                raise Exception("Select configs collection not available")
            
            # Use replace_one with upsert=True like scope selector atom
            result_select = await select_configs_coll.replace_one(
                {"_id": document_id},
                select_config_document,
                upsert=True
            )
            
            # Determine operation type like scope selector
            operation = "inserted" if result_select.upserted_id else "updated"
            logger.info(f"✅ Document saved with custom _id: {document_id}")
            logger.info(f"✅ Operation: {operation}")
            logger.info(f"✅ Upserted ID: {result_select.upserted_id}")
            logger.info(f"✅ Modified count: {result_select.modified_count}")
            
            # Create index for efficient queries (including client/app/project)
            await select_configs_coll.create_index([("client_name", 1), ("app_name", 1), ("project_name", 1)])
            await select_configs_coll.create_index([("combination_id", 1)])
            await select_configs_coll.create_index([("scope", 1)])
            await select_configs_coll.create_index([("model_name", 1)])
            await select_configs_coll.create_index([("created_at", -1)])
            
            logger.info(f"✅ Successfully saved to select_configs collection for combination_id: {select_config_document['combination_id']}")
            logger.info(f"✅ Document saved with custom _id: {document_id}")
            logger.info(f"✅ Operation: {operation}")
            logger.info(f"✅ Saved under client: {client_name}, app: {app_name}, project: {project_name}")
            logger.info(f"✅ Collection used: {MONGO_DB}.{SELECT_CONFIGS_COLLECTION_NAME}")
            
        except Exception as e:
            logger.error(f"❌ Error: Failed to save to select_configs collection: {e}")
            logger.error(f"❌ Error details: {type(e).__name__}: {str(e)}")
            import traceback
            logger.error(f"❌ Traceback: {traceback.format_exc()}")
            # Continue with the main flow even if this fails
        
        # Now modify the source file to add 'selected_models' column
        try:
            # Add 'selected_models' column if it doesn't exist
            if 'selected_models' not in df.columns:
                df['selected_models'] = 'no'
            
            # First, set all rows with the same combination_id to 'no' to ensure only one 'yes' per combination
            if 'combination_id' in df.columns:
                # Find the combination_id of the selected model
                selected_combination_id = None
                if selection_req.row_index is not None:
                    selected_combination_id = df.loc[selection_req.row_index, 'combination_id']
                elif selection_req.filter_criteria and 'combination_id' in selection_req.filter_criteria:
                    selected_combination_id = selection_req.filter_criteria['combination_id']
                
                logger.info(f"🔍 DEBUG: Selected combination_id: {selected_combination_id}")
                logger.info(f"🔍 DEBUG: Filter criteria: {selection_req.filter_criteria}")
                
                if selected_combination_id is not None:
                    # Set all rows with the same combination_id to 'no'
                    rows_to_reset = df[df['combination_id'] == selected_combination_id]
                    logger.info(f"🔍 DEBUG: Rows to reset to 'no': {len(rows_to_reset)} rows with combination_id {selected_combination_id}")
                    df.loc[df['combination_id'] == selected_combination_id, 'selected_models'] = 'no'
                    logger.info(f"🔍 DEBUG: Reset completed for combination_id {selected_combination_id}")
                else:
                    logger.warning(f"⚠️ WARNING: Could not determine combination_id from request")
            
            # Now set the selected model row to 'yes'
            if selection_req.row_index is not None:
                # Select by index
                df.loc[selection_req.row_index, 'selected_models'] = 'yes'
                logger.info(f"🔍 DEBUG: Set row {selection_req.row_index} to 'yes'")
            elif selection_req.filter_criteria:
                # Check if this is an ensemble model selection
                is_ensemble = False
                if 'model_name' in selection_req.filter_criteria:
                    model_name = selection_req.filter_criteria['model_name']
                    if 'ensemble' in model_name.lower() or model_name.lower() == 'ensemble':
                        is_ensemble = True
                        logger.info(f"🔍 DEBUG: Detected ensemble model selection: {model_name}")
                
                if is_ensemble:
                    # Check if ensemble already exists for this combination
                    existing_ensemble_mask = (df['combination_id'] == selected_combination_id) & (df['model_name'] == 'Ensemble')
                    existing_ensemble_rows = df[existing_ensemble_mask]
                    
                    if len(existing_ensemble_rows) > 0:
                        # Ensemble already exists, just mark it as selected
                        df.loc[existing_ensemble_mask, 'selected_models'] = 'yes'
                        logger.info(f"🔍 DEBUG: Ensemble already exists for combination {selected_combination_id}, marked as selected")
                    else:
                        # Create new ensemble row with actual ensemble data
                        # Get the weighted metrics from the ensemble calculation
                        weighted_metrics_for_file = {}
                        if 'weighted_metrics' in locals():
                            weighted_metrics_for_file = weighted_metrics
                        elif hasattr(ensemble_data, 'weighted'):
                            weighted_metrics_for_file = ensemble_data.weighted
                        
                        ensemble_row = {
                            'Scope': df['Scope'].iloc[0] if len(df) > 0 else 'Scope_1',
                            'combination_id': selected_combination_id,
                            'y_variable': df['y_variable'].iloc[0] if len(df) > 0 else 'Volume',
                            'x_variables': df['x_variables'].iloc[0] if len(df) > 0 else '[]',
                            'model_name': 'Ensemble',
                            'mape_train': weighted_metrics_for_file.get('mape_train', 0.0),
                            'mape_test': weighted_metrics_for_file.get('mape_test', 0.0),
                            'r2_train': weighted_metrics_for_file.get('r2_train', 0.0),
                            'r2_test': weighted_metrics_for_file.get('r2_test', 0.0),
                            'aic': weighted_metrics_for_file.get('aic', 0.0),
                            'bic': weighted_metrics_for_file.get('bic', 0.0),
                            'intercept': weighted_metrics_for_file.get('intercept', 0.0),
                            'n_parameters': weighted_metrics_for_file.get('n_parameters', 0),
                            'price_elasticity': weighted_metrics_for_file.get('price_elasticity', 0.0),
                            'run_id': f"ensemble_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
                            'timestamp': datetime.now().isoformat(),
                            'selected_models': 'yes'
                        }
                        
                        # Add all other columns with default values or weighted metrics
                        for col in df.columns:
                            if col not in ensemble_row:
                                # Check if this column exists in weighted metrics
                                if col in weighted_metrics_for_file:
                                    ensemble_row[col] = weighted_metrics_for_file[col]
                                else:
                                    ensemble_row[col] = 0.0 if df[col].dtype in ['float64', 'int64'] else ''
                        
                        # Append the ensemble row to the dataframe
                        df = pd.concat([df, pd.DataFrame([ensemble_row])], ignore_index=True)
                        logger.info(f"🔍 DEBUG: Added new ensemble row to dataframe")
                    
                else:
                    # Regular model selection - use filter criteria
                    mask = pd.Series([True] * len(df))
                    for col, value in selection_req.filter_criteria.items():
                        col_str = df[col].astype(str)
                        value_str = str(value)
                        mask &= (col_str == value_str)
                    
                    rows_to_select = df[mask]
                    logger.info(f"🔍 DEBUG: Rows matching filter criteria: {len(rows_to_select)} rows")
                    logger.info(f"🔍 DEBUG: Filter mask: {mask.sum()} True values")
                    
                    df.loc[mask, 'selected_models'] = 'yes'
                    logger.info(f"🔍 DEBUG: Set filtered rows to 'yes'")
            
            # Log the final state
            if 'combination_id' in df.columns:
                final_selected = df[df['selected_models'] == 'yes']
                logger.info(f"🔍 DEBUG: Final selected rows: {len(final_selected)} rows")
                for _, row in final_selected.iterrows():
                    logger.info(f"🔍 DEBUG: Selected - combination_id: {row.get('combination_id')}, model: {row.get('model_name', 'N/A')}")
            
            # Save the modified source file back to MinIO
            # logger.info(f"🔍 DEBUG: About to save file back to MinIO: {selection_req.file_key}")
            # logger.info(f"🔍 DEBUG: File type detected: {selection_req.file_key.split('.')[-1]}")
            # logger.info(f"🔍 DEBUG: DataFrame shape after modifications: {df.shape}")
            # logger.info(f"🔍 DEBUG: DataFrame columns: {df.columns.tolist()}")
            # logger.info(f"🔍 DEBUG: Sample of 'selected_models' column values: {df['selected_models'].value_counts().to_dict()}")
            
            if selection_req.file_key.endswith(".csv"):
                # Save as CSV
                csv_buffer = io.StringIO()
                df.to_csv(csv_buffer, index=False)
                csv_content = csv_buffer.getvalue().encode('utf-8')
                
                logger.info(f"🔍 DEBUG: CSV content size: {len(csv_content)} bytes")
                
                try:
                    # Verify the file exists before upload
                    try:
                        existing_obj = minio_client.stat_object(MINIO_BUCKET, selection_req.file_key)
                        logger.info(f"🔍 DEBUG: Existing file size before update: {existing_obj.size} bytes")
                        logger.info(f"🔍 DEBUG: Existing file ETag before update: {existing_obj.etag}")
                    except Exception as stat_error:
                        logger.info(f"🔍 DEBUG: File does not exist before update (will create new)")
                    
                    # Force overwrite by first removing the existing object
                    try:
                        minio_client.remove_object(MINIO_BUCKET, selection_req.file_key)
                        logger.info(f"🔍 DEBUG: Removed existing file to force overwrite")
                    except Exception as remove_error:
                        logger.info(f"🔍 DEBUG: Could not remove existing file (may not exist): {str(remove_error)}")
                    
                    # Now upload the new file
                    minio_client.put_object(
                        MINIO_BUCKET,
                        selection_req.file_key,
                        data=io.BytesIO(csv_content),
                        length=len(csv_content),
                        content_type="text/csv",
                    )
                    logger.info(f"🔍 DEBUG: CSV file uploaded to MinIO successfully")
                    
                    # Verify the file was updated
                    try:
                        updated_obj = minio_client.stat_object(MINIO_BUCKET, selection_req.file_key)
                        logger.info(f"🔍 DEBUG: Updated file size after update: {updated_obj.size} bytes")
                        logger.info(f"🔍 DEBUG: Updated file ETag after update: {updated_obj.etag}")
                        if 'existing_obj' in locals():
                            logger.info(f"🔍 DEBUG: File size change: {updated_obj.size - existing_obj.size} bytes")
                            logger.info(f"🔍 DEBUG: ETag changed: {existing_obj.etag != updated_obj.etag}")
                        else:
                            logger.info(f"🔍 DEBUG: New file created")
                    except Exception as stat_error:
                        logger.warning(f"⚠️ WARNING: Could not verify file update: {str(stat_error)}")
                        
                except Exception as minio_error:
                    logger.error(f"❌ MinIO upload error for CSV: {str(minio_error)}")
                    raise
                
            elif selection_req.file_key.endswith(".xlsx"):
                # Save as Excel
                excel_buffer = io.BytesIO()
                df.to_excel(excel_buffer, index=False)
                excel_content = excel_buffer.getvalue()
                
                logger.info(f"🔍 DEBUG: Excel content size: {len(excel_content)} bytes")
                
                try:
                    # Verify the file exists before upload
                    try:
                        existing_obj = minio_client.stat_object(MINIO_BUCKET, selection_req.file_key)
                        logger.info(f"🔍 DEBUG: Existing file size before update: {existing_obj.size} bytes")
                        logger.info(f"🔍 DEBUG: Existing file ETag before update: {existing_obj.etag}")
                    except Exception as stat_error:
                        logger.info(f"🔍 DEBUG: File does not exist before update (will create new)")
                    
                    # Force overwrite by first removing the existing object
                    try:
                        minio_client.remove_object(MINIO_BUCKET, selection_req.file_key)
                        logger.info(f"🔍 DEBUG: Removed existing file to force overwrite")
                    except Exception as remove_error:
                        logger.info(f"🔍 DEBUG: Could not remove existing file (may not exist): {str(remove_error)}")
                    
                    # Now upload the new file
                    minio_client.put_object(
                        MINIO_BUCKET,
                        selection_req.file_key,
                        data=io.BytesIO(excel_content),
                        length=len(excel_content),
                        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    )
                    logger.info(f"🔍 DEBUG: Excel file uploaded to MinIO successfully")
                    
                    # Verify the file was updated
                    try:
                        updated_obj = minio_client.stat_object(MINIO_BUCKET, selection_req.file_key)
                        logger.info(f"🔍 DEBUG: Updated file size after update: {updated_obj.size} bytes")
                        logger.info(f"🔍 DEBUG: Updated file ETag after update: {updated_obj.etag}")
                        if 'existing_obj' in locals():
                            logger.info(f"🔍 DEBUG: File size change: {updated_obj.size - existing_obj.size} bytes")
                            logger.info(f"🔍 DEBUG: ETag changed: {existing_obj.etag != updated_obj.etag}")
                        else:
                            logger.info(f"🔍 DEBUG: New file created")
                    except Exception as stat_error:
                        logger.warning(f"⚠️ WARNING: Could not verify file update: {str(stat_error)}")
                        
                except Exception as minio_error:
                    logger.error(f"❌ MinIO upload error for Excel: {str(minio_error)}")
                    raise
                
            elif selection_req.file_key.endswith(".arrow"):
                # Save as Arrow
                import pyarrow as pa
                import pyarrow.ipc as ipc
                table = pa.Table.from_pandas(df)
                arrow_buffer = pa.BufferOutputStream()
                with ipc.new_file(arrow_buffer, table.schema) as writer:
                    writer.write_table(table)
                arrow_bytes = arrow_buffer.getvalue().to_pybytes()
                
                logger.info(f"🔍 DEBUG: Arrow content size: {len(arrow_bytes)} bytes")
                
                try:
                    # Verify the file exists before upload
                    try:
                        existing_obj = minio_client.stat_object(MINIO_BUCKET, selection_req.file_key)
                        logger.info(f"🔍 DEBUG: Existing file size before update: {existing_obj.size} bytes")
                        logger.info(f"🔍 DEBUG: Existing file ETag before update: {existing_obj.etag}")
                    except Exception as stat_error:
                        logger.info(f"🔍 DEBUG: File does not exist before update (will create new)")
                    
                    # Force overwrite by first removing the existing object
                    try:
                        minio_client.remove_object(MINIO_BUCKET, selection_req.file_key)
                        logger.info(f"🔍 DEBUG: Removed existing file to force overwrite")
                    except Exception as remove_error:
                        logger.info(f"🔍 DEBUG: Could not remove existing file (may not exist): {str(remove_error)}")
                    
                    # Now upload the new file
                    minio_client.put_object(
                        MINIO_BUCKET,
                        selection_req.file_key,
                        data=io.BytesIO(arrow_bytes),
                        length=len(arrow_bytes),
                        content_type="application/octet-stream",
                    )
                    logger.info(f"🔍 DEBUG: Arrow file uploaded to MinIO successfully")
                    
                    # Verify the file was updated
                    try:
                        updated_obj = minio_client.stat_object(MINIO_BUCKET, selection_req.file_key)
                        logger.info(f"🔍 DEBUG: Updated file size after update: {updated_obj.size} bytes")
                        logger.info(f"🔍 DEBUG: Updated file ETag after update: {updated_obj.etag}")
                        if 'existing_obj' in locals():
                            logger.info(f"🔍 DEBUG: File size change: {updated_obj.size - existing_obj.size} bytes")
                            logger.info(f"🔍 DEBUG: ETag changed: {existing_obj.etag != updated_obj.etag}")
                        else:
                            logger.info(f"🔍 DEBUG: New file created")
                    except Exception as stat_error:
                        logger.warning(f"⚠️ WARNING: Could not verify file update: {str(stat_error)}")
                        
                except Exception as minio_error:
                    logger.error(f"❌ MinIO upload error for Arrow: {str(minio_error)}")
                    raise
            
            else:
                logger.warning(f"⚠️ WARNING: Unknown file extension, cannot save: {selection_req.file_key}")
            
            # Note: Redis cache update removed due to import issues
            # The file is successfully updated in MinIO
            
            logger.info(f"Successfully updated source file with 'selected_models' column: {selection_req.file_key}")
            
        except Exception as e:
            logger.error(f"Error updating source file with 'selected_models' column: {str(e)}")
            # Continue with MongoDB save even if file update fails
        
        return SavedModelResponse(
            model_id=str(result.inserted_id),
            saved_at=document["created_at"],
            status="success",
            row_data=cleaned_dict
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error saving model: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error saving model: {str(e)}")

@router.get("/models/saved-generic", tags=["Models"])
async def get_saved_models_generic(
    tags: Optional[List[str]] = Query(None, description="Filter by tags"),
    model_name: Optional[str] = Query(None, description="Filter by model name"),
    limit: int = Query(50, description="Maximum number of models to return"),
    skip: int = Query(0, description="Number of models to skip")
):
    """Retrieve generically saved models from MongoDB."""
    if db is None:
        raise HTTPException(status_code=503, detail="MongoDB connection is not available.")
    
    try:
        saved_models_collection = db.get_collection("saved_models_generic")
        
        # Build query
        query = {}
        if tags:
            query["tags"] = {"$in": tags}
        if model_name:
            query["model_name"] = {"$regex": model_name, "$options": "i"}
        
        # Get total count
        total_count = await saved_models_collection.count_documents(query)
        
        # Fetch models
        cursor = saved_models_collection.find(query).sort("created_at", -1).skip(skip).limit(limit)
        models = []
        
        async for model in cursor:
            models.append({
                "model_id": str(model["_id"]),
                "model_name": model.get("model_name"),
                "tags": model.get("tags", []),
                "description": model.get("description"),
                "created_at": model["created_at"],
                "source_file": model.get("source_file"),
                "selection_criteria": model.get("selection_criteria"),
                # Include a preview of the model data
                "data_preview": {k: v for k, v in list(model["model_data"].items())[:5]}
            })
        
        return {
            "total": total_count,
            "models": models,
            "pagination": {
                "skip": skip,
                "limit": limit,
                "has_more": (skip + limit) < total_count
            }
        }
        
    except Exception as e:
        logger.error(f"Error retrieving saved models: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/models/saved-generic/{model_id}", tags=["Models"])
async def get_saved_model_generic_by_id(
    model_id: str = Path(..., description="MongoDB ObjectId of the saved model")
):
    """Retrieve full details of a specific saved model."""
    if db is None:
        raise HTTPException(status_code=503, detail="MongoDB connection is not available.")
    
    try:
        saved_models_collection = db.get_collection("saved_models_generic")
        
        # Validate ObjectId
        try:
            obj_id = ObjectId(model_id)
        except:
            raise HTTPException(status_code=400, detail="Invalid model ID format")
        
        # Fetch model
        model = await saved_models_collection.find_one({"_id": obj_id})
        
        if not model:
            raise HTTPException(status_code=404, detail=f"Model {model_id} not found")
        
        # Convert ObjectId to string
        model["_id"] = str(model["_id"])
        
        return model
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving model: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/get-source-files", tags=["Source Files"])
async def get_source_files_from_build_config(
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name")
):
    """Get source file information from build-model_featurebased_configs collection for actual vs predicted comparison"""
    try:
        # Use shared authenticated MongoDB client from database.py
        # Get the build configuration from MongoDB
        document_id = f"{client_name}/{app_name}/{project_name}"
        build_config = await client["trinity_prod"]["build-model_featurebased_configs"].find_one({"_id": document_id})
        
        if not build_config:
            raise HTTPException(
                status_code=404, 
                detail=f"No build configuration found for {document_id}"
            )
        
        # Extract combination file keys
        combination_file_keys = build_config.get("combination_file_keys", [])
        
        # Get actual values from source files
        actual_values_data = {}
        
        for combo_info in combination_file_keys:
            combination_name = combo_info.get("combination", "")
            file_key = combo_info.get("file_key", "")
            
            if file_key and minio_client:
                try:
                    # Get the file from MinIO
                    response = minio_client.get_object(MINIO_BUCKET, file_key)
                    file_bytes = response.read()
                    
                    # Read file based on extension
                    if file_key.lower().endswith('.parquet'):
                        df = pd.read_parquet(io.BytesIO(file_bytes))
                    elif file_key.lower().endswith(('.arrow', '.feather')):
                        df = pd.read_feather(io.BytesIO(file_bytes))
                    else:
                        # Try to read as parquet first, then fall back to arrow
                        try:
                            df = pd.read_parquet(io.BytesIO(file_bytes))
                        except:
                            df = pd.read_feather(io.BytesIO(file_bytes))
                    
                    # Get the actual values for all variables
                    actual_values = {}
                    for column in df.columns:
                        actual_values[column] = df[column].tolist()
                    
                    actual_values_data[combination_name] = {
                        "file_key": file_key,
                        "actual_values": actual_values,
                        "row_count": len(df)
                    }
                    
                except Exception as e:
                    logger.error(f"Error reading file {file_key}: {str(e)}")
                    actual_values_data[combination_name] = {
                        "file_key": file_key,
                        "error": f"Failed to read file: {str(e)}"
                    }
        
        return {
            "success": True,
            "build_config_id": document_id,
            "combination_actual_values": actual_values_data,
            "build_config_summary": {
                "run_id": build_config.get("run_id"),
                "scope_number": build_config.get("scope_number"),
                "x_variables": build_config.get("x_variables", []),
                "y_variable": build_config.get("y_variable"),
                "total_combinations": len(combination_file_keys)
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting source files: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting source files: {str(e)}")

@router.get("/models/actual-vs-predicted-ensemble", tags=["Ensemble Actual vs Predicted"])
async def calculate_ensemble_actual_vs_predicted(
    file_key: str = Query(..., description="MinIO file key for the model results file"),
    combination_id: str = Query(..., description="Combination ID to filter data"),
    client_id: str = Query(..., description="Client ID"),
    app_id: str = Query(..., description="App ID"),
    project_id: str = Query(..., description="Project ID"),
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name")
):
    """Calculate actual vs predicted values using ensemble weighted metrics and source file data"""
    try:
        if not minio_client:
            raise HTTPException(status_code=503, detail="MinIO connection is not available.")
        
        # Use shared authenticated MongoDB client from database.py
        # Get the build configuration from MongoDB
        document_id = f"{client_name}/{app_name}/{project_name}"
        build_config = await client["trinity_prod"]["build-model_featurebased_configs"].find_one({"_id": document_id})
        
        if not build_config:
            raise HTTPException(
                status_code=404, 
                detail=f"No build configuration found for {document_id}"
            )
        
        # Get the source file key for this combination
        combination_file_keys = build_config.get("combination_file_keys", [])
        source_file_key = None
        for combo_info in combination_file_keys:
            if combo_info.get("combination") == combination_id:
                source_file_key = combo_info.get("file_key")
                break
        
        if not source_file_key:
            raise HTTPException(
                status_code=404,
                detail=f"No source file key found for combination '{combination_id}'"
            )
        
        # First, get the weighted ensemble data to get the ensemble betas
        ensemble_request = {
            "file_key": file_key,
            "grouping_keys": ['combination_id'],
            "filter_criteria": {"combination_id": combination_id},
            "include_numeric": None,
            "exclude_numeric": None,
            "filtered_models": None
        }
        
        # Call the weighted ensemble endpoint to get ensemble betas
        from .routes import weighted_ensemble
        ensemble_response = await weighted_ensemble(WeightedEnsembleRequest(**ensemble_request))
        
        if not ensemble_response.results or len(ensemble_response.results) == 0:
            raise HTTPException(status_code=404, detail="No ensemble data found for the given combination")
        
        ensemble_data = ensemble_response.results[0]
        weighted_metrics = ensemble_data.weighted
        
        # Get the source file data
        try:
            response = minio_client.get_object(MINIO_BUCKET, source_file_key)
            content = response.read()
            response.close()
            response.release_conn()
            
            if file_key.endswith(".csv"):
                df = pd.read_csv(io.BytesIO(content))
            elif file_key.endswith(".xlsx"):
                df = pd.read_excel(io.BytesIO(content))
            elif file_key.endswith(".arrow"):
                import pyarrow as pa
                import pyarrow.ipc as ipc
                reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
                df = reader.read_all().to_pandas()
            else:
                raise HTTPException(status_code=400, detail=f"Unsupported file type: {file_key}")
            
            # Filter data for the specific combination
            if "combination_id" in df.columns:
                df = df[df["combination_id"] == combination_id]
            
            if df.empty:
                raise HTTPException(status_code=404, detail=f"No data found for combination {combination_id}")
            
            # Get the target variable (Y variable)
            y_variable = None
            for col in df.columns:
                if col.lower() in ['target', 'y', 'dependent', 'sales', 'volume', 'value']:
                    y_variable = col
                    break
            
            if not y_variable:
                # Try to find a numeric column that could be the target
                numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
                if numeric_cols:
                    y_variable = numeric_cols[0]  # Use first numeric column as target
            
            if not y_variable:
                raise HTTPException(status_code=400, detail="Could not identify target variable")
            
            # Get ensemble intercept and betas
            intercept = weighted_metrics.get("intercept", 0)
            
            # Calculate predicted values using ensemble betas
            actual_values = df[y_variable].tolist()
            predicted_values = []
            
            for index, row in df.iterrows():
                predicted_value = intercept
                
                # Add contribution from each variable using ensemble betas
                for col in df.columns:
                    if col != y_variable:
                        beta_key = f"{col}_beta"
                        if beta_key in weighted_metrics:
                            x_value = row[col] if pd.notna(row[col]) else 0
                            beta_value = weighted_metrics[beta_key]
                            contribution = beta_value * x_value
                            predicted_value += contribution
                            
                            # Debug logging for first few rows
                            if index < 3:
                                logger.info(f"🔍 DEBUG: Row {index}, {col}: {x_value}, Beta_{col}: {beta_value}, Contribution: {contribution}")
                
                # Debug logging for first few predictions
                if index < 3:
                    logger.info(f"🔍 DEBUG: Row {index}, Final predicted value: {predicted_value}")
                
                predicted_values.append(predicted_value)
            
            # Calculate performance metrics
            if len(actual_values) > 0 and len(predicted_values) > 0:
                from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
                
                mae = mean_absolute_error(actual_values, predicted_values)
                mse = mean_squared_error(actual_values, predicted_values)
                rmse = mse ** 0.5
                r2 = r2_score(actual_values, predicted_values)
                
                # Calculate MAPE
                mape = 0
                if sum(actual_values) != 0:
                    mape = (sum(abs((actual - pred) / actual) for actual, pred in zip(actual_values, predicted_values) if actual != 0) / len(actual_values)) * 100
            else:
                mae = mse = rmse = r2 = mape = 0
            
            return {
                "success": True,
                "combination_name": combination_id,
                "model_name": "Ensemble",
                "file_key": source_file_key,
                "actual_values": actual_values,
                "predicted_values": predicted_values,
                "performance_metrics": {
                    "mae": mae,
                    "mse": mse,
                    "rmse": rmse,
                    "r2": r2,
                    "mape": mape
                },
                "model_info": {
                    "intercept": intercept,
                    "coefficients": weighted_metrics,
                    "x_variables": [key.replace('_beta', '') for key in weighted_metrics.keys() if key.endswith('_beta')],
                    "y_variable": y_variable
                },
                "data_points": len(actual_values)
            }
            
        except Exception as e:
            logger.error(f"Error reading source file: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Error reading source file: {str(e)}")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error calculating ensemble actual vs predicted: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error calculating ensemble actual vs predicted: {str(e)}")

@router.get("/models/yoy-calculation-ensemble", tags=["Ensemble YoY Calculation"])
async def calculate_ensemble_yoy(
    file_key: str = Query(..., description="MinIO file key for the model results file"),
    combination_id: str = Query(..., description="Combination ID to filter data"),
    client_id: str = Query(..., description="Client ID"),
    app_id: str = Query(..., description="App ID"),
    project_id: str = Query(..., description="Project ID"),
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name")
):
    """Calculate Year-over-Year (YoY) growth using ensemble weighted metrics and source file data"""
    try:
        if not minio_client:
            raise HTTPException(status_code=503, detail="MinIO connection is not available.")
        
        # Use shared authenticated MongoDB client from database.py
        # Get the build configuration from MongoDB
        document_id = f"{client_name}/{app_name}/{project_name}"
        build_config = await client["trinity_prod"]["build-model_featurebased_configs"].find_one({"_id": document_id})
        
        if not build_config:
            raise HTTPException(
                status_code=404, 
                detail=f"No build configuration found for {document_id}"
            )
        
        # Get the source file key for this combination
        combination_file_keys = build_config.get("combination_file_keys", [])
        source_file_key = None
        for combo_info in combination_file_keys:
            if combo_info.get("combination") == combination_id:
                source_file_key = combo_info.get("file_key")
                break
        
        if not source_file_key:
            raise HTTPException(
                status_code=404,
                detail=f"No source file key found for combination '{combination_id}'"
            )
        
        # First, get the weighted ensemble data to get the ensemble betas
        ensemble_request = {
            "file_key": file_key,
            "grouping_keys": ['combination_id'],
            "filter_criteria": {"combination_id": combination_id},
            "include_numeric": None,
            "exclude_numeric": None,
            "filtered_models": None
        }
        
        # Call the weighted ensemble endpoint to get ensemble betas
        from .routes import weighted_ensemble
        ensemble_response = await weighted_ensemble(WeightedEnsembleRequest(**ensemble_request))
        
        if not ensemble_response.results or len(ensemble_response.results) == 0:
            raise HTTPException(status_code=404, detail="No ensemble data found for the given combination")
        
        ensemble_data = ensemble_response.results[0]
        weighted_metrics = ensemble_data.weighted
        
        # Get the source file data
        try:
            response = minio_client.get_object(MINIO_BUCKET, source_file_key)
            content = response.read()
            response.close()
            response.release_conn()
            
            if file_key.endswith(".csv"):
                df = pd.read_csv(io.BytesIO(content))
            elif file_key.endswith(".xlsx"):
                df = pd.read_excel(io.BytesIO(content))
            elif file_key.endswith(".arrow"):
                import pyarrow as pa
                import pyarrow.ipc as ipc
                reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
                df = reader.read_all().to_pandas()
            else:
                raise HTTPException(status_code=400, detail=f"Unsupported file type: {file_key}")
            
            # Filter data for the specific combination
            if "combination_id" in df.columns:
                df = df[df["combination_id"] == combination_id]
            
            if df.empty:
                raise HTTPException(status_code=404, detail=f"No data found for combination {combination_id}")
            
            # Get ensemble intercept and betas
            intercept = weighted_metrics.get("intercept", 0)
            
            # Detect date column
            date_column = None
            date_columns = ["Date", "date", "Invoice_Date", "Bill_Date", "Order_Date", "Month", "month", "Period", "period", "Year", "year"]
            for col in date_columns:
                if col in df.columns:
                    date_column = col
                    break
            
            if not date_column:
                raise HTTPException(
                    status_code=400,
                    detail="Could not detect date column. Please ensure a date column is present."
                )
            
            # Convert date column to datetime
            df[date_column] = pd.to_datetime(df[date_column], errors='coerce')
            df = df.dropna(subset=[date_column])
            
            if df.empty:
                raise HTTPException(
                    status_code=400,
                    detail="No valid date data found after conversion."
                )
            
            # Get unique years and ensure we have at least 2 years
            years = sorted(df[date_column].dt.year.unique())
            if len(years) < 2:
                raise HTTPException(
                    status_code=400,
                    detail="Need at least two calendar years in the dataset for YoY calculation."
                )
            
            year_first, year_last = int(years[0]), int(years[-1])
            
            # Split data by years
            df_first_year = df[df[date_column].dt.year == year_first]
            df_last_year = df[df[date_column].dt.year == year_last]
            
            if df_first_year.empty or df_last_year.empty:
                raise HTTPException(
                    status_code=400,
                    detail=f"No data found for year {year_first} or {year_last}."
                )
            
            # Get target variable (Y variable)
            y_variable = None
            for col in df.columns:
                if col.lower() in ['target', 'y', 'dependent', 'sales', 'volume', 'value']:
                    y_variable = col
                    break
            
            if not y_variable:
                # Try to find a numeric column that could be the target
                numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
                if numeric_cols:
                    y_variable = numeric_cols[0]  # Use first numeric column as target
            
            if not y_variable:
                raise HTTPException(status_code=400, detail="Could not identify target variable")
            
            # Calculate actual YoY change
            y_first_mean = df_first_year[y_variable].mean() if y_variable in df_first_year.columns else 0
            y_last_mean = df_last_year[y_variable].mean() if y_variable in df_last_year.columns else 0
            observed_delta = float(y_last_mean - y_first_mean)
            
            # Calculate explained YoY change using ensemble coefficients
            explained_delta = 0.0
            contributions = []
            
            # Get all variables that have betas in the ensemble results
            for key in weighted_metrics.keys():
                if key.endswith('_beta'):
                    x_var = key.replace('_beta', '')
                    if x_var in df.columns:
                        beta_value = weighted_metrics[key]
                        
                        # Calculate mean values for each year
                        x_first_mean = df_first_year[x_var].mean()
                        x_last_mean = df_last_year[x_var].mean()
                        
                        # Calculate contribution: beta * (mean_last_year - mean_first_year)
                        delta_contribution = beta_value * (x_last_mean - x_first_mean)
                        explained_delta += delta_contribution
                        
                        contributions.append({
                            "variable": x_var,
                            "beta_coefficient": beta_value,
                            "mean_year1": float(x_first_mean),
                            "mean_year2": float(x_last_mean),
                            "delta_contribution": float(delta_contribution)
                        })
            
            # Sort contributions by absolute value
            contributions.sort(key=lambda x: abs(x["delta_contribution"]), reverse=True)
            
            # Calculate residual
            residual = float(observed_delta - explained_delta)
            
            # Calculate YoY percentage change
            yoy_percentage = 0.0
            if y_first_mean != 0:
                yoy_percentage = (observed_delta / y_first_mean) * 100
            
            # Create waterfall data for visualization
            waterfall_labels = [f"Base {year_first}"] + [c["variable"] for c in contributions] + ["Residual", f"Final {year_last}"]
            waterfall_values = [y_first_mean] + [c["delta_contribution"] for c in contributions] + [residual, y_last_mean]
            
            return {
                "success": True,
                "combination_name": combination_id,
                "model_name": "Ensemble",
                "file_key": source_file_key,
                "date_column_used": date_column,
                "years_used": {"year1": year_first, "year2": year_last},
                "y_variable_used": y_variable,
                "observed": {
                    "year1_mean": float(y_first_mean),
                    "year2_mean": float(y_last_mean),
                    "delta_y": observed_delta,
                    "yoy_percentage": yoy_percentage
                },
                "explanation": {
                    "explained_delta_yhat": float(explained_delta),
                    "residual": residual,
                    "contributions": contributions
                },
                "waterfall": {
                    "labels": waterfall_labels,
                    "values": waterfall_values
                },
                "model_info": {
                    "intercept": intercept,
                    "coefficients": weighted_metrics,
                    "x_variables": [key.replace('_beta', '') for key in weighted_metrics.keys() if key.endswith('_beta')],
                    "y_variable": y_variable
                }
            }
            
        except Exception as e:
            logger.error(f"Error reading source file: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Error reading source file: {str(e)}")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error calculating ensemble YoY: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error calculating ensemble YoY: {str(e)}")

@router.get("/models/contribution-ensemble", tags=["Ensemble Contribution"])
async def get_ensemble_contribution(
    file_key: str = Query(..., description="MinIO file key for the model results file"),
    combination_id: str = Query(..., description="Combination ID to filter data"),
    client_id: str = Query(..., description="Client ID"),
    app_id: str = Query(..., description="App ID"),
    project_id: str = Query(..., description="Project ID"),
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name")
):
    """Get contribution data for ensemble using weighted ensemble metrics"""
    try:
        if not minio_client:
            raise HTTPException(status_code=503, detail="MinIO connection is not available.")
        
        # First, get the weighted ensemble data to get the ensemble betas
        ensemble_request = {
            "file_key": file_key,
            "grouping_keys": ['combination_id'],
            "filter_criteria": {"combination_id": combination_id},
            "include_numeric": None,
            "exclude_numeric": None,
            "filtered_models": None
        }
        
        # Call the weighted ensemble endpoint to get ensemble betas
        from .routes import weighted_ensemble
        ensemble_response = await weighted_ensemble(WeightedEnsembleRequest(**ensemble_request))
        
        if not ensemble_response.results or len(ensemble_response.results) == 0:
            raise HTTPException(status_code=404, detail="No ensemble data found for the given combination")
        
        ensemble_data = ensemble_response.results[0]
        weighted_metrics = ensemble_data.weighted
        
        # Debug logging to see what keys are available
        logger.info(f"🔍 DEBUG: Available weighted metrics keys: {list(weighted_metrics.keys())}")
        
        # Extract contribution data from ensemble weighted metrics
        contribution_data = []
        
        # First, try to find contribution columns
        for key in weighted_metrics.keys():
            if key.endswith('_contribution'):
                variable_name = key.replace('_contribution', '').replace('_Contribution', '')
                value = weighted_metrics[key]
                if value is not None:
                    contribution_data.append({
                        "name": variable_name,
                        "value": float(value)
                    })
        
        # If no contribution data found, try to calculate from betas and means
        if not contribution_data:
            logger.info("🔍 DEBUG: No contribution columns found, calculating from betas and means")
            
            # Get intercept and calculate contributions from betas and means
            intercept = weighted_metrics.get("intercept", 0)
            
            for key in weighted_metrics.keys():
                if key.endswith('_beta'):
                    variable_name = key.replace('_beta', '').replace('_Beta', '')
                    beta_value = weighted_metrics[key]
                    
                    # Try to find corresponding mean value
                    mean_key = f"{variable_name}_avg"
                    if mean_key in weighted_metrics:
                        mean_value = weighted_metrics[mean_key]
                        if beta_value is not None and mean_value is not None:
                            # Calculate contribution: abs(beta * mean)
                            contribution_value = abs(float(beta_value) * float(mean_value))
                            contribution_data.append({
                                "name": variable_name,
                                "value": contribution_value
                            })
                            logger.info(f"🔍 DEBUG: Calculated contribution for {variable_name}: {contribution_value}")
        
        # If still no data, try using elasticities
        if not contribution_data:
            logger.info("🔍 DEBUG: No beta contributions found, trying elasticities")
            
            for key in weighted_metrics.keys():
                if key.endswith('_elasticity'):
                    variable_name = key.replace('_elasticity', '').replace('_Elasticity', '')
                    elasticity_value = weighted_metrics[key]
                    
                    if elasticity_value is not None:
                        # Use absolute elasticity as contribution
                        contribution_value = abs(float(elasticity_value))
                        contribution_data.append({
                            "name": variable_name,
                            "value": contribution_value
                        })
                        logger.info(f"🔍 DEBUG: Using elasticity as contribution for {variable_name}: {contribution_value}")
        
        if not contribution_data:
            logger.error("🔍 DEBUG: No contribution data could be calculated from ensemble results")
            raise HTTPException(status_code=404, detail="No valid contribution data found in ensemble results")
        
        logger.info(f"🔍 DEBUG: Final contribution data: {contribution_data}")

        return {
            "file_key": file_key,
            "combination_id": combination_id,
            "model_name": "Ensemble",
            "contribution_data": contribution_data
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting ensemble contribution: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting ensemble contribution: {str(e)}")

@router.post("/actual-vs-predicted", tags=["Actual vs Predicted"])
async def calculate_actual_vs_predicted(
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name"),
    combination_name: str = Query(..., description="Combination name"),
    model_name: str = Query(..., description="Model name")
):
    """Calculate actual vs predicted values using stored coefficients and actual X values"""
    try:
        # Use shared authenticated MongoDB client from database.py
        # Get the build configuration from MongoDB
        document_id = f"{client_name}/{app_name}/{project_name}"
        build_config = await client["trinity_prod"]["build-model_featurebased_configs"].find_one({"_id": document_id})
        
        if not build_config:
            raise HTTPException(
                status_code=404, 
                detail=f"No build configuration found for {document_id}"
            )
        
        # Get model coefficients for the specified combination and model
        model_coefficients = build_config.get("model_coefficients", {})
        combination_coefficients = model_coefficients.get(combination_name, {})
        model_coeffs = combination_coefficients.get(model_name, {})
        
        if not model_coeffs:
            raise HTTPException(
                status_code=404,
                detail=f"No coefficients found for combination '{combination_name}' and model '{model_name}'"
            )
        
        # Get the file key for this combination
        combination_file_keys = build_config.get("combination_file_keys", [])
        file_key = None
        for combo_info in combination_file_keys:
            if combo_info.get("combination") == combination_name:
                file_key = combo_info.get("file_key")
                break
        
        if not file_key:
            raise HTTPException(
                status_code=404,
                detail=f"No file key found for combination '{combination_name}'"
            )
        
        # Get actual values from the source file
        if not minio_client:
            raise HTTPException(status_code=503, detail="MinIO connection is not available.")
        
        try:
            # Get the file from MinIO
            response = minio_client.get_object(MINIO_BUCKET, file_key)
            file_bytes = response.read()
            
            # Read file based on extension
            if file_key.lower().endswith('.parquet'):
                df = pd.read_parquet(io.BytesIO(file_bytes))
            elif file_key.lower().endswith(('.arrow', '.feather')):
                df = pd.read_feather(io.BytesIO(file_bytes))
            else:
                # Try to read as parquet first, then fall back to arrow
                try:
                    df = pd.read_parquet(io.BytesIO(file_bytes))
                except:
                    df = pd.read_feather(io.BytesIO(file_bytes))
            
            # Get coefficients and intercept
            intercept = model_coeffs.get("intercept", 0)
            coefficients = model_coeffs.get("coefficients", {})
            x_variables = model_coeffs.get("x_variables", [])
            y_variable = model_coeffs.get("y_variable", "")
            
            # Calculate predicted values
            actual_values = df[y_variable].tolist() if y_variable in df.columns else []
            predicted_values = []
            
            # Debug logging
            logger.info(f"🔍 DEBUG: Model coefficients - intercept: {intercept}, coefficients: {coefficients}")
            logger.info(f"🔍 DEBUG: X variables: {x_variables}, Y variable: {y_variable}")
            
            for index, row in df.iterrows():
                # Calculate predicted value: intercept + sum(beta_i * x_i)
                predicted_value = intercept
                
                for x_var in x_variables:
                    beta_key = f"Beta_{x_var}"
                    if beta_key in coefficients and x_var in df.columns:
                        x_value = row[x_var]
                        beta_value = coefficients[beta_key]
                        contribution = beta_value * x_value
                        predicted_value += contribution
                        
                        # Debug logging for first few rows
                        if index < 3:
                            logger.info(f"🔍 DEBUG: Row {index}, {x_var}: {x_value}, Beta_{x_var}: {beta_value}, Contribution: {contribution}")
                
                # Debug logging for first few predictions
                if index < 3:
                    logger.info(f"🔍 DEBUG: Row {index}, Final predicted value: {predicted_value}")
                
                predicted_values.append(predicted_value)
            
            # Filter out extreme outliers that might be causing axis scaling issues
            if len(predicted_values) > 0:
                import numpy as np
                predicted_array = np.array(predicted_values)
                actual_array = np.array(actual_values)
                
                # Calculate percentiles to identify extreme outliers
                pred_99th = np.percentile(predicted_array, 99)
                pred_1st = np.percentile(predicted_array, 1)
                actual_99th = np.percentile(actual_array, 99)
                actual_1st = np.percentile(actual_array, 1)
                
                logger.info(f"🔍 DEBUG: Predicted values - 1st percentile: {pred_1st}, 99th percentile: {pred_99th}")
                logger.info(f"🔍 DEBUG: Actual values - 1st percentile: {actual_1st}, 99th percentile: {actual_99th}")
                
                # Filter out extreme outliers (beyond 99th percentile)
                filtered_data = []
                for i, (actual, predicted) in enumerate(zip(actual_values, predicted_values)):
                    if (predicted <= pred_99th and predicted >= pred_1st and 
                        actual <= actual_99th and actual >= actual_1st):
                        filtered_data.append((actual, predicted))
                
                if len(filtered_data) < len(actual_values):
                    logger.warning(f"⚠️ Filtered out {len(actual_values) - len(filtered_data)} extreme outliers")
                    actual_values = [item[0] for item in filtered_data]
                    predicted_values = [item[1] for item in filtered_data]
            
            # Calculate performance metrics
            if len(actual_values) > 0 and len(predicted_values) > 0:
                from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
                
                mae = mean_absolute_error(actual_values, predicted_values)
                mse = mean_squared_error(actual_values, predicted_values)
                rmse = mse ** 0.5
                r2 = r2_score(actual_values, predicted_values)
                
                # Calculate MAPE
                mape = 0
                if sum(actual_values) != 0:
                    mape = (sum(abs((actual - pred) / actual) for actual, pred in zip(actual_values, predicted_values) if actual != 0) / len(actual_values)) * 100
            else:
                mae = mse = rmse = r2 = mape = 0
            
            return {
                "success": True,
                "combination_name": combination_name,
                "model_name": model_name,
                "file_key": file_key,
                "actual_values": actual_values,
                "predicted_values": predicted_values,
                "performance_metrics": {
                    "mae": mae,
                    "mse": mse,
                    "rmse": rmse,
                    "r2": r2,
                    "mape": mape
                },
                "model_info": {
                    "intercept": intercept,
                    "coefficients": coefficients,
                    "x_variables": x_variables,
                    "y_variable": y_variable
                },
                "data_points": len(actual_values)
            }
            
        except Exception as e:
            logger.error(f"Error reading file {file_key}: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Error reading source file: {str(e)}")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error calculating actual vs predicted: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error calculating actual vs predicted: {str(e)}")

@router.post("/yoy-calculation", tags=["YoY Calculation"])
async def calculate_yoy(
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name"),
    combination_name: str = Query(..., description="Combination name"),
    model_name: str = Query(..., description="Model name")
):
    """Calculate Year-over-Year (YoY) growth using stored coefficients and actual X values"""
    try:
        # Use shared authenticated MongoDB client from database.py
        # Get the build configuration from MongoDB
        document_id = f"{client_name}/{app_name}/{project_name}"
        build_config = await client["trinity_prod"]["build-model_featurebased_configs"].find_one({"_id": document_id})
        
        if not build_config:
            raise HTTPException(
                status_code=404, 
                detail=f"No build configuration found for {document_id}"
            )
        
        # Get model coefficients for the specified combination and model
        model_coefficients = build_config.get("model_coefficients", {})
        combination_coefficients = model_coefficients.get(combination_name, {})
        model_coeffs = combination_coefficients.get(model_name, {})
        
        if not model_coeffs:
            raise HTTPException(
                status_code=404,
                detail=f"No coefficients found for combination '{combination_name}' and model '{model_name}'"
            )
        
        # Get the file key for this combination
        combination_file_keys = build_config.get("combination_file_keys", [])
        file_key = None
        for combo_info in combination_file_keys:
            if combo_info.get("combination") == combination_name:
                file_key = combo_info.get("file_key")
                break
        
        if not file_key:
            raise HTTPException(
                status_code=404,
                detail=f"No file key found for combination '{combination_name}'"
            )
        
        # Get actual values from the source file
        if not minio_client:
            raise HTTPException(status_code=503, detail="MinIO connection is not available.")
        
        try:
            # Get the file from MinIO
            response = minio_client.get_object(MINIO_BUCKET, file_key)
            file_bytes = response.read()
            
            # Read file based on extension
            if file_key.lower().endswith('.parquet'):
                df = pd.read_parquet(io.BytesIO(file_bytes))
            elif file_key.lower().endswith(('.arrow', '.feather')):
                df = pd.read_feather(io.BytesIO(file_bytes))
            else:
                # Try to read as parquet first, then fall back to arrow
                try:
                    df = pd.read_parquet(io.BytesIO(file_bytes))
                except:
                    df = pd.read_feather(io.BytesIO(file_bytes))
            
            # Get coefficients and intercept
            intercept = model_coeffs.get("intercept", 0)
            coefficients = model_coeffs.get("coefficients", {})
            x_variables = model_coeffs.get("x_variables", [])
            y_variable = model_coeffs.get("y_variable", "")
            
            # Detect date column
            date_column = None
            date_columns = ["Date", "date", "Invoice_Date", "Bill_Date", "Order_Date", "Month", "month", "Period", "period", "Year", "year"]
            for col in date_columns:
                if col in df.columns:
                    date_column = col
                    break
            
            if not date_column:
                raise HTTPException(
                    status_code=400,
                    detail="Could not detect date column. Please ensure a date column is present."
                )
            
            # Convert date column to datetime
            df[date_column] = pd.to_datetime(df[date_column], errors='coerce')
            df = df.dropna(subset=[date_column])
            
            if df.empty:
                raise HTTPException(
                    status_code=400,
                    detail="No valid date data found after conversion."
                )
            
            # Get unique years and ensure we have at least 2 years
            years = sorted(df[date_column].dt.year.unique())
            if len(years) < 2:
                raise HTTPException(
                    status_code=400,
                    detail="Need at least two calendar years in the dataset for YoY calculation."
                )
            
            year_first, year_last = int(years[0]), int(years[-1])
            
            # Split data by years
            df_first_year = df[df[date_column].dt.year == year_first]
            df_last_year = df[df[date_column].dt.year == year_last]
            
            if df_first_year.empty or df_last_year.empty:
                raise HTTPException(
                    status_code=400,
                    detail=f"No data found for year {year_first} or {year_last}."
                )
            
            # Calculate actual YoY change
            y_first_mean = df_first_year[y_variable].mean() if y_variable in df_first_year.columns else 0
            y_last_mean = df_last_year[y_variable].mean() if y_variable in df_last_year.columns else 0
            observed_delta = float(y_last_mean - y_first_mean)
            
            # Calculate explained YoY change using model coefficients
            explained_delta = 0.0
            contributions = []
            
            for x_var in x_variables:
                beta_key = f"Beta_{x_var}"
                if beta_key in coefficients and x_var in df.columns:
                    beta_value = coefficients[beta_key]
                    
                    # Calculate mean values for each year
                    x_first_mean = df_first_year[x_var].mean()
                    x_last_mean = df_last_year[x_var].mean()
                    
                    # Calculate contribution: beta * (mean_last_year - mean_first_year)
                    delta_contribution = beta_value * (x_last_mean - x_first_mean)
                    explained_delta += delta_contribution
                    
                    contributions.append({
                        "variable": x_var,
                        "beta_coefficient": beta_value,
                        "mean_year1": float(x_first_mean),
                        "mean_year2": float(x_last_mean),
                        "delta_contribution": float(delta_contribution)
                    })
            
            # Sort contributions by absolute value
            contributions.sort(key=lambda x: abs(x["delta_contribution"]), reverse=True)
            
            # Calculate residual
            residual = float(observed_delta - explained_delta)
            
            # Calculate YoY percentage change
            yoy_percentage = 0.0
            if y_first_mean != 0:
                yoy_percentage = (observed_delta / y_first_mean) * 100
            
            # Create waterfall data for visualization
            waterfall_labels = [f"Base {year_first}"] + [c["variable"] for c in contributions] + ["Residual", f"Final {year_last}"]
            waterfall_values = [y_first_mean] + [c["delta_contribution"] for c in contributions] + [residual, y_last_mean]
            
            return {
                "success": True,
                "combination_name": combination_name,
                "model_name": model_name,
                "file_key": file_key,
                "date_column_used": date_column,
                "years_used": {"year1": year_first, "year2": year_last},
                "y_variable_used": y_variable,
                "observed": {
                    "year1_mean": float(y_first_mean),
                    "year2_mean": float(y_last_mean),
                    "delta_y": observed_delta,
                    "yoy_percentage": yoy_percentage
                },
                "explanation": {
                    "explained_delta_yhat": float(explained_delta),
                    "residual": residual,
                    "contributions": contributions
                },
                "waterfall": {
                    "labels": waterfall_labels,
                    "values": waterfall_values
                },
                "model_info": {
                    "intercept": intercept,
                    "coefficients": coefficients,
                    "x_variables": x_variables,
                    "y_variable": y_variable
                }
            }
            
        except Exception as e:
            logger.error(f"Error reading file {file_key}: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Error reading source file: {str(e)}")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error calculating YoY: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error calculating YoY: {str(e)}")

def _detect_column(cols: List[str], candidates: List[str], regex: Optional[str] = None) -> Optional[str]:
    lower = {c.lower(): c for c in cols}
    for c in candidates:
        if c.lower() in lower:
            return lower[c.lower()]
    if regex:
        pat = re.compile(regex, re.IGNORECASE)
        for c in cols:
            if pat.search(c):
                return c
    return None

def _weighted_avg_series(s: pd.Series, w: pd.Series):
    mask = s.notna() & w.notna()
    if not mask.any():
        return None
    return float(np.average(s[mask], weights=w[mask]))

def _exp_mape_weights(mape_col: pd.Series):
    # handle NaNs by excluding them from weights
    mask = mape_col.notna()
    if not mask.any():
        return None, None, None
    m = mape_col[mask]
    best = float(m.min())
    raw = np.exp(-0.5 * (m - best))
    total = float(raw.sum())
    if total == 0.0:
        # fallback: uniform
        raw = np.ones_like(m, dtype=float)
        total = float(raw.sum())
    norm = raw / total
    return pd.Series(norm, index=m.index), best, total

def _numeric_cols(df: pd.DataFrame, exclude: List[str]) -> List[str]:
    cols = df.select_dtypes(include=[np.number]).columns.tolist()
    return [c for c in cols if c not in exclude]

@router.post("/models/weighted-ensemble", response_model=WeightedEnsembleResponse, tags=["Models"])
async def weighted_ensemble(req: WeightedEnsembleRequest):
    """
    For each categorical combination (grouping_keys), compute MAPE-based weighted averages
    across *all models* in that combo — for whatever numeric columns exist in the file.

    Weighting: w_i = exp(-0.5 * (MAPE_test_i - best_mape_in_combo))
    """
    if not minio_client:
        raise HTTPException(status_code=503, detail="MinIO connection is not available.")

    # ---- load file
    try:
        resp = minio_client.get_object(MINIO_BUCKET, req.file_key)
        blob = resp.read()
        resp.close()
        resp.release_conn()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"MinIO read error: {e}")

    # CSV first, Arrow/Feather fallback
    try:
        df = pd.read_csv(io.BytesIO(blob))
    except Exception:
        try:
            import pyarrow as pa
            import pyarrow.feather as feather
            import pyarrow.ipc as ipc
            # try feather
            try:
                table = feather.read_table(io.BytesIO(blob))
            except Exception:
                # try arrow IPC file
                table = ipc.RecordBatchFileReader(io.BytesIO(blob)).read_all()
            df = table.to_pandas()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Unsupported file format (CSV/Arrow only): {e}")

    if df.empty:
        raise HTTPException(status_code=400, detail="File has no rows.")

    # ---- sanity on grouping keys
    for g in req.grouping_keys:
        if g not in df.columns:
            raise HTTPException(status_code=400, detail=f"Grouping key '{g}' not found. Columns: {df.columns.tolist()[:50]}")

    # ---- detect model + mape test + fold (do this first)
    model_col = _detect_column(
        df.columns.tolist(),
        ["Model", "model", "model_name", "MODEL_NAME"]
    )
    if not model_col:
        raise HTTPException(status_code=400, detail="No model column found (tried: Model, model, model_name, MODEL_NAME).")

    # ---- optional pre-filter
    if req.filter_criteria:
        mask = pd.Series([True] * len(df))
        for col, val in req.filter_criteria.items():
            if col not in df.columns:
                raise HTTPException(status_code=400, detail=f"Filter column '{col}' not in file.")
            mask &= (df[col] == val)
        df = df[mask]
        if df.empty:
            return WeightedEnsembleResponse(grouping_keys=req.grouping_keys, total_combos=0, results=[])

    # ---- filter by specific models if provided
    if req.filtered_models:
        if model_col not in df.columns:
            raise HTTPException(status_code=400, detail=f"Model column '{model_col}' not found for model filtering.")
        df = df[df[model_col].isin(req.filtered_models)]
        if df.empty:
            return WeightedEnsembleResponse(grouping_keys=req.grouping_keys, total_combos=0, results=[])

    mape_test_col = _detect_column(
        df.columns.tolist(),
        ["MAPE Test", "MAPE_test", "test_mape", "Weighted_MAPE_Test", "MAPE"],
        regex=r"mape[^a-zA-Z0-9]*test|^mape$"
    )
    if not mape_test_col:
        raise HTTPException(status_code=400, detail="No test MAPE column found (e.g., 'MAPE Test').")

    fold_col = _detect_column(df.columns.tolist(), ["Fold", "fold"])
    group_cols = req.grouping_keys + [model_col]

    # ---- average across folds first (if Fold exists)
    if fold_col:
        num_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        # keep numeric only for aggregation
        df_avg = df.groupby(group_cols, dropna=False)[num_cols].mean().reset_index()
        # copy over non-numeric mape/model if needed (we already have mape in num_cols)
        base = df[group_cols].drop_duplicates()
        df = pd.merge(base, df_avg, on=group_cols, how="left")
    else:
        # ensure mape is numeric
        if not np.issubdtype(df[mape_test_col].dtype, np.number):
            with pd.option_context('mode.use_inf_as_na', True):
                df[mape_test_col] = pd.to_numeric(df[mape_test_col], errors="coerce")

    # ---- set up exclusions
    exclude = set(req.grouping_keys + [model_col])
    if fold_col:
        exclude.add(fold_col)

    # numeric candidates to weight
    numeric_candidates = _numeric_cols(df, exclude=list(exclude))
    if req.include_numeric:
        numeric_candidates = [c for c in numeric_candidates if c in req.include_numeric]
    if req.exclude_numeric:
        numeric_candidates = [c for c in numeric_candidates if c not in req.exclude_numeric]

    if mape_test_col not in numeric_candidates:
        numeric_candidates.append(mape_test_col)
    
    # Debug logging
    logger.info(f"🔍 DEBUG: Numeric candidates for weighting: {numeric_candidates}")
    logger.info(f"🔍 DEBUG: All columns in dataframe: {list(df.columns)}")
    logger.info(f"🔍 DEBUG: Excluded columns: {list(exclude)}")

    # ---- per-combo weighting + aggregation
    results: List[ComboResult] = []

    for combo_vals, sub in df.groupby(req.grouping_keys, dropna=False):
        # ensure DataFrame
        combo_df = sub.reset_index(drop=True)
        if combo_df.empty:
            continue

        # weights from MAPE Test
        w_series, best_mape, total_w = _exp_mape_weights(combo_df[mape_test_col])
        if w_series is None:
            # no valid mape -> skip combo
            continue

        # align weight series
        weights = w_series.reindex(combo_df.index).fillna(0.0)

        # best model
        best_idx = combo_df[mape_test_col].idxmin()
        best_model = None
        if pd.notna(best_idx):
            best_model = str(combo_df.loc[best_idx, model_col]) if model_col in combo_df.columns else None

        # weighted averages for every numeric col
        weighted_dict: Dict[str, Optional[float]] = {}
        for col in numeric_candidates:
            val = _weighted_avg_series(combo_df[col], weights)
            weighted_dict[col] = None if val is None else float(val)
        
        # Debug logging
        logger.info(f"🔍 DEBUG: Weighted dict keys: {list(weighted_dict.keys())}")
        logger.info(f"🔍 DEBUG: Weighted dict values: {weighted_dict}")

        # convenience aliases (if those columns exist)
        def pick_alias(*cols):
            for c in cols:
                if c in weighted_dict and weighted_dict[c] is not None:
                    return weighted_dict[c]
            return None

        aliases = {
            "elasticity": pick_alias("Weighted_Elasticity", "SelfElasticity", "Elasticity"),
            "mape_test": pick_alias(mape_test_col),
            "mape_train": pick_alias("MAPE Train", "MAPE_train", "Weighted_MAPE_Train", "mape_train"),
            "r2_test": pick_alias("R2 Test", "r2_test", "Weighted_R2_Test", "R2"),
            "r2_train": pick_alias("R2 Train", "r2_train", "Weighted_R2_Train"),
            "b0": pick_alias("Weighted_B0", "B0 (Original)", "Intercept", "Beta_Intercept", "intercept"),
        }

        # model composition by weight
        comp = combo_df[[model_col]].copy()
        comp["w"] = weights.values
        model_shares = comp.groupby(model_col)["w"].sum()
        model_comp = {str(k): float(v) for k, v in model_shares.items()}
        weight_conc = float(max(model_comp.values())) if model_comp else None

        # optional Y_Pred_at_Mean when we have Weighted_B0 + Weighted_Beta_* + Mean_*
        y_pred_at_mean = None
        try:
            b0 = aliases["b0"]
            if b0 is not None:
                # assemble features
                beta_cols = [c for c in weighted_dict.keys() if c.startswith("Beta_") or c.startswith("Weighted_Beta_") or c.endswith("_beta")]
                # normalize to Weighted_Beta_<feat>
                beta_map = {}
                for c in beta_cols:
                    if c.startswith("Weighted_Beta_"):
                        feat = c.replace("Weighted_Beta_", "")
                        beta_map[feat] = weighted_dict[c]
                    elif c.startswith("Beta_"):
                        feat = c.replace("Beta_", "")
                        beta_map[feat] = weighted_dict[c]
                    elif c.endswith("_beta"):
                        feat = c.replace("_beta", "")
                        beta_map[feat] = weighted_dict[c]
                # mean columns
                mean_cols = {c.replace("Mean_", ""): weighted_dict[c]
                             for c in weighted_dict.keys() if c.startswith("Mean_")}
                # Also look for _avg columns (user's naming convention)
                avg_cols = {c.replace("_avg", ""): weighted_dict[c]
                           for c in weighted_dict.keys() if c.endswith("_avg")}
                # Merge mean and avg columns
                mean_cols.update(avg_cols)
                # compute only over intersection
                s = float(b0)
                used = False
                for feat, beta in beta_map.items():
                    if beta is None:
                        continue
                    if feat in mean_cols and mean_cols[feat] is not None:
                        s += float(beta) * float(mean_cols[feat])
                        used = True
                if used:
                    y_pred_at_mean = s
        except Exception:
            y_pred_at_mean = None

        # combo dict
        if isinstance(combo_vals, tuple):
            combo_dict = {k: v for k, v in zip(req.grouping_keys, combo_vals)}
        else:
            combo_dict = {req.grouping_keys[0]: combo_vals}

        results.append(ComboResult(
            combo=combo_dict,
            models_used=int(len(combo_df)),
            best_model=best_model,
            best_mape=(None if best_mape is None else float(best_mape)),
            weight_concentration=weight_conc,
            model_composition=model_comp,
            weighted=weighted_dict,
            aliases=aliases,
            y_pred_at_mean=(None if y_pred_at_mean is None else float(y_pred_at_mean))
        ))

    return WeightedEnsembleResponse(
        grouping_keys=req.grouping_keys,
        total_combos=len(results),
        results=results
    )

@router.get("/models/saved-combinations-status", response_model=SavedCombinationsStatusResponse, tags=["Models"])
async def get_saved_combinations_status(
    file_key: str = Query(..., description="MinIO file key for the model results file"),
    atom_id: str = Query(..., description="Atom ID to filter saved models")
):
    """
    Get the status of saved combinations for a specific file and atom.
    Returns which combinations have been saved and which are still pending.
    """
    if db is None:
        raise HTTPException(status_code=503, detail="MongoDB connection is not available.")
    
    try:
        # Get all saved models from select_configs collection instead of saved_models_generic
        select_configs_coll = get_select_configs_collection()
        if select_configs_coll is None:
            raise HTTPException(status_code=503, detail="Select configs collection not available.")
        
        # Find models saved by this atom for this file
        saved_models = await select_configs_coll.find({
            "source_file": file_key,
            "tags": {"$in": [f"select-models-feature-{atom_id}"]}
        }).to_list(length=None)
        
        # Extract combination IDs from saved models
        saved_combination_ids = set()
        for model in saved_models:
            if "combination_id" in model:
                saved_combination_ids.add(str(model["combination_id"]))
        
        # Get all unique combination IDs from the source file
        if not minio_client:
            raise HTTPException(status_code=503, detail="MinIO connection is not available.")
        
        # Read the source file to get all combination IDs
        try:
            response = minio_client.get_object(MINIO_BUCKET, file_key)
            content = response.read()
            response.close()
            response.release_conn()
            
            # Read file based on extension
            if file_key.endswith(".csv"):
                df = pd.read_csv(io.BytesIO(content))
            elif file_key.endswith(".xlsx"):
                df = pd.read_excel(io.BytesIO(content))
            elif file_key.endswith(".arrow"):
                import pyarrow as pa
                import pyarrow.ipc as ipc
                reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
                df = reader.read_all().to_pandas()
            else:
                raise HTTPException(status_code=400, detail=f"Unsupported file type: {file_key}")
            
            # Get all unique combination IDs from the file
            if "combination_id" in df.columns:
                all_combination_ids = set(df["combination_id"].astype(str).unique())
            else:
                all_combination_ids = set()
            
            # Calculate pending combinations
            pending_combination_ids = all_combination_ids - saved_combination_ids
            
            return {
                "file_key": file_key,
                "atom_id": atom_id,
                "total_combinations": len(all_combination_ids),
                "saved_combinations": list(saved_combination_ids),
                "pending_combinations": list(pending_combination_ids),
                "saved_count": len(saved_combination_ids),
                "pending_count": len(pending_combination_ids),
                "completion_percentage": round((len(saved_combination_ids) / len(all_combination_ids)) * 100, 2) if all_combination_ids else 0
            }
            
        except Exception as e:
            logger.error(f"Error reading source file: {str(e)}")
            # Return partial data if we can't read the source file
            return {
                "file_key": file_key,
                "atom_id": atom_id,
                "total_combinations": len(saved_combination_ids),
                "saved_combinations": list(saved_combination_ids),
                "pending_combinations": [],
                "saved_count": len(saved_combination_ids),
                "pending_count": 0,
                "completion_percentage": 100 if saved_combination_ids else 0,
                "note": "Could not read source file to determine total combinations"
            }
            
    except Exception as e:
        logger.error(f"Error getting saved combinations status: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting saved combinations status: {str(e)}")

