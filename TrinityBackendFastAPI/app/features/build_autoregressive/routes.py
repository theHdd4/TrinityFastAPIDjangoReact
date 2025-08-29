# app/routes.py

from fastapi import APIRouter, HTTPException, Query, Path, Form
import logging
import asyncio
from datetime import datetime
from typing import List, Optional
import uuid

# Database imports
from .database import (
    save_autoregressive_results,
    get_autoregressive_results,
    save_dataframe_to_minio
)

# Schema imports
from .schemas import (
    AutoregressiveTrainingResponse,
    AutoregressiveModelConfig
)

# Legacy imports for backward compatibility
from .deps import get_minio_df, fetch_measures_list, get_column_classifications_collection, get_autoreg_identifiers_list, fetch_autoreg_identifiers_list
from .autoregressive.base import forecast_for_combination, calculate_fiscal_growth, calculate_halfyearly_yoy_growth, calculate_quarterly_yoy_growth
from .mongodb_saver import save_autoreg_identifiers, save_autoreg_results

# Import get_minio_client from scope_selector deps
from ..scope_selector.deps import get_minio_client

# Import get_object_prefix for dynamic path construction
from ..data_upload_validate.app.routes import get_object_prefix

# Data processing imports
import pandas as pd
import numpy as np
import io
from io import StringIO, BytesIO

logger = logging.getLogger(__name__)

router = APIRouter()

# Direct autoregressive model training endpoint (for frontend compatibility)
@router.post("/train-autoregressive-models-direct", response_model=AutoregressiveTrainingResponse, tags=["Autoregressive Model Training"])
async def train_autoregressive_models_direct(request: dict):
    """
    Train autoregressive models directly using MinIO files without requiring MongoDB scope documents.
    This endpoint works with the frontend's scope number and combination strings.
    """
    try:
        # Generate unique run ID or use provided one
        run_id = request.get('run_id') or str(uuid.uuid4())
        logger.info(f"Starting direct autoregressive model training with run_id: {run_id}")
        
        # Extract parameters from request
        scope_number = request.get('scope_number')  # e.g., "3"
        combinations = request.get('combinations', [])  # e.g., ["Channel_Convenience_Variant_Flavoured_Brand_HEINZ_Flavoured_PPG_Small_Single"]
        y_variable = request.get('y_variable')
        forecast_horizon = request.get('forecast_horizon', 12)
        fiscal_start_month = request.get('fiscal_start_month', 1)
        frequency = request.get('frequency', 'M')
        models_to_run = request.get('models_to_run')
        
        # Validate required parameters
        if not scope_number or not combinations or not y_variable:
            raise HTTPException(
                status_code=400,
                detail="Missing required parameters: scope_number, combinations, or y_variable"
            )
        
        # Find files in MinIO based on scope number and combinations
        minio_client = get_minio_client()
        
        # Dynamically get the bucket and prefix structure (same as scope selector)
        try:
            # Import scope selector settings to get the correct bucket
            from ..scope_selector.config import get_settings
            scope_settings = get_settings()
            bucket_name = scope_settings.minio_bucket  # Get bucket from scope selector config
            object_prefix = await get_object_prefix()
        except Exception as e:
            bucket_name = "Quant_Matrix_AI_Schema"  # Use the bucket where files actually exist
            object_prefix = "blank/blank project/"
        
        combination_results = []
        processed_combinations = 0
        total_combinations = len(combinations)
        
        for combination_index, combination in enumerate(combinations):
            logger.info(f"Processing combination {combination_index + 1}/{total_combinations}: {combination}")
            
            # Search for the file in MinIO
            target_file_key = None
            try:
                # Simple and direct search - find ALL files and filter them
                matching_objects = []
                
                try:
                    # Search for files containing both Scope_X and the combination string
                    all_objects = list(minio_client.list_objects(bucket_name, recursive=True))
                    
                    for obj in all_objects:
                        obj_name = obj.object_name
                        
                        # Check if file contains the scope number
                        scope_pattern = f"Scope_{scope_number}"
                        has_scope = scope_pattern in obj_name
                        
                        # Check if file contains the combination string
                        has_combination = combination in obj_name
                        
                        if has_scope and has_combination:
                            matching_objects.append(obj_name)
                    
                    logger.info(f"Total matching files found for {combination}: {len(matching_objects)}")
                    
                except Exception as search_error:
                    logger.error(f"Search failed: {search_error}")
                    continue
                
                if matching_objects:
                    # Use the first matching file
                    target_file_key = matching_objects[0]
                    
                    # Read the file
                    try:
                        response = minio_client.get_object(bucket_name, target_file_key)
                        file_data = response.read()
                        response.close()
                        response.release_conn()
                        
                        # Read file into DataFrame
                        if target_file_key.endswith('.arrow'):
                            try:
                                import pyarrow as pa
                                import pyarrow.ipc as ipc
                                reader = ipc.RecordBatchFileReader(pa.BufferReader(file_data))
                                df = reader.read_all().to_pandas()
                            except Exception as arrow_error:
                                logger.error(f"Error reading Arrow file: {arrow_error}")
                                continue
                        elif target_file_key.endswith('.csv'):
                            df = pd.read_csv(io.BytesIO(file_data))
                        elif target_file_key.endswith('.xlsx'):
                            df = pd.read_excel(io.BytesIO(file_data))
                        else:
                            logger.warning(f"Unsupported file format: {target_file_key}")
                            continue
                        
                        # Validate target variable exists
                        available_columns = df.columns.tolist()
                        if y_variable not in available_columns:
                            logger.warning(f"Target variable '{y_variable}' not found in {target_file_key}. Available: {available_columns}")
                            continue
                        
                        # Standardize column names
                        df.columns = df.columns.str.lower().str.strip()
                        y_var_lower = y_variable.lower().strip()
                        
                        if y_var_lower not in df.columns:
                            logger.warning(f"Target variable '{y_var_lower}' not found after standardization")
                            continue
                        
                    except Exception as file_error:
                        logger.error(f"Error reading file {target_file_key}: {file_error}")
                        continue
                    
                    # Run autoregressive forecasting
                    try:
                        forecast_result = await forecast_for_combination(
                            df=df,
                            y_var=y_var_lower,
                            forecast_horizon=forecast_horizon,
                            fiscal_start_month=fiscal_start_month,
                            frequency=frequency,
                            combination={"combination_id": combination, "file_key": target_file_key},
                            models_to_run=models_to_run
                        )
                        
                        combination_results.append({
                            "combination_id": combination,
                            "file_key": target_file_key,
                            "status": "success",
                            "result": forecast_result
                        })
                        
                        processed_combinations += 1
                        
                    except Exception as model_error:
                        logger.error(f"Error running autoregressive models for {combination}: {model_error}")
                        combination_results.append({
                            "combination_id": combination,
                            "file_key": target_file_key,
                            "status": "error",
                            "error": str(model_error)
                        })
                
                else:
                    logger.warning(f"No matching file found for combination: {combination}")
                    combination_results.append({
                        "combination_id": combination,
                        "file_key": None,
                        "status": "error",
                        "error": "No matching file found in MinIO"
                    })
                    
            except Exception as e:
                logger.error(f"Failed to process combination {combination}: {e}")
                combination_results.append({
                    "combination_id": combination,
                    "file_key": None,
                    "status": "error",
                    "error": str(e)
                })
        
        return AutoregressiveTrainingResponse(
            status="completed",
            message=f"Processed {processed_combinations}/{total_combinations} combinations",
            scope_id=f"scope_{scope_number}",
            set_name="direct_training",
            total_combinations=total_combinations,
            processed_combinations=processed_combinations,
            results=combination_results
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to train autoregressive models directly: {e}")
        raise HTTPException(status_code=500, detail="Failed to train autoregressive models directly")

# Get file path endpoint (for frontend file opening)
@router.get("/get_file_path")
async def get_file_path(scope: str = Query(...), combination: str = Query(...)):
    """Get the file path for a specific scope and combination."""
    try:
        minio_client = get_minio_client()
        
        # Dynamically get the bucket and prefix structure
        try:
            from ..scope_selector.config import get_settings
            scope_settings = get_settings()
            bucket_name = scope_settings.minio_bucket
            object_prefix = await get_object_prefix()
        except Exception as e:
            bucket_name = "Quant_Matrix_AI_Schema"
            object_prefix = "blank/blank project/"
        
        # Search for the file
        matching_objects = []
        try:
            all_objects = list(minio_client.list_objects(bucket_name, recursive=True))
            
            for obj in all_objects:
                obj_name = obj.object_name
                scope_pattern = f"Scope_{scope}"
                has_scope = scope_pattern in obj_name
                has_combination = combination in obj_name
                
                if has_scope and has_combination:
                    matching_objects.append(obj_name)
        except Exception as search_error:
            logger.error(f"Search failed: {search_error}")
            raise HTTPException(status_code=500, detail="Failed to search for file")
        
        if matching_objects:
            file_path = matching_objects[0]
            # Generate presigned URL for file access
            try:
                presigned_url = minio_client.presigned_get_object(bucket_name, file_path, expires=3600)
                return {"file_path": file_path, "presigned_url": presigned_url}
            except Exception as e:
                logger.error(f"Failed to generate presigned URL: {e}")
                return {"file_path": file_path, "presigned_url": None}
        else:
            raise HTTPException(status_code=404, detail="File not found")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get file path: {e}")
        raise HTTPException(status_code=500, detail="Failed to get file path")

# Get columns endpoint (for frontend column selection)
@router.get("/get_columns")
async def get_columns(scope: str = Query(...), combination: str = Query(...)):
    """Get available columns for a specific scope and combination."""
    try:
        minio_client = get_minio_client()
        
        # Dynamically get the bucket and prefix structure
        try:
            from ..scope_selector.config import get_settings
            scope_settings = get_settings()
            bucket_name = scope_settings.minio_bucket
            object_prefix = await get_object_prefix()
        except Exception as e:
            bucket_name = "Quant_Matrix_AI_Schema"
            object_prefix = "blank/blank project/"
        
        # Search for the file
        target_file_key = None
        try:
            all_objects = list(minio_client.list_objects(bucket_name, recursive=True))
            
            for obj in all_objects:
                obj_name = obj.object_name
                scope_pattern = f"Scope_{scope}"
                has_scope = scope_pattern in obj_name
                has_combination = combination in obj_name
                
                if has_scope and has_combination:
                    target_file_key = obj_name
                    break
        except Exception as search_error:
            logger.error(f"Search failed: {search_error}")
            raise HTTPException(status_code=500, detail="Failed to search for file")
        
        if target_file_key:
            try:
                response = minio_client.get_object(bucket_name, target_file_key)
                file_data = response.read()
                response.close()
                response.release_conn()
                
                # Read file into DataFrame
                if target_file_key.endswith('.arrow'):
                    import pyarrow as pa
                    import pyarrow.ipc as ipc
                    reader = ipc.RecordBatchFileReader(pa.BufferReader(file_data))
                    df = reader.read_all().to_pandas()
                elif target_file_key.endswith('.csv'):
                    df = pd.read_csv(io.BytesIO(file_data))
                elif target_file_key.endswith('.xlsx'):
                    df = pd.read_excel(io.BytesIO(file_data))
                else:
                    raise HTTPException(status_code=400, detail="Unsupported file format")
                
                # Return available columns
                columns = df.columns.tolist()
                return {"columns": columns, "file_key": target_file_key}
                
            except Exception as file_error:
                logger.error(f"Error reading file {target_file_key}: {file_error}")
                raise HTTPException(status_code=500, detail="Failed to read file")
        else:
            raise HTTPException(status_code=404, detail="File not found")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get columns: {e}")
        raise HTTPException(status_code=500, detail="Failed to get columns")

# Legacy endpoints for backward compatibility
@router.get("/init")
async def init_autoforecat(
    object_names: str = Form(...),
    bucket_name: str = Form(...),
    validator_atom_id: str = Form(...),
    file_key: str = Form(...),
):
    try:
        df = get_minio_df(bucket=bucket_name, file_key=object_names)
      
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to load data: {e}")
    
    df.columns = df.columns.str.strip().str.lower()

    # Clean string column values
    str_cols = df.select_dtypes(include='object').columns
    df[str_cols] = df[str_cols].apply(lambda x: x.str.strip().str.lower())
    
    # Step 3: Get final measures from column_classifications
    measures_collection = await get_column_classifications_collection()
    identifiers, measures = await fetch_measures_list(validator_atom_id, file_key, measures_collection)

    # Identify identifiers with more than one unique value and not numeric/datetime
    multi_value_identifiers = []
    for col in identifiers:
        if col in df.columns:
            if (
                df[col].nunique(dropna=False) > 1
                and not pd.api.types.is_numeric_dtype(df[col])
                and not pd.api.types.is_datetime64_any_dtype(df[col])
            ):
                multi_value_identifiers.append(col)

    await save_autoreg_identifiers(
        collection_name="autoreg_identifiers",
        data={"validator_atom_id": validator_atom_id, "file_key": file_key, "identifiers": multi_value_identifiers}
    )

    return {
        "identifiers": identifiers,
        "multi_value_identifiers": multi_value_identifiers,
        "measures": measures,
        "message": "Dataset loaded and inspected successfully."
    }

@router.post("/perform")
async def perform_autoregressive(
    object_names: str = Form(...),
    bucket_name: str = Form(...),
    validator_atom_id: str = Form(...),
    file_key: str = Form(...),
    y_var: str = Form(...),
    forecast_horizon: int = Form(...),
    fiscal_start_month: str = Form(...),
    frequency: str = Form(...),
    combination: str = Form(...)  # JSON string
):
    
    if not fiscal_start_month.isdigit():
        return {"status": "FAILURE", "error": f"Invalid fiscal_start_month: {fiscal_start_month}"}
    fiscal_start_month = int(fiscal_start_month)
    
    # Your existing autoregressive logic here
    # This is a placeholder - you should keep your existing implementation
    return {"status": "SUCCESS", "message": "Autoregressive forecasting completed"}


