# app/routes.py

from fastapi import APIRouter, HTTPException, Query, Path, Form, BackgroundTasks, Body, Request
import asyncio
import multiprocessing
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
import uuid
import threading
import hashlib
from concurrent.futures import ThreadPoolExecutor
import pandas as pd
import numpy as np

# MongoDB and MinIO imports for saving models
import io
import json

# Database imports
from .database import (
    save_autoregressive_results,
    get_autoregressive_results,
    save_dataframe_to_minio,
    autoregressive_db, 
    minio_client, 
    MINIO_BUCKET,
    save_combination_save_status_to_mongo,
    get_combination_save_status_from_mongo,
    update_combination_save_status,
    get_combination_save_status,
    get_mongo_client
)
from .config import settings

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
try:
    from ..scope_selector.deps import get_minio_client
except ImportError:
    # Fallback if import fails
    def get_minio_client():
        from minio import Minio
        return Minio(
            "minio:9000",
            access_key="admin_dev",
            secret_key="pass_dev",
            secure=False
        )

# Data processing imports
import numpy as np
import io
from io import StringIO, BytesIO

# Performance configuration - CPU OPTIMIZED
PERFORMANCE_CONFIG = {
    "max_concurrent_combinations": 19,  # Process ALL combinations simultaneously
    "max_concurrent_models": 4,         # Number of models to process simultaneously per combination
    "enable_caching": True,             # Enable result caching
    "cache_ttl": 3600,                 # Cache TTL in seconds (1 hour)
    "optimize_memory": True,            # Enable memory optimization
    "batch_size": 19,                  # Process all combinations in one batch
    "cpu_cores": multiprocessing.cpu_count(),  # Use all available CPU cores
    "process_pool": True               # Use ProcessPoolExecutor for CPU-bound tasks
}


router = APIRouter()


# Global storage for training progress
training_progress: Dict[str, Dict[str, Any]] = {}

# Background task executor
executor = ThreadPoolExecutor(max_workers=4)

async def process_combination_async(
    run_id: str,
    scope_number: str,
    combination: str,
    y_variable: str,
    forecast_horizon: int,
    fiscal_start_month: int,
    frequency: str,
    models_to_run: List[str],
    bucket_name: str,
    combination_index: int,
    total_combinations: int
) -> Dict[str, Any]:
    """Process a single combination asynchronously."""
    try:
        # Update progress
        if run_id in training_progress:
            training_progress[run_id]["current_combination"] = combination
            training_progress[run_id]["current"] = combination_index + 1
            training_progress[run_id]["percentage"] = int(((combination_index + 1) / total_combinations) * 100)
            training_progress[run_id]["current_model"] = "Searching for data file..."
            training_progress[run_id]["last_updated"] = datetime.now().isoformat()
            
            # Initialize combination save status in dedicated collection if this is the first combination
            # Note: This functionality is not available in the 3 Sept version
            # if combination_index == 0:
            #     try:
            #         # Get all combinations for this scope
            #         all_combinations = []
            #         for run_id_inner, progress_inner in training_progress.items():
            #             if progress_inner.get("scope_id") == f"scope_{scope_number}":
            #                 if "results" in progress_inner:
            #                     for result in progress_inner["results"]:
            #                         if "combination_id" in result:
            #                             all_combinations.append(str(result["combination_id"]))
            #         
            #         # Initialize save status with all combinations as pending
            #         await update_combination_save_status(
            #             scope=scope_number,
            #             atom_id=run_id,  # Use run_id as atom_id for now
            #             saved_combinations=[],
            #             pending_combinations=all_combinations,
            #             client_name="",  # Will be updated when combinations are saved
            #             app_name="",
            #             project_name=""
            #         )
            #     except Exception as e:
            #         # Continue even if initialization fails
        
        
        minio_client = get_minio_client()
        
        # Search for the file in MinIO
        target_file_key = None
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
            
                    
        except Exception as search_error:
            return {
                "combination_id": combination,
                "file_key": None,
                "status": "error",
                "error": f"Search failed: {str(search_error)}"
            }
                
        if not matching_objects:
            return {
                "combination_id": combination,
                "file_key": None,
                "status": "error",
                "error": "No matching file found in MinIO"
            }
        
        # Use the first matching file
        target_file_key = matching_objects[0]
        
        # Update progress - file found
        if run_id in training_progress:
            training_progress[run_id]["current_model"] = "Reading data file..."
            training_progress[run_id]["last_updated"] = datetime.now().isoformat()
            await asyncio.sleep(0.2)  # Small delay to make progress visible
        
        # Read the file
        try:
            response = minio_client.get_object(bucket_name, target_file_key)
            file_data = response.read()
            response.close()
            response.release_conn()
            
            # Update progress - file read successfully
            if run_id in training_progress:
                training_progress[run_id]["current_model"] = "Validating data and variables..."
                training_progress[run_id]["last_updated"] = datetime.now().isoformat()
                await asyncio.sleep(0.2)  # Small delay to make progress visible
            
            # Read file into DataFrame
            if target_file_key.endswith('.arrow'):
                try:
                    import pyarrow as pa
                    import pyarrow.ipc as ipc
                    reader = ipc.RecordBatchFileReader(pa.BufferReader(file_data))
                    df = reader.read_all().to_pandas()
                except Exception as arrow_error:
                    return {
                        "combination_id": combination,
                        "file_key": target_file_key,
                        "status": "error",
                        "error": f"Error reading Arrow file: {str(arrow_error)}"
                    }
            elif target_file_key.endswith('.csv'):
                df = pd.read_csv(io.BytesIO(file_data))
            elif target_file_key.endswith('.xlsx'):
                df = pd.read_excel(io.BytesIO(file_data))
            else:
                return {
                    "combination_id": combination,
                    "file_key": target_file_key,
                    "status": "error",
                    "error": f"Unsupported file format: {target_file_key}"
                }
            
            # Validate target variable exists
            available_columns = df.columns.tolist()
            if y_variable not in available_columns:
                return {
                    "combination_id": combination,
                    "file_key": target_file_key,
                    "status": "error",
                    "error": f"Target variable '{y_variable}' not found. Available: {available_columns}"
                }
            
            # Standardize column names
            df.columns = df.columns.str.lower().str.strip()
            y_var_lower = y_variable.lower().strip()
            
            if y_var_lower not in df.columns:
                return {
                    "combination_id": combination,
                    "file_key": target_file_key,
                    "status": "error",
                    "error": f"Target variable '{y_var_lower}' not found after standardization"
                }
            
        except Exception as file_error:
            return {
                "combination_id": combination,
                "file_key": target_file_key,
                "status": "error",
                "error": f"Error reading file: {str(file_error)}"
            }
        
        # Run autoregressive forecasting
        try:
            # Update progress - starting model training
            if run_id in training_progress:
                training_progress[run_id]["current_model"] = "Training autoregressive models..."
                training_progress[run_id]["last_updated"] = datetime.now().isoformat()
                await asyncio.sleep(0.3)  # Small delay to make progress visible
            
            forecast_result = await forecast_for_combination(
                df=df,
                y_var=y_var_lower,
                forecast_horizon=forecast_horizon,
                fiscal_start_month=fiscal_start_month,
                frequency=frequency,
                combination={"combination_id": combination, "file_key": target_file_key},
                models_to_run=models_to_run
            )
            
            # Update progress - model training completed
            if run_id in training_progress:
                training_progress[run_id]["current_model"] = "Model training completed successfully"
                training_progress[run_id]["last_updated"] = datetime.now().isoformat()
                await asyncio.sleep(0.2)  # Small delay to make progress visible
            
            
            return {
                "combination_id": combination,
                "file_key": target_file_key,
                "status": "success",
                "result": forecast_result
            }
            
        except Exception as model_error:
            return {
                            "combination_id": combination,
                            "file_key": target_file_key,
                            "status": "error",
                "error": str(model_error)
            }
            
    except Exception as e:
        return {
                        "combination_id": combination,
                        "file_key": None,
                        "status": "error",
            "error": str(e)
        }

async def run_background_training(
    run_id: str,
    scope_number: str,
    combinations: List[str],
    y_variable: str,
    forecast_horizon: int,
    fiscal_start_month: int,
    frequency: str,
    models_to_run: List[str],
    bucket_name: str
):
    """Run training in background and update progress."""
    try:
        total_combinations = len(combinations)
        combination_results = []
        
        # Initialize progress
        training_progress[run_id] = {
            "run_id": run_id,
            "current": 0,
            "total": total_combinations,
            "percentage": 0,
            "status": "running",
            "current_combination": "",
            "current_model": "",
            "completed_combinations": 0,
            "total_combinations": total_combinations,
            "results": [],
            "scope_id": f"scope_{scope_number}",
            "start_time": datetime.now().isoformat(),
            "last_updated": datetime.now().isoformat()
        }
        
        
        # Process combinations sequentially for better progress tracking
        for combination_index, combination in enumerate(combinations):
            try:
                # Update progress - starting combination
                training_progress[run_id]["current_combination"] = combination
                training_progress[run_id]["current"] = combination_index
                training_progress[run_id]["percentage"] = int((combination_index / total_combinations) * 100)
                training_progress[run_id]["last_updated"] = datetime.now().isoformat()
                
                
                # Update progress - searching for file
                training_progress[run_id]["current_model"] = "Searching for data file..."
                training_progress[run_id]["last_updated"] = datetime.now().isoformat()
                await asyncio.sleep(0.2)  # Small delay to make progress visible
                
                # Process single combination
                result = await process_combination_async(
                    run_id, scope_number, combination, y_variable,
                    forecast_horizon, fiscal_start_month, frequency,
                    models_to_run, bucket_name, combination_index, total_combinations
                )
                
                # Update progress - combination completed
                training_progress[run_id]["current"] = combination_index + 1
                training_progress[run_id]["percentage"] = int(((combination_index + 1) / total_combinations) * 100)
                
                if result.get("status") == "success":
                    training_progress[run_id]["completed_combinations"] += 1
                    training_progress[run_id]["current_model"] = f"Completed: {combination}"
                else:
                    training_progress[run_id]["current_model"] = f"Error: {combination}"
                
                training_progress[run_id]["last_updated"] = datetime.now().isoformat()
                combination_results.append(result)
                
                # Small delay to make progress visible
                await asyncio.sleep(0.3)
                
            except Exception as e:
                training_progress[run_id]["current_model"] = f"Error: {combination}"
                training_progress[run_id]["last_updated"] = datetime.now().isoformat()
                combination_results.append({
                    "combination_id": combination,
                    "file_key": None,
                    "status": "error",
                    "error": str(e)
                })
        
        # Update results in progress
        training_progress[run_id]["results"] = combination_results
        
        for i, result in enumerate(combination_results):
            if result.get('status') == 'success' and result.get('result'):
                # Process successful result
                pass
        
        # Update final progress
        training_progress[run_id]["status"] = "completed"
        training_progress[run_id]["results"] = combination_results
        training_progress[run_id]["percentage"] = 100
        training_progress[run_id]["current"] = total_combinations
        training_progress[run_id]["current_combination"] = ""
        training_progress[run_id]["current_model"] = "Training completed successfully"
        training_progress[run_id]["last_updated"] = datetime.now().isoformat()
        
        
    except Exception as e:
        if run_id in training_progress:
            training_progress[run_id]["status"] = "error"
            training_progress[run_id]["error"] = str(e)
            training_progress[run_id]["current_combination"] = ""
            training_progress[run_id]["current_model"] = f"Training failed: {str(e)}"
            training_progress[run_id]["last_updated"] = datetime.now().isoformat()

# Direct autoregressive model training endpoint (for frontend compatibility)
@router.post("/train-autoregressive-models-direct", response_model=AutoregressiveTrainingResponse, tags=["Autoregressive Model Training"])
async def train_autoregressive_models_direct(request: dict, background_tasks: BackgroundTasks):
    """
    Train autoregressive models directly using MinIO files without requiring MongoDB scope documents.
    This endpoint works with the frontend's scope number and combination strings.
    Now uses Celery for true asynchronous processing.
    """
    try:
        # Generate unique run ID or use provided one
        run_id = request.get('run_id') or str(uuid.uuid4())
        
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
        
        # Run training synchronously to return results immediately
        
        # Run training synchronously
        await run_background_training(
            run_id,
            scope_number,
            combinations,
            y_variable,
            forecast_horizon,
            fiscal_start_month,
            frequency,
            models_to_run,
            "trinity"  # bucket_name
        )
        
        # Get the results from training progress
        if run_id in training_progress:
            progress = training_progress[run_id]
            if progress["status"] == "completed":
                # Count successful results
                successful_results = [r for r in progress.get("results", []) if r.get("status") == "success"]
                
                # Return the actual results with forecast data
                serializable_results = []
                if progress.get("results"):
                    for result in progress["results"]:
                        serializable_result = {
                            "combination_id": result.get("combination_id", ""),
                            "file_key": result.get("file_key", ""),
                            "status": result.get("status", ""),
                            "error": result.get("error", "")
                        }
                        
                        # If the result contains forecast data, include the actual data
                        if result.get("status") == "success" and result.get("result"):
                            result_data = result["result"]
                            # Include the full result data but ensure it's serializable
                            serializable_result["result"] = {
                                "models_run": result_data.get("models_run", []),
                                "forecast_df": result_data.get("forecast_df", []),  # Include actual forecast data
                                "metrics": result_data.get("metrics", {}),  # Include actual metrics
                                "model_params": result_data.get("model_params", {}),
                                "combination": result_data.get("combination", {})
                            }
                        
                        serializable_results.append(serializable_result)
                
                
                return AutoregressiveTrainingResponse(
                    status="completed",
                    message=f"Training completed. {len(successful_results)}/{len(progress.get('results', []))} combinations successful.",
                    scope_id=progress.get("scope_id", "unknown"),
                    set_name="direct_training",
                    total_combinations=progress.get("total_combinations", 0),
                    processed_combinations=len(successful_results),
                    results=serializable_results,
                    run_id=run_id
                )
            else:
                # Training failed
                return AutoregressiveTrainingResponse(
                    status="error",
                    message=f"Training failed: {progress.get('error', 'Unknown error')}",
                    scope_id=f"scope_{scope_number}",
                    set_name="direct_training",
                    total_combinations=len(combinations),
                    processed_combinations=0,
                    results=[],
                    run_id=run_id
                )
        else:
            # Training not found
            return AutoregressiveTrainingResponse(
                status="error",
                message="Training not found",
                scope_id=f"scope_{scope_number}",
                set_name="direct_training",
                total_combinations=len(combinations),
                processed_combinations=0,
                results=[],
                run_id=run_id
            )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to start autoregressive model training")

@router.get("/training-progress/{run_id}", tags=["Autoregressive Model Training"])
async def get_training_progress(run_id: str):
    """Get the current progress of autoregressive model training."""
    if run_id not in training_progress:
        raise HTTPException(status_code=404, detail="Training run not found")
    
    progress = training_progress[run_id]
    
    # OPTIMIZED: Only return essential progress info, not full results
    # This prevents timeout when results are large
    successful_count = 0
    error_count = 0
    if progress.get("results"):
        for result in progress["results"]:
            if result.get("status") == "success":
                successful_count += 1
            elif result.get("status") == "error":
                error_count += 1
    
    return {
        "run_id": run_id,
        "status": progress["status"],
        "current": progress["current"],
        "total": progress["total"],
        "percentage": progress["percentage"],
        "current_combination": progress.get("current_combination", ""),
        "current_model": progress.get("current_model", ""),
        "completed_combinations": progress.get("completed_combinations", 0),
        "total_combinations": progress.get("total_combinations", 0),
        "successful_count": successful_count,
        "error_count": error_count,
        "start_time": progress.get("start_time"),
        "last_updated": progress.get("last_updated"),
        "total_execution_time_seconds": progress.get("total_execution_time"),
        "error": progress.get("error", None),
        "results": progress.get("results", [])
    }


@router.get("/training-results/{run_id}", tags=["Autoregressive Model Training"])
async def get_training_results(run_id: str):
    """Get the final results of autoregressive model training."""
    if run_id not in training_progress:
        raise HTTPException(status_code=404, detail="Training run not found")
    
    progress = training_progress[run_id]
    
    if progress["status"] != "completed":
        raise HTTPException(status_code=400, detail="Training not completed yet")
    
    # Count successful results
    successful_results = [r for r in progress.get("results", []) if r.get("status") == "success"]
    
    
    # Return the actual results with forecast data, but ensure they're serializable
    serializable_results = []
    if progress.get("results"):
        for result in progress["results"]:
            serializable_result = {
                "combination_id": result.get("combination_id", ""),
                "file_key": result.get("file_key", ""),
                "status": result.get("status", ""),
                "error": result.get("error", "")
            }
            
            # If the result contains forecast data, include the actual data
            if result.get("status") == "success" and result.get("result"):
                result_data = result["result"]
                # Include the full result data but ensure it's serializable
                serializable_result["result"] = {
                    "models_run": result_data.get("models_run", []),
                    "forecast_df": result_data.get("forecast_df", []),  # Include actual forecast data
                    "metrics": result_data.get("metrics", {}),  # Include actual metrics
                    "model_params": result_data.get("model_params", {}),
                    "combination": result_data.get("combination", {})
                }
            
            serializable_results.append(serializable_result)
        
        return AutoregressiveTrainingResponse(
            status="completed",
        message=f"Training completed. {len(successful_results)}/{len(progress.get('results', []))} combinations successful.",
        scope_id=progress.get("scope_id", "unknown"),
            set_name="direct_training",
        total_combinations=progress.get("total_combinations", 0),
        processed_combinations=len(successful_results),
        results=serializable_results,
            run_id=run_id
        )


# Get columns endpoint (for frontend column selection) - GET version
@router.get("/get_columns")
async def get_columns_get(
    scope: str = Query(...),
    combination: str = Query(...)
):
    """
    Get numerical columns from a specific scope and combination file (GET version).
    
    - **scope**: Scope number (e.g., "1", "2", "3")
    - **combination**: Combination name (e.g., "convenience_heinz_small")
    """
    try:
        minio_client = get_minio_client()
        
        if minio_client is None:
            raise HTTPException(status_code=503, detail="MinIO not available")
        
        # Use the same bucket as scope selector (trinity bucket)
        trinity_bucket = "trinity"
        
        # List objects in the trinity bucket to find matching files
        objects = minio_client.list_objects(
            trinity_bucket,
            recursive=True
        )
        
        # Log all available files for debugging
        all_files = list(objects)
        arrow_files = [obj.object_name for obj in all_files if obj.object_name.endswith('.arrow')]
        
        # Look for files that match the pattern: Scope_{scope}_{combination}_*.arrow
        target_file_key = None
        
        for obj in all_files:
            if obj.object_name.endswith('.arrow'):
                # Check if this file matches our scope and combination
                if f"Scope_{scope}_" in obj.object_name and combination in obj.object_name:
                    target_file_key = obj.object_name
                    break
        
        if not target_file_key:
            # If no exact match, try to find any file with the scope number
            for obj in all_files:
                if obj.object_name.endswith('.arrow') and f"Scope_{scope}_" in obj.object_name:
                    target_file_key = obj.object_name
                    break
        
        if not target_file_key:
            raise HTTPException(
                status_code=404, 
                detail=f"No files found for Scope {scope} with combination {combination}"
            )
        
        
        # Read the file from MinIO
        response = minio_client.get_object(trinity_bucket, target_file_key)
        file_data = response.read()
        response.close()
        response.release_conn()
        
        # Read Arrow file to get columns
        import io
        
        try:
            # Try to read as Arrow first
            import pyarrow as pa
            import pyarrow.ipc as ipc
            
            # Read Arrow file
            reader = ipc.RecordBatchFileReader(pa.BufferReader(file_data))
            table = reader.read_all()
            df = table.to_pandas()
        except Exception as arrow_error:
            # Fallback to CSV if Arrow fails
            df = pd.read_csv(io.BytesIO(file_data), nrows=0)
        
        columns = df.columns.tolist()
        
        # Get data types for each column
        df_sample = df.head(100) if len(df) > 0 else df
        column_info = []
        
        for col in columns:
            col_type = str(df_sample[col].dtype)
            is_numerical = (
                'int' in col_type or 
                'float' in col_type or 
                'number' in col_type or
                pd.api.types.is_numeric_dtype(df_sample[col])
            )
            
            column_info.append({
                "name": col,
                "type": col_type,
                "is_numerical": is_numerical
            })
        
        # Filter for numerical columns only
        numerical_columns = [col["name"] for col in column_info if col["is_numerical"]]
        
        return {
            "scope": scope,
            "combination": combination,
            "file_key": target_file_key,
            "total_columns": len(columns),
            "numerical_columns": numerical_columns,
            "all_columns": column_info
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))




# Detect frequency endpoint for time series analysis
@router.post("/detect_frequency")
async def detect_frequency(
    scope: str = Form(...),
    combination: str = Form(...),
    date_column: str = Form(...)
):
    """Detect the frequency of a time series from a specific scope and combination file."""
    try:
        minio_client = get_minio_client()
        
        # Use the same bucket as scope selector (trinity bucket)
        trinity_bucket = "trinity"
        
        # Search for the file
        target_file_key = None
        try:
            # List objects in the trinity bucket to find matching files
            objects = minio_client.list_objects(
                trinity_bucket,
                recursive=True
            )
            
            # Log all available files for debugging
            all_files = list(objects)
            
            # Look for files that match the pattern: Scope_{scope}_{combination}_*.arrow
            target_file_key = None
            
            for obj in all_files:
                if obj.object_name.endswith('.arrow'):
                    # Check if this file matches our scope and combination
                    if f"Scope_{scope}_" in obj.object_name and combination in obj.object_name:
                        target_file_key = obj.object_name
                    break
            
            if not target_file_key:
                # If no exact match, try to find any file with the scope number
                for obj in all_files:
                    if obj.object_name.endswith('.arrow') and f"Scope_{scope}_" in obj.object_name:
                        target_file_key = obj.object_name
                        break
            
            if not target_file_key:
                raise HTTPException(
                    status_code=404, 
                    detail=f"No files found for Scope {scope} with combination {combination}"
                )
            
            
        except Exception as search_error:
            raise HTTPException(status_code=500, detail="Failed to search for file")
        
        if target_file_key:
            try:
                response = minio_client.get_object(trinity_bucket, target_file_key)
                file_data = response.read()
                response.close()
                response.release_conn()
                
                # Read file into DataFrame
                if target_file_key.endswith('.arrow'):
                    import pyarrow as pa
                    import pyarrow.ipc as ipc
                    try:
                        # Read Arrow file
                        reader = ipc.RecordBatchFileReader(pa.BufferReader(file_data))
                        table = reader.read_all()
                        df = table.to_pandas()
                    except Exception as arrow_error:
                        # Fallback to CSV if Arrow fails
                        df = pd.read_csv(io.BytesIO(file_data), nrows=0)
                elif target_file_key.endswith('.csv'):
                    df = pd.read_csv(io.BytesIO(file_data))
                elif target_file_key.endswith('.xlsx'):
                    df = pd.read_excel(io.BytesIO(file_data))
                else:
                    raise HTTPException(status_code=400, detail="Unsupported file format")
                
                # Check if date column exists
                if date_column not in df.columns:
                    available_columns = df.columns.tolist()
                    raise HTTPException(
                        status_code=400, 
                        detail=f"Date column '{date_column}' not found. Available columns: {available_columns}"
                    )
                
                # Convert date column to datetime
                try:
                    df[date_column] = pd.to_datetime(df[date_column], errors='coerce')
                except Exception as date_error:
                    raise HTTPException(
                        status_code=400, 
                        detail=f"Failed to convert date column '{date_column}' to datetime format"
                    )
                
                # Remove rows with invalid dates
                df_clean = df.dropna(subset=[date_column])
                if df_clean.empty:
                    raise HTTPException(
                        status_code=400, 
                        detail=f"No valid dates found in column '{date_column}'"
                    )
                
                # Detect frequency using the provided function
                def detect_frequency(date_series):
                    """Detects frequency of a time series by calculating mode of time difference.
                    Returns: 'Daily', 'Weekly', 'Monthly', 'Quarterly', 'Yearly', or 'Custom (X days)'
                    """
                    date_series = date_series.sort_values().drop_duplicates()
                    diffs = date_series.diff().dropna()
                   
                    if diffs.empty:
                        return "Unknown"
                     
                    mode_diff = diffs.mode()[0]  # Most common time difference
                     
                    # Convert to days for easier comparison
                    mode_days = mode_diff.total_seconds() / (24 * 3600)
                     
                    # Check frequency ranges (allowing small variations)
                    if 0.9 <= mode_days <= 1.1:  # ~1 day
                        return "Daily"
                    elif 6 <= mode_days <= 8:  # ~7 days
                        return "Weekly"
                    elif 25 <= mode_days <= 35:  # ~30/31 days
                        return "Monthly"
                    elif 85 <= mode_days <= 95:  # ~91 days (1 quarter)
                        return "Quarterly"
                    elif 350 <= mode_days <= 380:  # ~365 days
                        return "Yearly"
                    else:
                        return f"Custom ({mode_diff})"

                # Detect frequency
                frequency = detect_frequency(df_clean[date_column])
                
                # Get additional statistics
                total_rows = len(df_clean)
                date_range = {
                    "start": df_clean[date_column].min().isoformat(),
                    "end": df_clean[date_column].max().isoformat()
                }
                
                # Return frequency information
                return {
                    "scope": scope,
                    "combination": combination,
                    "file_key": target_file_key,
                    "date_column": date_column,
                    "frequency": frequency,
                    "total_rows": total_rows,
                    "date_range": date_range,
                    "message": f"Successfully detected frequency: {frequency}"
                }
                
            except HTTPException:
                raise
            except Exception as file_error:
                raise HTTPException(status_code=500, detail="Failed to read file")
        else:
            raise HTTPException(status_code=404, detail="File not found")
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to detect frequency")

# Get date columns endpoint for frequency detection
@router.post("/get_date_columns")
async def get_date_columns(
    scope: str = Form(...),
    combination: str = Form(...)
):
    """Get available date columns from a specific scope and combination file for frequency detection."""
    try:
        minio_client = get_minio_client()
        
        # Use the same bucket as scope selector (trinity bucket)
        trinity_bucket = "trinity"
        
        # Search for the file
        target_file_key = None
        try:
            # List objects in the trinity bucket to find matching files
            objects = minio_client.list_objects(
                trinity_bucket,
                recursive=True
            )
            
            # Log all available files for debugging
            all_files = list(objects)
            
            # Look for files that match the pattern: Scope_{scope}_{combination}_*.arrow
            target_file_key = None
            
            for obj in all_files:
                if obj.object_name.endswith('.arrow'):
                    # Check if this file matches our scope and combination
                    if f"Scope_{scope}_" in obj.object_name and combination in obj.object_name:
                        target_file_key = obj.object_name
                        break
            
            if not target_file_key:
                # If no exact match, try to find any file with the scope number
                for obj in all_files:
                    if obj.object_name.endswith('.arrow') and f"Scope_{scope}_" in obj.object_name:
                        target_file_key = obj.object_name
                        break
            
            if not target_file_key:
                raise HTTPException(
                    status_code=404, 
                    detail=f"No files found for Scope {scope} with combination {combination}"
                )
            
            
        except Exception as search_error:
            raise HTTPException(status_code=500, detail="Failed to search for file")
        
        if target_file_key:
            try:
                response = minio_client.get_object(trinity_bucket, target_file_key)
                file_data = response.read()
                response.close()
                response.release_conn()
                
                # Read file into DataFrame
                if target_file_key.endswith('.arrow'):
                    import pyarrow as pa
                    import pyarrow.ipc as ipc
                    try:
                        # Read Arrow file
                        reader = ipc.RecordBatchFileReader(pa.BufferReader(file_data))
                        table = reader.read_all()
                        df = table.to_pandas()
                    except Exception as arrow_error:
                        # Fallback to CSV if Arrow fails
                        df = pd.read_csv(io.BytesIO(file_data), nrows=0)
                elif target_file_key.endswith('.csv'):
                    df = pd.read_csv(io.BytesIO(file_data))
                elif target_file_key.endswith('.xlsx'):
                    df = pd.read_excel(io.BytesIO(file_data))
                else:
                    raise HTTPException(status_code=400, detail="Unsupported file format")
                
                # Get all columns
                all_columns = df.columns.tolist()
                
                # Identify potential date columns
                date_columns = []
                for col in all_columns:
                    try:
                        # Try to convert a sample to datetime
                        sample_data = df[col].dropna().head(10)
                        if len(sample_data) > 0:
                            pd.to_datetime(sample_data, errors='raise')
                            date_columns.append({
                                "name": col,
                                "type": str(df[col].dtype),
                                "sample_values": sample_data.head(3).astype(str).tolist()
                            })
                    except:
                        # Not a date column, skip
                        continue
                
                # Return date columns information
                return {
                    "scope": scope,
                    "combination": combination,
                    "file_key": target_file_key,
                    "total_columns": len(all_columns),
                    "date_columns": date_columns,
                    "all_columns": all_columns,
                    "message": f"Found {len(date_columns)} potential date columns"
                }
                
            except HTTPException:
                raise
            except Exception as file_error:
                raise HTTPException(status_code=500, detail="Failed to read file")
        else:
            raise HTTPException(status_code=404, detail="File not found")
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to get date columns")

# Growth Rates Endpoints
@router.post("/calculate-fiscal-growth")
async def calculate_fiscal_growth_endpoint(
    scope: str = Form(...),
    combination: str = Form(...),
    forecast_horizon: int = Form(...),
    fiscal_start_month: int = Form(1),
    frequency: str = Form("M"),
    start_year: int = Form(2017),
    run_id: str = Form(None)  # Add run_id parameter
):
    """Calculate fiscal year growth rates for a specific scope and combination."""
    try:
        
        # Try to find real training results - first check provided run_id, then search all completed runs
        real_data_found = False
        actual_run_id = None
        
        # First, try the provided run_id if available
        if run_id and run_id in training_progress:
            progress = training_progress[run_id]
            if progress["status"] == "completed" and progress.get("results"):
                # Find the result for this specific combination
                for result in progress["results"]:
                    if result.get("combination_id") == combination and result.get("status") == "success":
                        # Use actual forecast data from training results
                        if result.get("result") and result["result"].get("forecast_df"):
                            forecast_df = result["result"]["forecast_df"]
                            models_run = result["result"].get("models_run", [])
                            
                            # Convert forecast_df to pandas DataFrame if it's a list
                            if isinstance(forecast_df, list):
                                forecast_df = pd.DataFrame(forecast_df)
                            
                            # Calculate fiscal growth using actual data
                            try:
                                
                                growth_data = calculate_fiscal_growth(
                                    forecast_df=forecast_df,
                                    forecast_horizon=forecast_horizon,
                                    fiscal_start_month=fiscal_start_month,
                                    frequency=frequency,
                                    start_year=start_year
                                )
                                
                                # Convert to list of dictionaries for JSON response
                                growth_list = growth_data.to_dict('records')
                                
                                # Handle any infinite or NaN values in the records
                                for record in growth_list:
                                    for key, value in record.items():
                                        if pd.isna(value) or (isinstance(value, float) and (value == float('inf') or value == float('-inf'))):
                                            record[key] = None
                                
                                
                                return {
                                    "status": "success",
                                    "data": {
                                        "fiscal_growth": growth_list
                                    },
                                    "data_source": "real_training_data",
                                    "run_id": run_id,
                                    "models_used": models_run
                                }
                            except Exception as calc_error:
                                # Fall back to sample data generation
                                pass
        
        # If no run_id provided or no data found, search all completed training runs
        if not real_data_found:
            for search_run_id, progress in training_progress.items():
                if progress.get("status") == "completed" and progress.get("results"):
                    for result in progress["results"]:
                        if result.get("combination_id") == combination and result.get("status") == "success":
                            if result.get("result") and result["result"].get("forecast_df"):
                                forecast_df = result["result"]["forecast_df"]
                                models_run = result["result"].get("models_run", [])
                                
                                # Convert forecast_df to pandas DataFrame if it's a list
                                if isinstance(forecast_df, list):
                                    forecast_df = pd.DataFrame(forecast_df)
                                
                                # Calculate fiscal growth using actual data
                                try:
                                    
                                    growth_data = calculate_fiscal_growth(
                                        forecast_df=forecast_df,
                                        forecast_horizon=forecast_horizon,
                                        fiscal_start_month=fiscal_start_month,
                                        frequency=frequency,
                                        start_year=start_year
                                    )
                                    
                                    # Convert to list of dictionaries for JSON response
                                    growth_list = growth_data.to_dict('records')
                                    
                                    # Handle any infinite or NaN values in the records
                                    for record in growth_list:
                                        for key, value in record.items():
                                            if pd.isna(value) or (isinstance(value, float) and (value == float('inf') or value == float('-inf'))):
                                                record[key] = None
                                    
                                    
                                    return {
                                        "status": "success",
                                        "data": {
                                            "fiscal_growth": growth_list
                                        },
                                        "data_source": "real_training_data",
                                        "run_id": search_run_id,
                                        "models_used": models_run
                                    }
                                except Exception as calc_error:
                                    # Continue searching other runs
                                    continue
        
        # Fallback to original logic if no run_id or no actual data found
        
        minio_client = get_minio_client()
        trinity_bucket = "trinity"
        
        # Search for the file using the same logic as the working forecast code
        target_file_key = None
        matching_objects = []
        
        try:
            # Search for files containing both Scope_X and the combination string
            all_objects = list(minio_client.list_objects(trinity_bucket, recursive=True))
            
            for obj in all_objects:
                obj_name = obj.object_name
                
                # Check if file contains the scope number
                scope_pattern = f"Scope_{scope}"
                has_scope = scope_pattern in obj_name
                
                # Check if file contains the combination string
                has_combination = combination in obj_name
                
                if has_scope and has_combination:
                    matching_objects.append(obj_name)
            
            
        except Exception as search_error:
            raise HTTPException(status_code=500, detail=f"Search failed: {str(search_error)}")
        
        if not matching_objects:
            raise HTTPException(status_code=404, detail="File not found")
        
        # Use the first matching file
        target_file_key = matching_objects[0]
        
        # Read the file
        try:
            response = minio_client.get_object(trinity_bucket, target_file_key)
            df = pd.read_feather(BytesIO(response.read()))
            response.close()
            response.release_conn()
        except Exception as file_error:
            raise HTTPException(status_code=500, detail="Failed to read file")
        
        # Check if we have the required columns (handle both 'date' and 'Date')
        date_col = None
        for col in ['date', 'Date', 'DATE']:
            if col in df.columns:
                date_col = col
                break
                
        if not date_col:
            raise HTTPException(status_code=400, detail="Date column not found in data")
        
        
        # Ensure we have actual data column
        actual_col = None
        for col in ['Actual', 'actual', 'value', 'Value', 'volume', 'Volume']:
            if col in df.columns:
                actual_col = col
                break
        
        if not actual_col:
            raise HTTPException(status_code=400, detail="No actual data column found")
        
        # Prepare the forecast dataframe format expected by the calculation function
        forecast_df = df[[date_col, actual_col]].copy()
        forecast_df.columns = ['date', 'Actual']
        
        
        # Add some sample forecast data for demonstration
        # IMPORTANT: Generate different sample data for each combination to avoid identical growth rates
        combination_hash = hashlib.md5(combination.encode()).hexdigest()
        np.random.seed(int(combination_hash[:8], 16))  # Use combination hash as seed for reproducible but different data
        
        sample_models = ['SARIMA', 'Holt-Winters']
        
        for model in sample_models:
            # Generate combination-specific variation factors
            combination_factor = (int(combination_hash[:4], 16) % 100) / 1000  # 0-0.1 variation
            model_factor = (int(combination_hash[4:8], 16) % 100) / 1000  # Additional model-specific variation
            
            # Generate historical fitted data (slightly different from actual for realistic model fitting)
            historical_values = df[actual_col].values * (1 + np.random.normal(combination_factor, 0.05, len(df)))
            forecast_df[model] = historical_values
            
            # Generate forecast values for the forecast horizon
            base_forecast_values = df[actual_col].iloc[-forecast_horizon:].values
            forecast_values = base_forecast_values * (1 + np.random.normal(combination_factor + model_factor, 0.1, forecast_horizon))
            forecast_df.loc[forecast_df.index[-forecast_horizon:], model] = forecast_values
            
        
        
        # Calculate fiscal growth
        try:
            growth_data = calculate_fiscal_growth(
                forecast_df=forecast_df,
                forecast_horizon=forecast_horizon,
                fiscal_start_month=fiscal_start_month,
                frequency=frequency,
                start_year=start_year
            )
            
            # Convert to list of dictionaries for JSON response
            growth_list = growth_data.to_dict('records')
            
            # Handle any infinite or NaN values in the records
            for record in growth_list:
                for key, value in record.items():
                    if pd.isna(value) or (isinstance(value, float) and (value == float('inf') or value == float('-inf'))):
                        record[key] = None
            
            
            return {
                "status": "success",
                "data": {
                    "fiscal_growth": growth_list
                },
                "data_source": "sample_data",
                "run_id": None,
                "models_used": sample_models,
                "note": "Generated using sample data for demonstration. Run autoregressive models first for real data."
            }
            
        except Exception as calc_error:
            raise HTTPException(status_code=500, detail=f"Failed to calculate growth: {str(calc_error)}")
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to calculate fiscal growth")

@router.post("/calculate-halfyearly-growth")
async def calculate_halfyearly_growth_endpoint(
    scope: str = Form(...),
    combination: str = Form(...),
    forecast_horizon: int = Form(...),
    fiscal_start_month: int = Form(1),
    frequency: str = Form("M"),
    run_id: str = Form(None)  # Add run_id parameter
):
    """Calculate half-yearly growth rates for a specific scope and combination."""
    try:
        # Process the request
        pass
    except Exception as log_error:
        logger.error(f"Error in half-yearly growth calculation: {log_error}")
        return {"error": str(log_error)}
    
    try:
        # Try to find real training results - first check provided run_id, then search all completed runs
        real_data_found = False
        
        # First, try the provided run_id if available
        if run_id and run_id in training_progress:
            progress = training_progress[run_id]
            if progress["status"] == "completed" and progress.get("results"):
                # Find the result for this specific combination
                for result in progress["results"]:
                    if result.get("combination_id") == combination and result.get("status") == "success":
                        # Use actual forecast data from training results
                        if result.get("result") and result["result"].get("forecast_df"):
                            forecast_df = result["result"]["forecast_df"]
                            models_run = result["result"].get("models_run", [])
                            
                            # Convert forecast_df to pandas DataFrame if it's a list
                            if isinstance(forecast_df, list):
                                forecast_df = pd.DataFrame(forecast_df)
                            
                            # Calculate half-yearly growth using actual data
                            try:
                                
                                growth_data = calculate_halfyearly_yoy_growth(
                                    forecast_df=forecast_df,
                                    forecast_horizon=forecast_horizon,
                                    fiscal_start_month=fiscal_start_month,
                                    frequency=frequency
                                )
                                
                                
                                # Convert to list of dictionaries for JSON response
                                growth_list = growth_data.to_dict('records')
                                
                                # Handle any infinite or NaN values in the records
                                for record in growth_list:
                                    for key, value in record.items():
                                        if pd.isna(value) or (isinstance(value, float) and (value == float('inf') or value == float('-inf'))):
                                            record[key] = None
                                
                                
                                return {
                                    "status": "success",
                                    "data": {
                                        "halfyearly_growth": growth_list
                                    },
                                    "data_source": "real_training_data",
                                    "run_id": run_id,
                                    "models_used": models_run
                                }
                            except Exception as calc_error:
                                # Fall back to sample data generation
                                pass
        
        # If no run_id provided or no data found, search all completed training runs
        if not real_data_found:
            for search_run_id, progress in training_progress.items():
                if progress.get("status") == "completed" and progress.get("results"):
                    for result in progress["results"]:
                        if result.get("combination_id") == combination and result.get("status") == "success":
                            if result.get("result") and result["result"].get("forecast_df"):
                                forecast_df = result["result"]["forecast_df"]
                                models_run = result["result"].get("models_run", [])
                                
                                # Convert forecast_df to pandas DataFrame if it's a list
                                if isinstance(forecast_df, list):
                                    forecast_df = pd.DataFrame(forecast_df)
                                
                                # Calculate half-yearly growth using actual data
                                try:
                                    
                                    growth_data = calculate_halfyearly_yoy_growth(
                                        forecast_df=forecast_df,
                                        forecast_horizon=forecast_horizon,
                                        fiscal_start_month=fiscal_start_month,
                                        frequency=frequency
                                    )
                                    
                                    
                                    # Convert to list of dictionaries for JSON response
                                    growth_list = growth_data.to_dict('records')
                                    
                                    # Handle any infinite or NaN values in the records
                                    for record in growth_list:
                                        for key, value in record.items():
                                            if pd.isna(value) or (isinstance(value, float) and (value == float('inf') or value == float('-inf'))):
                                                record[key] = None
                                    
                                    
                                    return {
                                        "status": "success",
                                        "data": {
                                            "halfyearly_growth": growth_list
                                        },
                                        "data_source": "real_training_data",
                                        "run_id": search_run_id,
                                        "models_used": models_run
                                    }
                                except Exception as calc_error:
                                    # Continue searching other runs
                                    continue
        
        # Fallback to original logic if no run_id or no actual data found
        
        minio_client = get_minio_client()
        trinity_bucket = "trinity"
        
        
        # Search for the file using the same logic as the working forecast code
        target_file_key = None
        matching_objects = []
        
        try:
            # Search for files containing both Scope_X and the combination string
            all_objects = list(minio_client.list_objects(trinity_bucket, recursive=True))
            
            for obj in all_objects:
                obj_name = obj.object_name
                
                # Check if file contains the scope number
                scope_pattern = f"Scope_{scope}"
                has_scope = scope_pattern in obj_name
                
                # Check if file contains the combination string
                has_combination = combination in obj_name
                
                if has_scope and has_combination:
                    matching_objects.append(obj_name)
            
            
        except Exception as search_error:
            raise HTTPException(status_code=500, detail=f"Search failed: {str(search_error)}")
        
        if not matching_objects:
            raise HTTPException(status_code=404, detail="File not found")
        
        # Use the first matching file
        target_file_key = matching_objects[0]
        
        # Read the file
        try:
            response = minio_client.get_object(trinity_bucket, target_file_key)
            df = pd.read_feather(BytesIO(response.read()))
            response.close()
            response.release_conn()
        except Exception as file_error:
            raise HTTPException(status_code=500, detail="Failed to read file")
        
        # Check if we have the required columns (handle both 'date' and 'Date')
        date_col = None
        for col in ['date', 'Date', 'DATE']:
            if col in df.columns:
                date_col = col
                break
                
        if not date_col:
            raise HTTPException(status_code=400, detail="Date column not found in data")
        
        
        # Ensure we have actual data column
        actual_col = None
        for col in ['Actual', 'actual', 'value', 'Value', 'volume', 'Volume']:
            if col in df.columns:
                actual_col = col
                break
        
        if not actual_col:
            raise HTTPException(status_code=400, detail="No actual data column found")
        
        # Prepare the forecast dataframe format expected by the calculation function
        forecast_df = df[[date_col, actual_col]].copy()
        forecast_df.columns = ['date', 'Actual']
        
        
        # Add some sample forecast data for demonstration
        # IMPORTANT: Generate different sample data for each combination to avoid identical growth rates
        combination_hash = hashlib.md5(combination.encode()).hexdigest()
        np.random.seed(int(combination_hash[:8], 16))  # Use combination hash as seed for reproducible but different data
        
        sample_models = ['SARIMA', 'Holt-Winters']
        for model in sample_models:
            # Generate combination-specific variation factors
            combination_factor = (int(combination_hash[:4], 16) % 100) / 1000  # 0-0.1 variation
            model_factor = (int(combination_hash[4:8], 16) % 100) / 1000  # Additional model-specific variation
            
            # Generate historical fitted data (slightly different from actual for realistic model fitting)
            historical_values = df[actual_col].values * (1 + np.random.normal(combination_factor, 0.05, len(df)))
            forecast_df[model] = historical_values
            
            # Generate forecast values for the forecast horizon
            base_forecast_values = df[actual_col].iloc[-forecast_horizon:].values
            forecast_values = base_forecast_values * (1 + np.random.normal(combination_factor + model_factor, 0.1, forecast_horizon))
            forecast_df.loc[forecast_df.index[-forecast_horizon:], model] = forecast_values
        
        
        # Calculate half-yearly growth
        try:
            growth_data = calculate_halfyearly_yoy_growth(
                forecast_df=forecast_df,
                forecast_horizon=forecast_horizon,
                fiscal_start_month=fiscal_start_month,
                frequency=frequency
            )
            
            
            # Convert to list of dictionaries for JSON response
            growth_list = growth_data.to_dict('records')
            
            # Handle any infinite or NaN values in the records
            for record in growth_list:
                for key, value in record.items():
                    if pd.isna(value) or (isinstance(value, float) and (value == float('inf') or value == float('-inf'))):
                        record[key] = None
            
            
            return {
                "status": "success",
                "data": {
                    "halfyearly_growth": growth_list
                },
                "data_source": "sample_data",
                "run_id": None,
                "models_used": sample_models,
                "note": "Generated using sample data for demonstration. Run autoregressive models first for real data."
            }
            
        except Exception as calc_error:
            raise HTTPException(status_code=500, detail=f"Failed to calculate growth: {str(calc_error)}")
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to calculate half-yearly growth")

@router.post("/calculate-quarterly-growth")
async def calculate_quarterly_growth_endpoint(
    scope: str = Form(...),
    combination: str = Form(...),
    forecast_horizon: int = Form(...),
    fiscal_start_month: int = Form(1),
    frequency: str = Form("M"),
    run_id: str = Form(None)  # Add run_id parameter
):
    """Calculate quarterly growth rates for a specific scope and combination."""
    try:
        # Try to find real training results - first check provided run_id, then search all completed runs
        real_data_found = False
        
        # First, try the provided run_id if available
        if run_id and run_id in training_progress:
            progress = training_progress[run_id]
            if progress["status"] == "completed" and progress.get("results"):
                # Find the result for this specific combination
                for result in progress["results"]:
                    if result.get("combination_id") == combination and result.get("status") == "success":
                        # Use actual forecast data from training results
                        if result.get("result") and result["result"].get("forecast_df"):
                            forecast_df = result["result"]["forecast_df"]
                            models_run = result["result"].get("models_run", [])
                            
                            # Convert forecast_df to pandas DataFrame if it's a list
                            if isinstance(forecast_df, list):
                                forecast_df = pd.DataFrame(forecast_df)
                            
                            # Calculate quarterly growth using actual data
                            try:
                                
                                growth_data = calculate_quarterly_yoy_growth(
                                    forecast_df=forecast_df,
                                    forecast_horizon=forecast_horizon,
                                    fiscal_start_month=fiscal_start_month,
                                    frequency=frequency
                                )
                                
                                # Convert to list of dictionaries for JSON response
                                growth_list = growth_data.to_dict('records')
                                
                                # Handle any infinite or NaN values in the records
                                for record in growth_list:
                                    for key, value in record.items():
                                        if pd.isna(value) or (isinstance(value, float) and (value == float('inf') or value == float('-inf'))):
                                            record[key] = None
                                
                                
                                return {
                                    "status": "success",
                                    "data": {
                                        "quarterly_growth": growth_list
                                    },
                                    "data_source": "real_training_data",
                                    "run_id": run_id,
                                    "models_used": models_run
                                }
                            except Exception as calc_error:
                                # Fall back to sample data generation
                                pass
        
        # If no run_id provided or no data found, search all completed training runs
        if not real_data_found:
            for search_run_id, progress in training_progress.items():
                if progress.get("status") == "completed" and progress.get("results"):
                    for result in progress["results"]:
                        if result.get("combination_id") == combination and result.get("status") == "success":
                            if result.get("result") and result["result"].get("forecast_df"):
                                forecast_df = result["result"]["forecast_df"]
                                models_run = result["result"].get("models_run", [])
                                
                                # Convert forecast_df to pandas DataFrame if it's a list
                                if isinstance(forecast_df, list):
                                    forecast_df = pd.DataFrame(forecast_df)
                                
                                # Calculate quarterly growth using actual data
                                try:
                                    
                                    growth_data = calculate_quarterly_yoy_growth(
                                        forecast_df=forecast_df,
                                        forecast_horizon=forecast_horizon,
                                        fiscal_start_month=fiscal_start_month,
                                        frequency=frequency
                                    )
                                    
                                    # Convert to list of dictionaries for JSON response
                                    growth_list = growth_data.to_dict('records')
                                    
                                    # Handle any infinite or NaN values in the records
                                    for record in growth_list:
                                        for key, value in record.items():
                                            if pd.isna(value) or (isinstance(value, float) and (value == float('inf') or value == float('-inf'))):
                                                record[key] = None
                                    
                                    
                                    return {
                                        "status": "success",
                                        "data": {
                                            "quarterly_growth": growth_list
                                        },
                                        "data_source": "real_training_data",
                                        "run_id": search_run_id,
                                        "models_used": models_run
                                    }
                                except Exception as calc_error:
                                    # Continue searching other runs
                                    continue
        
        # Fallback to original logic if no run_id or no actual data found
        
        minio_client = get_minio_client()
        trinity_bucket = "trinity"
        
        # Search for the file using the same logic as the working forecast code
        target_file_key = None
        matching_objects = []
        
        try:
            # Search for files containing both Scope_X and the combination string
            all_objects = list(minio_client.list_objects(trinity_bucket, recursive=True))
            
            for obj in all_objects:
                obj_name = obj.object_name
                
                # Check if file contains the scope number
                scope_pattern = f"Scope_{scope}"
                has_scope = scope_pattern in obj_name
                
                # Check if file contains the combination string
                has_combination = combination in obj_name
                
                if has_scope and has_combination:
                    matching_objects.append(obj_name)
            
            
        except Exception as search_error:
            raise HTTPException(status_code=500, detail=f"Search failed: {str(search_error)}")
        
        if not matching_objects:
            raise HTTPException(status_code=404, detail="File not found")
        
        # Use the first matching file
        target_file_key = matching_objects[0]
        
        # Read the file
        try:
            response = minio_client.get_object(trinity_bucket, target_file_key)
            df = pd.read_feather(BytesIO(response.read()))
            response.close()
            response.release_conn()
        except Exception as file_error:
            raise HTTPException(status_code=500, detail="Failed to read file")
        
        # Check if we have the required columns (handle both 'date' and 'Date')
        date_col = None
        for col in ['date', 'Date', 'DATE']:
            if col in df.columns:
                date_col = col
                break
                
        if not date_col:
            raise HTTPException(status_code=400, detail="Date column not found in data")
        
        
        # Ensure we have actual data column
        actual_col = None
        for col in ['Actual', 'actual', 'value', 'Value', 'volume', 'Volume']:
            if col in df.columns:
                actual_col = col
                break
        
        if not actual_col:
            raise HTTPException(status_code=400, detail="No actual data column found")
        
        # Prepare the forecast dataframe format expected by the calculation function
        forecast_df = df[[date_col, actual_col]].copy()
        forecast_df.columns = ['date', 'Actual']
        
        
        # Add some sample forecast data for demonstration
        # IMPORTANT: Generate different sample data for each combination to avoid identical growth rates
        combination_hash = hashlib.md5(combination.encode()).hexdigest()
        np.random.seed(int(combination_hash[:8], 16))  # Use combination hash as seed for reproducible but different data
        
        sample_models = ['SARIMA', 'Holt-Winters']
        
        for model in sample_models:
            # Generate combination-specific variation factors
            combination_factor = (int(combination_hash[:4], 16) % 100) / 1000  # 0-0.1 variation
            model_factor = (int(combination_hash[4:8], 16) % 100) / 1000  # Additional model-specific variation
            
            # Generate historical fitted data (slightly different from actual for realistic model fitting)
            historical_values = df[actual_col].values * (1 + np.random.normal(combination_factor, 0.05, len(df)))
            forecast_df[model] = historical_values
            
            # Generate forecast values for the forecast horizon
            base_forecast_values = df[actual_col].iloc[-forecast_horizon:].values
            forecast_values = base_forecast_values * (1 + np.random.normal(combination_factor + model_factor, 0.1, forecast_horizon))
            forecast_df.loc[forecast_df.index[-forecast_horizon:], model] = forecast_values
            
        
        
        # Calculate quarterly growth
        try:
            growth_data = calculate_quarterly_yoy_growth(
                forecast_df=forecast_df,
                forecast_horizon=forecast_horizon,
                fiscal_start_month=fiscal_start_month,
                frequency=frequency
            )
            
            # Convert to list of dictionaries for JSON response
            growth_list = growth_data.to_dict('records')
            
            # Handle any infinite or NaN values in the records
            for record in growth_list:
                for key, value in record.items():
                    if pd.isna(value) or (isinstance(value, float) and (value == float('inf') or value == float('-inf'))):
                        record[key] = None
            
            
            return {
                "status": "success",
                "data": {
                    "quarterly_growth": growth_list
                },
                "data_source": "sample_data",
                "run_id": None,
                "models_used": sample_models,
                "note": "Generated using sample data for demonstration. Run autoregressive models first for real data."
            }
            
        except Exception as calc_error:
            raise HTTPException(status_code=500, detail=f"Failed to calculate growth: {str(calc_error)}")
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to calculate quarterly growth")

# Quick validation endpoint to prevent 504 timeouts
@router.post("/validate-request", tags=["Autoregressive Model Training"])
async def validate_request(request: dict):
    """
    Use this before calling the main training endpoint to validate parameters.
    """
    try:
        # Extract and validate parameters
        scope_number = request.get('scope_number')
        combinations = request.get('combinations', [])
        y_variable = request.get('y_variable')
        forecast_horizon = request.get('forecast_horizon', 12)
        fiscal_start_month = request.get('fiscal_start_month', 1)
        frequency = request.get('frequency', 'M')
        models_to_run = request.get('models_to_run')
        
        # Basic validation
        if not scope_number or not combinations or not y_variable:
            raise HTTPException(
                status_code=400,
                detail="Missing required parameters: scope_number, combinations, or y_variable"
            )
        
        # Estimate processing time based on parameters
        estimated_time = len(combinations) * len(models_to_run or ['ARIMA']) * 30  # 30 seconds per combination per model
        
        return {
            "status": "valid",
            "message": "Request parameters are valid",
            "estimated_processing_time_seconds": estimated_time,
            "combinations_count": len(combinations),
            "models_count": len(models_to_run or ['ARIMA']),
            "recommendation": "Use /train-autoregressive-models-direct to start training"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Validation failed")


# List all active training runs (for recovery after 504 timeouts)




# Use existing database setup from database.py
from .database import (
    autoregressive_db, 
    minio_client, 
    MINIO_BUCKET
)

# Schema for save responses
from pydantic import BaseModel

class SavedModelResponse(BaseModel):
    model_id: str
    message: str
    saved_at: datetime
    combination_id: str
    scope: str

class SavedCombinationsStatusResponse(BaseModel):
    scope: str
    atom_id: str
    total_combinations: int
    saved_combinations: List[str]
    pending_combinations: List[str]
    saved_count: int
    pending_count: int
    completion_percentage: float
    note: Optional[str] = None

@router.post("/models/save-single-combination", response_model=SavedModelResponse, tags=["Autoregressive Models"])
async def save_single_autoregressive_combination(
    request: dict = Body(...)
):
    """
    Save a single auto-regressive combination result to MongoDB and MinIO.
    """
    try:
        # Get MongoDB client with lazy initialization
        mongo_client = get_mongo_client()
        if mongo_client is None:
            raise HTTPException(status_code=503, detail="MongoDB connection is not available.")
        
        # Get the autoregressive database
        autoregressive_db = mongo_client[settings.autoregressive_database]
        # Extract data from request
        scope = request.get("scope")
        combination_id = request.get("combination_id")
        result_data = request.get("result")
        status = request.get("status")
        tags = request.get("tags", [])
        description = request.get("description", "")
        
        
        if not scope or not combination_id or not result_data:
            raise HTTPException(status_code=400, detail="Missing required fields: scope, combination_id, or result")
        
        # Prepare document for MongoDB
        document = {
            # Model data
            "model_data": {
                "combination_id": combination_id,
                "scope": scope,
                "result": result_data,
                "status": status,
                "models_run": result_data.get("models_run", []),
                "forecast_data": result_data.get("forecast_df", []),
                "metrics": result_data.get("metrics", {}),
                "model_params": result_data.get("model_params", {}),
                "run_id": f"autoregressive_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
                "timestamp": datetime.now().isoformat()
            },
            
            # Metadata
            "model_name": f"autoregressive_{combination_id}",
            "source_scope": scope,
            "combination_id": combination_id,
            
            # User metadata
            "tags": tags,
            "description": description,
            
            # Timestamps
            "created_at": datetime.now(),
            "updated_at": datetime.now(),
            
            # Additional info
            "model_type": "autoregressive",
            "total_models": len(result_data.get("models_run", [])),
            "status": status
        }
        
        # Save to MongoDB
        saved_models_collection = autoregressive_db["saved_autoregressive_models"]
        
        # Insert the model
        result = await saved_models_collection.insert_one(document)
        
        
        # Update combination save status in dedicated collection
        try:
            # Use client_name/app_name/project_name if available, otherwise fall back to client_id/app_id/project_id
            final_client_name = request.get("client_name", "") or request.get("client_id", "")
            final_app_name = request.get("app_name", "") or request.get("app_id", "")
            final_project_name = request.get("project_name", "") or request.get("project_id", "")
            
            # Extract atom_id from tags
            atom_id = ""
            if tags:
                for tag in tags:
                    if tag.startswith("auto-regressive-models-"):
                        atom_id = tag.replace("auto-regressive-models-", "")
                        break
            
            
            # Get current save status
            current_status = await get_combination_save_status_from_mongo(
                scope=scope,
                atom_id=atom_id,
                client_name=final_client_name,
                app_name=final_app_name,
                project_name=final_project_name
            )
            
            
            # Update with new saved combination
            saved_combinations = current_status.get("saved_combinations", []) if current_status else []
            pending_combinations = current_status.get("pending_combinations", []) if current_status else []
            
            
            if combination_id not in saved_combinations:
                saved_combinations.append(combination_id)
            
            if combination_id in pending_combinations:
                pending_combinations.remove(combination_id)
            
            
            # Save updated status
            await update_combination_save_status(
                scope=scope,
                atom_id=atom_id,
                saved_combinations=saved_combinations,
                pending_combinations=pending_combinations,
                client_name=final_client_name,
                app_name=final_app_name,
                project_name=final_project_name
            )
            
            
        except Exception as e:
            import traceback
            # Continue even if save status update fails
        
        # Save forecast data to MinIO if available
        if minio_client and result_data.get("forecast_df"):
            try:
                forecast_df = pd.DataFrame(result_data["forecast_df"])
                forecast_key = f"autoregressive/forecasts/{scope}/{combination_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
                
                # Convert DataFrame to CSV bytes
                csv_buffer = io.StringIO()
                forecast_df.to_csv(csv_buffer, index=False)
                csv_bytes = csv_buffer.getvalue().encode('utf-8')
                
                # Upload to MinIO
                minio_client.put_object(
                    MINIO_BUCKET,
                    forecast_key,
                    io.BytesIO(csv_bytes),
                    length=len(csv_bytes),
                    content_type="text/csv"
                )
                
                # Update document with MinIO file reference
                await saved_models_collection.update_one(
                    {"_id": result.inserted_id},
                    {"$set": {"forecast_file_key": forecast_key}}
                )
                
            except Exception as e:
                # Continue even if MinIO save fails
                logger.warning(f"Failed to save forecast to MinIO: {e}")
        
        return SavedModelResponse(
            model_id=str(result.inserted_id),
            message=f"Auto-regressive combination '{combination_id}' saved successfully",
            saved_at=datetime.now(),
            combination_id=combination_id,
            scope=scope
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving combination: {str(e)}")

@router.post("/models/save-all-combinations", response_model=SavedModelResponse, tags=["Autoregressive Models"])
async def save_all_autoregressive_combinations(
    request: dict = Body(...)
):
    """
    Save all auto-regressive combinations at once.
    """
    if autoregressive_db is None:
        raise HTTPException(status_code=503, detail="MongoDB connection is not available.")
    
    try:
        # Extract data from request
        scope = request.get("scope")
        combinations = request.get("combinations", [])
        tags = request.get("tags", [])
        description = request.get("description", "")
        
        if not scope or not combinations:
            raise HTTPException(status_code=400, detail="Missing required fields: scope or combinations")
        
        saved_count = 0
        saved_combination_ids = []
        
        for combination_data in combinations:
            try:
                combination_id = combination_data.get("combination_id")
                result_data = combination_data.get("result")
                status = combination_data.get("status")
                
                if not combination_id or not result_data or status != "success":
                    continue
                
                # Prepare document for MongoDB
                document = {
                    # Model data
                    "model_data": {
                        "combination_id": combination_id,
                        "scope": scope,
                        "result": result_data,
                        "status": status,
                        "models_run": result_data.get("models_run", []),
                        "forecast_data": result_data.get("forecast_df", []),
                        "metrics": result_data.get("metrics", {}),
                        "model_params": result_data.get("model_params", {}),
                        "run_id": f"autoregressive_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
                        "timestamp": datetime.now().isoformat()
                    },
                    
                    # Metadata
                    "model_name": f"autoregressive_{combination_id}",
                    "source_scope": scope,
                    "combination_id": combination_id,
                    
                    # User metadata
                    "tags": tags,
                    "description": description,
                    
                    # Timestamps
                    "created_at": datetime.now(),
                    "updated_at": datetime.now(),
                    
                    # Additional info
                    "model_type": "autoregressive",
                    "total_models": len(result_data.get("models_run", [])),
                    "status": status
                }
                
                # Save to MongoDB
                saved_models_collection = autoregressive_db["saved_autoregressive_models"]
                result = await saved_models_collection.insert_one(document)
                
                saved_count += 1
                saved_combination_ids.append(combination_id)
                
                # Save forecast data to MinIO if available
                if minio_client and result_data.get("forecast_df"):
                    try:
                        forecast_df = pd.DataFrame(result_data["forecast_df"])
                        forecast_key = f"autoregressive/forecasts/{scope}/{combination_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
                        
                        # Convert DataFrame to CSV bytes
                        csv_buffer = io.StringIO()
                        forecast_df.to_csv(csv_buffer, index=False)
                        csv_bytes = csv_buffer.getvalue().encode('utf-8')
                        
                        # Upload to MinIO
                        minio_client.put_object(
                            MINIO_BUCKET,
                            forecast_key,
                            io.BytesIO(csv_bytes),
                            length=len(csv_bytes),
                            content_type="text/csv"
                        )
                        
                        # Update document with MinIO file reference
                        await saved_models_collection.update_one(
                            {"_id": result.inserted_id},
                            {"$set": {"forecast_file_key": forecast_key}}
                        )
                        
                    except Exception as e:
                        # Continue even if MinIO save fails
                        logger.warning(f"Failed to save forecast to MinIO: {e}")
                
            except Exception as e:
                continue
        
        return SavedModelResponse(
            model_id=f"batch_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            message=f"Saved {saved_count} auto-regressive combinations successfully",
            saved_at=datetime.now(),
            combination_id=",".join(saved_combination_ids),
            scope=scope
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving combinations: {str(e)}")

@router.get("/models/saved-combinations-status", response_model=SavedCombinationsStatusResponse, tags=["Autoregressive Models"])
async def get_saved_autoregressive_combinations_status(
    scope: str = Query(..., description="Scope number"),
    atom_id: str = Query(..., description="Atom ID to filter saved models"),
    client_name: str = Query("", description="Client name"),
    app_name: str = Query("", description="App name"),
    project_name: str = Query("", description="Project name"),
    client_id: str = Query("", description="Client ID"),
    app_id: str = Query("", description="App ID"),
    project_id: str = Query("", description="Project ID")
):
    """
    Get the status of saved auto-regressive combinations for a specific scope and atom.
    Returns which combinations have been saved and which are still pending.
    Uses dedicated collection like column_classifier_configs.
    """
    try:
        # Use client_name/app_name/project_name if available, otherwise fall back to client_id/app_id/project_id
        final_client_name = client_name or client_id
        final_app_name = app_name or app_id
        final_project_name = project_name or project_id
        
        # Get MongoDB connection with lazy initialization
        mongo_client = get_mongo_client()
        if mongo_client is None:
            raise HTTPException(status_code=503, detail="MongoDB connection is not available.")
        
        # Get all saved models for this scope and atom
        autoregressive_db = mongo_client[settings.autoregressive_database]
        saved_models_collection = autoregressive_db["saved_autoregressive_models"]
        
        # Find models saved by this atom for this scope
        saved_models = await saved_models_collection.find({
            "source_scope": scope,
            "tags": {"$in": [f"auto-regressive-models-{atom_id}"]}
        }).to_list(length=None)
        
        # Extract combination IDs from saved models
        saved_combination_ids = set()
        source_files = set()
        for model in saved_models:
            if "combination_id" in model:
                saved_combination_ids.add(str(model["combination_id"]))
            if "file_key" in model:
                source_files.add(str(model["file_key"]))
        
        # Get all combinations for this scope from the training progress
        all_combination_ids = set()
        processed_combination_ids = set()
        for run_id, progress in training_progress.items():
            if progress.get("scope_id") == f"scope_{scope}":
                if "results" in progress:
                    for result in progress["results"]:
                        if "combination_id" in result:
                            combination_id = str(result["combination_id"])
                            all_combination_ids.add(combination_id)
                            # If the result has a status of "success", consider it processed
                            if result.get("status") == "success":
                                processed_combination_ids.add(combination_id)
        
        # If no combinations found in training progress, try to get from existing save status
        if not all_combination_ids:
            existing_status = await get_combination_save_status_from_mongo(
                scope=scope,
                atom_id=atom_id,
                client_name=final_client_name,
                app_name=final_app_name,
                project_name=final_project_name
            )
            if existing_status:
                all_combination_ids = set(existing_status.get("saved_combinations", []) + existing_status.get("pending_combinations", []))
        
        # If still no combinations found, use saved combinations as total
        if not all_combination_ids:
            all_combination_ids = saved_combination_ids.copy()
        
        # Calculate pending combinations more accurately
        # Pending = processed but not saved
        # If we have processed combinations, use those; otherwise fall back to all combinations
        if processed_combination_ids:
            # Use processed combinations as the base for pending calculation
            pending_combination_ids = processed_combination_ids - saved_combination_ids
            # Total should be the union of saved and pending
            all_combination_ids = saved_combination_ids | pending_combination_ids
        else:
            # Fallback: pending = all - saved
            pending_combination_ids = all_combination_ids - saved_combination_ids
        
        # Get a representative source file (use the first one found)
        source_file_key = list(source_files)[0] if source_files else None
        
        # Create the response data first
        response_data = {
            "scope": scope,
            "atom_id": atom_id,
            "total_combinations": len(all_combination_ids),
            "saved_combinations": list(saved_combination_ids),
            "pending_combinations": list(pending_combination_ids),
            "saved_count": len(saved_combination_ids),
            "pending_count": len(pending_combination_ids),
            "completion_percentage": round((len(saved_combination_ids) / len(all_combination_ids)) * 100, 2) if all_combination_ids else 0
        }
        
        # Add source file key if available
        if source_file_key:
            response_data["file_key"] = source_file_key
        
        
        return response_data
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting saved combinations status: {str(e)}")


async def get_training_progress_detailed(run_id: str):
    """Get detailed training progress with stage information for enhanced progress bars."""
    if run_id not in training_progress:
        raise HTTPException(status_code=404, detail="Training run not found")
    
    progress = training_progress[run_id]
    
    # Calculate execution time
    execution_time = None
    if progress.get("start_time"):
        try:
            start_time = datetime.fromisoformat(progress["start_time"])
            if progress.get("last_updated"):
                last_updated = datetime.fromisoformat(progress["last_updated"])
                execution_time = (last_updated - start_time).total_seconds()
        except:
            execution_time = None
    
    # Get detailed status information
    status_details = {
        "running": "Training in progress",
        "completed": "Training completed successfully",
        "error": "Training failed",
        "pending": "Waiting to start"
    }
    
    # Calculate stage progress
    stage_progress = {
        "file_reading": "completed" if progress.get("current", 0) > 0 else "pending",
        "model_training": "running" if progress.get("status") == "running" else ("completed" if progress.get("status") == "completed" else "pending"),
        "completion": "completed" if progress.get("status") == "completed" else "pending"
    }
    
    return {
        "run_id": run_id,
        "status": progress["status"],
        "status_message": status_details.get(progress["status"], "Unknown status"),
        "current": progress["current"],
        "total": progress["total"],
        "percentage": progress["percentage"],
        "current_combination": progress.get("current_combination", ""),
        "current_model": progress.get("current_model", ""),
        "completed_combinations": progress.get("completed_combinations", 0),
        "total_combinations": progress.get("total_combinations", 0),
        "stage_progress": stage_progress,
        "execution_time_seconds": execution_time,
        "start_time": progress.get("start_time"),
        "last_updated": progress.get("last_updated"),
        "error": progress.get("error", None),
        "successful_count": len([r for r in progress.get("results", []) if r.get("status") == "success"]),
        "error_count": len([r for r in progress.get("results", []) if r.get("status") == "error"])
    }

# ============================================================================
# SAVE ENDPOINTS FOR ATOM STATE PERSISTENCE
# ============================================================================

async def save_autoregressive_configuration(
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name"),
    autoregressive_data: dict = Body(..., description="Autoregressive configuration data to save"),
    user_id: str = Query("", description="User ID"),
    project_id: int = Query(None, description="Project ID")
):
    """Save autoregressive configuration to MongoDB"""
    try:
        from .mongodb_saver import save_autoregressive_config
        
        result = await save_autoregressive_config(
            client_name=client_name,
            app_name=app_name,
            project_name=project_name,
            autoregressive_data=autoregressive_data,
            user_id=user_id,
            project_id=project_id
        )
        
        if result["status"] == "success":
            return {
                "success": True,
                "message": f"Autoregressive configuration saved successfully",
                "mongo_id": result["mongo_id"],
                "operation": result["operation"],
                "collection": result["collection"]
            }
        else:
            raise HTTPException(status_code=500, detail=f"Failed to save autoregressive configuration: {result['error']}")
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save autoregressive configuration: {str(e)}")

async def get_autoregressive_configuration(
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name")
):
    """Retrieve saved autoregressive configuration from MongoDB"""
    try:
        from .mongodb_saver import get_autoregressive_config_from_mongo
        
        result = await get_autoregressive_config_from_mongo(client_name, app_name, project_name)
        
        if result:
            return {
                "success": True,
                "data": result
            }
        else:
            return {
                "success": False,
                "message": "No autoregressive configuration found",
                "data": None
            }
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve autoregressive configuration: {str(e)}")

@router.post("/save")
async def save_autoregressive_data(
    request: Request,
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name"),
    user_id: str = Query("", description="User ID"),
    project_id: int = Query(None, description="Project ID")
):
    """General save endpoint for autoregressive data - used by SAVE button"""
    
    try:
        # Get the request body
        body = await request.json()
        
        # Save autoregressive configuration data
        from .mongodb_saver import save_autoregressive_config
        
        result = await save_autoregressive_config(
            client_name=client_name,
            app_name=app_name,
            project_name=project_name,
            autoregressive_data=body,
            user_id=user_id,
            project_id=project_id
        )
        
        
        if result["status"] == "success":
            return {
                "success": True,
                "message": f"Autoregressive data saved successfully",
                "mongo_id": result["mongo_id"],
                "operation": result["operation"],
                "collection": result["collection"]
            }
        else:
            raise HTTPException(status_code=500, detail=f"Failed to save autoregressive data: {result['error']}")
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save autoregressive data: {str(e)}")

@router.get("/test-mongo")
async def test_mongo_connection():
    """Test MongoDB connection and list databases"""
    try:
        from .mongodb_saver import get_client
        
        client = get_client()
        if client is None:
            return {
                "success": False,
                "error": "MongoDB client not available"
            }
        
        # List all databases
        databases = await client.list_database_names()
        
        # Check if trinity_prod exists
        if "trinity_prod" in databases:
            # List collections in trinity_prod
            collections = await client["trinity_prod"].list_collection_names()
        else:
            collections = []
        
        return {
            "success": True,
            "databases": databases,
            "trinity_prod_exists": "trinity_prod" in databases,
            "collections_in_trinity_prod": collections if "trinity_prod" in databases else []
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }
