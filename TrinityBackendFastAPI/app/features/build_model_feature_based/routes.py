from fastapi import APIRouter, HTTPException, Query, Path, Form
import logging
import asyncio
from datetime import datetime
from typing import List, Optional
import uuid

# Model imports
from .models import CustomConstrainedRidge, ConstrainedLinearRegression

# Database imports - Enhanced versions only
from .database import (
    scopes_collection, 
    minio_client,
    build_collection,
    # file_exists, 
    # presign,
    # get_scope_combinations,
    # fetch_scope_by_id,
    # get_scope_set_with_columns,
    train_models_for_combination_enhanced,  # Use enhanced version
    save_model_results_enhanced, # export_results_to_csv_and_minio, get_csv_from_minio ,save_marketing_model_results,
)

# Import get_minio_client from scope_selector deps
from ..scope_selector.deps import get_minio_client

# Import get_object_prefix for dynamic path construction
from ..data_upload_validate.app.routes import get_object_prefix





# Schema imports
from .schemas import (
    # CombinationList, 
    # Health,
    # ModelResultDocument,
    # ScopeDetail,
    # ScopeSetColumns,
    # ScopeSetRequest,
    ModelTrainingResponse,
    ModelTrainingRequest,
    # CombinationModelResults,
    # ModelResult
)



####mmm settings 
# Data processing imports
import pandas as pd
import numpy as np
from io import StringIO, BytesIO

# PyArrow imports for MinIO storage
import pyarrow as pa
import pyarrow.feather as feather

# Scikit-learn imports for modeling
from sklearn.linear_model import Ridge, Lasso, LinearRegression, ElasticNet
from sklearn.metrics import mean_absolute_percentage_error, r2_score

# Your existing imports
from .config import settings
# from .database import (
#     minio_client,
#     marketing_collection,
#     metadata_collection,
#     save_marketing_model_results,
#     get_marketing_results
# )

# Marketing-specific imports
# from .schemas import (
#     # Marketing Mix schemas
#     MarketingDataPreparationRequest,
#     MarketingDataPreparationResponse,
#     MarketingTransformationRequest,
#     MarketingTransformationResponse,
#     MarketingModelTrainingRequest,
#     MarketingModelTrainingResponse,
#     MarketingElasticityRequest,
#     MarketingElasticityResponse,
#     MarketingExportResponse,
#     MarketingModelResult,
#     MarketingModelType,
#     TransformationType,
#     StandardizationMethod
# )

# Marketing helper functions
# from .marketing_helpers import (
#     apply_transformations_by_region,
#     calculate_media_elasticity,
#     calculate_contributions,
#     save_dataframe_to_minio,
#     save_transformation_metadata,
#     get_transformation_metadata,
#     get_file_from_source,
#     calculate_model_metrics,
#     adstock_function,
#     logistic_function,
#     power_function
# )

# Elasticity and contribution imports - removed unused imports since we're using direct calculation

# Global progress tracking
training_progress = {}

# Logger setup
logger = logging.getLogger(__name__)






router = APIRouter()
logger = logging.getLogger(__name__)

# @router.get("/health", response_model=Health, tags=["Health"])
# async def health():
#     """Check health status of Build Atom API."""
#     mongo_ok = scopes_collection is not None
#     
#     # Test MinIO
#     minio_ok = False
#     try:
#         if minio_client is not None:
#             minio_client.bucket_exists(settings.minio_bucket_name)
#             minio_ok = True
#     except Exception as e:
#         logger.error(f"MinIO health check failed: {e}")
#         minio_ok = False
#     
#     return Health(
#         status="healthy" if (mongo_ok and minio_ok) else "unhealthy",
#         timestamp=datetime.now(),
#         services={
#             "mongodb": {"status": "connected" if mongo_ok else "disconnected"},
#             "minio": {"status": "connected" if minio_ok else "disconnected"},
#         },
#         version=settings.app_version,
#         api=settings.app_name,
#     )

# @router.get("/scopes/{scope_id}", response_model=ScopeDetail, tags=["Scopes"])
# async def get_scope_by_id(
#     scope_id: str = Path(..., description="Scope ID from MongoDB")
# ):
#     """
#     Get scope details and combinations by scope ID.
#     The scope_id can be either the MongoDB _id or the scope_id field.
#     """
#     if scopes_collection is None:
#         raise HTTPException(
#             status_code=503,
#             detail="MongoDB connection not available"
#         )
#     
#     try:
#         scope_data = await get_scope_combinations(scope_id)
#         
#         if scope_data is None:
#             raise HTTPException(
#                 status_code=404,
#                 detail=f"Scope with ID '{scope_id}' not found"
#             )
#         
#         return scope_data
#         
#     except HTTPException:
#         raise
#     except Exception as e:
#         logger.error(f"Error fetching scope {scope_id}: {e}")
#         raise HTTPException(
#             status_code=500,
#             detail=f"Error fetching scope: {str(e)}"
#         )

# @router.get("/scopes", response_model=List[ScopeDetail], tags=["Scopes"])
# async def list_all_scopes(
#     limit: int = Query(10, ge=1, le=100, description="Maximum number of scopes"),
#     skip: int = Query(0, ge=0, description="Number of scopes to skip")
# ):
#     """List all available scopes with their combinations."""
#     if scopes_collection is None:
#         raise HTTPException(
#             status_code=503,
#             detail="MongoDB connection not available"
#         )
#     
#     try:
#         scopes = []
#         cursor = scopes_collection.find({}).skip(skip).limit(limit)
#         
#         async for scope_doc in cursor:
#             scope_id = str(scope_doc.get("_id", scope_doc.get("scope_id", "")))
#             scope_data = await get_scope_combinations(scope_id)
#             if scope_data:
#                 scopes.append(scope_data)
#         
#         return scopes
#         
#     except Exception as e:
#         logger.error(f"Error listing scopes: {e}")
#         raise HTTPException(
#             status_code=500,
#             detail=f"Error listing scopes: {str(e)}"
#         )

# @router.get("/", tags=["Info"])
# async def root():
#     """Root endpoint for Build Atom API."""
#     return {
#         "message": f"Welcome to {settings.app_name}",
#         "version": settings.app_version,
#         "documentation": "/docs",
#         "endpoints": {
#             "health": "/api/v1/health",
#             "get_scope": "/api/v1/scopes/{scope_id}",
#             "list_scopes": "/api/v1/scopes",
#             "get_scope_set": "/api/v1/scopes/{scope_id}/sets/{set_name}",
#             "list_scope_sets": "/api/v1/scopes/{scope_id}/sets"
#         }
#     }





# Add to routes.py

# @router.get("/scopes/{scope_id}/sets/{set_name}", response_model=ScopeSetColumns, tags=["Scopes"])
# async def get_scope_set_details(
#     scope_id: str = Path(..., description="Scope ID from MongoDB"),
#     set_name: str = Path(..., description="Set name (e.g., Scope_1, Scope_2, Scope_3)")
# ):
#     """
#     Get combinations for a specific scope and set_name, along with column information.
#     
#     This endpoint:
#     1. Filters combinations by the specified set_name
#     2. Reads the first CSV file to extract column names
#     3. Returns filtered combinations with column structure
#     """
#     if scopes_collection is None:
#         raise HTTPException(
#             status_code=503,
#             detail="MongoDB connection not available"
#         )
#     
#     try:
#         scope_set_data = await get_scope_set_with_columns(scope_id, set_name)
#         
#         if scope_set_data is None:
#             raise HTTPException(
#                 status_code=404,
#                 detail=f"Scope '{scope_id}' with set '{set_name}' not found or has no combinations"
#             )
#         
#         return scope_set_data
#         
#     except HTTPException:
#         raise
#     except Exception as e:
#         logger.error(f"Error fetching scope set {scope_id}/{set_name}: {e}")
#         raise HTTPException(
#             status_code=500,
#             detail=f"Error fetching scope set: {str(e)}"
#         )

# @router.get("/scopes/{scope_id}/sets", response_model=List[str], tags=["Scopes"])
# async def list_scope_sets(
#     scope_id: str = Path(..., description="Scope ID from MongoDB")
# ):
#     """
#     List all available set names for a given scope.
#     """
#     if scopes_collection is None:
#         raise HTTPException(
#             status_code=503,
#             detail="MongoDB connection not available"
#         )
#     
#     try:
#         scope_doc = await fetch_scope_by_id(scope_id)
#         
#         if scope_doc is None:
#             raise HTTPException(
#                 status_code=404,
#                 detail=f"Scope '{scope_id}' not found"
#             )
#         
#         # Extract unique set names
#         set_names = set()
#         for fset in scope_doc.get("filter_set_results", []):
#             set_name = fset.get("set_name", "")
#             if set_name:
#                 set_names.add(set_name)
#         
#         return sorted(list(set_names))
#         
#     except HTTPException:
#         raise
#     except Exception as e:
#         logger.error(f"Error listing scope sets: {e}")
#         raise HTTPException(
#             status_code=500,
#             detail=f"Error listing scope sets: {str(e)}"
#         )




#############models 
# Updated endpoint in routes.py

@router.get("/training-progress/{run_id}", tags=["Model Training"])
async def get_training_progress(run_id: str):
    """
    Get the current progress of model training for a specific run_id.
    """
    if run_id not in training_progress:
        raise HTTPException(
            status_code=404,
            detail=f"Training progress for run_id '{run_id}' not found"
        )
    
    return training_progress[run_id]

@router.post("/train-models-direct", response_model=ModelTrainingResponse, tags=["Model Training"])
async def train_models_direct(request: dict):
    """
    Train models directly using MinIO files without requiring MongoDB scope documents.
    This endpoint works with the frontend's scope number and combination strings.
    """
    try:
        # Generate unique run ID or use provided one
        run_id = request.get('run_id') or str(uuid.uuid4())
        logger.info(f"Starting direct model training with run_id: {run_id}")
        
        # Extract parameters from request
        scope_number = request.get('scope_number')  # e.g., "3"
        combinations = request.get('combinations', [])  # e.g., ["Channel_Convenience_Variant_Flavoured_Brand_HEINZ_Flavoured_PPG_Small_Single"]
        x_variables = request.get('x_variables', [])
        y_variable = request.get('y_variable')
        standardization = request.get('standardization', 'none')
        k_folds = request.get('k_folds', 5)
        models_to_run = request.get('models_to_run')
        
        # Request parameters received
        
        if not scope_number or not combinations or not x_variables or not y_variable:
            raise HTTPException(
                status_code=400,
                detail="Missing required parameters: scope_number, combinations, x_variables, or y_variable"
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
        
        # Processing scope and combinations
        
        # Get bucket contents for processing
        try:
            all_bucket_objects = list(minio_client.list_objects(bucket_name, recursive=True))
        except Exception as debug_error:
            logger.warning(f"Bucket listing failed: {debug_error}")
        
        combination_results = []
        total_saved = 0
        all_variable_stats = {}
        
        # Initialize progress tracking
        total_combinations = len(combinations)
        total_models = len(models_to_run) if models_to_run else 0
        total_tasks = total_combinations * total_models
        
        training_progress[run_id] = {
            "run_id": run_id,
            "current": 0,
            "total": total_tasks,
            "percentage": 0,
            "status": "running",
            "current_combination": "",
            "current_model": "",
            "completed_combinations": 0,
            "total_combinations": total_combinations
        }
        
        for combination_index, combination in enumerate(combinations):
            # Update progress - starting combination
            training_progress[run_id]["current_combination"] = combination
            training_progress[run_id]["current"] = combination_index * total_models
            training_progress[run_id]["percentage"] = int((training_progress[run_id]["current"] / training_progress[run_id]["total"]) * 100)
            
            # Search for the file in MinIO
            target_file_key = None
            try:
                # Simple and direct search - find ALL files and filter them
                matching_objects = []
                
                try:
                    # Search for files containing both Scope_X and the combination
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
                    
                    logger.info(f"Total matching files found: {len(matching_objects)}")
                    
                except Exception as search_error:
                    logger.error(f"Search failed: {search_error}")
                    logger.error(f"Search error type: {type(search_error)}")
                    logger.error(f"Search error details: {str(search_error)}")
                
                if matching_objects:
                    # Use the first matching file
                    target_file_key = matching_objects[0]
                    
                    # Update progress - reading file
                    training_progress[run_id]["current_model"] = "Reading data file..."
                    await asyncio.sleep(0.3)
                    
                    # Read the file to get columns and validate variables
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
                        else:
                            logger.warning(f"Unsupported file format: {target_file_key}")
                            continue
                        
                        # Update progress - validating variables
                        training_progress[run_id]["current_model"] = "Validating variables..."
                        await asyncio.sleep(0.2)
                        
                        # Validate variables exist in the data
                        available_columns = df.columns.tolist()
                        all_variables = x_variables + [y_variable]
                        missing_vars = [var for var in all_variables if var not in available_columns]
                        
                        if missing_vars:
                            logger.warning(f"Variables not found in {target_file_key}: {missing_vars}")
                            continue
                        
                    except Exception as file_error:
                        logger.error(f"Error reading file {target_file_key}: {file_error}")
                        continue
                    
                    # Update progress - starting model training for this combination
                    training_progress[run_id]["current_combination"] = combination
                    training_progress[run_id]["current_model"] = "Training models..."
                    
                    # Add a small delay to make progress visible
                    await asyncio.sleep(0.5)
                    
                    # Train models for this combination
                    model_results, variable_data = await train_models_for_combination_enhanced(
                        file_key=target_file_key,
                        x_variables=x_variables,
                        y_variable=y_variable,
                        price_column=None,  # Can be enhanced later
                        standardization=standardization,
                        k_folds=k_folds,
                        models_to_run=models_to_run,
                        custom_configs=None,
                        bucket_name=bucket_name  # Pass the correct bucket name
                    )
                    
                    # Update progress - completed combination
                    training_progress[run_id]["current"] += total_models
                    training_progress[run_id]["percentage"] = int((training_progress[run_id]["current"] / training_progress[run_id]["total"]) * 100)
                    training_progress[run_id]["completed_combinations"] += 1
                    
                    # Extract fold elasticities from model results
                    for model_result in model_results:
                        fold_elasticities = []
                        if 'fold_results' in model_result:
                            for fold in model_result['fold_results']:
                                if fold.get('price_elasticity') is not None:
                                    fold_elasticities.append(fold['price_elasticity'])
                        
                        if fold_elasticities:
                            model_result['fold_elasticities'] = fold_elasticities
                    
                    # Store variable statistics
                    all_variable_stats[combination] = variable_data
                    
                    # Calculate elasticities and contributions for each model
                    logger.info(f"Starting elasticity calculation for combination {combination}")
                    for model_result in model_results:
                        try:
                            # Get coefficients and means that are already available
                            coefficients = model_result.get('coefficients', {})
                            variable_averages = variable_data.get('variable_averages', {})
                            
                            # Try to get createcolumn transformation data from MongoDB
                            transform_data = None
                            try:
                                # Try to get client/app/project info from the request or use defaults
                                client_name = request.get('client_name', 'default_client')
                                app_name = request.get('app_name', 'default_app')
                                project_name = request.get('project_name', 'default_project')
                                
                                # Fetch createcolumn transformation data
                                if 'createandtransform_configs_collection' in globals() and createandtransform_configs_collection is not None:
                                    document_id = f"{client_name}/{app_name}/{project_name}"
                                    transform_doc = await createandtransform_configs_collection.find_one({"_id": document_id})
                                    if transform_doc:
                                        transform_data = transform_doc
                                        logger.info(f"Found createcolumn transformation data for {document_id}")
                                    else:
                                        logger.info(f"No createcolumn transformation data found for {document_id}, using direct calculation")
                                else:
                                    logger.info("createandtransform_configs_collection not available, using direct calculation")
                            except Exception as e:
                                logger.warning(f"Failed to fetch createcolumn transformation data: {e}, using direct calculation")
                            
                            # Calculate elasticities using the CORRECT formula since Y is NOT standardized
                            elasticities = {}
                            contributions = {}
                            
                            # Get unstandardized coefficients (these are the correct ones since Y is not standardized)
                            unstandardized_coeffs = model_result.get('unstandardized_coefficients', {})
                            
                            # For each X variable, calculate elasticity and contribution
                            for x_var in x_variables:
                                beta_key = f"Beta_{x_var}"
                                x_mean = variable_averages.get(x_var, 0)
                                y_mean = variable_averages.get(y_variable, 0)
                                
                                # Use unstandardized coefficients for elasticity calculation
                                # Since Y is NOT standardized, we need unstandardized coefficients
                                if unstandardized_coeffs and beta_key in unstandardized_coeffs:
                                    beta_val = unstandardized_coeffs[beta_key]
                                else:
                                    # Fallback to raw coefficients if unstandardized not available
                                    beta_val = coefficients.get(beta_key, 0)
                                
                                # Calculate elasticity using the CORRECT formula: (β × X_mean) / Y_mean
                                if y_mean != 0 and x_mean != 0:
                                    elasticity = (beta_val * x_mean) / y_mean
                                else:
                                    elasticity = 0
                                
                                elasticities[x_var] = elasticity
                                
                                # Calculate contribution: (β × X_mean) / sum(all_β × X_mean)
                                contributions[x_var] = abs(beta_val * x_mean)
                            
                            # Normalize contributions to sum to 1
                            total_contribution = sum(contributions.values())
                            if total_contribution > 0:
                                for x_var in contributions:
                                    contributions[x_var] = contributions[x_var] / total_contribution
                            
                            # Store results in model_result
                            model_result['elasticities'] = elasticities
                            model_result['contributions'] = contributions
                            

                            model_result['elasticity_details'] = {
                                'calculation_method': 'direct_from_model_results',
                                'variables_processed': list(elasticities.keys()),
                                'transform_data_used': transform_data is not None
                            }
                            model_result['contribution_details'] = {
                                'calculation_method': 'direct_from_model_results',
                                'variables_processed': list(contributions.keys()),
                                'total_contribution': total_contribution,
                                'transform_data_used': transform_data is not None
                            }
                            

                                
                        except Exception as e:
                            logger.warning(f"Failed to calculate elasticities/contributions for {combination} {model_result.get('model_name', 'unknown')}: {e}")
                            logger.warning(f"Exception details: {type(e).__name__}: {str(e)}")
                            # Don't fail the entire process if elasticity calculation fails
                            model_result['elasticities'] = {}
                            model_result['contributions'] = {}
                            model_result['elasticity_details'] = {}
                            model_result['contribution_details'] = {}
                    
                    # Save results to MongoDB (if available)
                    try:
                        saved_ids = await save_model_results_enhanced(
                            scope_id=f"scope_{scope_number}",
                            scope_name=f"Scope_{scope_number}",
                            set_name=f"Scope_{scope_number}",
                            combination={
                                "combination_id": combination,
                                "channel": "Unknown",  # Required field
                                "brand": "Unknown",   # Required field
                                "ppg": "Unknown",     # Required field
                                "file_key": target_file_key,
                                "filename": target_file_key.split('/')[-1],
                                "set_name": f"Scope_{scope_number}",
                                "record_count": len(df)
                            },
                    model_results=model_results,
                            x_variables=x_variables,
                            y_variable=y_variable,
                            price_column=None,
                            standardization=standardization,
                            k_folds=k_folds,
                    run_id=run_id,
                    variable_data=variable_data
                )

                        total_saved += len(saved_ids)
                        
                    except Exception as e:
                        logger.error(f"Failed to save results for {combination}: {e}")
                    

                    
                    combination_results.append({
                        "combination_id": combination,
                        "channel": "Unknown",  # Required field
                        "brand": "Unknown",   # Required field
                        "ppg": "Unknown",     # Required field
                        "file_key": target_file_key,
                        "total_records": len(df),
                        "model_results": model_results
                    })
                    
                else:
                    logger.warning(f"Could not find file for combination: {combination}")
                    continue
                    
            except Exception as e:
                logger.error(f"Error processing combination {combination}: {e}")
                continue
        
        if not combination_results:
            raise HTTPException(
                status_code=404,
                detail=f"No valid combinations found for scope {scope_number}"
            )
        
        # Save model results to MinIO (similar to scope-selector pattern)
        try:
            # Get the standard prefix using get_object_prefix
            prefix = await get_object_prefix()
            
            # Create timestamp for file naming
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            
            # Generate filename for model results
            model_results_filename = f"model_results_scope_{scope_number}_{timestamp}.arrow"
            
            # Construct the full path with the standard structure
            model_results_file_key = f"{prefix}model-results/{model_results_filename}"
            
            # Prepare data for MinIO storage
            
            # Create a summary DataFrame with key results
            summary_data = []
            for combo_result in combination_results:
                # Get variable averages for this combination
                combination_id = combo_result['combination_id']
                variable_averages = all_variable_stats.get(combination_id, {}).get('variable_averages', {})
                
                for model_result in combo_result.get('model_results', []):
                    # Create base summary row
                    summary_row = {
                        'combination_id': combo_result['combination_id'],
                        'y_variable': y_variable,
                        'x_variables': x_variables,  # Keep as list instead of joining
                        'model_name': model_result.get('model_name', 'Unknown'),
                        'mape_train': model_result.get('mape_train', 0),
                        'mape_test': model_result.get('mape_test', 0),
                        'r2_train': model_result.get('r2_train', 0),
                        'r2_test': model_result.get('r2_test', 0),
                        'aic': model_result.get('aic', 0),
                        'bic': model_result.get('bic', 0),
                        'intercept': model_result.get('intercept', 0),
                        'n_parameters': model_result.get('n_parameters', 0),
                        'price_elasticity': model_result.get('price_elasticity', None),
                        'run_id': run_id,
                        'scope_number': scope_number,
                        'timestamp': timestamp
                    }
                    
                    # Add average values for each variable (before any transformation)
                    for x_var in x_variables:
                        avg_key = f"{x_var}_avg"
                        summary_row[avg_key] = variable_averages.get(x_var, 0)
                    
                    # Add Y variable average
                    y_avg_key = f"{y_variable}_avg"
                    summary_row[y_avg_key] = variable_averages.get(y_variable, 0)
                    
                    # Add beta coefficients for each X-variable
                    coefficients = model_result.get('coefficients', {})
                    for x_var in x_variables:
                        beta_key = f"{x_var}_beta"
                        summary_row[beta_key] = coefficients.get(f"Beta_{x_var}", 0)
                    
                    # Add elasticity values for each X-variable
                    elasticities = model_result.get('elasticities', {})
                    for x_var in x_variables:
                        elasticity_key = f"{x_var}_elasticity"
                        summary_row[elasticity_key] = elasticities.get(x_var, 0)
                    
                    # Add contribution values for each X-variable
                    contributions = model_result.get('contributions', {})
                    for x_var in x_variables:
                        contribution_key = f"{x_var}_contribution"
                        summary_row[contribution_key] = contributions.get(x_var, 0)
                    
                    summary_data.append(summary_row)
            
            if summary_data:
                # Convert to DataFrame and save as Arrow file
                import pandas as pd
                summary_df = pd.DataFrame(summary_data)
                
                arrow_buffer = BytesIO()
                table = pa.Table.from_pandas(summary_df)
                feather.write_feather(table, arrow_buffer)
                arrow_buffer.seek(0)
                
                # Save to MinIO
                try:
                    minio_client.put_object(
                        bucket_name,
                        model_results_file_key,
                        arrow_buffer,
                        length=arrow_buffer.getbuffer().nbytes,
                        content_type='application/vnd.apache.arrow.file'
                    )
                    
                    logger.info(f"Model results saved to MinIO: {model_results_file_key}")
                    
                except Exception as e:
                    logger.warning(f"Failed to save model results to MinIO: {e}")
                    # Don't fail the entire request if MinIO save fails
                    
        except Exception as e:
            logger.warning(f"Failed to prepare model results for MinIO: {e}")
            # Don't fail the entire request if MinIO preparation fails
        
        # Clean model results to handle non-JSON-compliant values
        def clean_model_results(results):
            """Clean model results to ensure JSON compliance"""
            import math
            
            def clean_value(value):
                if isinstance(value, (int, float)):
                    if math.isnan(value) or math.isinf(value):
                        return 0.0  # Convert NaN/inf to 0.0 for float fields
                    return value
                elif isinstance(value, dict):
                    return {k: clean_value(v) for k, v in value.items()}
                elif isinstance(value, list):
                    return [clean_value(v) for v in value]
                else:
                    return value
            
            cleaned_results = []
            for combo_result in results:
                cleaned_combo = combo_result.copy()
                cleaned_model_results = []
                
                for model_result in combo_result.get('model_results', []):
                    cleaned_model = clean_value(model_result)
                    cleaned_model_results.append(cleaned_model)
                
                cleaned_combo['model_results'] = cleaned_model_results
                cleaned_results.append(cleaned_combo)
            
            return cleaned_results
        

        
        # Clean the results before returning
        cleaned_combination_results = clean_model_results(combination_results)
        

        

        
        # Update final progress
        training_progress[run_id]["status"] = "completed"
        training_progress[run_id]["current"] = training_progress[run_id]["total"]
        training_progress[run_id]["percentage"] = 100
        training_progress[run_id]["current_combination"] = ""
        training_progress[run_id]["current_model"] = ""
        
        # Return response
        return ModelTrainingResponse(
            scope_id=f"scope_{scope_number}",
            set_name=f"Scope_{scope_number}",
            x_variables=x_variables,
            y_variable=y_variable,
            standardization=standardization,
            k_folds=k_folds,
            total_combinations=len(cleaned_combination_results),
            combination_results=cleaned_combination_results,
            summary={
                "run_id": run_id,
                "total_combinations_processed": len(cleaned_combination_results),
                "total_models_saved": total_saved,
                "variable_statistics": all_variable_stats
            }
        )
        
    except HTTPException:
        # Update progress on error
        if run_id in training_progress:
            training_progress[run_id]["status"] = "error"
        raise
    except Exception as e:
        # Update progress on error
        if run_id in training_progress:
            training_progress[run_id]["status"] = "error"
        logger.error(f"Error in direct model training: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

# @router.post("/train-models", response_model=ModelTrainingResponse, tags=["Model Training"])
# async def train_models(request: ModelTrainingRequest):
#     """
#     Train models with enhanced result tracking and storage.
#     """
#     try:
#         # Generate unique run ID
#         run_id = str(uuid.uuid4())
#         logger.info(f"Starting enhanced model training with run_id: {run_id}")
        
#         # Get scope combinations
#         scope_data = await get_scope_set_with_columns(request.scope_id, request.set_name)
        
#         if not scope_data:
#             raise HTTPException(
#                 status_code=404,
#                 detail=f"Scope {request.scope_id} with set {request.set_name} not found"
#             )
        
#         # Validate variables
#         available_columns = scope_data['columns']
#         all_variables = request.x_variables + [request.y_variable]
#         missing_vars = [var for var in all_variables if var not in available_columns]
        
#         if missing_vars:
#             raise HTTPException(
#                 status_code=400,
#                 detail=f"Variables not found in data: {missing_vars}"
#             )
        
#         # Process each combination
#         combination_results = []
#         total_saved = 0
#         all_variable_stats = {}
        
#         for combination in scope_data['combinations']:
#             logger.info(f"Training models for combination: {combination['combination_id']}")
            
#             # Train models with enhanced tracking
#             # Train models with enhanced tracking
#             model_results, variable_data = await train_models_for_combination_enhanced(
#                 file_key=combination['file_key'],
#                 x_variables=request.x_variables,
#                 y_variable=request.y_variable,
#                 price_column=request.price_column,  # ← Add this line
#                 standardization=request.standardization,
#                 k_folds=request.k_folds,
#                 models_to_run=request.models_to_run,
#                 custom_configs=request.custom_model_configs
#             )
            
            
#             # ⭐ ADD YOUR CODE HERE ⭐
#             # Extract fold elasticities from model results
#             for model_result in model_results:
#                 fold_elasticities = []
#                 if 'fold_results' in model_result:
#                     for fold in model_result['fold_results']:
#                         if fold.get('price_elasticity') is not None:
#                             fold_elasticities.append(fold['price_elasticity'])
                
#                 # Add to model result
#                 if fold_elasticities:
#                     model_result['fold_elasticities'] = fold_elasticities
            
#             # Store variable statistics for this combination
#             all_variable_stats[combination['combination_id']] = variable_data



#             # Store variable statistics for this combination
#             all_variable_stats[combination['combination_id']] = variable_data
            
#             # Save enhanced results to MongoDB
#             try:
#                 saved_ids = await save_model_results_enhanced(
#                     scope_id=request.scope_id,
#                     scope_name=scope_data['scope_name'],
#                     set_name=request.set_name,
#                     combination=combination,
#                     model_results=model_results,
#                     x_variables=request.x_variables,
#                     y_variable=request.y_variable,
#                     price_column=request.price_column,  # ADD THIS LINE
#                     standardization=request.standardization,
#                     k_folds=request.k_folds,
#                     run_id=run_id,
#                     variable_data=variable_data
#                 )


#                 total_saved += len(saved_ids)
#                 logger.info(f"Saved {len(saved_ids)} enhanced models for {combination['combination_id']}")
                
#             except Exception as e:
#                 logger.error(f"Failed to save results for {combination['combination_id']}: {e}")
            
#             combination_results.append({
#                 "combination_id": combination['combination_id'],
#                 "channel": combination['channel'],
#                 "brand": combination['brand'],
#                 "ppg": combination['ppg'],
#                 "file_key": combination['file_key'],
#                 "total_records": combination.get('record_count', 0),
#                 "model_results": model_results,
#                 "variable_averages": variable_data.get("variable_averages", {})
#             })
        
#         # Enhanced summary
#         summary = {
#             "total_models_per_combination": len(model_results) if model_results else 0,
#             "best_model_by_mape": {},
#             "best_model_by_r2": {},
#             "run_id": run_id,
#             "total_models_saved": total_saved,
#             "save_status": "success" if total_saved > 0 else "failed",
#             "variable_summary": all_variable_stats
#         }
        
#         # Find best models
#         for combo_result in combination_results:
#             combo_id = combo_result['combination_id']
            
#             if combo_result['model_results']:
#                 # Best by MAPE
#                 best_mape = min(combo_result['model_results'], key=lambda x: x['mape_test'])
#                 summary["best_model_by_mape"][combo_id] = {
#                     "model": best_mape['model_name'],
#                     "mape_test": best_mape['mape_test'],
#                     "mape_test_std": best_mape.get('mape_test_std', 0)
#                 }
                
#                 # Best by R2
#                 best_r2 = max(combo_result['model_results'], key=lambda x: x['r2_test'])
#                 summary["best_model_by_r2"][combo_id] = {
#                     "model": best_r2['model_name'],
#                     "r2_test": best_r2['r2_test'],
#                     "r2_test_std": best_r2.get('r2_test_std', 0)
#                 }
        
#         return ModelTrainingResponse(
#             scope_id=request.scope_id,
#             set_name=request.set_name,
#             x_variables=request.x_variables,
#             y_variable=request.y_variable,
#             standardization=request.standardization,
#             k_folds=request.k_folds,
#             total_combinations=len(combination_results),
#             combination_results=combination_results,
#             summary=summary
#         )
        
#     except HTTPException:
#         raise
#     except Exception as e:
#         logger.error(f"Error in enhanced model training: {e}")
#         raise HTTPException(status_code=500, detail=str(e))

    
    


# @router.get("/model-results/detailed/{run_id}", tags=["Model Results"])
# async def get_detailed_model_results(
#     run_id: str = Path(..., description="Run ID from training session"),
#     include_folds: bool = Query(False, description="Include fold-wise details")
# ):
#     """Retrieve detailed model results with variable statistics."""
#     if build_collection is None:
#         raise HTTPException(status_code=503, detail="MongoDB not available")
    
#     try:
#         # Query for aggregated results only
#         query = {"run_id": run_id, "is_fold_result": False}
#         results = []
        
#         cursor = build_collection.find(query)
#         async for doc in cursor:
#             doc["_id"] = str(doc["_id"])
#             if not include_folds:
#                 doc.pop("fold_results", None)
#             results.append(doc)
        
#         if not results:
#             raise HTTPException(status_code=404, detail=f"No results found for run_id: {run_id}")
        
#         # Extract variable averages from first result
#         variable_averages_summary = {}
#         if results:
#             for var, avg in results[0].get("variable_averages", {}).items():
#                 variable_averages_summary[var] = avg
        
#         return {
#             "run_id": run_id,
#             "total_models": len(results),
#             "variable_averages": variable_averages_summary,
#             "results": results
#         }
        
#     except HTTPException:
#         raise
#     except Exception as e:
#         logger.error(f"Error retrieving detailed results: {e}")
#         raise HTTPException(status_code=500, detail=str(e))

# @router.get("/model-results/variable-stats/{run_id}", tags=["Model Results"])
# async def get_variable_statistics(
#     run_id: str = Path(..., description="Run ID from training session")
# ):
#     """Get variable statistics for all combinations in a training run."""
#     if build_collection is None:
#         raise HTTPException(status_code=503, detail="MongoDB not available")
    
#     try:
#         pipeline = [
#             {"$match": {"run_id": run_id, "is_fold_result": False}},
#             {
#                 "$group": {
#                     "_id": "$combination_id",
#                     "channel": {"$first": "$channel"},
#                     "brand": {"$first": "$brand"},
#                     "ppg": {"$first": "$ppg"},
#                     "variable_statistics": {"$first": "$variable_statistics"},
#                     "variable_averages": {"$first": "$variable_averages"}
#                 }
#             }
#         ]
        
#         results = []
#         async for doc in build_collection.aggregate(pipeline):
#             results.append({
#                 "combination_id": doc["_id"],
#                 "channel": doc["channel"],
#                 "brand": doc["brand"],
#                 "ppg": doc["ppg"],
#                 "variable_statistics": doc["variable_statistics"],
#                 "variable_averages": doc["variable_averages"]
#             })
        
#         return {
#             "run_id": run_id,
#             "combinations": results
#         }
        
#     except Exception as e:
#         logger.error(f"Error retrieving variable statistics: {e}")
#         raise HTTPException(status_code=500, detail=str(e))
    
    
    
    
    
# from fastapi.responses import StreamingResponse
# from typing import Optional

# @router.get("/model-results/export/{run_id}", tags=["Model Results"])
# async def export_model_results_csv(
#     run_id: str = Path(..., description="Run ID from training session"),
#     include_folds: bool = Query(False, description="Include fold-wise details"),
#     save_only: bool = Query(False, description="Only save to MinIO without downloading")
# ):
#     """
#     Export model results to CSV format with MinIO storage.
    
#     Features:
#     - Downloads CSV file by default
#     - Saves to MinIO bucket for permanent storage
#     - Option to only save without downloading
#     - Includes fold-level details if requested
    
#     Returns:
#     - CSV file download (default)
#     - JSON response with MinIO path if save_only=True
#     """
#     try:
#         # Generate CSV and save to MinIO
#         csv_data, minio_file_key = await export_results_to_csv_and_minio(run_id, include_folds)
        
#         if save_only:
#             # Return JSON response with file location
#             return {
#                 "status": "success",
#                 "message": "CSV saved to MinIO",
#                 "minio_bucket": settings.minio_results_bucket,
#                 "file_key": minio_file_key,
#                 "download_url": f"/api/v1/model-results/download/{minio_file_key}"
#             }
#         else:
#             # Return CSV as download
#             filename = f"model_results_{run_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
            
#             return StreamingResponse(
#                 iter([csv_data.getvalue()]),
#                 media_type="text/csv",
#                 headers={
#                     "Content-Disposition": f"attachment; filename={filename}",
#                     "X-MinIO-Path": minio_file_key  # Include MinIO path in headers
#                 }
#             )
        
#     except Exception as e:
#         logger.error(f"Error exporting results to CSV: {e}")
#         raise HTTPException(
#             status_code=500,
#             detail=f"Error exporting results: {str(e)}"
#         )


# @router.get("/model-results/download/{file_path:path}", tags=["Model Results"])
async def download_csv_from_minio(
    file_path: str = Path(..., description="MinIO file path")
):
    """
    Download a previously saved CSV file from MinIO.
    
    Example: /api/v1/model-results/download/csv-exports/run_id/filename.csv
    """
    try:
        # Get file from MinIO
        csv_data = await get_csv_from_minio(file_path)
        
        # Extract filename from path
        filename = file_path.split('/')[-1]
        
        return StreamingResponse(
            csv_data,
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )
        
    except Exception as e:
        logger.error(f"Error downloading CSV from MinIO: {e}")
        raise HTTPException(
            status_code=404 if "NoSuchKey" in str(e) else 500,
            detail=f"Error downloading file: {str(e)}"
        )


# @router.get("/model-results/list-exports", tags=["Model Results"])
async def list_csv_exports(
    run_id: Optional[str] = Query(None, description="Filter by run ID"),
    limit: int = Query(50, ge=1, le=200)
):
    """
    List all CSV exports stored in MinIO.
    """
    if minio_client is None:
        raise HTTPException(status_code=503, detail="MinIO not available")
    
    try:
        prefix = f"csv-exports/{run_id}/" if run_id else "csv-exports/"
        
        objects = []
        for obj in minio_client.list_objects(settings.minio_results_bucket, prefix=prefix, recursive=True):
            # Get object metadata
            stat = minio_client.stat_object(settings.minio_results_bucket, obj.object_name)
            
            objects.append({
                "file_key": obj.object_name,
                "size": obj.size,
                "last_modified": obj.last_modified.isoformat(),
                "download_url": f"/api/v1/model-results/download/{obj.object_name}",
                "metadata": dict(stat.metadata) if stat.metadata else {}
            })
            
            if len(objects) >= limit:
                break
        
        return {
            "total": len(objects),
            "exports": objects
        }
        
    except Exception as e:
        logger.error(f"Error listing CSV exports: {e}")
        raise HTTPException(status_code=500, detail=str(e))



##########################################################################

# @router.post("/marketing/prepare-data", response_model=MarketingDataPreparationResponse, tags=["Marketing Mix Modeling"])
# async def prepare_marketing_data(request: MarketingDataPreparationRequest):
#     """Prepare data for marketing mix modeling using scope system."""
#     run_id = str(uuid.uuid4())
#     logger.info(f"Starting data preparation with run_id: {run_id}")
#     
#     try:
#         # Get scope combinations
#         scope_data = await get_scope_set_with_columns(request.scope_id, request.set_name)
#         if not scope_data:
#             raise HTTPException(
#                 status_code=404,
#                 detail=f"Scope {request.scope_id} with set {request.set_name} not found"
#             )
#         
#         # Process each combination
#         all_prepared_files = []
#         total_rows = 0
#         columns_removed_summary = {}
#         last_df = None  # Keep track of last DataFrame for column count
#         
#         for combination in scope_data['combinations']:
#             logger.info(f"Processing combination: {combination['combination_id']}")
#             
#             # Load data from combination file
#             file_data = get_file_from_source(combination['file_key'])
#             
#             # Read file based on extension
#             if combination['file_key'].endswith(('.xlsx', '.xls')):
#                 df = pd.read_excel(file_data)
#             
#             else:
#                 df = pd.read_csv(file_data)
#             
#             logger.info(f"Loaded {combination['combination_id']} with shape: {df.shape}")
#             
#             # Filter by fiscal years
#             if "Fiscal Year" in df.columns:
#                 df = df[df["Fiscal Year"].isin(request.fiscal_years)]
#                 logger.info(f"Filtered to fiscal years: {request.fiscal_years}")
#             
#             # Remove zero columns
#             columns_removed = []
#             if request.remove_zero_columns:
#                 initial_cols = df.columns.tolist()
#                 df = df.loc[:, (df != 0).any(axis=0)]
#                 columns_removed = list(set(initial_cols) - set(df.columns.tolist()))
#                 if columns_removed:
#                     columns_removed_summary[combination['combination_id']] = columns_removed
#             
#             # Save prepared data for this combination
#             combo_id = combination['combination_id']
#             prepared_key = f"marketing-prepared/{run_id}/{combo_id}/data.xlsx"
#             save_dataframe_to_minio(df, prepared_key, format="excel")
#             
#             all_prepared_files.append({
#                 "combination_id": combo_id,
#                 "file_key": prepared_key,
#                 "rows": len(df),
#                 "columns": len(df.columns)
#             })
#             
#             total_rows += len(df)
#             last_df = df  # Keep reference to last processed DataFrame
#         
#         # ⚡ CRITICAL FIX: Save metadata using marketing_helpers function
#         metadata = {
#             "run_id": run_id,
#             "scope_id": request.scope_id,
#             "set_name": request.set_name,
#             "combinations": all_prepared_files,
#             "fiscal_years": request.fiscal_years,
#             "columns_removed_summary": columns_removed_summary
#         }
#         
#         # Import the function if not already imported
#         from marketing_helpers import save_transformation_metadata
#         
#         # Save the metadata
#         await save_transformation_metadata(run_id, metadata)
#         logger.info(f"✅ Metadata saved for run_id: {run_id}")
#         
#         return MarketingDataPreparationResponse(
#             run_id=run_id,
#             status="success",
#             rows=total_rows,
#             columns=len(last_df.columns) if last_df is not None else 0,
#             prepared_data_key=f"marketing-prepared/{run_id}/",
#             fiscal_years_included=request.fiscal_years,
#             columns_removed=None
#         )
#         
#     except Exception as e:
#         logger.error(f"Error in data preparation: {e}")
#         raise HTTPException(status_code=500, detail=str(e))



# @router.post("/marketing/transform-variables", response_model=MarketingTransformationResponse, tags=["Marketing Mix Modeling"])
# async def transform_marketing_variables(request: MarketingTransformationRequest):
#     """Apply transformations to marketing variables for all combinations."""
#     transform_id = str(uuid.uuid4())
#     logger.info(f"Starting variable transformation with transform_id: {transform_id}")
#     
#     try:
#         # Get preparation metadata
#         prep_metadata = await get_transformation_metadata(request.run_id)
#         combinations = prep_metadata.get("combinations", [])
#         
#         if not combinations:
#             raise HTTPException(status_code=404, detail="No prepared data found")
#         
#         all_transformed_files = []
#         all_variable_stats = {}
#         all_regions = set()
#         
#         # Process each combination
#         for combo_info in combinations:
#             combo_id = combo_info["combination_id"]
#             file_key = combo_info["file_key"]
#             
#             logger.info(f"Transforming variables for combination: {combo_id}")
#             
#             # Load prepared data
#             file_data = get_file_from_source(file_key)
#             df = pd.read_excel(file_data)
#             
#             # Get unique regions in this combination's data
#             regions = df["Region"].unique().tolist() if "Region" in df.columns else []
#             all_regions.update(regions)
#             
#             # Apply transformations
#             df_transformed = apply_transformations_by_region(
#                 df=df,
#                 media_variables=request.media_variables,
#                 other_variables=request.other_variables,
#                 non_scaled_variables=request.non_scaled_variables,
#                 transformation_params=request.transformation_params,
#                 standardization_method=request.standardization_method.value,
#                 transformation_type=request.transformation_type.value
#             )
#             
#             # Calculate statistics for this combination
#             variable_stats = {}
#             for col in df_transformed.columns:
#                 if col.endswith("_transformed") or col.endswith("_scaled"):
#                     stats_by_region = {}
#                     for region in regions:
#                         if region in df_transformed["Region"].unique():
#                             region_data = df_transformed[df_transformed["Region"] == region][col]
#                             stats_by_region[region] = {
#                                 "mean": float(region_data.mean()),
#                                 "std": float(region_data.std()),
#                                 "min": float(region_data.min()),
#                                 "max": float(region_data.max())
#                             }
#                     variable_stats[col] = stats_by_region
#             
#             # Save transformed data
#             transform_key = f"marketing-transformed/{transform_id}/{combo_id}/data.xlsx"
#             save_dataframe_to_minio(df_transformed, transform_key, format="excel")
#             
#             all_transformed_files.append({
#                 "combination_id": combo_id,
#                 "file_key": transform_key,
#                 "regions": regions
#             })
#             
#             all_variable_stats[combo_id] = variable_stats
#         
#         # Save transformation metadata
#         metadata = {
#             "run_id": request.run_id,
#             "transform_id": transform_id,
#             "transformation_type": request.transformation_type.value,
#             "standardization_method": request.standardization_method.value,
#             "transformation_params": request.transformation_params,
#             "media_variables": request.media_variables,
#             "other_variables": request.other_variables,
#             "non_scaled_variables": request.non_scaled_variables,
#             "combinations": all_transformed_files,
#             "variable_stats": all_variable_stats
#         }
#         
#         await save_transformation_metadata(transform_id, metadata)
#         
#         return MarketingTransformationResponse(
#             transform_id=transform_id,
#             status="success",
#             transformed_data_key=f"marketing-transformed/{transform_id}/",
#             variable_statistics=all_variable_stats,
#             regions_processed=list(all_regions),
#             media_variables_transformed=request.media_variables
#         )
        
    except Exception as e:
        logger.error(f"Error in variable transformation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# @router.post("/marketing/train-models", response_model=MarketingModelTrainingResponse, tags=["Marketing Mix Modeling"])
# async def train_marketing_models(request: MarketingModelTrainingRequest):
#     """Train marketing mix models for all combinations with optional constraints."""
#     training_id = str(uuid.uuid4())
#     start_time = datetime.now()
#     logger.info(f"Starting model training with training_id: {training_id}")
    
#     try:
#         # Get transformation metadata
#         # transform_metadata = await get_transformation_metadata(request.run_id)
#         transform_metadata = {}
#         combinations = transform_metadata.get("combinations", [])
#         
#         if not combinations:
#             raise HTTPException(status_code=404, detail="No transformed data found")
#         
#         all_results = []
#         model_counter = 0
#         combinations_processed = 0
        
        # Process each combination
        for combo_info in combinations:
            combo_id = combo_info["combination_id"]
            file_key = combo_info["file_key"]
            
            logger.info(f"Training models for combination: {combo_id}")
            
            # Load transformed data
            # file_data = get_file_from_source(file_key)
            file_data = None
            df = pd.read_excel(file_data)
            
            # Extract brand, market, region from combination ID or data
            if "Brand" in df.columns:
                brands = df["Brand"].unique().tolist()
            else:
                brands = ["Unknown"]
            
            if "Market" in df.columns:
                markets = df["Market"].unique().tolist()
            else:
                markets = ["Unknown"]
            
            if "Region" in df.columns:
                regions = df["Region"].unique().tolist()
            else:
                regions = ["Unknown"]
            
            # Train models for this combination
            for model_type in request.model_types:
                for y_variable in request.y_variables:
                    if y_variable not in df.columns:
                        logger.warning(f"Y variable {y_variable} not found in {combo_id}")
                        continue
                    
                    # Prepare features
                    x_columns = []
                    
                    # Add scaled other variables
                    for var in transform_metadata.get("other_variables", []):
                        col_name = f"scaled_{var}"
                        if col_name in df.columns:
                            x_columns.append(col_name)
                    
                    # Add transformed media variables
                    for var in transform_metadata.get("media_variables", []):
                        col_name = f"{var}_transformed"
                        if col_name in df.columns:
                            x_columns.append(col_name)
                    
                    # Add non-scaled variables
                    for var in transform_metadata.get("non_scaled_variables", []):
                        col_name = f"non_scaled_{var}"
                        if col_name in df.columns:
                            x_columns.append(col_name)
                    
                    if not x_columns:
                        logger.warning(f"No feature columns found for {combo_id}")
                        continue
                    
                    # Prepare data
                    X = df[x_columns].values
                    y = df[y_variable].values
                    
                    if len(y) < 10:  # Skip if too few samples
                        logger.warning(f"Too few samples ({len(y)}) for {combo_id}")
                        continue
                    
                    # Split data
                    split_index = int(len(y) * request.train_test_split)
                    if split_index < 5 or (len(y) - split_index) < 2:
                        logger.warning(f"Insufficient data for train/test split in {combo_id}")
                        continue
                    
                    X_train, X_test = X[:split_index], X[split_index:]
                    y_train, y_test = y[:split_index], y[split_index:]
                    
                    # Prepare constraint information
                    constraint_dict = []
                    if request.use_constraints and request.variable_constraints:
                        constraint_dict = [
                            {
                                "variable_name": vc.variable_name,
                                "constraint_type": vc.constraint_type.value
                            }
                            for vc in request.variable_constraints
                        ]
                    
                    # Model selection with constraint support
                    if request.use_constraints and constraint_dict:
                        # Import the function if not already imported
                        from marketing_helpers import create_constrained_model
                        
                        # Use custom constrained model
                        model = create_constrained_model(
                            model_type=model_type.value,
                            variable_constraints=constraint_dict,
                            x_columns=x_columns,
                            learning_rate=request.constraint_learning_rate,
                            iterations=request.constraint_iterations,
                            l2_penalty=0.1 if "Ridge" in model_type.value else 0.0
                        )
                        
                        # Special fit method for constrained models
                        try:
                            model.fit(X_train, y_train, x_columns)
                        except Exception as e:
                            logger.error(f"Error fitting constrained model for {combo_id}: {e}")
                            continue
                    else:
                        # Use standard models (existing logic)
                        if model_type == MarketingModelType.RIDGE:
                            model = Ridge(alpha=0.1)
                        elif model_type == MarketingModelType.LASSO:
                            model = Lasso(alpha=0.1, max_iter=2000)
                        elif model_type == MarketingModelType.LINEAR:
                            model = LinearRegression()
                        elif model_type == MarketingModelType.ELASTIC_NET:
                            model = ElasticNet(alpha=0.1, l1_ratio=0.5)
                        else:
                            model = Ridge(alpha=0.1)
                        
                        # Standard fit
                        try:
                            model.fit(X_train, y_train)
                        except Exception as e:
                            logger.error(f"Error fitting standard model for {combo_id}: {e}")
                            continue
                    
                    # Evaluate model
                    try:
                        # Calculate metrics
                        y_train_pred = model.predict(X_train)
                        y_test_pred = model.predict(X_test)
                        
                        # metrics = calculate_model_metrics(y_train, y_train_pred, len(x_columns))
                        # test_metrics = calculate_model_metrics(y_test, y_test_pred, len(x_columns))
                        metrics = {"mape": 0.0, "r2": 0.0, "aic": 0.0, "bic": 0.0, "adjusted_r2": 0.0}
                        test_metrics = {"mape": 0.0, "r2": 0.0, "aic": 0.0, "bic": 0.0}
                        
                        # Extract coefficients
                        coefficients = {
                            "intercept": float(model.intercept_),
                            **{x_columns[i]: float(model.coef_[i]) for i in range(len(x_columns))}
                        }
                        
                        # Store result with constraint info
                        result = {
                            "model_id": model_counter,
                            "combination_id": combo_id,
                            "model_type": model_type.value,
                            "brand": brands[0] if brands else "Unknown",
                            "markets": markets,
                            "regions": regions,
                            "y_variable": y_variable,
                            "mape_train": metrics["mape"],
                            "mape_test": test_metrics["mape"],
                            "r2": metrics["r2"],
                            "adjusted_r2": metrics["adjusted_r2"],
                            "aic": metrics["aic"],
                            "bic": metrics["bic"],
                            "coefficients": coefficients,
                            "transformation_params": transform_metadata.get("transformation_params", {}),
                            "y_mean": float(y.mean()),
                            "n_samples_train": len(y_train),
                            "n_samples_test": len(y_test),
                            # Add constraint information
                            "constraints_applied": request.use_constraints,
                            "variable_constraints": constraint_dict if request.use_constraints else [],
                            "constraint_learning_rate": request.constraint_learning_rate if request.use_constraints else None,
                            "constraint_iterations": request.constraint_iterations if request.use_constraints else None
                        }
                        
                        all_results.append(result)
                        model_counter += 1
                        
                        # Log constraint enforcement
                        if request.use_constraints:
                            logger.info(f"Model {model_counter-1} trained with constraints for {combo_id}")
                            # Log which constraints were applied
                            for constraint in constraint_dict:
                                var_name = constraint["variable_name"]
                                constraint_type = constraint["constraint_type"]
                                if var_name in coefficients:
                                    coef_value = coefficients[var_name]
                                    if constraint_type == "positive" and coef_value >= 0:
                                        logger.info(f"✓ Constraint satisfied: {var_name} >= 0 (value: {coef_value:.4f})")
                                    elif constraint_type == "negative" and coef_value <= 0:
                                        logger.info(f"✓ Constraint satisfied: {var_name} <= 0 (value: {coef_value:.4f})")
                                    else:
                                        logger.warning(f"⚠ Constraint violated: {var_name} {constraint_type} (value: {coef_value:.4f})")
                        
                    except Exception as e:
                        logger.error(f"Error evaluating model for {combo_id}: {e}")
                        continue
            
            combinations_processed += 1
        
        # Save results
        # if all_results:
        #     saved_ids = await save_marketing_model_results(
        #         training_id,
        #         all_results,
        #         {
        #             "transform_id": request.run_id,
        #             "training_params": request.dict(),
        #             "total_models": len(all_results),
        #             "scope_id": transform_metadata.get("scope_id"),
        #             "set_name": transform_metadata.get("set_name"),
        #             "constraints_used": request.use_constraints
        #         }
        #     )
        # else:
        #     saved_ids = []
        saved_ids = []
        
        # Calculate best models
        best_models = {}
        if all_results:
            best_models["by_mape"] = min(all_results, key=lambda x: x["mape_test"])["model_id"]
            best_models["by_r2"] = max(all_results, key=lambda x: x["r2"])["model_id"]
            best_models["by_aic"] = min(all_results, key=lambda x: x["aic"])["model_id"]
        
        execution_time = (datetime.now() - start_time).total_seconds()
        
        return MarketingModelTrainingResponse(
            training_id=training_id,
            status="success",
            models_trained=len(all_results),
            summary={
                "combinations_processed": combinations_processed,
                "model_types": [mt.value for mt in request.model_types],
                "y_variables": request.y_variables,
                "constraints_applied": request.use_constraints,
                "total_constraints": len(request.variable_constraints) if request.use_constraints else 0
            },
            best_models=best_models,
            execution_time_seconds=execution_time
        )
        
    except Exception as e:
        logger.error(f"Error in model training: {e}")
        raise HTTPException(status_code=500, detail=str(e))




# @router.post("/marketing/calculate-elasticity", response_model=MarketingElasticityResponse, tags=["Marketing Mix Modeling"])
# async def calculate_marketing_elasticity(request: MarketingElasticityRequest):
    """Calculate elasticities for marketing models."""
    try:
        # Get model results
        # results = await get_marketing_results(request.run_id)
        results = []
        
        if not results:
            raise HTTPException(status_code=404, detail=f"No results found for run_id: {request.run_id}")
        
        # Filter by model IDs if specified
        if request.model_ids:
            results = [r for r in results if r.get("model_id") in request.model_ids]
        
        # Get transformation metadata from first result
        transform_id = results[0].get("transform_id")
        if not transform_id:
            raise HTTPException(status_code=400, detail="No transform_id found in results")
            
        # transform_metadata = await get_transformation_metadata(transform_id)
        transform_metadata = {}
        
        updated_results = []
        elasticity_summary = {}
        contribution_summary = {}
        
        for result in results:
            elasticities = {}
            contributions = {}
            
            # Calculate elasticity for each media variable
            for media_var in transform_metadata.get("media_variables", []):
                beta_col = f"{media_var}_transformed"
                if beta_col in result.get("coefficients", {}):
                    beta = result["coefficients"][beta_col]
                    
                    # Get transformation parameters
                    params = transform_metadata.get("transformation_params", {}).get(media_var, [])
                    
                    if transform_metadata["transformation_type"] == "logistic" and len(params) >= 3:
                        growth_rate = params[0]
                        carryover = params[1]
                        midpoint = params[2]
                        
                        # Calculate sensitivity at midpoint
                        sensitivity = midpoint * (1 - midpoint)
                        
                        # Get y_mean from stored result
                        y_mean = result.get("y_mean", 1)
                        
                        # Calculate elasticity
                        # elasticity = calculate_media_elasticity(
                        #     beta, growth_rate, sensitivity, carryover, y_mean
                        # )
                        elasticity = 0.0
                        
                        elasticities[media_var] = float(elasticity) if not np.isnan(elasticity) else None
            
            # Calculate contributions if requested
            if request.include_contributions:
                # Get variable means from transform metadata
                variable_means = {}
                for var, stats in transform_metadata.get("variable_stats", {}).items():
                    # Get mean for the specific region
                    region = result.get("region")
                    if region and region in stats:
                        variable_means[var] = stats[region].get("mean", 0)
                
                # Calculate contributions
                # contributions = calculate_contributions(
                #     result.get("coefficients", {}),
                #     variable_means
                # )
                contributions = {}
            
            # Update result with elasticities
            result["elasticities"] = elasticities
            if contributions:
                result["contributions"] = contributions
            
            # Update summaries
            elasticity_summary[result["model_id"]] = elasticities
            if contributions:
                contribution_summary[result["model_id"]] = {
                    k: v for k, v in contributions.items() 
                    if not k.endswith("_pct")
                }
            
            updated_results.append(result)
        
        # Update MongoDB with elasticities and contributions
        for result in updated_results:
            await build_collection.update_one(
                {"_id": f"marketing_{request.run_id}_{result['model_id']}"},
                {"$set": {
                    "elasticities": result.get("elasticities", {}),
                    "contributions": result.get("contributions", {})
                }}
            )
        
        return MarketingElasticityResponse(
            status="success",
            models_updated=len(updated_results),
            elasticity_summary=elasticity_summary,
            contribution_summary=contribution_summary if request.include_contributions else None
        )
        
    except Exception as e:
        logger.error(f"Error calculating elasticities: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    
    
    

# @router.get("/marketing/results/{run_id}", response_model=List[MarketingModelResult], tags=["Marketing Mix Modeling"])
# async def get_marketing_model_results(
#     run_id: str = Path(..., description="Training run ID"),
#     model_ids: Optional[List[int]] = Query(None, description="Filter by specific model IDs"),
#     brand: Optional[str] = Query(None, description="Filter by brand"),
#     region: Optional[str] = Query(None, description="Filter by region")
# ):
    """Retrieve marketing model results by run_id with optional filters."""
    try:
        # Get all results for run_id
        # results = await get_marketing_results(run_id)
        results = []
        
        if not results:
            raise HTTPException(status_code=404, detail=f"No results found for run_id: {run_id}")
        
        # Apply filters
        if model_ids:
            results = [r for r in results if r.get("model_id") in model_ids]
        
        if brand:
            results = [r for r in results if r.get("brand") == brand]
        
        if region:
            results = [r for r in results if r.get("region") == region]
        
        # Updated clean_float function that always returns a valid float
        def clean_float(value, default=0.0):
            if value is None:
                return default
            if isinstance(value, float):
                if np.isinf(value):
                    return 999999.0 if value > 0 else -999999.0
                elif np.isnan(value):
                    return default
            return float(value)
        
        # Convert to response model with better handling
        response_results = []
        for r in results:
            response_results.append(MarketingModelResult(
                model_id=r["model_id"],
                model_type=r["model_type"],
                brand=r["brand"],
                market=r.get("markets", []),
                region=[r.get("region", "")],
                y_variable=r["y_variable"],
                mape=clean_float(r.get("mape_test", r.get("mape", 0)), 0.0),
                r_squared=clean_float(r.get("r2", 0), 0.0),
                adjusted_r_squared=clean_float(r.get("adjusted_r2", 0), 0.0),
                aic=clean_float(r.get("aic", 0), 999999.0),
                bic=clean_float(r.get("bic", 0), 999999.0),
                coefficients={k: clean_float(v) for k, v in r.get("coefficients", {}).items()},
                contributions=r.get("contributions"),
                elasticities=r.get("elasticities"),
                transformation_params=r.get("transformation_params", {}),
                standardization_method=r.get("standardization_method", "none"),
                created_at=r.get("created_at", datetime.now()),
                training_id=run_id
            ))
        
        return response_results
        
    except Exception as e:
        logger.error(f"Error retrieving results: {e}")
        raise HTTPException(status_code=500, detail=str(e))




# @router.get("/marketing/download/{file_path:path}", tags=["Marketing Mix Modeling"])
# async def download_marketing_export(
#     file_path: str = Path(..., description="Export file path")
# ):
    """Download exported marketing results file (Excel or CSV)."""
    pass  # Marketing functions disabled


@router.post("/get_columns", tags=["Columns"])
async def get_columns(
    scope: str = Form(...),
    combination: str = Form(...)
):
    """
    Get numerical columns from a specific scope and combination file.
    
    - **scope**: Scope number (e.g., "1", "2", "3")
    - **combination**: Combination name (e.g., "Channel_Convenience_Variant_Flavoured_Brand_HEINZ_Flavoured_PPG_Small_Single")
    """
    try:
        if minio_client is None:
            raise HTTPException(status_code=503, detail="MinIO not available")
        
        # Get the standard prefix using get_object_prefix from scope_selector
        # Since we can't import it directly, we'll construct the path manually
        # The scope selector saves files to: {prefix}filtered-data/{scope_id}/Scope_{scope_number}_{combination}_{timestamp}.arrow
        
        # We need to find the actual scope files in MinIO
        # The scope selector saves files to the 'trinity' bucket, not 'dataformodel'
        # Let's search for files that match the pattern
        try:
            # List objects in the 'trinity' bucket to find matching files
            # We need to use the same bucket that the scope selector uses
            trinity_bucket = "trinity"  # This should match the scope selector's bucket
            
            # List objects in the trinity bucket to find matching files
            objects = minio_client.list_objects(
                trinity_bucket,
                recursive=True
            )
            
            # Log all available files for debugging
            all_files = list(objects)
            logger.info(f"Found {len(all_files)} files in {trinity_bucket} bucket")
            arrow_files = [obj.object_name for obj in all_files if obj.object_name.endswith('.arrow')]
            logger.info(f"Found {len(arrow_files)} Arrow files: {arrow_files[:10]}...")  # Show first 10
            
            # Look for files that match the pattern: Scope_{scope}_{combination}_*.arrow
            target_file_key = None
            logger.info(f"Searching for files with Scope_{scope}_ and combination: {combination}")
            
            for obj in all_files:
                if obj.object_name.endswith('.arrow'):
                    logger.debug(f"Checking file: {obj.object_name}")
                    # Check if this file matches our scope and combination
                    if f"Scope_{scope}_" in obj.object_name and combination in obj.object_name:
                        target_file_key = obj.object_name
                        logger.info(f"Found exact match: {target_file_key}")
                break
        
            if not target_file_key:
                # If no exact match, try to find any file with the scope number
                logger.info(f"No exact match found, looking for any file with Scope_{scope}_")
                for obj in all_files:
                    if obj.object_name.endswith('.arrow') and f"Scope_{scope}_" in obj.object_name:
                        target_file_key = obj.object_name
                        logger.info(f"Found scope match: {target_file_key}")
                        break
            
            if not target_file_key:
                raise HTTPException(
                    status_code=404, 
                    detail=f"No files found for Scope {scope} with combination {combination}"
                )
            
            logger.info(f"Found file: {target_file_key}")
            
            # Read the file from MinIO
            response = minio_client.get_object(trinity_bucket, target_file_key)
            file_data = response.read()
            response.close()
            response.release_conn()
            
            # Read Arrow file to get columns
            import io
            import pyarrow as pa
            import pyarrow.ipc as ipc
            
            try:
                # Read Arrow file
                reader = ipc.RecordBatchFileReader(pa.BufferReader(file_data))
                table = reader.read_all()
                df = table.to_pandas()
            except Exception as arrow_error:
                logger.warning(f"Failed to read as Arrow, trying CSV: {arrow_error}")
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
            
        except Exception as e:
            logger.error(f"Error reading file {target_file_key}: {e}")
            raise HTTPException(status_code=500, detail=f"Error reading file: {str(e)}")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_columns: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/get_file_path", tags=["File Path"])
async def get_file_path(
    scope: str = Form(...),
    combination: str = Form(...)
):
    """
    Get the actual file path for a specific scope and combination.
    
    - **scope**: Scope number (e.g., "1", "2", "3")
    - **combination**: Combination name (e.g., "Channel_Convenience_Variant_Flavoured_Brand_HEINZ_Flavoured_PPG_Small_Single")
    """
    try:
        if minio_client is None:
            raise HTTPException(status_code=503, detail="MinIO not available")
        
        # Use the same logic as get_columns to find the file
        trinity_bucket = "trinity"
        
        # List objects in the trinity bucket to find matching files
        objects = minio_client.list_objects(
            trinity_bucket,
            recursive=True
        )
        
        # Look for files that match the pattern: Scope_{scope}_{combination}_*.arrow
        target_file_key = None
        
        for obj in objects:
            if obj.object_name.endswith('.arrow'):
                # Check if this file matches our scope and combination
                if f"Scope_{scope}_" in obj.object_name and combination in obj.object_name:
                    target_file_key = obj.object_name
                    break
        
        if not target_file_key:
            # If no exact match, try to find any file with the scope number
            for obj in objects:
                if obj.object_name.endswith('.arrow') and f"Scope_{scope}_" in obj.object_name:
                    target_file_key = obj.object_name
                    break
        
        if not target_file_key:
            raise HTTPException(
                status_code=404, 
                detail=f"No files found for Scope {scope} with combination {combination}"
            )
        
        # Return the file path that can be used with the dataframe viewer
        return {
            "file_path": target_file_key,
            "scope": scope,
            "combination": combination
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_file_path: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Elasticity and contribution endpoints removed - using direct calculation in train-models-direct instead