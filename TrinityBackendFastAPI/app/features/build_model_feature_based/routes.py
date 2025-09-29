from fastapi import APIRouter, HTTPException, Query, Path, Form, Body, Request
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
    file_exists, 
    presign,
    get_scope_combinations,
    fetch_scope_by_id,
    get_scope_set_with_columns,
    train_models_for_combination_enhanced,  # Use enhanced version
    save_model_results_enhanced, export_results_to_csv_and_minio, get_csv_from_minio ,save_marketing_model_results,
)

# Import get_minio_client from scope_selector deps
from ..scope_selector.deps import get_minio_client

# Import get_object_prefix for dynamic path construction
from ..data_upload_validate.app.routes import get_object_prefix

# Import MongoDB saver functions
from .mongodb_saver import save_build_config, get_build_config_from_mongo, get_scope_config_from_mongo, get_combination_column_values

# Import stack model training
from .stack_model_training import StackModelTrainer
from .mmm_stack_training import MMMStackModelDataProcessor





# Schema imports
from .schemas import (
    CombinationList, 
    Health,
    ModelResultDocument,
    ScopeDetail,
    ScopeSetColumns,
    ScopeSetRequest,
    ModelTrainingResponse,
    ModelTrainingRequest,
    CombinationModelResults,
    ModelResult,
    StackModelTrainingResponse,
    CombinationBetasResponse
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
from .database import (
    minio_client,
    marketing_collection,
    metadata_collection,
    save_marketing_model_results,
    get_marketing_results
)

# Marketing-specific imports
from .schemas import (
    # Marketing Mix schemas
    MarketingDataPreparationRequest,
    MarketingDataPreparationResponse,
    MarketingTransformationRequest,
    MarketingTransformationResponse,
    MarketingModelTrainingRequest,
    MarketingModelTrainingResponse,
    MarketingElasticityRequest,
    MarketingElasticityResponse,
    MarketingExportResponse,
    MarketingModelResult,
    MarketingModelType,
    TransformationType,
    StandardizationMethod
)
from .stack_model_data import StackModelDataProcessor

# Elasticity and contribution imports - removed unused imports since we're using direct calculation

# Global progress tracking
training_progress = {}

# Logger setup
logger = logging.getLogger(__name__)






router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/health", response_model=Health, tags=["Health"])
async def health():
    """Check health status of Build Atom API."""
    mongo_ok = scopes_collection is not None
    
    # Test MinIO
    minio_ok = False
    try:
        if minio_client is not None:
            minio_client.bucket_exists(settings.minio_bucket_name)
            minio_ok = True
    except Exception as e:
        logger.error(f"MinIO health check failed: {e}")
        minio_ok = False
    
    return Health(
        status="healthy" if (mongo_ok and minio_ok) else "unhealthy",
        timestamp=datetime.now(),
        services={
            "mongodb": {"status": "connected" if mongo_ok else "disconnected"},
            "minio": {"status": "connected" if minio_ok else "disconnected"},
        },
        version=settings.app_version,
        api=settings.app_name,
    )

@router.get("/scopes/{scope_id}", response_model=ScopeDetail, tags=["Scopes"])
async def get_scope_by_id(
    scope_id: str = Path(..., description="Scope ID from MongoDB")
):
    """
    Get scope details and combinations by scope ID.
    The scope_id can be either the MongoDB _id or the scope_id field.
    """
    if scopes_collection is None:
        raise HTTPException(
            status_code=503,
            detail="MongoDB connection not available"
        )
    
    try:
        scope_data = await get_scope_combinations(scope_id)
        
        if scope_data is None:
            raise HTTPException(
                status_code=404,
                detail=f"Scope with ID '{scope_id}' not found"
            )
        
        return scope_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching scope {scope_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching scope: {str(e)}"
        )

@router.get("/scopes", response_model=List[ScopeDetail], tags=["Scopes"])
async def list_all_scopes(
    limit: int = Query(10, ge=1, le=100, description="Maximum number of scopes"),
    skip: int = Query(0, ge=0, description="Number of scopes to skip")
):
    """List all available scopes with their combinations."""
    if scopes_collection is None:
        raise HTTPException(
            status_code=503,
            detail="MongoDB connection not available"
        )
    
    try:
        scopes = []
        cursor = scopes_collection.find({}).skip(skip).limit(limit)
        
        async for scope_doc in cursor:
            scope_id = str(scope_doc.get("_id", scope_doc.get("scope_id", "")))
            scope_data = await get_scope_combinations(scope_id)
            if scope_data:
                scopes.append(scope_data)
        
        return scopes
        
    except Exception as e:
        logger.error(f"Error listing scopes: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error listing scopes: {str(e)}"
        )

@router.get("/", tags=["Info"])
async def root():
    """Root endpoint for Build Atom API."""
    return {
        "message": f"Welcome to {settings.app_name}",
        "version": settings.app_version,
        "documentation": "/docs",
        "endpoints": {
            "health": "/api/v1/health",
            "get_scope": "/api/v1/scopes/{scope_id}",
            "list_scopes": "/api/v1/scopes",
            "get_scope_set": "/api/v1/scopes/{scope_id}/sets/{set_name}",
            "list_scope_sets": "/api/v1/scopes/{scope_id}/sets"
        }
    }





# Add to routes.py

@router.get("/scopes/{scope_id}/sets/{set_name}", response_model=ScopeSetColumns, tags=["Scopes"])
async def get_scope_set_details(
    scope_id: str = Path(..., description="Scope ID from MongoDB"),
    set_name: str = Path(..., description="Set name (e.g., Scope_1, Scope_2, Scope_3)")
):
    """
    Get combinations for a specific scope and set_name, along with column information.
    
    This endpoint:
    1. Filters combinations by the specified set_name
    2. Reads the first CSV file to extract column names
    3. Returns filtered combinations with column structure
    """
    if scopes_collection is None:
        raise HTTPException(
            status_code=503,
            detail="MongoDB connection not available"
        )
    
    try:
        scope_set_data = await get_scope_set_with_columns(scope_id, set_name)
        
        if scope_set_data is None:
            raise HTTPException(
                status_code=404,
                detail=f"Scope '{scope_id}' with set '{set_name}' not found or has no combinations"
            )
        
        return scope_set_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching scope set {scope_id}/{set_name}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching scope set: {str(e)}"
        )

@router.get("/scopes/{scope_id}/sets", response_model=List[str], tags=["Scopes"])
async def list_scope_sets(
    scope_id: str = Path(..., description="Scope ID from MongoDB")
):
    """
    List all available set names for a given scope.
    """
    if scopes_collection is None:
        raise HTTPException(
            status_code=503,
            detail="MongoDB connection not available"
        )
    
    try:
        scope_doc = await fetch_scope_by_id(scope_id)
        
        if scope_doc is None:
            raise HTTPException(
                status_code=404,
                detail=f"Scope '{scope_id}' not found"
            )
        
        # Extract unique set names
        set_names = set()
        for fset in scope_doc.get("filter_set_results", []):
            set_name = fset.get("set_name", "")
            if set_name:
                set_names.add(set_name)
        
        return sorted(list(set_names))
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing scope sets: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error listing scope sets: {str(e)}"
        )




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

@router.get("/pool-identifiers/{scope_id}", tags=["Pool Regression"])
async def get_pool_identifiers(scope_id: str):
    """
    Get pool identifiers (Channel, Brand, PPG) from scope selector metadata.
    Uses the same pattern as train-models-direct API to fetch scope configuration.
    """
    try:
        logger.info(f"🔍 Fetching pool identifiers for scope_id: {scope_id}")
        
        # Get the object prefix using the same function as train-models-direct
        prefix = await get_object_prefix(scope_id)
        logger.info(f"📁 Retrieved prefix: {prefix}")
        
        if not prefix:
            raise HTTPException(
                status_code=404,
                detail=f"Could not find prefix for scope_id: {scope_id}"
            )
        
        identifiers = []
        try:
            # Extract client, app, project from prefix (same pattern as train-models-direct)
            prefix_parts = prefix.strip('/').split('/')
            
            if len(prefix_parts) >= 2:
                client_name = prefix_parts[0]
                app_name = prefix_parts[1]
                project_name = prefix_parts[2] if len(prefix_parts) > 2 else "default_project"
                
                logger.info(f"🔍 Extracted: client={client_name}, app={app_name}, project={project_name}")
                
                # Get scope configuration from MongoDB (same function as train-models-direct)
                scope_config = await get_scope_config_from_mongo(client_name, app_name, project_name)
                
                if scope_config and 'identifiers' in scope_config:
                    identifiers = scope_config['identifiers']
                    logger.info(f"✅ Retrieved identifiers: {identifiers}")
                else:
                    logger.warning("⚠️ No identifiers found in scope config")
                    raise HTTPException(
                        status_code=404,
                        detail="No identifiers found in scope configuration"
                    )
            else:
                logger.warning(f"⚠️ Could not extract client/app/project from prefix: {prefix}")
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid prefix format: {prefix}"
                )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"❌ Failed to get identifiers from scope config: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Error fetching identifiers: {str(e)}"
            )
        
        return {
            "scope_id": scope_id,
            "prefix": prefix,
            "identifiers": identifiers
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error in get_pool_identifiers: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )

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
        scope_number = request.get('scope_number') 
        combinations = request.get('combinations', []) 
        x_variables = request.get('x_variables', [])
        y_variable = request.get('y_variable')
        standardization = request.get('standardization', 'none')
        k_folds = request.get('k_folds', 5)
        models_to_run = request.get('models_to_run')
        
        # Individual modeling parameters
        individual_modeling = request.get('individual_modeling', True)
        individual_k_folds = request.get('individual_k_folds', 5)
        individual_test_size = request.get('individual_test_size', 0.2)
        individual_models_to_run = request.get('individual_models_to_run', [])
        individual_custom_model_configs = request.get('individual_custom_model_configs', [])
        # Convert list to dictionary for individual model configs
        if isinstance(individual_custom_model_configs, list):
            individual_custom_model_configs = {config.get('id', ''): config for config in individual_custom_model_configs if config.get('id')}
        
        # Stack modeling parameters
        stack_modeling = request.get('stack_modeling', False)
        stack_k_folds = request.get('stack_k_folds', 5)
        stack_test_size = request.get('stack_test_size', 0.2)
        stack_models_to_run = request.get('stack_models_to_run', [])
        stack_custom_model_configs = request.get('stack_custom_model_configs', [])
        # Convert list to dictionary for stack model configs
        if isinstance(stack_custom_model_configs, list):
            stack_custom_model_configs = {config.get('id', ''): config for config in stack_custom_model_configs if config.get('id')}
        pool_by_identifiers = request.get('pool_by_identifiers', [])
        # Clustering is automatically enabled when stack modeling is enabled
        apply_clustering = stack_modeling  # True if stack_modeling is True, False otherwise
        numerical_columns_for_clustering = request.get('numerical_columns_for_clustering', [])
        n_clusters = request.get('n_clusters', None)
        apply_interaction_terms = request.get('apply_interaction_terms', True)
        numerical_columns_for_interaction = request.get('numerical_columns_for_interaction', [])
        

        
        if not scope_number or not combinations or not x_variables or not y_variable:
            raise HTTPException(
                status_code=400,
                detail="Missing required parameters: scope_number, combinations, x_variables, or y_variable"
            )
        
        # Validate individual modeling parameters if individual modeling is enabled
        if individual_modeling:
            if not individual_models_to_run:
                raise HTTPException(
                    status_code=400,
                    detail="individual_models_to_run is required when individual_modeling is enabled"
                )
        
        if stack_modeling:
            if not stack_models_to_run:
                raise HTTPException(
                    status_code=400,
                    detail="stack_models_to_run is required when stack_modeling is enabled"
                )
            if not pool_by_identifiers:
                raise HTTPException(
                    status_code=400,
                    detail="pool_by_identifiers is required when stack_modeling is enabled"
                )
            if apply_clustering and not numerical_columns_for_clustering:
                raise HTTPException(
                    status_code=400,
                    detail="numerical_columns_for_clustering is required when apply_clustering is enabled"
                )
        
        # Find files in MinIO based on scope number and combinations
        minio_client = get_minio_client()
        
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
        individual_models_count = len(individual_models_to_run) if individual_modeling and individual_models_to_run else 0
        stack_models_count = len(stack_models_to_run) if stack_modeling and stack_models_to_run else 0
        total_models = individual_models_count + stack_models_count
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
                        
                        # Convert all column names to lowercase for consistent matching
                        original_columns = df.columns.tolist()
                        df.columns = df.columns.str.lower()
                        logger.info(f"Converted columns to lowercase: {original_columns} -> {df.columns.tolist()}")
                        
                        # Update progress - validating variables
                        training_progress[run_id]["current_model"] = "Validating variables..."
                        await asyncio.sleep(0.2)
                        
                        # Validate variables exist in the data
                        available_columns = df.columns.tolist()
                        # Convert x_variables and y_variable to lowercase for consistent matching
                        x_variables_lower = [var.lower() for var in x_variables]
                        y_variable_lower = y_variable.lower()
                        all_variables = x_variables_lower + [y_variable_lower]
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
                    
                    # Train individual models for this combination (if individual modeling is enabled)
                    model_results = []
                    variable_data = {}
                    
                    if individual_modeling and individual_models_to_run:
                        logger.info(f"Training individual models for combination {combination}")
                        model_results, variable_data = await train_models_for_combination_enhanced(
                            file_key=target_file_key,
                            x_variables=x_variables_lower,  # Use lowercase variables
                            y_variable=y_variable_lower,    # Use lowercase variable
                            price_column=None,  # Can be enhanced later
                            standardization=standardization,
                            models_to_run=individual_models_to_run,  # Use individual models
                            custom_configs=individual_custom_model_configs,  # Use individual configs
                            test_size=0.2,  # Use train/test split
                            k_folds=individual_k_folds,  # Global k_folds for CV models
                            bucket_name=bucket_name  # Pass the correct bucket name
                        )
                    
                    # Update progress - completed individual models for this combination
                    if individual_modeling and individual_models_to_run:
                        training_progress[run_id]["current"] += individual_models_count
                        training_progress[run_id]["percentage"] = int((training_progress[run_id]["current"] / training_progress[run_id]["total"]) * 100)
                    
                    
                    for model_result in model_results:
                        fold_elasticities = []
                        if 'fold_results' in model_result:
                            for fold in model_result['fold_results']:
                                if fold.get('price_elasticity') is not None:
                                    fold_elasticities.append(fold['price_elasticity'])
                        
                        if fold_elasticities:
                            model_result['fold_elasticities'] = fold_elasticities

                    all_variable_stats[combination] = variable_data

                    logger.info(f"Starting elasticity calculation for combination {combination}")
                    for model_result in model_results:
                        try:
                            coefficients = model_result.get('coefficients', {})
                            variable_averages = variable_data.get('variable_averages', {})
                            
                            transform_data = None
                            try:
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
                            

                            elasticities = {}
                            contributions = {}
                            
                            unstandardized_coeffs = model_result.get('unstandardized_coefficients', {})
                            
                            # For each X variable, calculate elasticity and contribution
                            for x_var in x_variables_lower:  # Use lowercase variables
                                beta_key = f"Beta_{x_var}"
                                x_mean = variable_averages.get(x_var, 0)
                                y_mean = variable_averages.get(y_variable_lower, 0)  # Use lowercase variable
                                
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
                                "file_key": target_file_key,
                                "filename": target_file_key.split('/')[-1],
                                "set_name": f"Scope_{scope_number}",
                                "record_count": len(df)
                            },
                            model_results=model_results,
                            x_variables=x_variables_lower,
                            y_variable=y_variable_lower,
                            price_column=None,
                            standardization=standardization,
                            test_size=0.2,
                            run_id=run_id,
                            variable_data=variable_data
                        )

                        total_saved += len(saved_ids)
                        
                    except Exception as e:
                        logger.error(f"Failed to save results for {combination}: {e}")
                    

                    
                    combination_results.append({
                        "combination_id": combination,
                        "file_key": target_file_key,
                        "total_records": len(df),
                        "model_results": model_results
                    })
                    
                    # Update progress - combination completed
                    training_progress[run_id]["completed_combinations"] += 1
                    
                else:
                    logger.warning(f"Could not find file for combination: {combination}")
                    continue
                    
            except Exception as e:
                logger.error(f"Error processing combination {combination}: {e}")
                continue
        

        
        # Add stack modeling results if requested (even if individual models failed)
        if stack_modeling:
            try:
                logger.info(f"🚀 Starting stack modeling for {len(combinations)} combinations")
                logger.info(f"Stack modeling parameters:")
                logger.info(f"  - pool_by_identifiers: {pool_by_identifiers}")
                logger.info(f"  - apply_clustering: {apply_clustering}")
                logger.info(f"  - numerical_columns_for_clustering: {numerical_columns_for_clustering}")
                logger.info(f"  - apply_interaction_terms: {apply_interaction_terms}")
                logger.info(f"  - numerical_columns_for_interaction: {numerical_columns_for_interaction}")
                
                # Import StackModelTrainer
                from .stack_model_training import StackModelTrainer
                stack_trainer = StackModelTrainer()
                logger.info("✅ StackModelTrainer imported successfully")

                x_variables_lower_stack = [var.lower() for var in x_variables]
                y_variable_lower_stack = y_variable.lower()
                
                individual_metrics = await stack_trainer.calculate_individual_combination_metrics(
                    scope_number=scope_number,
                    combinations=combinations,
                    pool_by_identifiers=pool_by_identifiers,
                    x_variables=x_variables_lower_stack,
                    y_variable=y_variable_lower_stack,
                    minio_client=minio_client,
                    bucket_name=bucket_name,
                    apply_clustering=apply_clustering,
                    numerical_columns_for_clustering=numerical_columns_for_clustering,
                    n_clusters=n_clusters,
                    apply_interaction_terms=apply_interaction_terms,
                    numerical_columns_for_interaction=numerical_columns_for_interaction,
                    standardization=standardization,
                    k_folds=stack_k_folds,  # Use stack K-folds
                    models_to_run=stack_models_to_run,  # Use stack models
                    custom_configs=stack_custom_model_configs,  # Use stack configs
                    price_column=None,
                    run_id=run_id
                )
                
                logger.info(f"📊 Stack modeling call completed. Status: {individual_metrics.get('status', 'unknown')}")
                logger.info(f"Individual metrics keys: {list(individual_metrics.keys())}")
                
                # Update progress for stack modeling completion
                if stack_models_count > 0:
                    training_progress[run_id]["current"] += stack_models_count * total_combinations
                    training_progress[run_id]["percentage"] = int((training_progress[run_id]["current"] / training_progress[run_id]["total"]) * 100)
                
                if individual_metrics.get('status') == 'success':
                    logger.info(f"Stack modeling completed successfully for {len(individual_metrics.get('individual_combination_metrics', {}))} combinations")
                    
                    # Convert stack results to combination_results format
                    for combination, metrics in individual_metrics.get('individual_combination_metrics', {}).items():
                        if 'error' in metrics:
                            logger.warning(f"Skipping combination {combination} due to error: {metrics['error']}")
                            continue
                        
                        stack_model_results = []
                        for model_name, model_metrics in metrics.items():
                            if 'error' in model_metrics:
                                continue
                            
                            # Create model result in the same format as individual models
                            stack_model_result = {
                                "model_name": f"stack_{model_name}",  # Add stack prefix
                                "mape_train": model_metrics.get('mape_train', 0.0),
                                "mape_test": model_metrics.get('mape_test', 0.0),
                                "r2_train": model_metrics.get('r2_train', 0.0),
                                "r2_test": model_metrics.get('r2_test', 0.0),
                                "mape_train_std": 0.0,  # Not available in stack modeling
                                "mape_test_std": 0.0,   # Not available in stack modeling
                                "r2_train_std": 0.0,    # Not available in stack modeling
                                "r2_test_std": 0.0,     # Not available in stack modeling
                                "coefficients": {f"Beta_{var}": coef for var, coef in model_metrics.get('betas', {}).get('coefficients', {}).items()},
                                "standardized_coefficients": {f"Beta_{var}": coef for var, coef in model_metrics.get('standardized_betas', {}).items()},
                                "intercept": model_metrics.get('betas', {}).get('intercept', 0.0),
                                "n_parameters": len(x_variables) + 1,  # +1 for intercept
                                "aic": model_metrics.get('aic', 0.0),
                                "bic": model_metrics.get('bic', 0.0),
                                "price_elasticity": None,  # Not calculated in stack modeling
                                "price_elasticity_std": None,
                                "elasticity_calculated": False,
                                "csf": None,
                                "mcv": None,
                                "ppu_at_elasticity": None,
                                "fold_results": [],  # Not available in stack modeling
                                "train_size": model_metrics.get('train_size', 0),
                                "test_size": model_metrics.get('test_size', 0),
                                "elasticities": model_metrics.get('elasticities', {}),
                                "contributions": model_metrics.get('contributions', {}),
                                "elasticity_details": {
                                    "calculation_method": "stack_modeling",
                                    "variables_processed": list(model_metrics.get('elasticities', {}).keys()),
                                    "transform_data_used": False
                                },
                                "contribution_details": {
                                    "calculation_method": "stack_modeling",
                                    "variables_processed": list(model_metrics.get('contributions', {}).keys()),
                                    "total_contribution": sum(model_metrics.get('contributions', {}).values()),
                                    "transform_data_used": False
                                },
                                # Auto-tuning results
                                "best_alpha": model_metrics.get('best_alpha', None),
                                "best_cv_score": model_metrics.get('best_cv_score', None),
                                "best_l1_ratio": model_metrics.get('best_l1_ratio', None)
                            }
                            stack_model_results.append(stack_model_result)
                        
                        if stack_model_results:
                            # Find existing combination entry and merge stack models into it
                            existing_combination = None
                            for combo_result in combination_results:
                                if combo_result.get('combination_id') == combination:
                                    existing_combination = combo_result
                                    break
                            
                            if existing_combination:
                                # Merge stack models into existing combination's model_results
                                existing_combination['model_results'].extend(stack_model_results)
                                logger.info(f"Merged {len(stack_model_results)} stack models into existing combination {combination}")
                                # Note: Don't increment completed_combinations here as it was already counted for individual models
                            else:
                                # If no existing combination found, create a new entry (fallback)
                                # Add stack model results as new combination entry (fallback case)
                                combination_results.append({
                                    "combination_id": combination,
                                    "file_key": f"stack_model_{combination}",  # Virtual file key for stack models
                                    "total_records": model_metrics.get('individual_samples', 0),
                                    "model_results": stack_model_results
                                })
                                
                                # Update progress - combination completed (for stack-only mode)
                                training_progress[run_id]["completed_combinations"] += 1
                                
                                logger.info(f"Added {len(stack_model_results)} stack models as new combination {combination} (no existing entry found)")
                
                else:
                    logger.error(f"❌ Stack modeling failed: {individual_metrics.get('error', 'Unknown error')}")
                    # Add error details to combination_results for debugging
                    combination_results.append({
                        "combination_id": "stack_modeling_error",
                        "file_key": "stack_modeling_error",
                        "total_records": 0,
                        "model_results": [{
                            "model_name": "stack_modeling_error",
                            "error": individual_metrics.get('error', 'Unknown error'),
                            "mape_train": 0.0,
                            "mape_test": 0.0,
                            "r2_train": 0.0,
                            "r2_test": 0.0
                        }]
                    })
                    
            except Exception as e:
                logger.error(f"❌ Error in stack modeling: {e}")
                import traceback
                logger.error(f"Stack modeling traceback: {traceback.format_exc()}")
                # Add error details to combination_results for debugging
                combination_results.append({
                    "combination_id": "stack_modeling_exception",
                    "file_key": "stack_modeling_exception",
                    "total_records": 0,
                    "model_results": [{
                        "model_name": "stack_modeling_exception",
                        "error": str(e),
                        "mape_train": 0.0,
                        "mape_test": 0.0,
                        "r2_train": 0.0,
                        "r2_test": 0.0
                    }]
                })
        
        # Check if we have any results (individual or stack)
        if not combination_results:
            raise HTTPException(
                status_code=404,
                detail=f"No valid combinations found for scope {scope_number}. Individual models failed and stack modeling {'failed' if stack_modeling else 'not requested'}"
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
            
            # Get identifiers from scope configuration
            identifiers = []
            try:
                # Extract client, app, project from prefix
                prefix_parts = prefix.strip('/').split('/')
                
                if len(prefix_parts) >= 2:
                    client_name = prefix_parts[0]
                    app_name = prefix_parts[1]
                    project_name = prefix_parts[2] if len(prefix_parts) > 2 else "default_project"
                    
                    # Get scope configuration from MongoDB
                    scope_config = await get_scope_config_from_mongo(client_name, app_name, project_name)
                    
                    if scope_config and 'identifiers' in scope_config:
                        identifiers = scope_config['identifiers']
                        logger.info(f"✅ Retrieved identifiers: {identifiers}")
                    else:
                        logger.warning("⚠️ No identifiers found in scope config")
                else:
                    logger.warning(f"⚠️ Could not extract client/app/project from prefix: {prefix}")
            except Exception as e:
                logger.warning(f"❌ Failed to get identifiers from scope config: {e}")
                identifiers = []
            
            # Prepare data for MinIO storage
            
            # Create a summary DataFrame with key results
            summary_data = []
            for combo_result in combination_results:
                # Get variable averages for this combination
                combination_id = combo_result['combination_id']
                variable_averages = all_variable_stats.get(combination_id, {}).get('variable_averages', {})
                
                # Get column values for this combination from source file
                column_values = {}
                
                if identifiers and combo_result.get('file_key'):
                    try:
                        column_values = await get_combination_column_values(
                            minio_client, 
                            bucket_name, 
                            combo_result['file_key'], 
                            identifiers
                        )
                        logger.info(f"✅ Retrieved column values for {combination_id}: {column_values}")
                    except Exception as e:
                        logger.warning(f"❌ Failed to get column values for {combination_id}: {e}")
                        column_values = {identifier: "Unknown" for identifier in identifiers}
                else:
                    column_values = {identifier: "Unknown" for identifier in identifiers}
                
                for model_result in combo_result.get('model_results', []):
                    # Create base summary row
                    summary_row = {
                        'Scope': f'Scope_{scope_number}',
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
                        'timestamp': timestamp
                    }
                    
                    # Add identifier column values
                    for identifier in identifiers:
                        if identifier in column_values:
                            summary_row[f"{identifier}"] = column_values[identifier]
                        else:
                            summary_row[f"{identifier}"] = "Unknown"
                    
                    # Add average values for each variable (before any transformation)
                    for x_var in x_variables:
                        avg_key = f"{x_var}_avg"
                        # Use lowercase variable name for average lookup to match how averages are generated
                        summary_row[avg_key] = variable_averages.get(x_var.lower(), 0)
                    
                    # Add Y variable average
                    y_avg_key = f"{y_variable}_avg"
                    # Use lowercase variable name for Y variable average lookup to match how averages are generated
                    summary_row[y_avg_key] = variable_averages.get(y_variable.lower(), 0)
                    
                    # Add beta coefficients for each X-variable
                    coefficients = model_result.get('coefficients', {})
                    for x_var in x_variables:
                        beta_key = f"{x_var}_beta"
                        # Use lowercase variable name for coefficient lookup to match how coefficients are generated
                        summary_row[beta_key] = coefficients.get(f"Beta_{x_var.lower()}", 0)
                    
                    # Add elasticity values for each X-variable
                    elasticities = model_result.get('elasticities', {})
                    for x_var in x_variables:
                        elasticity_key = f"{x_var}_elasticity"
                        # Use lowercase variable name for elasticity lookup to match how elasticities are generated
                        summary_row[elasticity_key] = elasticities.get(x_var.lower(), 0)
                    
                    # Add contribution values for each X-variable
                    contributions = model_result.get('contributions', {})
                    for x_var in x_variables:
                        contribution_key = f"{x_var}_contribution"
                        # Use lowercase variable name for contribution lookup to match how contributions are generated
                        summary_row[contribution_key] = contributions.get(x_var.lower(), 0)
                    
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
        
        # Save the build configuration to MongoDB
        try:
            client_name = "default_client"
            app_name = "default_app"
            project_name = "default_project"
            
            # Try to extract from file paths if available
            if combination_results and len(combination_results) > 0:
                first_result = combination_results[0]
                if 'file_key' in first_result:
                    file_key = first_result['file_key']
                    # file_key format might be: "default_client/default_app/default_project/..."
                    file_key_parts = file_key.split('/')
                    if len(file_key_parts) >= 3:
                        client_name = file_key_parts[0]
                        app_name = file_key_parts[1]
                        project_name = file_key_parts[2]
            
            # Extract file keys and model coefficients from combination results
            combination_file_keys = []
            model_coefficients = {}
            
            for i, combo_result in enumerate(cleaned_combination_results):
                if 'file_key' in combo_result:
                    # Use the original combination from the combinations list
                    combination_name = combinations[i] if i < len(combinations) else f"combination_{i}"
                    combination_file_keys.append({
                        "combination": combination_name,
                        "file_key": combo_result['file_key']
                    })
                    
                    # Extract model coefficients for this combination
                    if 'model_results' in combo_result:
                        combination_coefficients = {}
                        for model_result in combo_result['model_results']:
                            model_name = model_result.get('model_name', 'unknown')
                            coefficients = model_result.get('coefficients', {})
                            intercept = model_result.get('intercept', 0)
                            
                            combination_coefficients[model_name] = {
                                "intercept": intercept,
                                "coefficients": coefficients,
                                "x_variables": x_variables,
                                "y_variable": y_variable
                            }
                        
                        model_coefficients[combination_name] = combination_coefficients
            
            # Prepare build configuration data
            build_config_data = {
                "run_id": run_id,
                "scope_number": scope_number,
                "combinations": combinations,
                "x_variables": x_variables,
                "y_variable": y_variable,
                "standardization": standardization,
                "k_folds": k_folds,
                "models_to_run": models_to_run,
                "total_combinations_processed": len(cleaned_combination_results),
                "total_models_saved": total_saved,
                # "variable_statistics": all_variable_stats,
                "combination_file_keys": combination_file_keys,
                "model_coefficients": model_coefficients,
                "created_at": datetime.now().isoformat(),
                "training_status": "completed"
            }
            
            # Save to MongoDB
            mongo_result = await save_build_config(
                client_name=client_name,
                app_name=app_name,
                project_name=project_name,
                build_data=build_config_data,
                user_id="",  # You can add user_id if available
                project_id=None  # You can add project_id if available
            )
            
    
            
            if mongo_result["status"] == "success":
                logger.info(f"📦 Build configuration saved to MongoDB: {mongo_result['mongo_id']}")
            else:
                logger.error(f"❌ Failed to save build configuration to MongoDB: {mongo_result['error']}")
        except Exception as e:
            logger.error(f"❌ Error saving build configuration to MongoDB: {str(e)}")
            # Don't fail the entire request if MongoDB save fails
        
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
                "variable_statistics": all_variable_stats,
                "modeling_type": "stack" if stack_modeling else "individual",
                "stack_modeling_enabled": stack_modeling,
                "stack_modeling_config": {
                    "pool_by_identifiers": pool_by_identifiers,
                    "apply_clustering": apply_clustering,
                    "apply_interaction_terms": apply_interaction_terms
                } if stack_modeling else None
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


@router.get("/model-results/download/{file_path:path}", tags=["Model Results"])
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


@router.get("/model-results/list-exports", tags=["Model Results"])
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



########################################################################

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

# ============================================================================
# SAVE ENDPOINTS
# ============================================================================

@router.post("/save-build-config")
async def save_build_configuration(
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name"),
    build_data: dict = Body(..., description="Build configuration data to save"),
    user_id: str = Query("", description="User ID"),
    project_id: int = Query(None, description="Project ID")
):
    """Save build configuration to MongoDB"""
    try:
        result = await save_build_config(
            client_name=client_name,
            app_name=app_name,
            project_name=project_name,
            build_data=build_data,
            user_id=user_id,
            project_id=project_id
        )
        
        if result["status"] == "success":
            return {
                "success": True,
                "message": f"Build configuration saved successfully",
                "mongo_id": result["mongo_id"],
                "operation": result["operation"],
                "collection": result["collection"]
            }
        else:
            raise HTTPException(status_code=500, detail=f"Failed to save build configuration: {result['error']}")
            
    except Exception as e:
        logger.error(f"Error saving build configuration: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to save build configuration: {str(e)}")

@router.get("/get-build-config")
async def get_build_configuration(
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name")
):
    """Retrieve saved build configuration from MongoDB"""
    try:
        result = await get_build_config_from_mongo(client_name, app_name, project_name)
        
        if result:
            return {
                "success": True,
                "data": result
            }
        else:
            return {
                "success": False,
                "message": "No build configuration found",
                "data": None
            }
            
    except Exception as e:
        logger.error(f"Error retrieving build configuration: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve build configuration: {str(e)}")

@router.post("/save")
async def save_build_data(
    request: Request,
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name"),
    user_id: str = Query("", description="User ID"),
    project_id: int = Query(None, description="Project ID")
):
    """General save endpoint for build data - used by SAVE button"""
    
    try:
        # Get the request body
        body = await request.json()
        
        # Save build configuration data
        result = await save_build_config(
            client_name=client_name,
            app_name=app_name,
            project_name=project_name,
            build_data=body,
            user_id=user_id,
            project_id=project_id
        )
        
        if result["status"] == "success":
            return {
                "success": True,
                "message": f"Build data saved successfully",
                "mongo_id": result["mongo_id"],
                "operation": result["operation"],
                "collection": result["collection"]
            }
        else:
            raise HTTPException(status_code=500, detail=f"Failed to save build data: {result['error']}")
            
    except Exception as e:
        logger.error(f"Error saving build data: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to save build data: {str(e)}")


        
    except Exception as e:
        logger.error(f"Error testing MongoDB connection: {str(e)}")
        return {
            "success": False,
            "error": str(e)
        }


@router.post("/stack-model/prepare-data", tags=["Stack Modeling"])
async def prepare_stack_model_data(request: dict):
    """
    Prepare pooled data for stack modeling without training models.
    This endpoint fetches data from multiple combinations and creates pooled datasets
    based on user-specified identifiers.
    """
    try:

        # Extract parameters from request
        scope_number = request.get('scope_number')
        combinations = request.get('combinations', [])
        pool_by_identifiers = request.get('pool_by_identifiers', [])
        x_variables = request.get('x_variables', [])
        y_variable = request.get('y_variable')
        
        # Clustering parameters (optional)
        apply_clustering = request.get('apply_clustering', False)
        numerical_columns_for_clustering = request.get('numerical_columns_for_clustering', [])
        n_clusters = request.get('n_clusters', None)
        
        # Interaction terms parameters (optional)
        apply_interaction_terms = request.get('apply_interaction_terms', True)
        identifiers_for_interaction = request.get('identifiers_for_interaction', [])
        numerical_columns_for_interaction = request.get('numerical_columns_for_interaction', [])
        
        # Validate required parameters
        if not scope_number:
            raise HTTPException(status_code=400, detail="scope_number is required")
        if not combinations:
            raise HTTPException(status_code=400, detail="combinations list is required")
        if not pool_by_identifiers:
            raise HTTPException(status_code=400, detail="pool_by_identifiers list is required")
        if not x_variables:
            raise HTTPException(status_code=400, detail="x_variables list is required")
        if not y_variable:
            raise HTTPException(status_code=400, detail="y_variable is required")
        
        # Validate clustering parameters if clustering is requested
        if apply_clustering:
            if not numerical_columns_for_clustering:
                raise HTTPException(status_code=400, detail="numerical_columns_for_clustering is required when apply_clustering is true")
            
            # Validate that numerical_columns_for_clustering is a subset of x_variables + y_variable
            all_numerical_columns = x_variables + [y_variable]
            invalid_clustering_columns = [col for col in numerical_columns_for_clustering if col not in all_numerical_columns]
            if invalid_clustering_columns:
                raise HTTPException(status_code=400, detail=f"numerical_columns_for_clustering must be a subset of x_variables + y_variable. Invalid columns: {invalid_clustering_columns}")
        
        # Validate interaction terms parameters if interaction terms are requested
        if apply_interaction_terms:
            # Interaction terms can only be applied when clustering is also applied
            if not apply_clustering:
                raise HTTPException(status_code=400, detail="apply_clustering must be true when apply_interaction_terms is true. Interaction terms are only created for split clustered data.")
            
            if not numerical_columns_for_interaction:
                raise HTTPException(status_code=400, detail="numerical_columns_for_interaction is required when apply_interaction_terms is true")
            
            # Validate that numerical_columns_for_interaction is a subset of x_variables + y_variable
            all_numerical_columns = x_variables + [y_variable]
            invalid_interaction_columns = [col for col in numerical_columns_for_interaction if col not in all_numerical_columns]
            if invalid_interaction_columns:
                raise HTTPException(status_code=400, detail=f"numerical_columns_for_interaction must be a subset of x_variables + y_variable. Invalid columns: {invalid_interaction_columns}")
        
        # Get MinIO client and bucket name
        minio_client = get_minio_client()
        bucket_name = "trinity"  # From config
        
        # Initialize the processor
        processor = StackModelDataProcessor()
        
        # Prepare the stacked data
        result = await processor.prepare_stack_model_data(
            scope_number=scope_number,
            combinations=combinations,
            pool_by_identifiers=pool_by_identifiers,
            x_variables=x_variables,
            y_variable=y_variable,
            minio_client=minio_client,
            bucket_name=bucket_name
        )
        
        # Apply clustering if requested
        if apply_clustering and result.get('status') == 'success':
            logger.info("Applying clustering to pooled data...")
            
            # Convert numerical columns to lowercase for consistent matching
            numerical_columns_for_clustering = [col.lower() for col in numerical_columns_for_clustering]
            
            # Convert interaction terms parameters to lowercase for consistent matching
            if apply_interaction_terms:
                numerical_columns_for_interaction = [col.lower() for col in numerical_columns_for_interaction]
            
            # Get the pooled data from the result
            pooled_data = result.get('pooled_data', {})
            
            # Apply clustering to the pooled data
            clustering_result = await processor.apply_clustering_to_stack_data(
                pooled_data=pooled_data,
                numerical_columns=numerical_columns_for_clustering,
                minio_client=minio_client,
                bucket_name=bucket_name,
                n_clusters=n_clusters,
                apply_interaction_terms=apply_interaction_terms,
                identifiers_for_interaction=None,  # Auto-detect identifiers
                numerical_columns_for_interaction=numerical_columns_for_interaction
            )
            
            # Add clustering information to the main result
            result['clustering_applied'] = True
            result['clustering_result'] = clustering_result
            result['numerical_columns_for_clustering'] = numerical_columns_for_clustering
            result['n_clusters'] = n_clusters
            
            # Update the pooled data with clustering results
            if clustering_result.get('status') == 'success':
                result['total_pools'] = len(clustering_result.get('clustered_pools', {}))
        else:
            result['clustering_applied'] = False
        
        # Interaction terms are only applied to split clustered data, not to original pooled data
        result['interaction_terms_applied'] = apply_interaction_terms and apply_clustering
        
        if 'pooled_data' in result:
            del result['pooled_data']
        
        logger.info("Stack model data preparation completed successfully")
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in stack model data preparation: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.post("/stack-model/train-models", response_model=StackModelTrainingResponse, tags=["Stack Modeling"])
async def train_models_for_stacked_data(request: dict):
    """
    Train models on stacked/clustered data using the same models as individual combinations.
    This endpoint works with the output from the prepare-data endpoint.
    """
    try:
        logger.info("Starting stack model training")
        logger.info(f"Request: {request}")
        
        # Extract parameters from request
        scope_number = request.get('scope_number')
        combinations = request.get('combinations', [])
        pool_by_identifiers = request.get('pool_by_identifiers', [])
        x_variables = request.get('x_variables', [])
        y_variable = request.get('y_variable')
        
        # Clustering parameters (optional)
        apply_clustering = request.get('apply_clustering', False)
        numerical_columns_for_clustering = request.get('numerical_columns_for_clustering', [])
        n_clusters = request.get('n_clusters', None)
        
        # Interaction terms parameters (optional)
        apply_interaction_terms = request.get('apply_interaction_terms', True)
        numerical_columns_for_interaction = request.get('numerical_columns_for_interaction', [])
        
        # Model training parameters
        standardization = request.get('standardization', 'none')
        k_folds = request.get('k_folds', 5)
        models_to_run = request.get('models_to_run', None)
        custom_configs = request.get('custom_model_configs', None)
        price_column = request.get('price_column', None)
        
        # Generate unique run ID
        run_id = request.get('run_id') or str(uuid.uuid4())
        
        # Validate required parameters
        if not scope_number:
            raise HTTPException(status_code=400, detail="scope_number is required")
        if not combinations:
            raise HTTPException(status_code=400, detail="combinations list is required")
        if not pool_by_identifiers:
            raise HTTPException(status_code=400, detail="pool_by_identifiers list is required")
        if not x_variables:
            raise HTTPException(status_code=400, detail="x_variables list is required")
        if not y_variable:
            raise HTTPException(status_code=400, detail="y_variable is required")
        
        # Validate clustering parameters if clustering is requested
        if apply_clustering:
            if not numerical_columns_for_clustering:
                raise HTTPException(status_code=400, detail="numerical_columns_for_clustering is required when apply_clustering is true")
            
            # Validate that numerical_columns_for_clustering is a subset of x_variables + y_variable
            all_numerical_columns = x_variables + [y_variable]
            invalid_clustering_columns = [col for col in numerical_columns_for_clustering if col not in all_numerical_columns]
            if invalid_clustering_columns:
                raise HTTPException(status_code=400, detail=f"numerical_columns_for_clustering must be a subset of x_variables + y_variable. Invalid columns: {invalid_clustering_columns}")
        
        # Validate interaction terms parameters if interaction terms are requested
        if apply_interaction_terms:
            # Interaction terms can only be applied when clustering is also applied
            if not apply_clustering:
                raise HTTPException(status_code=400, detail="apply_clustering must be true when apply_interaction_terms is true. Interaction terms are only created for split clustered data.")
            
            if not numerical_columns_for_interaction:
                raise HTTPException(status_code=400, detail="numerical_columns_for_interaction is required when apply_interaction_terms is true")
            
            # Validate that numerical_columns_for_interaction is a subset of x_variables + y_variable
            all_numerical_columns = x_variables + [y_variable]
            invalid_interaction_columns = [col for col in numerical_columns_for_interaction if col not in all_numerical_columns]
            if invalid_interaction_columns:
                raise HTTPException(status_code=400, detail=f"numerical_columns_for_interaction must be a subset of x_variables + y_variable. Invalid columns: {invalid_interaction_columns}")
        
        # Get MinIO client and bucket name
        minio_client = get_minio_client()
        bucket_name = "trinity"  # From config
        
        # Initialize the stack model trainer
        trainer = StackModelTrainer()
        
        # Train models using the dedicated trainer class
        result = await trainer.train_models_for_stacked_data(
            scope_number=scope_number,
            combinations=combinations,
            pool_by_identifiers=pool_by_identifiers,
            x_variables=x_variables,
            y_variable=y_variable,
            minio_client=minio_client,
            bucket_name=bucket_name,
            apply_clustering=apply_clustering,
            numerical_columns_for_clustering=numerical_columns_for_clustering,
            n_clusters=n_clusters,
            apply_interaction_terms=apply_interaction_terms,
            numerical_columns_for_interaction=numerical_columns_for_interaction,
            standardization=standardization,
            k_folds=k_folds,
            models_to_run=models_to_run,
            custom_configs=custom_configs,
            price_column=price_column,
            test_size=0.2,
            run_id=run_id
        )
        
        # Check if training was successful
        if hasattr(result, 'summary') and result.summary.get('status') == 'error':
            raise HTTPException(status_code=500, detail=result.summary.get('error', 'Unknown error'))
        
        logger.info("Stack model training completed successfully")
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in stack model training: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/stack-model/combination-betas", response_model=CombinationBetasResponse, tags=["Stack Modeling"])
async def get_combination_betas(request: dict):
    """
    Get final beta coefficients for each combination using pooled regression approach.
    This endpoint trains models and returns only the final betas (common + individual) for each combination.
    """
    try:
        logger.info("Starting combination betas calculation")
        logger.info(f"Request: {request}")
        
        # Extract parameters from request
        scope_number = request.get('scope_number')
        combinations = request.get('combinations', [])
        pool_by_identifiers = request.get('pool_by_identifiers', [])
        x_variables = request.get('x_variables', [])
        y_variable = request.get('y_variable')
        
        # Clustering parameters (optional)
        apply_clustering = request.get('apply_clustering', False)
        numerical_columns_for_clustering = request.get('numerical_columns_for_clustering', [])
        n_clusters = request.get('n_clusters', None)
        
        # Interaction terms parameters (optional)
        apply_interaction_terms = request.get('apply_interaction_terms', True)
        numerical_columns_for_interaction = request.get('numerical_columns_for_interaction', [])
        
        # Model training parameters
        standardization = request.get('standardization', 'none')
        k_folds = request.get('k_folds', 5)
        models_to_run = request.get('models_to_run', None)
        custom_configs = request.get('custom_model_configs', None)
        price_column = request.get('price_column', None)
        
        # Generate unique run ID
        run_id = request.get('run_id') or str(uuid.uuid4())
        
        # Validate required parameters
        if not scope_number:
            raise HTTPException(status_code=400, detail="scope_number is required")
        if not combinations:
            raise HTTPException(status_code=400, detail="combinations list is required")
        if not pool_by_identifiers:
            raise HTTPException(status_code=400, detail="pool_by_identifiers list is required")
        if not x_variables:
            raise HTTPException(status_code=400, detail="x_variables list is required")
        if not y_variable:
            raise HTTPException(status_code=400, detail="y_variable is required")
        
        # Validate clustering parameters if clustering is requested
        if apply_clustering and not numerical_columns_for_clustering:
            raise HTTPException(
                status_code=400, 
                detail="numerical_columns_for_clustering is required when apply_clustering is True"
            )
        
        # Validate interaction terms parameters if interaction terms are requested
        if apply_interaction_terms and not numerical_columns_for_interaction:
            raise HTTPException(
                status_code=400, 
                detail="numerical_columns_for_interaction is required when apply_interaction_terms is True"
            )
        
        # Get MinIO client
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
        
        # Initialize trainer
        trainer = StackModelTrainer()
        
        # Get combination betas using the dedicated trainer class
        result = await trainer.get_combination_betas(
            scope_number=scope_number,
            combinations=combinations,
            pool_by_identifiers=pool_by_identifiers,
            x_variables=x_variables,
            y_variable=y_variable,
            minio_client=minio_client,
            bucket_name=bucket_name,
            apply_clustering=apply_clustering,
            numerical_columns_for_clustering=numerical_columns_for_clustering,
            n_clusters=n_clusters,
            apply_interaction_terms=apply_interaction_terms,
            numerical_columns_for_interaction=numerical_columns_for_interaction,
            standardization=standardization,
            k_folds=k_folds,
            models_to_run=models_to_run,
            custom_configs=custom_configs,
            price_column=price_column,
            run_id=run_id
        )
        
        # Check if calculation was successful
        if hasattr(result, 'summary') and result.summary.get('status') == 'error':
            raise HTTPException(status_code=500, detail=result.summary.get('error', 'Unknown error'))
        
        logger.info("Combination betas calculation completed successfully")
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in combination betas calculation: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/stack-model/individual-combination-metrics", tags=["Stack Modeling"])
async def calculate_individual_combination_metrics(request: dict):

    try:  
        # Extract parameters from request
        scope_number = request.get('scope_number')
        combinations = request.get('combinations', [])
        pool_by_identifiers = request.get('pool_by_identifiers', [])
        x_variables = request.get('x_variables', [])
        y_variable = request.get('y_variable')
        
        # Clustering parameters (optional)
        apply_clustering = request.get('apply_clustering', False)
        numerical_columns_for_clustering = request.get('numerical_columns_for_clustering', [])
        n_clusters = request.get('n_clusters', None)
        
        # Interaction terms parameters (optional)
        apply_interaction_terms = request.get('apply_interaction_terms', True)
        numerical_columns_for_interaction = request.get('numerical_columns_for_interaction', [])
        
        # Model training parameters
        standardization = request.get('standardization', 'none')
        k_folds = request.get('k_folds', 5)
        models_to_run = request.get('models_to_run', None)
        custom_configs = request.get('custom_model_configs', None)
        price_column = request.get('price_column', None)
        
        # Generate unique run ID
        run_id = request.get('run_id') or str(uuid.uuid4())
        
        # Validate required parameters
        if not scope_number:
            raise HTTPException(status_code=400, detail="scope_number is required")
        if not combinations:
            raise HTTPException(status_code=400, detail="combinations list is required")
        if not pool_by_identifiers:
            raise HTTPException(status_code=400, detail="pool_by_identifiers list is required")
        if not x_variables:
            raise HTTPException(status_code=400, detail="x_variables list is required")
        if not y_variable:
            raise HTTPException(status_code=400, detail="y_variable is required")
        
        # Get MinIO client and bucket name
        from ..scope_selector.deps import get_minio_client
        from ..scope_selector.config import get_settings
        minio_client = get_minio_client()
        scope_settings = get_settings()
        bucket_name = scope_settings.minio_bucket
        
        # Initialize trainer
        trainer = StackModelTrainer()
        
        # Calculate individual combination metrics
        result = await trainer.calculate_individual_combination_metrics(
            scope_number=scope_number,
            combinations=combinations,
            pool_by_identifiers=pool_by_identifiers,
            x_variables=x_variables,
            y_variable=y_variable,
            minio_client=minio_client,
            bucket_name=bucket_name,
            apply_clustering=apply_clustering,
            numerical_columns_for_clustering=numerical_columns_for_clustering,
            n_clusters=n_clusters,
            apply_interaction_terms=apply_interaction_terms,
            numerical_columns_for_interaction=numerical_columns_for_interaction,
            standardization=standardization,
            k_folds=k_folds,
            models_to_run=models_to_run,
            custom_configs=custom_configs,
            price_column=price_column,
            run_id=run_id
        )
        
        # Check if calculation was successful
        if result.get('status') == 'error':
            raise HTTPException(status_code=500, detail=result.get('error', 'Unknown error'))
        
        logger.info("Individual combination metrics calculation completed successfully")
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in individual combination metrics calculation: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/mmm-train-models", response_model=ModelTrainingResponse, tags=["MMM Training"])
async def train_mmm_models(request: dict):

    try:
        # Generate unique run ID or use provided one
        run_id = request.get('run_id') or str(uuid.uuid4())
        logger.info(f"Starting MMM model training with run_id: {run_id}")
        
        # Extract parameters from request
        scope_number = request.get('scope_number')
        combinations = request.get('combinations', [])
        x_variables = request.get('x_variables', [])
        y_variable = request.get('y_variable')
        variable_configs = request.get('variable_configs', {})
        models_to_run = request.get('models_to_run', [])
        custom_model_configs = request.get('custom_model_configs', {})  # Updated to use same constraint approach
        # Convert list to dictionary for model configs (same as general models endpoint)
        if isinstance(custom_model_configs, list):
            custom_model_configs = {config.get('id', ''): config for config in custom_model_configs if config.get('id')}
        k_folds = request.get('k_folds', 5)
        test_size = request.get('test_size', 0.2)
        price_column = request.get('price_column')
        
        # Validation
        if not scope_number or not combinations or not x_variables or not y_variable:
            raise HTTPException(
                status_code=400,
                detail="Missing required parameters: scope_number, combinations, x_variables, or y_variable"
            )
        
        if not variable_configs:
            raise HTTPException(
                status_code=400,
                detail="variable_configs is required for MMM training"
            )
        
        if not models_to_run:
            raise HTTPException(
                status_code=400,
                detail="models_to_run is required for MMM training"
            )
        
        # Validate variable configurations
        for var in x_variables:
            if var not in variable_configs:
                logger.warning(f"No transformation config found for variable {var}, using 'none'")
                variable_configs[var] = {"type": "none"}
        
        # Import MMM trainer
        from .mmm_training import mmm_trainer
        
        # Get MinIO client and bucket
        minio_client = get_minio_client()
        
        try:
            from ..scope_selector.config import get_settings
            scope_settings = get_settings()
            bucket_name = scope_settings.minio_bucket
            object_prefix = await get_object_prefix()
        except Exception as e:
            bucket_name = "Quant_Matrix_AI_Schema"
            object_prefix = "blank/blank project/"
        
        # Initialize progress tracking
        total_combinations = len(combinations)
        total_models = len(models_to_run)
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
        
        combination_results = []
        total_saved = 0
        all_variable_stats = {}
        
        # Process each combination
        for combination_index, combination in enumerate(combinations):
            # Update progress
            training_progress[run_id]["current_combination"] = combination
            training_progress[run_id]["current"] = combination_index * total_models
            training_progress[run_id]["percentage"] = int((training_progress[run_id]["current"] / training_progress[run_id]["total"]) * 100)
            
            # Search for the file in MinIO
            target_file_key = None
            try:
                # Search for files containing both Scope_X and the combination
                all_objects = list(minio_client.list_objects(bucket_name, recursive=True))
                matching_objects = []
                
                for obj in all_objects:
                    obj_name = obj.object_name
                    scope_pattern = f"Scope_{scope_number}"
                    has_scope = scope_pattern in obj_name
                    has_combination = combination in obj_name
                    
                    if has_scope and has_combination:
                        matching_objects.append(obj_name)
                
                if matching_objects:
                    target_file_key = matching_objects[0]
                    logger.info(f"Found file for combination {combination}: {target_file_key}")
                    
                    # Update progress - reading file
                    training_progress[run_id]["current_model"] = "Reading data file..."
                    await asyncio.sleep(0.3)
                    
                    # Train MMM models for this combination
                    training_progress[run_id]["current_model"] = "Training MMM models..."
                    await asyncio.sleep(0.5)
                    
                    try:
                        logger.info(f"Starting MMM training for combination: {combination}")
                        # Convert x_variables to lowercase for consistency
                        x_variables_lower = [var.lower() for var in x_variables]
                        y_variable_lower = y_variable.lower()
                        
                        # Convert variable_configs keys to lowercase
                        variable_configs_lower = {}
                        for var, config in variable_configs.items():
                            variable_configs_lower[var.lower()] = config
                        
                        # Train MMM models
                        model_results, variable_data = await mmm_trainer.train_mmm_models_for_combination(
                            file_key=target_file_key,
                            x_variables=x_variables_lower,
                            y_variable=y_variable_lower,
                            variable_configs=variable_configs_lower,
                            models_to_run=models_to_run,
                            custom_configs=custom_model_configs,  # Use same constraint approach as general models
                            k_folds=k_folds,
                            test_size=test_size,
                            bucket_name=bucket_name,
                            price_column=price_column.lower() if price_column else None
                        )
                        
                        logger.info(f"MMM training completed for {combination}. Generated {len(model_results)} model results")
                        
                        # Update progress
                        training_progress[run_id]["current"] += total_models
                        training_progress[run_id]["percentage"] = int((training_progress[run_id]["current"] / training_progress[run_id]["total"]) * 100)
                        
                        # Store variable statistics
                        all_variable_stats[combination] = variable_data
                        
                        # Save results to MongoDB
                        try:
                            saved_ids = await save_model_results_enhanced(
                                scope_id=f"scope_{scope_number}",
                                scope_name=f"Scope_{scope_number}",
                                set_name=f"Scope_{scope_number}",
                                combination={
                                    "combination_id": combination,
                                    "file_key": target_file_key,
                                    "filename": target_file_key.split('/')[-1],
                                    "set_name": f"Scope_{scope_number}",
                                    "record_count": variable_data.get("original_data_shape", [0, 0])[0]
                                },
                                model_results=model_results,
                                x_variables=x_variables_lower,
                                y_variable=y_variable_lower,
                                price_column=price_column.lower() if price_column else None,
                                standardization="mmm_per_variable",  # Special marker for MMM
                                test_size=test_size,
                                run_id=run_id,
                                variable_data=variable_data
                            )
                            
                            total_saved += len(saved_ids)
                            logger.info(f"Saved {len(saved_ids)} MMM model results for combination {combination}")
                            
                        except Exception as e:
                            logger.error(f"Failed to save MMM results for {combination}: {e}")
                        
                        # Save MMM results to MinIO as Arrow file
                        try:
                            import pandas as pd
                            import pyarrow as pa
                            import pyarrow.feather as feather
                            from io import BytesIO
                            
                            # Prepare summary data for MinIO
                            summary_data = []
                            logger.info(f"Preparing summary data for {len(model_results)} model results")
                            for model_result in model_results:
                                # Extract parameter combination info
                                param_combo = model_result.get("parameter_combination", {})
                                combo_index = model_result.get("combination_index", 0)
                                
                                # Extract actual parameters used
                                actual_params = model_result.get('actual_parameters_used', {})
                                
                                # Create summary row
                                summary_row = {
                                    'run_id': run_id,
                                    'scope_id': f"scope_{scope_number}",
                                    'scope_name': f"Scope_{scope_number}",
                                    'set_name': f"Scope_{scope_number}",
                                    'combination_id': combination,
                                    'file_key': target_file_key,
                                    'model_name': model_result['model_name'],
                                    'model_type': 'mmm_regression',
                                    'combination_index': combo_index,
                                    'total_records': variable_data.get("original_data_shape", [0, 0])[0],
                                    'training_date': datetime.now().isoformat(),
                                    
                                    # Performance metrics
                                    'mape_train': model_result['mape_train'],
                                    'mape_test': model_result['mape_test'],
                                    'r2_train': model_result['r2_train'],
                                    'r2_test': model_result['r2_test'],
                                    
                                    # Model selection criteria
                                    'aic': model_result.get('aic', float('inf')),
                                    'bic': model_result.get('bic', float('inf')),
                                    'n_parameters': model_result.get('n_parameters', len(x_variables_lower) + 1),
                                    
                                    # Price elasticity
                                    'price_column': price_column.lower() if price_column else None,
                                    'price_elasticity': model_result.get('price_elasticity'),
                                    
                                    # Training configuration
                                    'standardization': 'mmm_per_variable',
                                    'k_folds': k_folds,
                                    'test_size': test_size,
                                    'x_variables': ','.join(x_variables_lower),
                                    'y_variable': y_variable_lower,
                                    
                                    # MMM-specific fields
                                    'transformation_types': ','.join([config.get('type', 'none') for config in actual_params.values()]),
                                    'parameter_combination': str(param_combo),
                                    'actual_parameters_used': str(actual_params),
                                    
                                    # Individual parameter details for each variable
                                    'adstock_decay_params': str({var: config.get('adstock_decay', 'N/A') for var, config in actual_params.items() if config.get('type') == 'media'}),
                                    'logistic_growth_params': str({var: config.get('logistic_growth', 'N/A') for var, config in actual_params.items() if config.get('type') == 'media'}),
                                    'logistic_midpoint_params': str({var: config.get('logistic_midpoint', 'N/A') for var, config in actual_params.items() if config.get('type') == 'media'}),
                                    'logistic_carryover_params': str({var: config.get('logistic_carryover', 'N/A') for var, config in actual_params.items() if config.get('type') == 'media'})
                                }
                                
                                # Add variable averages (same as train-models-direct)
                                variable_averages = variable_data.get("combination_results", [{}])[0].get("variable_averages", {})
                                for x_var in x_variables_lower:
                                    avg_key = f"{x_var}_avg"
                                    summary_row[avg_key] = variable_averages.get(x_var, 0)
                                
                                # Add Y variable average
                                y_avg_key = f"{y_variable_lower}_avg"
                                summary_row[y_avg_key] = variable_averages.get(y_variable_lower, 0)
                                
                                # Add coefficients
                                coefficients = model_result.get('coefficients', {})
                                for coef_name, coef_value in coefficients.items():
                                    summary_row[coef_name] = coef_value
                                
                                # Add unstandardized intercept
                                summary_row['unstandardized_intercept'] = model_result.get('unstandardized_intercept', 0.0)
                                
                                # Add elasticities as individual columns (same as train-models-direct)
                                elasticities = model_result.get('elasticities', {})
                                for var_name, elasticity_value in elasticities.items():
                                    summary_row[f"{var_name}_elasticity"] = elasticity_value
                                
                                # Add contributions as individual columns (same as train-models-direct)
                                contributions = model_result.get('contributions', {})
                                for var_name, contribution_value in contributions.items():
                                    summary_row[f"{var_name}_contribution"] = contribution_value
                                
                                summary_data.append(summary_row)
                            
                            if summary_data:
                                logger.info(f"Preparing to save {len(summary_data)} MMM results to MinIO for combination {combination}")
                                
                                # Convert to DataFrame and save as Arrow file
                                summary_df = pd.DataFrame(summary_data)
                                logger.info(f"Created DataFrame with shape: {summary_df.shape}")
                                logger.info(f"DataFrame columns: {list(summary_df.columns)}")
                                
                                arrow_buffer = BytesIO()
                                table = pa.Table.from_pandas(summary_df)
                                feather.write_feather(table, arrow_buffer)
                                arrow_buffer.seek(0)
                                
                                # Create MinIO file key for MMM results
                                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                                model_results_file_key = f"mmm-results/{run_id}/{combination}_mmm_results_{timestamp}.arrow"
                                logger.info(f"Saving to MinIO with key: {model_results_file_key}")
                                
                                # Save to MinIO
                                # Encode combination name for MinIO metadata (only supports US-ASCII)
                                combination_encoded = combination.encode('ascii', 'ignore').decode('ascii')
                                
                                minio_client.put_object(
                                    bucket_name,
                                    model_results_file_key,
                                    arrow_buffer,
                                    length=arrow_buffer.getbuffer().nbytes,
                                    content_type='application/vnd.apache.arrow.file',
                                    metadata={
                                        "run_id": run_id,
                                        "scope_number": str(scope_number),
                                        "combination": combination_encoded,
                                        "model_type": "mmm",
                                        "total_models": str(len(model_results)),
                                        "parameter_combinations": str(len(set(mr.get("combination_index", 0) for mr in model_results))),
                                        "export_date": timestamp
                                    }
                                )
                                
                                logger.info(f"Successfully saved MMM results to MinIO: {model_results_file_key}")
                                
                        except Exception as e:
                            logger.warning(f"Failed to save MMM results to MinIO: {e}")
                            # Don't fail the entire request if MinIO save fails
                        
                        # Add to results
                        combination_results.append({
                            "combination_id": combination,
                            "file_key": target_file_key,
                            "total_records": variable_data.get("original_data_shape", [0, 0])[0],
                            "model_results": model_results
                        })
                        
                        # Update progress - combination completed
                        training_progress[run_id]["completed_combinations"] += 1
                        
                    except Exception as e:
                        logger.error(f"Error training MMM models for combination {combination}: {e}")
                        continue
                        
                else:
                    logger.warning(f"Could not find file for combination: {combination}")
                    continue
                    
            except Exception as e:
                logger.error(f"Error processing combination {combination}: {e}")
                continue
        
        # Mark training as completed
        training_progress[run_id]["status"] = "completed"
        training_progress[run_id]["percentage"] = 100
        
        # Prepare summary
        summary = {
            "run_id": run_id,
            "total_models_saved": total_saved,
            "total_combinations_processed": len(combination_results),
            "variable_transformations_applied": len(variable_configs),
            "business_constraints_applied": len(custom_model_configs),
            "transformation_types_used": list(set(config.get("type", "none") for config in variable_configs.values())),
            "best_model_by_mape": {},
            "best_model_by_r2": {}
        }
        
        # Find best models
        for combo_result in combination_results:
            combo_id = combo_result["combination_id"]
            best_mape_model = None
            best_r2_model = None
            best_mape = float('inf')
            best_r2 = -float('inf')
            
            for model_result in combo_result["model_results"]:
                if model_result["mape_test"] < best_mape:
                    best_mape = model_result["mape_test"]
                    best_mape_model = model_result["model_name"]
                
                if model_result["r2_test"] > best_r2:
                    best_r2 = model_result["r2_test"]
                    best_r2_model = model_result["model_name"]
            
            if best_mape_model:
                summary["best_model_by_mape"][combo_id] = {
                    "model": best_mape_model,
                    "mape_test": best_mape
                }
            
            if best_r2_model:
                summary["best_model_by_r2"][combo_id] = {
                    "model": best_r2_model,
                    "r2_test": best_r2
                }
        
        logger.info(f"MMM training completed successfully: {len(combination_results)} combinations processed, {total_saved} models saved")
        
        return {
            "scope_id": f"scope_{scope_number}",
            "set_name": f"Scope_{scope_number}",
            "x_variables": x_variables,
            "y_variable": y_variable,
            "standardization": "mmm_per_variable",
            "k_folds": k_folds,
            "total_combinations": len(combination_results),
            "combination_results": combination_results,
            "summary": summary
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in MMM model training: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/mmm-stack-train-models", response_model=MarketingModelTrainingResponse, tags=["MMM Stack Training"])
async def train_mmm_stack_models(request: dict):
    """
    Train Marketing Mix Models on stack/clustered data with per-variable transformations.
    
    This endpoint combines the clustering approach with sophisticated MMM transformations:
    1. Uses split clustered data from prepare_stack_model_data
    2. Applies MMM transformations to each combination within clusters
    3. Creates interaction terms between combinations and variables
    4. Trains models on transformed data with parameter combinations
    
    Request body should include:
    - scope_number: Scope number for file search
    - combinations: List of combination strings
    - pool_by_identifiers: List of identifiers for pooling (e.g., ['Channel', 'Brand'])
    - x_variables: List of feature variables
    - y_variable: Target variable
    - variable_configs: Per-variable transformation configurations
    - models_to_run: List of model names to train
    - n_clusters: Number of clusters for K-means (optional)
    - clustering_columns: List of columns to use for clustering (subset of x_variables + y_variable, optional)
    - apply_interaction_terms: Whether to create interaction terms (default: True)
    - numerical_columns_for_interaction: Columns for interaction terms (optional)
    - variable_constraints: Business constraints (optional)
    """
    try:
        # Generate unique run ID or use provided one
        run_id = request.get('run_id') or str(uuid.uuid4())
        logger.info(f"Starting MMM stack model training with run_id: {run_id}")
        
        # Extract parameters from request
        scope_number = request.get('scope_number')
        combinations = request.get('combinations', [])
        pool_by_identifiers = request.get('pool_by_identifiers', [])
        x_variables = request.get('x_variables', [])
        y_variable = request.get('y_variable')
        variable_configs = request.get('variable_configs', {})
        models_to_run = request.get('models_to_run', [])
        n_clusters = request.get('n_clusters')
        clustering_columns = request.get('clustering_columns')
        apply_interaction_terms = request.get('apply_interaction_terms', True)
        numerical_columns_for_interaction = request.get('numerical_columns_for_interaction', [])
        variable_constraints = request.get('variable_constraints', [])
        test_size = request.get('test_size', 0.2)
        price_column = request.get('price_column')
        
        # Validation
        if not scope_number or not combinations or not pool_by_identifiers or not x_variables or not y_variable:
            raise HTTPException(
                status_code=400,
                detail="Missing required parameters: scope_number, combinations, pool_by_identifiers, x_variables, or y_variable"
            )
        
        if not variable_configs:
            raise HTTPException(
                status_code=400,
                detail="variable_configs is required for MMM stack training"
            )
        
        if not models_to_run:
            raise HTTPException(
                status_code=400,
                detail="models_to_run is required for MMM stack training"
            )
        
        # Convert to lowercase for consistency
        x_variables_lower = [var.lower() for var in x_variables]
        y_variable_lower = y_variable.lower()
        pool_by_identifiers_lower = [id.lower() for id in pool_by_identifiers]
        
        # Get MinIO client and bucket
        minio_client = get_minio_client()
        bucket_name = "trinity-data"
        
        # Initialize MMM Stack Data Processor
        from .mmm_stack_training import MMMStackModelDataProcessor
        processor = MMMStackModelDataProcessor()
        
        # Step 1: Prepare stack model data (get split clustered data)
        logger.info("Preparing stack model data...")
        stack_data_result = await processor.prepare_stack_model_data(
            scope_number=scope_number,
            combinations=combinations,
            pool_by_identifiers=pool_by_identifiers,
            x_variables=x_variables,
            y_variable=y_variable,
            minio_client=minio_client,
            bucket_name=bucket_name,
            n_clusters=n_clusters,
            clustering_columns=clustering_columns
        )
        
        if stack_data_result['status'] != 'success':
            raise HTTPException(
                status_code=400,
                detail=f"Failed to prepare stack model data: {stack_data_result.get('error', 'Unknown error')}"
            )
        
        split_clustered_data = stack_data_result['split_clustered_data']
        logger.info(f"Successfully prepared {len(split_clustered_data)} split clusters")
        
        # Step 2: Train MMM models on split clustered data
        logger.info("Starting MMM model training on split clustered data...")
        training_start_time = datetime.now()
        
        training_result = await processor.train_mmm_models_for_stack_data(
            split_clustered_data=split_clustered_data,
            x_variables=x_variables,
            y_variable=y_variable,
            variable_configs=variable_configs,
            models_to_run=models_to_run,
            apply_interaction_terms=apply_interaction_terms,
            numerical_columns_for_interaction=numerical_columns_for_interaction,
            test_size=test_size,
            price_column=price_column,
            variable_constraints=variable_constraints
        )
        
        training_end_time = datetime.now()
        execution_time = (training_end_time - training_start_time).total_seconds()
        
        if training_result['status'] != 'success':
            raise HTTPException(
                status_code=500,
                detail=f"MMM stack model training failed: {training_result.get('error', 'Unknown error')}"
            )
        
        # Process results
        total_models_trained = training_result['total_models_trained']
        split_cluster_results = training_result['split_cluster_results']
        
        # Find best models across all clusters
        best_models = {}
        overall_best_mape = float('inf')
        overall_best_model = None
        overall_best_cluster = None
        
        for cluster_key, cluster_result in split_cluster_results.items():
            if cluster_result['status'] == 'success' and cluster_result['model_results']:
                # Find best model in this cluster
                cluster_best_mape = float('inf')
                cluster_best_model = None
                
                for model_result in cluster_result['model_results']:
                    if model_result['mape_test'] < cluster_best_mape:
                        cluster_best_mape = model_result['mape_test']
                        cluster_best_model = model_result['model_name']
                
                best_models[cluster_key] = {
                    'best_model': cluster_best_model,
                    'best_mape': cluster_best_mape,
                    'models_trained': cluster_result['models_trained']
                }
                
                # Track overall best
                if cluster_best_mape < overall_best_mape:
                    overall_best_mape = cluster_best_mape
                    overall_best_model = cluster_best_model
                    overall_best_cluster = cluster_key
        
        # Create summary
        summary = {
            'total_split_clusters': training_result['total_split_clusters'],
            'total_parameter_combinations': training_result['total_parameter_combinations'],
            'total_models_trained': total_models_trained,
            'overall_best_model': overall_best_model,
            'overall_best_mape': overall_best_mape,
            'overall_best_cluster': overall_best_cluster,
            'cluster_summaries': best_models,
            'variable_configs': variable_configs,
            'models_tested': models_to_run,
            'execution_time_seconds': execution_time
        }
        
        # Save results to MongoDB (optional)
        try:
            from .mongodb_saver import save_marketing_model_results
            save_marketing_model_results(
                run_id=run_id,
                scope_number=scope_number,
                training_type="mmm_stack",
                results=training_result,
                summary=summary
            )
            logger.info(f"Saved MMM stack training results to MongoDB with run_id: {run_id}")
        except Exception as e:
            logger.warning(f"Failed to save results to MongoDB: {e}")
        
        logger.info(f"Completed MMM stack model training: {total_models_trained} models trained across {training_result['total_split_clusters']} split clusters")
        
        return MarketingModelTrainingResponse(
            training_id=run_id,
            status="success",
            models_trained=total_models_trained,
            summary=summary,
            best_models=best_models,
            execution_time_seconds=execution_time
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in MMM stack model training: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/get-column-classifier-metadata")
async def get_column_classifier_metadata():
    """
    Get column classifier metadata for the hardcoded project ID.
    This endpoint fetches the column classifier configuration from MongoDB.
    """
    try:
        from .mongodb_saver import get_column_classifier_config_from_mongo
        
        # Hardcoded _id for testing
        hardcoded_id = "Quant_Matrix_AI_Schema/marketing-mix/New Marketing Mix Modeling Project"
        
        # Fetch the metadata
        metadata = await get_column_classifier_config_from_mongo(hardcoded_id)
        
        if metadata:
            logger.info(f"✅ Successfully retrieved column classifier metadata for: {hardcoded_id}")
            return {
                "status": "success",
                "message": "Column classifier metadata retrieved successfully",
                "project_id": hardcoded_id,
                "metadata": metadata
            }
        else:
            logger.warning(f"⚠️ No column classifier metadata found for: {hardcoded_id}")
            return {
                "status": "not_found",
                "message": f"No column classifier metadata found for project: {hardcoded_id}",
                "project_id": hardcoded_id,
                "metadata": None
            }
            
    except Exception as e:
        logger.error(f"❌ Error fetching column classifier metadata: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail=f"Error fetching column classifier metadata: {str(e)}"
        )


