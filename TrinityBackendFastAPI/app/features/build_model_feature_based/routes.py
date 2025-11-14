from fastapi import APIRouter, HTTPException, Query, Path, Form, Body, Request, Depends
import logging
import asyncio
from datetime import datetime
from typing import List, Optional, Dict, Any
import uuid

# Model imports
from .models import CustomConstrainedRidge, ConstrainedLinearRegression

# Database imports - Enhanced versions only
from .database import (
    scopes_collection, 
    scopeselector_configs_collection,
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
from app.core.observability import timing_dependency_factory

# Import MMM model results saver (removed - using save_build_config instead)

# Import MongoDB saver functions
from .mongodb_saver import save_build_config, get_build_config_from_mongo, get_scope_config_from_mongo, get_combination_column_values

# Import ensemble calculation
from .ensemble_calculation import ensemble_calculator

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


timing_dependency = timing_dependency_factory("app.features.build_model_feature_based")

router = APIRouter(dependencies=[Depends(timing_dependency)])
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


@router.get("/build-atom/scopes", tags=["Build Atom"])
async def get_build_atom_scopes(
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name")
):
    """
    Get scopes and combinations for the build-model feature-based atom.
    Returns data in the format expected by the frontend.
    Uses client_name/app_name/project_name to find the specific scope document.
    """
    logger.info("🔍 Starting get_build_atom_scopes endpoint")
    logger.info(f"📋 Parameters: client_name={client_name}, app_name={app_name}, project_name={project_name}")
    
    if scopeselector_configs_collection is None:
        logger.error("❌ MongoDB scopeselector_configs_collection is None")
        raise HTTPException(
            status_code=503,
            detail="MongoDB connection not available"
        )
    
    logger.info("✅ MongoDB scopeselector_configs_collection is available")
    
    try:
        scopes = []
        
        # Create the MongoDB _id using client_name/app_name/project_name pattern
        scope_id = f"{client_name}/{app_name}/{project_name}"
        logger.info(f"🔍 Looking for scope with _id: {scope_id}")
        
        # Query MongoDB using the specific _id
        scope_doc = await scopeselector_configs_collection.find_one({"_id": scope_id})
        
        if scope_doc is None:
            logger.warning(f"⚠️ No scope document found with _id: {scope_id}")
            # Try alternative query patterns
            logger.info("🔍 Trying alternative query patterns...")
            
            # Try with scope_id field instead of _id
            scope_doc = await scopeselector_configs_collection.find_one({"scope_id": scope_id})
            if scope_doc:
                logger.info(f"✅ Found scope using scope_id field: {scope_id}")
            else:
                logger.warning(f"⚠️ No scope found with scope_id field either: {scope_id}")
                
                # Try partial matches
                partial_matches = []
                async for doc in scopeselector_configs_collection.find({}).limit(10):
                    doc_id = str(doc.get("_id", ""))
                    if client_name in doc_id or app_name in doc_id or project_name in doc_id:
                        partial_matches.append(doc_id)
                
                logger.info(f"🔍 Found {len(partial_matches)} partial matches: {partial_matches}")
                
                return {
                    "success": False,
                    "message": f"No scope found with _id: {scope_id}",
                    "scopes": [],
                    "total_scopes": 0,
                    "debug_info": {
                        "requested_id": scope_id,
                        "partial_matches": partial_matches,
                        "total_documents": await scopeselector_configs_collection.count_documents({})
                    }
                }
        else:
            logger.info(f"✅ Found scope document with _id: {scope_id}")
        
        # Process the found scope document
        logger.info(f"📄 Processing scope document: {scope_doc.get('_id', 'No ID')}")
        
        scope_id_str = str(scope_doc.get("_id", scope_doc.get("scope_id", "")))
        scope_name = scope_doc.get("name", f"Scope {scope_id_str}")
        
        logger.info(f"  📋 Scope ID: {scope_id_str}, Name: {scope_name}")
        
        # Extract scope numbers from filter_set_results
        scope_numbers = set()
        combinations_by_scope = {}
        
        filter_set_results = scope_doc.get("filter_set_results", [])
        logger.info(f"  🔍 Found {len(filter_set_results)} filter_set_results")
        
        for i, fset in enumerate(filter_set_results):
            set_name = fset.get("set_name", "")
            logger.info(f"    📁 Filter set {i}: set_name = '{set_name}'")
            
            if set_name.startswith("Scope_"):
                logger.info(f"    ✅ Found scope set: {set_name}")
                
                # Extract scope number from set_name like "Scope_1", "Scope_2", etc.
                scope_match = set_name.split("_")
                if len(scope_match) >= 2:
                    scope_num = scope_match[1]
                    scope_numbers.add(scope_num)
                    logger.info(f"    🔢 Extracted scope number: {scope_num}")
                    
                    # Extract combinations for this scope
                    scope_combinations = []
                    combination_files = fset.get("combination_files", [])
                    logger.info(f"    📊 Found {len(combination_files)} combination files")
                    
                    for j, cfile in enumerate(combination_files):
                        combo = cfile.get("combination", {})
                        logger.info(f"      🔗 Combination {j}: {combo}")
                        
                        # Create combination string from the combination object
                        combo_parts = []
                        for key, value in combo.items():
                            if value:  # Only include non-empty values
                                # Normalize value to match file_key format: replace spaces with underscores
                                normalized_value = str(value).replace(' ', '_')
                                combo_parts.append(normalized_value)
                        
                        if combo_parts:
                            combination_string = "_".join(combo_parts)
                            logger.info(f"      ✅ Created combination string: {combination_string}")
                            
                            scope_combinations.append({
                                "value": combination_string,
                                "label": combination_string,  # Same as value for clean display
                                "file_key": cfile.get("file_key", ""),
                                "record_count": cfile.get("record_count", 0)
                            })
                        else:
                            logger.warning(f"      ⚠️ Empty combination parts for combo: {combo}")
                    
                    combinations_by_scope[scope_num] = scope_combinations
                    logger.info(f"    📈 Scope {scope_num} has {len(scope_combinations)} combinations")
                else:
                    logger.warning(f"    ⚠️ Invalid scope format: {set_name}")
            else:
                logger.info(f"    ❌ Skipping non-scope set: {set_name}")
        
        logger.info(f"  🎯 Found scope numbers: {sorted(scope_numbers)}")
        
        # Create scope options for each scope number
        for scope_num in sorted(scope_numbers, key=int):
            scope_option = {
                "scope_id": scope_id_str,
                "scope_number": scope_num,
                "scope_name": f"Scope {scope_num}",  # Simplified name
                "combinations": combinations_by_scope.get(scope_num, [])
            }
            scopes.append(scope_option)
            logger.info(f"  ✅ Added scope option: {scope_option['scope_name']} with {len(scope_option['combinations'])} combinations")
        
        logger.info(f"🎉 Final result: {len(scopes)} scopes found")
        for i, scope in enumerate(scopes):
            logger.info(f"  📋 Scope {i+1}: {scope['scope_name']} ({len(scope['combinations'])} combinations)")
        
        return {
            "success": True,
            "scopes": scopes,
            "total_scopes": len(scopes),
            "debug_info": {
                "requested_id": scope_id,
                "found_document": scope_doc is not None,
                "scope_numbers_found": sorted(scope_numbers)
            }
        }
        
    except Exception as e:
        logger.error(f"❌ Error fetching build atom scopes: {e}")
        logger.error(f"❌ Error type: {type(e)}")
        import traceback
        logger.error(f"❌ Traceback: {traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching scopes: {str(e)}"
        )

@router.get("/build-atom/scopes/{scope_number}/combinations", tags=["Build Atom"])
async def get_build_atom_combinations(
    scope_number: str = Path(..., description="Scope number (e.g., '1', '2', '3')"),
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name")
):
    """
    Get combinations for a specific scope number for the build-model feature-based atom.
    Uses client_name/app_name/project_name to find the specific scope document.
    """
    if scopeselector_configs_collection is None:
        raise HTTPException(
            status_code=503,
            detail="MongoDB connection not available"
        )
    
    try:
        combinations = []
        
        # Create the MongoDB _id using client_name/app_name/project_name pattern
        scope_id = f"{client_name}/{app_name}/{project_name}"
        logger.info(f"🔍 Looking for scope with _id: {scope_id}")
        
        # Query MongoDB using the specific _id
        scope_doc = await scopeselector_configs_collection.find_one({"_id": scope_id})
        
        if scope_doc is None:
            logger.warning(f"⚠️ No scope document found with _id: {scope_id}")
            # Try alternative query patterns
            logger.info("🔍 Trying alternative query patterns...")
            
            # Try with scope_id field instead of _id
            scope_doc = await scopeselector_configs_collection.find_one({"scope_id": scope_id})
            if scope_doc:
                logger.info(f"✅ Found scope using scope_id field: {scope_id}")
            else:
                logger.warning(f"⚠️ No scope found with scope_id field either: {scope_id}")
                raise HTTPException(
                    status_code=404,
                    detail=f"No scope found with _id: {scope_id}"
                )
        else:
            logger.info(f"✅ Found scope document with _id: {scope_id}")
        
        # Process the found scope document
        logger.info(f"📄 Processing scope document: {scope_doc.get('_id', 'No ID')}")
        
        # Look for the specific scope number in filter_set_results
        for fset in scope_doc.get("filter_set_results", []):
            set_name = fset.get("set_name", "")
            logger.info(f"📁 Checking filter set: {set_name}")
            
            if set_name == f"Scope_{scope_number}":
                logger.info(f"✅ Found matching scope set: {set_name}")
                # Extract combinations for this scope
                for cfile in fset.get("combination_files", []):
                    combo = cfile.get("combination", {})
                    logger.info(f"🔗 Processing combination: {combo}")
                    
                    # Create combination string from the combination object
                    combo_parts = []
                    for key, value in combo.items():
                        if value:  # Only include non-empty values
                            # Normalize value to match file_key format: replace spaces with underscores
                            normalized_value = str(value).replace(' ', '_')
                            combo_parts.append(normalized_value)
                    if combo_parts:
                        combination_string = "_".join(combo_parts)
                        logger.info(f"✅ Created combination string: {combination_string}")
                        
                        combinations.append({
                            "value": combination_string,
                            "label": combination_string,  # Same as value for clean display
                            "file_key": cfile.get("file_key", ""),
                            "record_count": cfile.get("record_count", 0),
                            "scope_id": str(scope_doc.get("_id", scope_doc.get("scope_id", "")))
                        })
        
        if not combinations:
            raise HTTPException(
                status_code=404,
                detail=f"No combinations found for Scope_{scope_number} in document {scope_id}"
            )
        
        logger.info(f"🎉 Found {len(combinations)} combinations for Scope_{scope_number}")
        
        return {
            "success": True,
            "scope_number": scope_number,
            "combinations": combinations,
            "total_combinations": len(combinations),
            "debug_info": {
                "requested_id": scope_id,
                "found_document": scope_doc is not None
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching combinations for scope {scope_number}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching combinations: {str(e)}"
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
            "list_scope_sets": "/api/v1/scopes/{scope_id}/sets",
            "build_atom_scopes": "/api/v1/build-atom/scopes?client_name={client}&app_name={app}&project_name={project}",
            "build_atom_combinations": "/api/v1/build-atom/scopes/{scope_number}/combinations?client_name={client}&app_name={app}&project_name={project}"
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
                    logger.warning("⚠️ No identifiers found in scope config, using default identifiers")
                    # Provide default identifiers as fallback
                    identifiers = ["Channel", "Brand"]
                    logger.info(f"📋 Using default identifiers: {identifiers}")
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
        variable_configs = request.get('variable_configs', {})
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
        
        # Extract constraint parameters
        negative_constraints = request.get('negative_constraints', [])
        positive_constraints = request.get('positive_constraints', [])
        
        
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
            # pool_by_identifiers is optional - can be empty list for individual modeling
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
                        
                        # Convert variable_configs keys to lowercase for consistency
                        variable_configs_lower = {}
                        for var, config in variable_configs.items():
                            variable_configs_lower[var.lower()] = config
                        
                        logger.info(f"🔧 Variable configs: {variable_configs_lower}")
                        
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
                            variable_configs=variable_configs_lower,  # Pass per-variable transformations
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
                # Import StackModelTrainer
                from .stack_model_training import StackModelTrainer
                stack_trainer = StackModelTrainer()
                logger.info("✅ StackModelTrainer imported successfully")

                x_variables_lower_stack = [var.lower() for var in x_variables]
                y_variable_lower_stack = y_variable.lower()
                
                # Convert variable_configs keys to lowercase for stack modeling
                variable_configs_lower_stack = {}
                for var, config in variable_configs.items():
                    variable_configs_lower_stack[var.lower()] = config
                
                individual_metrics = await stack_trainer.calculate_individual_combination_metrics(
                    scope_number=scope_number,
                    combinations=combinations,
                    pool_by_identifiers=pool_by_identifiers,
                    x_variables=x_variables_lower_stack,
                    y_variable=y_variable_lower_stack,
                    variable_configs=variable_configs_lower_stack,  # Pass per-variable transformations
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
                    run_id=run_id,
                    negative_constraints=negative_constraints,
                    positive_constraints=positive_constraints
                )
                

                
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
                            

                            
                            # Extract betas safely with defaults
                            betas_dict = model_metrics.get('betas', {})
                            coefficients_dict = betas_dict.get('coefficients', {}) if isinstance(betas_dict, dict) else {}
                            intercept_value = betas_dict.get('intercept', 0.0) if isinstance(betas_dict, dict) else 0.0
                            
                          
                            
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
                                "coefficients": {f"Beta_{var}": coef for var, coef in coefficients_dict.items()},
                                "standardized_coefficients": {f"Beta_{var}": coef for var, coef in model_metrics.get('standardized_betas', {}).items()},
                                "intercept": intercept_value,
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
                                # logger.info(f"Merged {len(stack_model_results)} stack models into existing combination {combination}")
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
            
            # Create timestamp for data (not for filename - filename stays consistent to enable overwriting)
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            
            # Generate filename for model results (without timestamp to enable overwriting)
            model_results_filename = f"model_results_scope_{scope_number}.arrow"
            
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
                
                # Check if this is a stack model by looking at model names (they start with 'Stack_')
                model_results = combo_result.get('model_results', [])
                is_stack_model = any(model.get('model_name', '').startswith('Stack_') for model in model_results)
                
                if is_stack_model:
                    # For stack models, use default values since the file doesn't exist in MinIO
                    logger.info(f"📊 Stack model detected for {combination_id}, using default column values")
                    column_values = {identifier: "Stack Model" for identifier in identifiers}
                elif identifiers and combo_result.get('file_key'):
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
            
            # Build combination_file_keys from current cleaned_combination_results
            # Use combination_id directly from result (which matches the original combination from request)
            for i, combo_result in enumerate(cleaned_combination_results):
                # Use combination_id from the result if available, otherwise fall back to index
                if 'combination_id' in combo_result:
                    combination_name = combo_result['combination_id']
                elif 'combination' in combo_result:
                    combination_name = combo_result['combination']
                else:
                    # Fallback: use index if no combination_id found
                    combination_name = combinations[i] if i < len(combinations) else f"combination_{i}"
                    logger.warning(f"⚠️ No combination_id found in combo_result {i}, using fallback: {combination_name}")
                
                # Verify this combination matches one from the request
                if combination_name not in combinations:
                    logger.warning(f"⚠️ combination_name '{combination_name}' not found in request combinations list")
                
                if 'file_key' in combo_result:
                    logger.info(f"📝 Adding combination_file_key: {combination_name} -> {combo_result['file_key']}")
                    combination_file_keys.append({
                        "combination": combination_name,
                        "file_key": combo_result['file_key']
                    })
                else:
                    logger.warning(f"⚠️ No file_key found for combination {combination_name}")
                    
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
            
            # Prepare comprehensive build configuration data
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
                "combination_file_keys": combination_file_keys,
                "model_coefficients": model_coefficients,
                "created_at": datetime.now().isoformat(),
                "training_status": "completed",
                
                # ADD MISSING IMPORTANT FIELDS:
                
                # Individual modeling configuration
                "individual_modeling": individual_modeling,
                "individual_k_folds": individual_k_folds,
                "individual_test_size": individual_test_size,
                "individual_models_to_run": individual_models_to_run,
                "individual_custom_model_configs": individual_custom_model_configs,
                
                # Stack modeling configuration
                "stack_modeling": stack_modeling,
                "stack_k_folds": stack_k_folds,
                "stack_test_size": stack_test_size,
                "stack_models_to_run": stack_models_to_run,
                "stack_custom_model_configs": stack_custom_model_configs,
                "pool_by_identifiers": pool_by_identifiers,
                
                # Clustering configuration
                "apply_clustering": apply_clustering,
                "numerical_columns_for_clustering": numerical_columns_for_clustering,
                "n_clusters": n_clusters if n_clusters is not None else 3,
                
                # Interaction terms configuration
                "apply_interaction_terms": apply_interaction_terms,
                "numerical_columns_for_interaction": numerical_columns_for_interaction,
                
                # ROI configuration (if available in request)
                "roi_config": request.get('roi_config', {}),
                
                # Constraints configuration (if available in request)
                "constraints_config": request.get('constraints_config', {}),
                
                # Price column configuration
                "price_column": request.get('price_column'),
                
                # Test size configuration
                "test_size": request.get('test_size', 0.2),
                
                # Additional metadata
                "client_name": client_name,
                "app_name": app_name,
                "project_name": project_name,
                "training_type": "stack_modeling" if stack_modeling else "individual_modeling",
                "application_type": "general"
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
    Get numerical columns from the parent file of a scope.
    Reads the original source file (file_key at root level) instead of filtered combination files.
    
    - **scope**: Scope ID (e.g., "2")
    - **combination**: Combination name (not used, kept for backward compatibility)
    """
    try:
        logger.info(f"🔍 Fetching columns from parent file for scope_id: {scope}")
        
        if minio_client is None:
            raise HTTPException(status_code=503, detail="MinIO not available")
        
        # Step 1: Get the object prefix
        prefix = await get_object_prefix(scope)
        logger.info(f"📁 Retrieved prefix: {prefix}")
        
        if not prefix:
            raise HTTPException(
                status_code=404,
                detail=f"Could not find prefix for scope_id: {scope}"
            )
        
        # Step 2: Extract client, app, project from prefix
        prefix_parts = prefix.strip('/').split('/')
        
        if len(prefix_parts) < 2:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid prefix format: {prefix}"
            )
        
        client_name = prefix_parts[0]
        app_name = prefix_parts[1]
        project_name = prefix_parts[2] if len(prefix_parts) > 2 else "default_project"
        
        logger.info(f"🔍 Extracted: client={client_name}, app={app_name}, project={project_name}")
        
        # Step 3: Get scope configuration from MongoDB
        logger.info(f"📋 Fetching scope configuration from MongoDB")
        scope_config = await get_scope_config_from_mongo(client_name, app_name, project_name)
        
        if not scope_config:
            raise HTTPException(
                status_code=404,
                detail=f"Scope configuration not found in MongoDB for {client_name}/{app_name}/{project_name}"
            )
        
        # Step 4: Get the parent file_key from the root of the scope document
        parent_file_key = scope_config.get("file_key")
        
        if not parent_file_key:
            raise HTTPException(
                status_code=404,
                detail=f"Parent file_key not found in scope configuration"
            )
        
        logger.info(f"📄 Parent file key: {parent_file_key}")
        
        # Step 5: Read the parent file from MinIO
        trinity_bucket = "trinity"
        logger.info(f"📖 Reading parent file from MinIO: {parent_file_key}")
        
        try:
            response = minio_client.get_object(trinity_bucket, parent_file_key)
            file_data = response.read()
            response.close()
            response.release_conn()
        except Exception as minio_error:
            logger.error(f"❌ Failed to read parent file from MinIO: {minio_error}")
            raise HTTPException(
                status_code=404,
                detail=f"Parent file not found in MinIO: {parent_file_key}"
            )
        
        # Step 6: Parse the file to get columns
        import io
        import pyarrow as pa
        import pyarrow.ipc as ipc
        
        try:
            # Try reading as Arrow file first
            reader = ipc.RecordBatchFileReader(pa.BufferReader(file_data))
            table = reader.read_all()
            df = table.to_pandas()
            logger.info(f"📊 Read {len(df)} rows and {len(df.columns)} columns from Arrow file")
        except Exception as arrow_error:
            logger.warning(f"Failed to read as Arrow, trying CSV: {arrow_error}")
            # Fallback to CSV if Arrow fails
            try:
                df = pd.read_csv(io.BytesIO(file_data))
                logger.info(f"📊 Read {len(df)} rows and {len(df.columns)} columns from CSV file")
            except Exception as csv_error:
                logger.error(f"❌ Failed to read as CSV: {csv_error}")
                raise HTTPException(
                    status_code=400,
                    detail=f"Could not parse file as Arrow or CSV: {parent_file_key}"
                )
        
        columns = df.columns.tolist()
        
        # Step 7: Analyze columns and filter numerical ones
        df_sample = df.head(100) if len(df) > 100 else df
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
        logger.info(f"✅ Found {len(numerical_columns)} numerical columns out of {len(columns)} total")
        
        # Step 8: Return numerical columns with parent file info
        return {
            "scope": scope,
            "file_key": parent_file_key,
            "source": "parent_file",
            "total_columns": len(columns),
            "numerical_columns": numerical_columns,
            "all_columns": column_info
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error in get_columns: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

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
        
        # Debug: Log the structure of the received data
        logger.info(f"🔍 DEBUG: Received save request with keys: {list(body.keys())}")
        if "cards" in body:
            logger.info(f"🔍 DEBUG: Found {len(body['cards'])} cards")
            for i, card in enumerate(body['cards']):
                logger.info(f"🔍 DEBUG: Card {i} has {len(card.get('atoms', []))} atoms")
                for j, atom in enumerate(card.get('atoms', [])):
                    atom_id = atom.get('atomId', 'unknown')
                    settings_keys = list(atom.get('settings', {}).keys())
                    logger.info(f"🔍 DEBUG: Atom {j} ({atom_id}) has settings: {settings_keys}")
                    
                    # Check specifically for ROI and constraints
                    settings = atom.get('settings', {})
                    if 'roi_config' in settings:
                        logger.info(f"🔍 DEBUG: Found roi_config in atom {j}: {settings['roi_config']}")
                    if 'constraints_config' in settings:
                        logger.info(f"🔍 DEBUG: Found constraints_config in atom {j}: {settings['constraints_config']}")
                    if 'negative_constraints' in settings:
                        logger.info(f"🔍 DEBUG: Found negative_constraints in atom {j}: {settings['negative_constraints']}")
                    if 'positive_constraints' in settings:
                        logger.info(f"🔍 DEBUG: Found positive_constraints in atom {j}: {settings['positive_constraints']}")
        
        # Check if this is atom list configuration data (has cards structure)
        if "cards" in body and isinstance(body["cards"], list):
            # This is atom list configuration data - save to atom_list_configuration collection
            from app.features.project_state.routes import save_atom_list_configuration
            
            result = await save_atom_list_configuration(
                client_name=client_name,
                app_name=app_name,
                project_name=project_name,
                atom_config_data=body,
                user_id=user_id,
                project_id=project_id
            )
            
            if result["status"] == "success":
                return {
                    "success": True,
                    "message": f"Atom list configuration saved successfully",
                    "mongo_id": result["mongo_id"],
                    "operation": result["operation"],
                    "collection": result["collection"],
                    "documents_inserted": result.get("documents_inserted", 0)
                }
            else:
                raise HTTPException(status_code=500, detail=f"Failed to save atom list configuration: {result['error']}")
        else:
            # This is build configuration data - save to build-model_featurebased_configs collection
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
        # pool_by_identifiers is optional - can be empty list
        if not x_variables:
            raise HTTPException(status_code=400, detail="x_variables list is required")
        if not y_variable:
            raise HTTPException(status_code=400, detail="y_variable is required")
        
        # Validate clustering parameters if clustering is requested
        if apply_clustering:
            if not numerical_columns_for_clustering:
                raise HTTPException(status_code=400, detail="numerical_columns_for_clustering is required when apply_clustering is true")
            
            # Note: numerical_columns_for_clustering can be any numerical columns from the dataset
            # No restriction to x_variables + y_variable - clustering can use any available columns
        
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
        
        # Get bucket name from scope selector config
        try:
            from ..scope_selector.config import get_settings
            scope_settings = get_settings()
            bucket_name = scope_settings.minio_bucket
            logger.info(f"🔧 Using bucket from scope selector config: '{bucket_name}'")
        except Exception as e:
            bucket_name = "Quant_Matrix_AI_Schema"  # Fallback bucket
            logger.info(f"🔧 Using fallback bucket: '{bucket_name}' (error: {e})")
        
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
        # pool_by_identifiers is optional - can be empty list
        if not x_variables:
            raise HTTPException(status_code=400, detail="x_variables list is required")
        if not y_variable:
            raise HTTPException(status_code=400, detail="y_variable is required")
        
        # Validate clustering parameters if clustering is requested
        if apply_clustering:
            if not numerical_columns_for_clustering:
                raise HTTPException(status_code=400, detail="numerical_columns_for_clustering is required when apply_clustering is true")
            
            # Note: numerical_columns_for_clustering can be any numerical columns from the dataset
            # No restriction to x_variables + y_variable - clustering can use any available columns
        
        # Validate interaction terms parameters if interaction terms are requested
        if apply_interaction_terms:
            # Interaction terms can only be applied when clustering is also applied
            if not apply_clustering:
                raise HTTPException(status_code=400, detail="apply_clustering must be true when apply_interaction_terms is true. Interaction terms are only created for split clustered data.")
            
            if not numerical_columns_for_interaction:
                raise HTTPException(status_code=400, detail="numerical_columns_for_interaction is required when apply_interaction_terms is true")
            
            # Note: numerical_columns_for_interaction can be any numerical columns from the dataset
            # No restriction to x_variables + y_variable - interaction terms can use any available columns
        
        # Get MinIO client and bucket name
        minio_client = get_minio_client()
        
        # Get bucket name from scope selector config
        try:
            from ..scope_selector.config import get_settings
            scope_settings = get_settings()
            bucket_name = scope_settings.minio_bucket
            logger.info(f"🔧 Using bucket from scope selector config: '{bucket_name}'")
        except Exception as e:
            bucket_name = "Quant_Matrix_AI_Schema"  # Fallback bucket
            logger.info(f"🔧 Using fallback bucket: '{bucket_name}' (error: {e})")
        
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


# @router.post("/stack-model/combination-betas", response_model=CombinationBetasResponse, tags=["Stack Modeling"])
# async def get_combination_betas(request: dict):
#     """
#     Get final beta coefficients for each combination using pooled regression approach.
#     This endpoint trains models and returns only the final betas (common + individual) for each combination.
#     """
#     try:
#         logger.info("Starting combination betas calculation")
#         logger.info(f"Request: {request}")
        
#         # Extract parameters from request
#         scope_number = request.get('scope_number')
#         combinations = request.get('combinations', [])
#         pool_by_identifiers = request.get('pool_by_identifiers', [])
#         x_variables = request.get('x_variables', [])
#         y_variable = request.get('y_variable')
        
#         # Clustering parameters (optional)
#         apply_clustering = request.get('apply_clustering', False)
#         numerical_columns_for_clustering = request.get('numerical_columns_for_clustering', [])
#         n_clusters = request.get('n_clusters', None)
        
#         # Interaction terms parameters (optional)
#         apply_interaction_terms = request.get('apply_interaction_terms', True)
#         numerical_columns_for_interaction = request.get('numerical_columns_for_interaction', [])
        
#         # Model training parameters
#         standardization = request.get('standardization', 'none')
#         k_folds = request.get('k_folds', 5)
#         models_to_run = request.get('models_to_run', None)
#         custom_configs = request.get('custom_model_configs', None)
#         price_column = request.get('price_column', None)
        
#         # Generate unique run ID
#         run_id = request.get('run_id') or str(uuid.uuid4())
        
#         # Validate required parameters
#         if not scope_number:
#             raise HTTPException(status_code=400, detail="scope_number is required")
#         if not combinations:
#             raise HTTPException(status_code=400, detail="combinations list is required")
#         if not pool_by_identifiers:
#             raise HTTPException(status_code=400, detail="pool_by_identifiers list is required")
#         if not x_variables:
#             raise HTTPException(status_code=400, detail="x_variables list is required")
#         if not y_variable:
#             raise HTTPException(status_code=400, detail="y_variable is required")
        
#         # Validate clustering parameters if clustering is requested
#         if apply_clustering and not numerical_columns_for_clustering:
#             raise HTTPException(
#                 status_code=400, 
#                 detail="numerical_columns_for_clustering is required when apply_clustering is True"
#             )
        
#         # Validate interaction terms parameters if interaction terms are requested
#         if apply_interaction_terms and not numerical_columns_for_interaction:
#             raise HTTPException(
#                 status_code=400, 
#                 detail="numerical_columns_for_interaction is required when apply_interaction_terms is True"
#             )
        
#         # Get MinIO client
#         minio_client = get_minio_client()
        
#         # Dynamically get the bucket and prefix structure
#         try:
#             from ..scope_selector.config import get_settings
#             scope_settings = get_settings()
#             bucket_name = scope_settings.minio_bucket
#             object_prefix = await get_object_prefix()
#         except Exception as e:
#             bucket_name = "Quant_Matrix_AI_Schema"
#             object_prefix = "blank/blank project/"
        
#         # Initialize trainer
#         trainer = StackModelTrainer()
        
#         # Get combination betas using the dedicated trainer class
#         result = await trainer.get_combination_betas(
#             scope_number=scope_number,
#             combinations=combinations,
#             pool_by_identifiers=pool_by_identifiers,
#             x_variables=x_variables,
#             y_variable=y_variable,
#             minio_client=minio_client,
#             bucket_name=bucket_name,
#             apply_clustering=apply_clustering,
#             numerical_columns_for_clustering=numerical_columns_for_clustering,
#             n_clusters=n_clusters,
#             apply_interaction_terms=apply_interaction_terms,
#             numerical_columns_for_interaction=numerical_columns_for_interaction,
#             standardization=standardization,
#             k_folds=k_folds,
#             models_to_run=models_to_run,
#             custom_configs=custom_configs,
#             price_column=price_column,
#             run_id=run_id
#         )
        
#         # Check if calculation was successful
#         if hasattr(result, 'summary') and result.summary.get('status') == 'error':
#             raise HTTPException(status_code=500, detail=result.summary.get('error', 'Unknown error'))
        
#         logger.info("Combination betas calculation completed successfully")
#         return result
        
#     except HTTPException:
#         raise
#     except Exception as e:
#         logger.error(f"Error in combination betas calculation: {str(e)}")
#         raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


# @router.post("/stack-model/individual-combination-metrics", tags=["Stack Modeling"])
# async def calculate_individual_combination_metrics(request: dict):

#     try:  
#         # Extract parameters from request
#         scope_number = request.get('scope_number')
#         combinations = request.get('combinations', [])
#         pool_by_identifiers = request.get('pool_by_identifiers', [])
#         x_variables = request.get('x_variables', [])
#         y_variable = request.get('y_variable')
        
#         # Clustering parameters (optional)
#         apply_clustering = request.get('apply_clustering', False)
#         numerical_columns_for_clustering = request.get('numerical_columns_for_clustering', [])
#         n_clusters = request.get('n_clusters', None)
        
#         # Interaction terms parameters (optional)
#         apply_interaction_terms = request.get('apply_interaction_terms', True)
#         numerical_columns_for_interaction = request.get('numerical_columns_for_interaction', [])
        
#         # Model training parameters
#         standardization = request.get('standardization', 'none')
#         k_folds = request.get('k_folds', 5)
#         models_to_run = request.get('models_to_run', None)
#         custom_configs = request.get('custom_model_configs', None)
#         price_column = request.get('price_column', None)
        
#         # Generate unique run ID
#         run_id = request.get('run_id') or str(uuid.uuid4())
        
#         # Validate required parameters
#         if not scope_number:
#             raise HTTPException(status_code=400, detail="scope_number is required")
#         if not combinations:
#             raise HTTPException(status_code=400, detail="combinations list is required")
#         if not pool_by_identifiers:
#             raise HTTPException(status_code=400, detail="pool_by_identifiers list is required")
#         if not x_variables:
#             raise HTTPException(status_code=400, detail="x_variables list is required")
#         if not y_variable:
#             raise HTTPException(status_code=400, detail="y_variable is required")
        
#         # Get MinIO client and bucket name
#         from ..scope_selector.deps import get_minio_client
#         from ..scope_selector.config import get_settings
#         minio_client = get_minio_client()
#         scope_settings = get_settings()
#         bucket_name = scope_settings.minio_bucket
        
#         # Initialize trainer
#         trainer = StackModelTrainer()
        
#         # Calculate individual combination metrics
#         result = await trainer.calculate_individual_combination_metrics(
#             scope_number=scope_number,
#             combinations=combinations,
#             pool_by_identifiers=pool_by_identifiers,
#             x_variables=x_variables,
#             y_variable=y_variable,
#             minio_client=minio_client,
#             bucket_name=bucket_name,
#             apply_clustering=apply_clustering,
#             numerical_columns_for_clustering=numerical_columns_for_clustering,
#             n_clusters=n_clusters,
#             apply_interaction_terms=apply_interaction_terms,
#             numerical_columns_for_interaction=numerical_columns_for_interaction,
#             standardization=standardization,
#             k_folds=k_folds,
#             models_to_run=models_to_run,
#             custom_configs=custom_configs,
#             price_column=price_column,
#             run_id=run_id
#         )
        
#         # Check if calculation was successful
#         if result.get('status') == 'error':
#             raise HTTPException(status_code=500, detail=result.get('error', 'Unknown error'))
        
#         logger.info("Individual combination metrics calculation completed successfully")
#         return result
        
#     except HTTPException:
#         raise
#     except Exception as e:
#         logger.error(f"Error in individual combination metrics calculation: {str(e)}")
#         raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


def _get_ensemble_models_by_type(filtered_combination_results):
    """Helper function to get ensemble models grouped by type."""
    models_by_type = {}
    for combo_result in filtered_combination_results:
        for model in combo_result.get('model_results', []):
            model_name = model.get('model_name', 'unknown')
            if model_name not in models_by_type:
                models_by_type[model_name] = []
            models_by_type[model_name].append({
                'combination_id': combo_result.get('combination_id', ''),
                'mape_test': model.get('mape_test', 0),
                'r2_test': model.get('r2_test', 0),
                'ensemble_applied': combo_result.get('ensemble_applied', False)
            })
    return models_by_type

async def _save_results_to_minio(summary_data, file_key, minio_client, bucket_name):
    """Helper function to save results to MinIO."""
    try:
        import pandas as pd
        import pyarrow as pa
        import pyarrow.feather as feather
        from io import BytesIO
        
        summary_df = pd.DataFrame(summary_data)
        logger.info(f"📊 DataFrame shape: {summary_df.shape}")
        logger.info(f"📊 DataFrame columns: {list(summary_df.columns)}")
        
        arrow_buffer = BytesIO()
        table = pa.Table.from_pandas(summary_df)
        feather.write_feather(table, arrow_buffer)
        arrow_buffer.seek(0)
        
        # Save to MinIO
        minio_client.put_object(
            bucket_name,
            file_key,
            arrow_buffer,
            length=arrow_buffer.getbuffer().nbytes,
            content_type='application/vnd.apache.arrow.file'
        )
        logger.info(f"✅ Successfully saved results to MinIO: {file_key}")
        
    except Exception as e:
        logger.error(f"❌ Failed to save results to MinIO: {e}")
        logger.error(f"   Bucket: {bucket_name}")
        logger.error(f"   File key: {file_key}")
        logger.error(f"   Buffer size: {arrow_buffer.getbuffer().nbytes}")

@router.post("/mmm-train-models", response_model=ModelTrainingResponse, tags=["MMM Training"])
async def train_mmm_models(request: dict):

    try:
        # Generate unique run ID or use provided one
        run_id = request.get('run_id') or str(uuid.uuid4())
        
        # Extract parameters from request
        scope_number = request.get('scope_number')
        combinations = request.get('combinations', [])
        x_variables = request.get('x_variables', [])
        y_variable = request.get('y_variable')
        variable_configs = request.get('variable_configs', {})
        
        # Convert all variable names to lowercase for consistency
        x_variables = [var.lower() for var in x_variables] if x_variables else []
        y_variable = y_variable.lower() if y_variable else y_variable
        
        # Convert variable_configs keys to lowercase
        variable_configs_lower = {}
        for var, config in variable_configs.items():
            variable_configs_lower[var.lower()] = config
        variable_configs = variable_configs_lower
        
        # Individual modeling parameters
        individual_modeling = request.get('individual_modeling', True)  # Default to True for backward compatibility
        individual_models_to_run = request.get('individual_models_to_run', request.get('models_to_run', []))  # Fallback to models_to_run
        individual_custom_model_configs = request.get('individual_custom_model_configs', request.get('custom_model_configs', {}))
        # Convert list to dictionary for individual model configs
        if isinstance(individual_custom_model_configs, list):
            individual_custom_model_configs = {config.get('id', ''): config for config in individual_custom_model_configs if config.get('id')}
        individual_k_folds = request.get('individual_k_folds', request.get('k_folds', 5))
        individual_test_size = request.get('individual_test_size', request.get('test_size', 0.2))
        
        # Stack modeling parameters (similar to general models)
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
        logger.info(f"🔍 apply_interaction_terms: {apply_interaction_terms}")
        logger.info(f"🔍 numerical_columns_for_interaction: {numerical_columns_for_interaction}")
        
        price_column = request.get('price_column')
        
        # Convert all column names to lowercase for consistency
        pool_by_identifiers = [col.lower() for col in pool_by_identifiers] if pool_by_identifiers else []
        numerical_columns_for_clustering = [col.lower() for col in numerical_columns_for_clustering] if numerical_columns_for_clustering else []
        numerical_columns_for_interaction = [col.lower() for col in numerical_columns_for_interaction] if numerical_columns_for_interaction else []
        price_column = price_column.lower() if price_column else price_column
        
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
        
        # Validate individual modeling parameters if individual modeling is enabled
        if individual_modeling:
            if not individual_models_to_run:
                raise HTTPException(
                    status_code=400,
                    detail="individual_models_to_run is required when individual_modeling is enabled"
                )
        
        # Validate stack modeling parameters if stack modeling is enabled
        if stack_modeling:
            if not stack_models_to_run:
                raise HTTPException(
                    status_code=400,
                    detail="stack_models_to_run is required when stack_modeling is enabled"
                )
            # pool_by_identifiers is optional - can be empty list for individual modeling
            if apply_clustering and not numerical_columns_for_clustering:
                raise HTTPException(
                    status_code=400,
                    detail="numerical_columns_for_clustering is required when apply_clustering is enabled"
                )
        
        # Ensure at least one modeling approach is enabled
        if not individual_modeling and not stack_modeling:
            raise HTTPException(
                status_code=400,
                detail="At least one of individual_modeling or stack_modeling must be enabled"
            )
        
        # Validate variable configurations
        for var in x_variables:
            if var not in variable_configs:
                variable_configs[var] = {"type": "none"}
        
        # Import MMM trainer
        from .mmm_training import mmm_trainer
        
        # Get ROI configuration if provided
        roi_config = request.get('roi_config')
        logger.info(f"🔍 ROI config: {roi_config}")
        
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
        individual_models_count = len(individual_models_to_run) if individual_modeling else 0
        stack_models_count = len(stack_models_to_run) if stack_modeling else 0
        total_tasks = total_combinations * (individual_models_count + stack_models_count)
        
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
        all_variable_stats = {}
        
        # Process individual MMM training if enabled
        if individual_modeling:
            
            # Update training progress for UI
            training_progress[run_id]["stage"] = "individual_modeling"
            training_progress[run_id]["stage_description"] = "Training individual models"
            training_progress[run_id]["current_step"] = "Starting individual modeling"
        
        # Process individual MMM training for each combination if enabled
        if individual_modeling:
        # Process each combination
            for combination_index, combination in enumerate(combinations):
                # Update progress for UI
                training_progress[run_id]["current_combination"] = combination
                training_progress[run_id]["current_step"] = f"Reading file for {combination}"
                training_progress[run_id]["current"] = combination_index * individual_models_count
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
                        
                        # Update progress - reading file
                        training_progress[run_id]["current_model"] = "Reading data file..."
                        await asyncio.sleep(0.3)
                        
                        # Train MMM models for this combination
                        training_progress[run_id]["current_step"] = f"Training models for {combination}"
                        training_progress[run_id]["current_model"] = "Training MMM models..."
                        await asyncio.sleep(0.5)
                        
                        try:
                            # Convert x_variables to lowercase for consistency
                            x_variables_lower = [var.lower() for var in x_variables]
                            y_variable_lower = y_variable.lower()
                            
                            # Convert variable_configs keys to lowercase
                            variable_configs_lower = {}
                            for var, config in variable_configs.items():
                                variable_configs_lower[var.lower()] = config
                            
                            # Train MMM models
                                # Use price column from ROI config if available, otherwise use request price column
                                roi_price_column = None
                                if roi_config and roi_config.get('priceColumn'):
                                    roi_price_column = roi_config.get('priceColumn').lower()
                                else:
                                    roi_price_column = price_column.lower() if price_column else None
                                
                            model_results, variable_data = await mmm_trainer.train_mmm_models_for_combination(
                                file_key=target_file_key,
                                x_variables=x_variables_lower,
                                y_variable=y_variable_lower,
                                variable_configs=variable_configs_lower,
                                    models_to_run=individual_models_to_run,
                                    custom_configs=individual_custom_model_configs,  # Use individual configs
                                    k_folds=individual_k_folds,
                                    test_size=individual_test_size,
                                bucket_name=bucket_name,
                                    price_column=roi_price_column,  # Use ROI config price column
                                    roi_config=request.get('roi_config'),  # Pass ROI configuration
                                    combination_name=combination  # Pass the actual combination name
                            )
                            
                                                    # Update pogress
                            training_progress[run_id]["current"] += individual_models_count
                            training_progress[run_id]["percentage"] = int((training_progress[run_id]["current"] / training_progress[run_id]["total"]) * 100)
                            
                            # Store variable statistics
                            all_variable_stats[combination] = variable_data
                            
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
            
        # Log completion of individual modeling
        if individual_modeling:

            training_progress[run_id]["current_step"] = "Individual modeling completed"
        
        # MMM Stack modeling integration (similar to general models)
        if stack_modeling:
            logger.info(f"🔍 Starting MMM stack modeling with {len(combinations)} combinations")
            # logger.info(f"🔍 Stack models to run: {stack_models_to_run}")
            # logger.info(f"🔍 Pool by identifiers: {pool_by_identifiers}")
            # logger.info(f"🔍 Apply clustering: {apply_clustering}")
            # logger.info(f"🔍 Numerical columns for clustering: {numerical_columns_for_clustering}")
            
            try:
                # Import MMM stack trainer
                from .mmm_stack_training import MMMStackModelDataProcessor
                
                # Initialize MMM stack trainer
                mmm_stack_trainer = MMMStackModelDataProcessor()
                logger.info("✅ MMM stack trainer initialized")
                
                # Step 1: Prepare stack model data (get split clustered data)
                training_progress[run_id]["current_step"] = f"Reading and pooling data by {pool_by_identifiers}"
                # logger.info(f"🔍 Step 1: Preparing stack model data...")
                stack_data_result = await mmm_stack_trainer.prepare_stack_model_data(
                    scope_number=scope_number,
                    combinations=combinations,
                    pool_by_identifiers=pool_by_identifiers,
                    x_variables=x_variables,
                    y_variable=y_variable,
                    minio_client=minio_client,
                    bucket_name=bucket_name,
                    n_clusters=n_clusters,
                    clustering_columns=numerical_columns_for_clustering
                )
                
                logger.info(f"🔍 Stack data preparation result: {stack_data_result.get('status')}")
                
                if stack_data_result.get('status') != 'success':
                    error_msg = stack_data_result.get('error', 'Unknown error')
                    logger.error(f"❌ Failed to prepare MMM stack model data: {error_msg}")
                    raise Exception(f"Failed to prepare MMM stack model data: {error_msg}")
                
                split_clustered_data = stack_data_result.get('split_clustered_data', {})
                logger.info(f"✅ Stack data prepared successfully with {len(split_clustered_data)} pools")
                logger.info(f"🔍 Split clustered data keys: {list(split_clustered_data.keys())}")
                
                # Step 2: Train MMM stack models on prepared data
                training_progress[run_id]["current_step"] = f"Training {len(stack_models_to_run)} model(s) on {len(split_clustered_data)} pools"
                logger.info(f"🔍 Step 2: Training MMM stack models...")
                stack_training_result = await mmm_stack_trainer.train_mmm_models_for_stack_data(
                    split_clustered_data=split_clustered_data,
                    x_variables=x_variables,
                    y_variable=y_variable,
                    variable_configs=variable_configs,
                    models_to_run=stack_models_to_run,
                    apply_interaction_terms=apply_interaction_terms,
                    numerical_columns_for_interaction=numerical_columns_for_interaction,
                    test_size=stack_test_size,
                    price_column=price_column,
                    custom_configs=stack_custom_model_configs,
                    scope_number=scope_number,
                    combinations=combinations,
                    minio_client=minio_client,
                    bucket_name=bucket_name,
                    roi_config=roi_config,
                    run_id=run_id,
                    training_progress=training_progress
                )
                
                logger.info(f"🔍 Stack training result status: {stack_training_result.get('status') if stack_training_result else 'None'}")
                
                if stack_training_result and stack_training_result.get('status') == 'success':
                    logger.info("✅ Stack training completed successfully")
                    
                    # Process stack model results and merge them into existing combination results
                    # The stack_training_result contains individual_combination_metrics
                    stack_combination_results = stack_training_result.get('individual_combination_metrics', {})
                    logger.info(f"🔍 Stack combination results count: {len(stack_combination_results)}")
                    logger.info(f"🔍 Stack combination keys: {list(stack_combination_results.keys())}")
                    
                    # Process individual combination metrics (dictionary format)
                    for combination, model_results_dict in stack_combination_results.items():
                        # logger.info(f"🔍 Processing stack results for combination: {combination}")
                        # logger.info(f"🔍 Model results dict keys: {list(model_results_dict.keys())}")
                        
                        # Convert stack model results to match individual model format
                        stack_model_results_formatted = []
                        for param_model_key, model_result in model_results_dict.items():
                            logger.info(f"🔍 Processing model: {param_model_key}")
                            
                            # Safety check - ensure model_result is a dictionary
                            if not isinstance(model_result, dict):
                                logger.warning(f"⚠️ Model result is not a dictionary: {type(model_result)}")
                                continue
                            
                            # Format coefficients with Beta_ prefix for consistency
                            unstandardized_coeffs = model_result.get('unstandardized_coefficients', {})
                            standardized_coeffs = model_result.get('coefficients', {})
                            
                            # Add Beta_ prefix to coefficient keys if not already present
                            formatted_unstandardized_coeffs = {}
                            for key, value in unstandardized_coeffs.items():
                                if key.lower() != 'intercept' and not key.startswith('Beta_'):
                                    formatted_unstandardized_coeffs[f"Beta_{key}"] = value
                                elif key.lower() != 'intercept':
                                    formatted_unstandardized_coeffs[key] = value
                            
                            formatted_standardized_coeffs = {}
                            for key, value in standardized_coeffs.items():
                                if key.lower() != 'intercept' and not key.startswith('Beta_'):
                                    formatted_standardized_coeffs[f"Beta_{key}"] = value
                                elif key.lower() != 'intercept':
                                    formatted_standardized_coeffs[key] = value
                            
                            stack_model_result = {
                                "model_name": f"Stack_{model_result.get('model_name', 'Unknown')}",
                                "mape_train": model_result.get('mape_train', 0.0),
                                "mape_test": model_result.get('mape_test', 0.0),
                                "r2_train": model_result.get('r2_train', 0.0),
                                "r2_test": model_result.get('r2_test', 0.0),
                                "coefficients": formatted_unstandardized_coeffs,
                                "standardized_coefficients": formatted_standardized_coeffs,
                                "intercept": model_result.get('intercept', 0.0),
                                "unstandardized_intercept": model_result.get('unstandardized_intercept', 0.0),
                                "aic": model_result.get('aic', 0.0),
                                "bic": model_result.get('bic', 0.0),
                                "n_parameters": model_result.get('n_parameters', 0),
                                "price_elasticity": model_result.get('price_elasticity', None),
                                "elasticities": model_result.get('elasticities', {}),
                                "contributions": model_result.get('contributions', {}),
                                "transformation_metadata": model_result.get('transformation_metadata', {}),
                                "variable_configs": model_result.get('variable_configs', {}),
                                "combo_config": model_result.get('combo_config', {}),  # Include combo_config
                                "variable_averages": model_result.get('variable_averages', {}),  # Include variable averages
                                "roi_results": model_result.get('roi_results', {}),  # Include ROI results
                                "model_type": "mmm_stack",  # Mark as stack model
                                "best_alpha": model_result.get('best_alpha', None)
                            }
                            stack_model_results_formatted.append(stack_model_result)
                        
                        if stack_model_results_formatted:
                            # Find existing combination entry and merge stack models into it
                            existing_combination = None
                            for combo_result in combination_results:
                                if combo_result.get('combination_id') == combination:
                                    existing_combination = combo_result
                                    break
                            
                            if existing_combination:
                                # Merge stack models into existing combination's model_results
                                existing_combination['model_results'].extend(stack_model_results_formatted)
                                logger.info(f"Merged {len(stack_model_results_formatted)} MMM stack models into existing combination {combination}")
                                # Note: Don't increment completed_combinations here as it was already counted for individual models
                            else:
                                # If no existing combination found, create a new entry (fallback)
                                # For stack models, we need to preserve a source file key for S-curve module
                                # Try to find the original source file key from existing combinations
                                source_file_key = None
                                for existing_combo in combination_results:
                                    if existing_combo.get('combination_id') == combination:
                                        source_file_key = existing_combo.get('file_key')
                                        break
                                
                                # If no source file key found, try to construct the expected MinIO path
                                if not source_file_key:
                                    # Try to construct the expected file key based on the pattern used by individual models
                                    try:
                                        from ..scope_selector.config import get_settings
                                        scope_settings = get_settings()
                                        bucket_name = scope_settings.minio_bucket
                                        object_prefix = await get_object_prefix()
                                        source_file_key = f"{bucket_name}/{object_prefix}data/{combination}.arrow"
                                        # logger.info(f"🔍 Constructed source file key for stack model: {source_file_key}")
                                    except Exception as e:
                                        logger.warning(f"⚠️ Could not construct source file key for {combination}: {e}")
                                        source_file_key = combination  # Fallback to combination name
                                        logger.warning(f"⚠️ Using combination name as fallback: {source_file_key}")
                                
                                combination_results.append({
                                    "combination_id": combination,
                                    "file_key": source_file_key,  # Use original source file key for S-curve compatibility
                                    "total_records": 0,  # Individual metrics don't have total_records
                                    "model_results": stack_model_results_formatted
                                })
                                
                                # Update progress - combination completed (for stack-only mode)
                                training_progress[run_id]["completed_combinations"] += 1
                                                    
                    # Store stack modeling results in all_variable_stats
                    for combination, model_results_dict in stack_combination_results.items():
                        # Create variable stats entry for this combination
                        combination_variable_stats = {
                            'combination_results': []
                        }
                        
                        # Process each model result to extract variable averages
                        for param_model_key, model_result in model_results_dict.items():
                            if isinstance(model_result, dict):
                                # Extract variable averages from the model result
                                variable_averages = model_result.get('variable_averages', {})
                                combo_config = model_result.get('combo_config', {})
                                transformation_metadata = model_result.get('transformation_metadata', {})
                                
                                # Create combination result entry
                                combination_result = {
                                    'variable_averages': variable_averages,
                                    'combo_config': combo_config,
                                    'transformation_metadata': transformation_metadata
                                }
                                combination_variable_stats['combination_results'].append(combination_result)
                        
                        # Store in all_variable_stats
                        all_variable_stats[combination] = combination_variable_stats
                    
                    training_progress[run_id]["current_step"] = "Stack modeling completed"
                    logger.info("✅ MMM stack modeling completed successfully")
                else:
                    logger.error(f"❌ Stack training failed with status: {stack_training_result.get('status')}")
                    logger.error(f"   Error: {stack_training_result.get('error', 'Unknown error')}")
                    
                    # Add error details to combination_results for debugging
                    combination_results.append({
                        "combination_id": "mmm_stack_modeling_error",
                        "file_key": "mmm_stack_modeling_error",
                        "total_records": 0,
                        "model_results": [{
                            "model_name": "mmm_stack_modeling_error",
                            "error": stack_training_result.get('error', 'Unknown error'),
                            "mape_train": 0.0,
                            "mape_test": 0.0,
                            "r2_train": 0.0,
                            "r2_test": 0.0,
                            "coefficients": {},
                            "unstandardized_coefficients": {},
                            "intercept": 0.0,
                            "unstandardized_intercept": 0.0,
                            "aic": 0.0,
                            "bic": 0.0,
                            "n_parameters": 0,
                            "price_elasticity": None,
                            "elasticities": {},
                            "contributions": {},
                            "transformation_metadata": {},
                            "variable_configs": {},
                            "model_type": "mmm_stack_error",
                            "stack_cluster_id": "",
                            "best_alpha": None
                        }]
                    })
                    
            except Exception as e:
                logger.error(f"❌ Exception in MMM stack modeling: {str(e)}")
                import traceback
                logger.error(f"   Traceback: {traceback.format_exc()}")
                
                # Add error details to combination_results for debugging
                combination_results.append({
                    "combination_id": "mmm_stack_modeling_error",
                    "file_key": "mmm_stack_modeling_error",
                    "total_records": 0,
                    "model_results": [{
                        "model_name": "mmm_stack_modeling_error",
                        "error": str(e),
                        "mape_train": 0.0,
                        "mape_test": 0.0,
                        "r2_train": 0.0,
                        "r2_test": 0.0,
                        "coefficients": {},
                        "unstandardized_coefficients": {},
                        "intercept": 0.0,
                        "unstandardized_intercept": 0.0,
                        "aic": 0.0,
                        "bic": 0.0,
                        "n_parameters": 0,
                        "price_elasticity": None,
                        "elasticities": {},
                        "contributions": {},
                        "transformation_metadata": {},
                        "variable_configs": {},
                        "model_type": "mmm_stack_error",
                        "stack_cluster_id": "",
                        "best_alpha": None
                    }]
                })
        
        # Save all results to MongoDB (both individual and stack MMM models) in a single document
        if combination_results:
            try:

                
                # Filter out error combinations
                valid_combination_results = []
                for combo_result in combination_results:
                    model_results = combo_result.get("model_results", [])
                    if not any("error" in str(model.get("model_name", "")) for model in model_results):
                        valid_combination_results.append(combo_result)
                    else:
                        logger.warning(f"Skipping error combination {combo_result.get('combination_id')} for MongoDB save")
                
                if valid_combination_results:
                    logger.info(f"✅ Processed {len(valid_combination_results)} valid combinations for MMM training")
                    
                    # Store original individual parameter results before ensemble calculation
                    original_combination_results = []
                    for combo_result in combination_results:
                        # Create a deep copy of the original results
                        import copy
                        original_combo_result = copy.deepcopy(combo_result)
                        original_combination_results.append(original_combo_result)
                    
                    # Calculate ensemble results for each combination
                    # logger.info("🔄 Starting ensemble calculation for MMM model results")
                    ensemble_results = ensemble_calculator.calculate_ensemble_results(valid_combination_results)
                    
                    # Create ensemble summary
                    ensemble_summary = ensemble_calculator.create_ensemble_summary(ensemble_results)
                    # logger.info(f"📊 Ensemble calculation completed: {ensemble_summary}")
                    
                    # Create validation summary to ensure proper combination and model tracking
                    validation_summary = ensemble_calculator.create_validation_summary(ensemble_results)
                    # logger.info(f"🔍 Ensemble validation summary: {validation_summary['overall_stats']}")
                    
                    # Log any validation issues
                    if validation_summary['overall_stats']['validation_failed'] > 0:
                        logger.warning(f"⚠️ {validation_summary['overall_stats']['validation_failed']} validation issues found in ensemble calculation")
                        for model_key, model_val in validation_summary['model_validation'].items():
                            if not model_val.get('validation_passed', False):
                                logger.warning(f"   Validation failed for {model_key}: {model_val}")
                    
                    # Debug: Log ensemble results keys and combination results keys
                    logger.info(f"🔍 Ensemble results keys: {list(ensemble_results.keys())}")
                    combination_names = [combo.get('combination_id') for combo in combination_results]
                    # logger.info(f"🔍 Combination results keys: {combination_names}")
                    
                    # Update combination_results with ensemble results
                    # Replace individual model results with ensemble results for each combination
                    for i, combo_result in enumerate(combination_results):
                        combination_name = combo_result.get('combination_id', f'combination_{i}')
                        # logger.info(f"🔍 Processing combination: '{combination_name}'")
                        
                        if combination_name in ensemble_results:
                            # Replace model_results with ensemble results
                            ensemble_data = ensemble_results[combination_name]
                            ensemble_model_results = []
                            
                            # Convert ensemble results back to model_results format
                            for model_type, ensemble_metrics in ensemble_data.items():
                                # Ensure all numeric values are proper Python types
                                def safe_convert(value, default=0):
                                    import numpy as np
                                    if isinstance(value, np.integer):
                                        return int(value)
                                    elif isinstance(value, np.floating):
                                        return float(value)
                                    elif value is None:
                                        return default
                                    else:
                                        return value
                                
                                ensemble_model_result = {
                                    "model_name": model_type,
                                    "combination_index": 0,  # Single ensemble result
                                    "parameter_combination": ensemble_metrics.get('weighted_transformation_parameters', {}),
                                    "actual_parameters_used": ensemble_metrics.get('weighted_transformation_parameters', {}),
                                    "mape_train": safe_convert(ensemble_metrics.get('mape_train', 0)),
                                    "mape_test": safe_convert(ensemble_metrics.get('mape_test', 0)),
                                    "r2_train": safe_convert(ensemble_metrics.get('r2_train', 0)),
                                    "r2_test": safe_convert(ensemble_metrics.get('r2_test', 0)),
                                    "coefficients": ensemble_metrics.get('coefficients', {}),
                                    "standardized_coefficients": ensemble_metrics.get('coefficients', {}),
                                    "intercept": safe_convert(ensemble_metrics.get('intercept', 0)),
                                    "aic": safe_convert(ensemble_metrics.get('aic', 0)),
                                    "bic": safe_convert(ensemble_metrics.get('bic', 0)),
                                    "n_parameters": safe_convert(ensemble_metrics.get('n_parameters', 0)),
                                    "price_elasticity": safe_convert(ensemble_metrics.get('price_elasticity', 0)),
                                    "elasticities": ensemble_metrics.get('elasticities', {}),
                                    "contributions": ensemble_metrics.get('contributions', {}),
                                    "roi_results": ensemble_metrics.get('roi_results', {}),
                                    "transformation_metadata": ensemble_metrics.get('transformation_metadata', {}),
                                    "variable_configs": ensemble_metrics.get('weighted_transformation_parameters', {}),
                                    "ensemble_metadata": ensemble_metrics.get('ensemble_metadata', {})
                                }
                                ensemble_model_results.append(ensemble_model_result)
                            
                            # Update the combination result with ensemble results
                            combo_result['model_results'] = ensemble_model_results
                            combo_result['ensemble_applied'] = True
                            logger.info(f"✅ Applied ensemble calculation to {combination_name}: {len(ensemble_model_results)} model types")
                        else:
                            logger.warning(f"⚠️ No ensemble results found for combination: '{combination_name}'")
                            logger.warning(f"   Available ensemble keys: {list(ensemble_results.keys())}")
                            combo_result['ensemble_applied'] = False
                        
                else:
                    logger.warning("No valid combinations to save to MongoDB")
                    
            except Exception as e:
                logger.error(f"❌ Failed to save MMM results to MongoDB: {e}")
                # Don't fail the entire request if MongoDB save fails
        
        # Use ensemble results directly (no need for additional filtering)
        # The combination_results already contain ensemble results after ensemble calculation
        filtered_combination_results = []
        
        for combo_result in combination_results:
            combo_id = combo_result["combination_id"]
            
            # Check if ensemble calculation was applied
            if combo_result.get('ensemble_applied', False):
                logger.info(f"✅ Using ensemble results for {combo_id}")
                # The model_results already contain ensemble results
                filtered_combo_result = {
                    "combination_id": combo_id,
                    "file_key": combo_result.get("file_key", ""),
                    "total_records": combo_result.get("total_records", 0),
                    "model_results": combo_result["model_results"],  # Already contains ensemble results
                    "ensemble_applied": True
                }
            else:
                logger.warning(f"⚠️ No ensemble results found for {combo_id}, using original results")
                # Fallback to original results if ensemble wasn't applied
                filtered_combo_result = {
                    "combination_id": combo_id,
                    "file_key": combo_result.get("file_key", ""),
                    "total_records": combo_result.get("total_records", 0),
                    "model_results": combo_result["model_results"],
                    "ensemble_applied": False
                }
            
            filtered_combination_results.append(filtered_combo_result)
        
        # Prepare summary after ensemble results are created
        total_ensemble_models = sum(len(combo.get('model_results', [])) for combo in filtered_combination_results)
        ensemble_applied_count = sum(1 for combo in filtered_combination_results if combo.get('ensemble_applied', False))
        
        summary = {
            "run_id": run_id,
            "total_combinations_processed": len(combination_results),
            "total_models_returned": total_ensemble_models,  # Ensemble models in response
            "ensemble_applied_to_combinations": ensemble_applied_count,
            "note": "Response contains ensemble results for each model type per combination (weighted by MAPE performance).",
            "variable_transformations_applied": len(variable_configs),
            "business_constraints_applied": len(individual_custom_model_configs) + len(stack_custom_model_configs),
            "transformation_types_used": list(set(config.get("type", "none") for config in variable_configs.values())),
            "ensemble_models_by_type": _get_ensemble_models_by_type(filtered_combination_results),
            "stack_modeling_enabled": stack_modeling,
            "stack_models_count": sum(1 for combo in filtered_combination_results for model in combo.get('model_results', []) if 'Stack_' in model.get('model_name', '')) if stack_modeling else 0
        }
        
        # Populate ensemble model summaries by model type
        for combo_result in filtered_combination_results:
            combo_id = combo_result["combination_id"]
            if combo_id not in summary["ensemble_models_by_type"]:
                summary["ensemble_models_by_type"][combo_id] = {}
            
            for model_result in combo_result["model_results"]:
                model_name = model_result["model_name"]
                if model_name not in summary["ensemble_models_by_type"][combo_id]:
                    summary["ensemble_models_by_type"][combo_id][model_name] = {}
                
                # Store ensemble results for each model type
                summary["ensemble_models_by_type"][combo_id][model_name] = {
                        "mape_test": model_result["mape_test"],
                    "r2_test": model_result["r2_test"],
                    "ensemble_applied": combo_result.get("ensemble_applied", False),
                    "ensemble_metadata": model_result.get("ensemble_metadata", {})
                }
        
        # Save MMM results to MinIO (both ensemble and individual parameter results)
        try:
            # Get the standard prefix using get_object_prefix
            prefix = await get_object_prefix()
            
            # Create timestamp for data (not for filename - filename stays consistent to enable overwriting)
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            
            # Generate filenames for both ensemble and individual results (without timestamp to enable overwriting)
            ensemble_results_filename = f"mmm_ensemble_results_scope_{scope_number}.arrow"
            individual_results_filename = f"mmm_individual_results_scope_{scope_number}.arrow"
            
            # Construct the full paths with the standard structure
            ensemble_results_file_key = f"{prefix}model-results/{ensemble_results_filename}"
            individual_results_file_key = f"{prefix}model-results/{individual_results_filename}"
            
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
                    else:
                        identifiers = []
                else:
                    identifiers = []
            except Exception as e:
                identifiers = []
            
            # Prepare data for MinIO storage - both ensemble and individual results
            # 1. Prepare ensemble results data
            ensemble_summary_data = []
            for combo_result in combination_results:
                # Get variable averages for this combination
                combination_id = combo_result['combination_id']
                
                # Fix: all_variable_stats contains final_variable_statistics for each combination
                # We need to extract variable_averages from the combination_results
                variable_averages = {}
                
                # Check if all_variable_stats[combination] has combination_results
                if 'combination_results' in all_variable_stats.get(combination_id, {}):
                    combination_results_list = all_variable_stats[combination_id]['combination_results']
                    if combination_results_list and len(combination_results_list) > 0:
                        # Get variable_averages from the first combination result
                        variable_averages = combination_results_list[0].get('variable_averages', {})
                
                # Fallback: if no variable_averages found, try to get from any available combination
                if not variable_averages:
                    for combo_key, combo_data in all_variable_stats.items():
                        if 'combination_results' in combo_data:
                            combination_results_list = combo_data['combination_results']
                            if combination_results_list and len(combination_results_list) > 0:
                                variable_averages = combination_results_list[0].get('variable_averages', {})
                                if variable_averages:
                                    logger.info(f"🔍 Using fallback variable_averages from {combo_key}")
                                    break
                

                
                # Get column values for this combination from source file
                column_values = {}
                
                # Check if this is a stack model by looking at model names (they start with 'Stack_')
                model_results = combo_result.get('model_results', [])
                is_stack_model = any(model.get('model_name', '').startswith('Stack_') for model in model_results)
                
                if is_stack_model:
                    # For stack models, use default values since the file doesn't exist in MinIO
                    logger.info(f"📊 Stack model detected for {combination_id}, using default column values")
                    column_values = {identifier: "Stack Model" for identifier in identifiers}
                elif identifiers and combo_result.get('file_key'):
                    try:
                        column_values = await get_combination_column_values(
                            minio_client, 
                            bucket_name, 
                            combo_result['file_key'], 
                            identifiers
                        )
                    except Exception as e:
                        column_values = {identifier: "Unknown" for identifier in identifiers}
                else:
                    column_values = {identifier: "Unknown" for identifier in identifiers}
                
                for model_result in combo_result.get('model_results', []):
                    # Create base summary row (same structure as train-models-direct)
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
                        'timestamp': timestamp,
                        'result_type': 'ensemble'  # Mark as ensemble result
                    }
                    
                    # Add identifier column values (same as train-models-direct)
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
                    summary_row[y_avg_key] = variable_averages.get(y_variable.lower(), 0)
                    
                    coefficients = model_result.get('standardized_coefficients', {})
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
                    
                    # Add ROI results as individual columns (MMM-specific)
                    roi_results = model_result.get('roi_results', {})
                    for feature_name, roi_data in roi_results.items():
                        summary_row[f"{feature_name}_roi"] = roi_data.get('roi', 0)
                        # Do not save CPRP to MinIO
                    
                    # Add parameter_combination column for MMM modeling
                    # Convert combo_config to JSON string for storage in Arrow file
                    import json
                    combo_config = model_result.get('variable_configs', {})  # Use 'variable_configs' instead of 'combo_config'
                    
\
                    
                    if combo_config:
                        summary_row['parameter_combination'] = json.dumps(combo_config, default=str)
                    else:
                        summary_row['parameter_combination'] = ""
                        logger.warning(f"⚠️ No variable_configs found in model_result")
                    
                    ensemble_summary_data.append(summary_row)
            
            # 2. Prepare individual parameter results data (from original_combination_results)
            individual_summary_data = []
            if 'original_combination_results' in locals():
                for combo_result in original_combination_results:
                    # Get variable averages for this combination
                    combination_id = combo_result['combination_id']
       
                    # Get variable averages from all_variable_stats
                    variable_averages = {}
                    if 'combination_results' in all_variable_stats.get(combination_id, {}):
                        combination_results_list = all_variable_stats[combination_id]['combination_results']
                        if combination_results_list and len(combination_results_list) > 0:
                            variable_averages = combination_results_list[0].get('variable_averages', {})
                    
                    # Fallback: if no variable_averages found, try to get from any available combination
                    if not variable_averages:
                        for combo_key, combo_data in all_variable_stats.items():
                            if 'combination_results' in combo_data:
                                combination_results_list = combo_data['combination_results']
                                if combination_results_list and len(combination_results_list) > 0:
                                    variable_averages = combination_results_list[0].get('variable_averages', {})
                                    if variable_averages:
                                        logger.info(f"🔍 Using fallback variable_averages from {combo_key} for individual results")
                                        break
                    
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
                        except Exception as e:
                            logger.warning(f"⚠️ Could not get column values for {combination_id}: {e}")
                            column_values = {identifier: "Unknown" for identifier in identifiers}
                    else:
                        column_values = {identifier: "Unknown" for identifier in identifiers}
                    
                    # Process each model result in this combination
                    for model_result in combo_result.get('model_results', []):
                        # Create summary row for individual parameter result
                        summary_row = {
                            'run_id': run_id,
                            'scope_number': scope_number,
                            'combination_id': combination_id,
                            'model_name': model_result.get('model_name', 'Unknown'),
                            'combination_index': model_result.get('combination_index', 0),
                            'mape_train': model_result.get('mape_train', 0),
                            'mape_test': model_result.get('mape_test', 0),
                            'r2_train': model_result.get('r2_train', 0),
                            'r2_test': model_result.get('r2_test', 0),
                            'intercept': model_result.get('intercept', 0),
                            'unstandardized_intercept': model_result.get('unstandardized_intercept', 0),
                            'aic': model_result.get('aic', 0),
                            'bic': model_result.get('bic', 0),
                            'n_parameters': model_result.get('n_parameters', 0),
                            'price_elasticity': model_result.get('price_elasticity', 0),
                            'total_records': combo_result.get('total_records', 0),
                            'file_key': combo_result.get('file_key', ''),
                            'result_type': 'individual_parameter'  # Mark as individual result
                        }
                        
                        # Add identifier columns
                        for identifier in identifiers:
                            summary_row[identifier] = column_values.get(identifier, "Unknown")
                        
                        # Add variable average columns
                        for var_name, var_value in variable_averages.items():
                            # variable_averages contains simple float values (means), not dictionaries
                            summary_row[f"{var_name}_mean"] = var_value if isinstance(var_value, (int, float)) else 0
                            # For individual results, we don't have std/min/max from variable_average
                        
                        # Add coefficient values for each X-variable (using standardized coefficients)
                        coefficients = model_result.get('standardized_coefficients', {})
                        for x_var in x_variables:
                            beta_key = f"{x_var}_beta"
                            summary_row[beta_key] = coefficients.get(f"Beta_{x_var.lower()}", 0)
                        
                        # Add elasticity values for each X-variable
                        elasticities = model_result.get('elasticities', {})
                        for x_var in x_variables:
                            elasticity_key = f"{x_var}_elasticity"
                            summary_row[elasticity_key] = elasticities.get(x_var.lower(), 0)
                        
                        # Add contribution values for each X-variable
                        contributions = model_result.get('contributions', {})
                        for x_var in x_variables:
                            contribution_key = f"{x_var}_contribution"
                            summary_row[contribution_key] = contributions.get(x_var.lower(), 0)
                        
                        # Add ROI results as individual columns
                        roi_results = model_result.get('roi_results', {})
                        for feature_name, roi_data in roi_results.items():
                            summary_row[f"{feature_name}_roi"] = roi_data.get('roi', 0)
                            # Do not save CPRP to MinIO
                        
                        # Add parameter_combination column
                        import json
                        combo_config = model_result.get('variable_configs', {})
                        if combo_config:
                            summary_row['parameter_combination'] = json.dumps(combo_config, default=str)
                        else:
                            summary_row['parameter_combination'] = ""
                        
                        individual_summary_data.append(summary_row)

            
            # Save ensemble results to MinIO
            if ensemble_summary_data:
                # logger.info(f"📊 Preparing to save {len(ensemble_summary_data)} MMM ensemble results to MinIO")
                await _save_results_to_minio(ensemble_summary_data, ensemble_results_file_key, minio_client, bucket_name)
            
            # Save individual parameter results to MinIO
            if individual_summary_data:
                # logger.info(f"📊 Preparing to save {len(individual_summary_data)} MMM individual parameter results to MinIO")
                await _save_results_to_minio(individual_summary_data, individual_results_file_key, minio_client, bucket_name)
                    
        except Exception as e:
            logger.error(f"❌ Failed to prepare MMM results for MinIO saving: {e}")
            import traceback
            logger.error(f"   Traceback: {traceback.format_exc()}")
        
        # Save to MongoDB using the same structure as train-models-direct
        try:
            # Extract client_name, app_name, project_name from object_prefix
            client_name = "Quant_Matrix_AI_Schema"  # Default
            app_name = "marketing-mix"  # Default
            project_name = "New Marketing Mix Modeling Project 1"  # Default
            
            try:
                if object_prefix and object_prefix != "blank/blank project/":
                    prefix_parts = object_prefix.rstrip('/').split('/')
                    if len(prefix_parts) >= 3:
                        client_name = prefix_parts[0]
                        app_name = prefix_parts[1]
                        project_name = prefix_parts[2] if len(prefix_parts) > 2 else "default_project"
            except Exception as e:
                logger.warning(f"Could not extract client/app/project from object_prefix: {e}")
            
            # Extract model coefficients from combination results
            model_coefficients = {}
            combination_file_keys = []
            
            # Add ensemble results file key
            if 'ensemble_results_file_key' in locals():
                combination_file_keys.append({
                    "combination": "ensemble_results",
                    "file_key": ensemble_results_file_key,
                    "result_type": "ensemble"
                })
            
            # Add individual parameter results file key
            if 'individual_results_file_key' in locals():
                combination_file_keys.append({
                    "combination": "individual_parameter_results", 
                    "file_key": individual_results_file_key,
                    "result_type": "individual_parameters"
                })
            
            # Build combination_file_keys from current combination_results
            # Use the exact combination_id from results (which matches the request combinations)
            for i, combo_result in enumerate(combination_results):
                # Use combination_id from the result (which should match the original combination from request)
                if 'combination_id' in combo_result:
                    combination_name = combo_result['combination_id']
                    
                    # Verify this combination matches one from the request
                    if combination_name not in combinations:
                        logger.warning(f"⚠️ combination_id '{combination_name}' not found in request combinations list")
                    
                    # Add original file key if available (skip for stack models)
                    if 'file_key' in combo_result:
                        file_key = combo_result['file_key']
                        # Check if this is a stack model by looking at model names
                        model_results = combo_result.get('model_results', [])
                        is_stack_model = any(model.get('model_name', '').startswith('Stack_') for model in model_results)
                        
                        if is_stack_model:
                            # For stack models, keep the source file key for S-curve compatibility
                            # The file_key should be the original source file key, not a stack-specific key
                            logger.info(f"📊 Using source file key for stack model {combination_name}: {file_key}")
                            # Don't set file_key = None, keep the original source file key
                        
                        if file_key:  # Only add if file_key is not None
                            logger.info(f"📝 Adding combination_file_key: {combination_name} -> {file_key}")
                            combination_file_keys.append({
                                "combination": combination_name,
                                "file_key": file_key,
                                "result_type": "source_data"
                            })
                        else:
                            logger.warning(f"⚠️ No file_key found for combination {combination_name}")
                    else:
                        logger.warning(f"⚠️ No file_key in combo_result for combination {combination_name}")
                    
                    # Extract model coefficients for this combination
                    if 'model_results' in combo_result:
                        combination_coefficients = {}
                        for model_result in combo_result['model_results']:
                            model_name = model_result.get('model_name', 'unknown')
                            coefficients = model_result.get('coefficients', {})
                            intercept = model_result.get('intercept', 0)
                            
                            # Debug: Check for None values that could cause multiplication errors
                            if intercept is None:
                                logger.warning(f"⚠️ Found None intercept for {model_name} in {combination_name}, setting to 0")
                                intercept = 0
                            
                            # Check coefficients for None values
                            if coefficients is None:
                                logger.warning(f"⚠️ Found None coefficients for {model_name} in {combination_name}, setting to empty dict")
                                coefficients = {}
                            
                            transformation_metadata = model_result.get('transformation_metadata', {})
                            
                            combination_coefficients[model_name] = {
                                "intercept": intercept,
                                "coefficients": coefficients,
                                "x_variables": x_variables,
                                "y_variable": y_variable,
                                "transformation_metadata": transformation_metadata  # Per-model transformation metadata
                            }
                        
                        model_coefficients[combination_name] = combination_coefficients
            
            # Prepare comprehensive build configuration data
            # Ensure no None values that could cause MongoDB errors
            build_config_data = {
                "run_id": run_id or "",
                "scope_number": scope_number or "",
                "combinations": combinations or [],
                "x_variables": x_variables or [],
                "y_variable": y_variable or "",
                "standardization": "mmm_per_variable",
                "k_folds": individual_k_folds if individual_k_folds is not None else 5,
                "models_to_run": individual_models_to_run or [],
                "total_combinations_processed": len(combination_results) if combination_results else 0,
                "total_models_saved": len([r for r in combination_results if 'model_results' in r]) if combination_results else 0,
                "combination_file_keys": combination_file_keys or [],
                "model_coefficients": model_coefficients or {},
                "created_at": datetime.now().isoformat(),
                "training_status": "completed",
                
                # Individual modeling configuration
                "individual_modeling": individual_modeling if individual_modeling is not None else True,
                "individual_k_folds": individual_k_folds if individual_k_folds is not None else 5,
                "individual_test_size": individual_test_size if individual_test_size is not None else 0.2,
                "individual_models_to_run": individual_models_to_run or [],
                "individual_custom_model_configs": individual_custom_model_configs or {},
                
                # Stack modeling configuration
                "stack_modeling": stack_modeling if stack_modeling is not None else False,
                "stack_k_folds": stack_k_folds if stack_k_folds is not None else 5,
                "stack_test_size": stack_test_size if stack_test_size is not None else 0.2,
                "stack_models_to_run": stack_models_to_run or [],
                "stack_custom_model_configs": stack_custom_model_configs or {},
                "pool_by_identifiers": pool_by_identifiers or [],
                
                # Clustering configuration
                "apply_clustering": apply_clustering if apply_clustering is not None else False,
                "numerical_columns_for_clustering": numerical_columns_for_clustering or [],
                "n_clusters": n_clusters if n_clusters is not None else 3,
                
                # Interaction terms configuration
                "apply_interaction_terms": apply_interaction_terms if apply_interaction_terms is not None else False,
                "numerical_columns_for_interaction": numerical_columns_for_interaction or [],
                
                # ROI configuration (if available in request)
                "roi_config": request.get('roi_config', {}),
                
                # Constraints configuration (if available in request)
                "constraints_config": request.get('constraints_config', {}),
                
                # Price column configuration
                "price_column": request.get('price_column') or "",
                
                # Test size configuration
                "test_size": request.get('test_size', 0.2) if request.get('test_size') is not None else 0.2,
                "mmm_training": True,
                
                # Additional metadata
                "client_name": client_name,
                "app_name": app_name,
                "project_name": project_name,
                 "application_type": "mmm"
            }
            
            # Debug: Check build_config_data for None values before saving to MongoDB
            logger.info("🔍 Checking build_config_data for None values before MongoDB save...")
            none_values_found = []
            for key, value in build_config_data.items():
                if value is None:
                    none_values_found.append(key)
                    logger.warning(f"⚠️ Found None value for key '{key}' in build_config_data")
            
            if none_values_found:
                logger.warning(f"⚠️ Found {len(none_values_found)} None values in build_config_data: {none_values_found}")
            else:
                logger.info("✅ No None values found in build_config_data")
            
            # Note: Since save_build_config now always overwrites the entire document,
            # we don't need to merge with existing data - just use the new combination_file_keys directly
            logger.info(f"📝 Using new combination_file_keys directly (MongoDB will overwrite entire document)")

            # Save to MongoDB with detailed error handling
            try:
                mongo_result = await save_build_config(
                    client_name=client_name,
                    app_name=app_name,
                    project_name=project_name,
                    build_data=build_config_data,
                    user_id="",  # You can add user_id if available
                    project_id=None  # You can add project_id if available
                )
                
                if mongo_result["status"] == "success":
                    # logger.info(f"📦 MMM Build configuration saved to MongoDB: {mongo_result['mongo_id']}")
                    pass
                else:
                    logger.error(f"❌ Failed to save MMM build configuration to MongoDB: {mongo_result['error']}")
            except Exception as mongo_error:
                logger.error(f"❌ Exception during MongoDB save: {str(mongo_error)}")
                logger.error(f"   Error type: {type(mongo_error)}")
                import traceback
                logger.error(f"   Traceback: {traceback.format_exc()}")
                # Don't fail the entire request if MongoDB save fails
        except Exception as e:
            logger.error(f"❌ Error saving MMM build configuration to MongoDB: {str(e)}")
            import traceback
            logger.error(f"   Traceback: {traceback.format_exc()}")
            # Don't fail the entire request if MongoDB save fails
        
        return ModelTrainingResponse(
            scope_id=f"scope_{scope_number}",
            set_name=f"Scope_{scope_number}",
            x_variables=x_variables,
            y_variable=y_variable,
            standardization="mmm_per_variable",
            k_folds=individual_k_folds,
            total_combinations=len(combination_results),
            combination_results=filtered_combination_results,  # Only best models
            summary=summary
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")





# @router.post("/mmm-stack-simple", response_model=Dict[str, Any])
# async def mmm_stack_simple_training(request: Dict[str, Any]):
#     """
#     Simple stack training endpoint that only calls prepare_stack_data and _train_stack_models_for_betas.
#     Returns just the model results without individual combination metrics.
#     """
#     try:
#         # Extract parameters from request (same as mmm-stack-train-models)
#         scope_number = request.get('scope_number')
#         combinations = request.get('combinations', [])
#         pool_by_identifiers = request.get('pool_by_identifiers', [])
#         x_variables = request.get('x_variables', [])
#         y_variable = request.get('y_variable')
#         variable_configs = request.get('variable_configs', {})
#         models_to_run = request.get('models_to_run', ['Linear Regression'])
#         custom_configs = request.get('custom_configs', {})
#         apply_interaction_terms = request.get('apply_interaction_terms', True)
#         numerical_columns_for_interaction = request.get('numerical_columns_for_interaction', [])
#         test_size = request.get('test_size', 0.2)
#         price_column = request.get('price_column')
#         n_clusters = request.get('n_clusters', None)
#         clustering_columns = request.get('clustering_columns', None)
        
#         # Validate required parameters
#         if not scope_number:
#             raise HTTPException(status_code=400, detail="scope_number is required")
#         if not combinations:
#             raise HTTPException(status_code=400, detail="combinations list is required")
#         if not x_variables:
#             raise HTTPException(status_code=400, detail="x_variables list is required")
#         if not y_variable:
#             raise HTTPException(status_code=400, detail="y_variable is required")
        
#         logger.info(f"Starting simple MMM stack training for scope {scope_number}")
#         logger.info(f"Combinations: {combinations}")
#         logger.info(f"X variables: {x_variables}")
#         logger.info(f"Y variable: {y_variable}")
        
#         # Get MinIO client and bucket
#         minio_client = get_minio_client()
        
#         # Get bucket name from scope selector config
#         try:
#             from ..scope_selector.config import get_settings
#             scope_settings = get_settings()
#             bucket_name = scope_settings.minio_bucket
#             logger.info(f"Using bucket from scope selector config: '{bucket_name}'")
#         except Exception as e:
#             bucket_name = "Quant_Matrix_AI_Schema"  # Fallback bucket
#             logger.info(f"Using fallback bucket: '{bucket_name}' (error: {e})")
        
#         # Initialize the stack training processor
#         from .mmm_stack_training import MMMStackModelDataProcessor
#         processor = MMMStackModelDataProcessor()
        
#         # Step 1: Prepare stack data
#         logger.info("Step 1: Preparing stack data...")
#         split_clustered_data = await processor.prepare_stack_model_data(
#             scope_number=scope_number,
#             combinations=combinations,
#             pool_by_identifiers=pool_by_identifiers,
#             x_variables=x_variables,
#             y_variable=y_variable,
#             minio_client=minio_client,
#             bucket_name=bucket_name,
#             n_clusters=n_clusters,
#             clustering_columns=clustering_columns
#         )
        
#         if not split_clustered_data:
#             raise HTTPException(status_code=400, detail="Failed to prepare stack data")
        
#         logger.info(f"Prepared {len(split_clustered_data)} split clusters")
        
#         # Step 2: Train stack models for betas
#         logger.info("Step 2: Training stack models for betas...")
#         logger.info(f"Split clustered data keys: {list(split_clustered_data.keys())}")
#         logger.info(f"X variables: {x_variables}")
#         logger.info(f"Y variable: {y_variable}")
#         logger.info(f"Variable configs: {variable_configs}")
#         logger.info(f"Models to run: {models_to_run}")
        
#         stack_model_results = await processor._train_stack_models_for_betas(
#             split_clustered_data=split_clustered_data,
#             x_variables=x_variables,
#             y_variable=y_variable,
#             variable_configs=variable_configs,
#             models_to_run=models_to_run,
#             custom_configs=custom_configs,
#             apply_interaction_terms=apply_interaction_terms,
#             numerical_columns_for_interaction=numerical_columns_for_interaction,
#             test_size=test_size,
#             price_column=price_column
#         )
        
#         logger.info(f"Trained {len(stack_model_results)} stack models")
#         if stack_model_results:
#             logger.info(f"Sample model result keys: {list(stack_model_results[0].keys()) if stack_model_results else 'No results'}")
#         else:
#             logger.warning("No models were trained - check the _train_stack_models_for_betas function")
        
#         # Return simple results
#         return {
#             "status": "success",
#             "total_models_trained": len(stack_model_results),
#             "split_clusters": len(split_clustered_data),
#             "stack_model_results": stack_model_results
#         }
        
#     except HTTPException:
#         raise
#     except Exception as e:
#         logger.error(f"Error in simple MMM stack training: {str(e)}")
#         raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

#     @router.post("/mmm-stack-individual-metrics")
#     async def mmm_stack_individual_metrics(request: Dict[str, Any]):
#         """
#         Get individual combination metrics from stack training without response validation.
#         Returns raw results including individual combination metrics.
#         """
#         try:
#             # Extract parameters from request
#             scope_number = request.get('scope_number')
#             combinations = request.get('combinations', [])
#             pool_by_identifiers = request.get('pool_by_identifiers', [])
#             x_variables = request.get('x_variables', [])
#             y_variable = request.get('y_variable')
#             variable_configs = request.get('variable_configs', {})
#             models_to_run = request.get('models_to_run', ['Linear Regression'])
#             custom_configs = request.get('custom_configs', {})
#             apply_interaction_terms = request.get('apply_interaction_terms', True)
#             numerical_columns_for_interaction = request.get('numerical_columns_for_interaction', [])
#             test_size = request.get('test_size', 0.2)
#             price_column = request.get('price_column')
#             roi_config = request.get('roi_config')
#             n_clusters = request.get('n_clusters', None)
#             clustering_columns = request.get('clustering_columns', None)
        
#         # Validate required parameters
#         if not scope_number:
#             raise HTTPException(status_code=400, detail="scope_number is required")
#         if not combinations:
#             raise HTTPException(status_code=400, detail="combinations list is required")
#         if not x_variables:
#             raise HTTPException(status_code=400, detail="x_variables list is required")
#         if not y_variable:
#             raise HTTPException(status_code=400, detail="y_variable is required")
        
#         logger.info(f"Starting individual metrics extraction for scope {scope_number}")
#         logger.info(f"Combinations: {combinations}")
#         logger.info(f"X variables: {x_variables}")
#         logger.info(f"Y variable: {y_variable}")
        
#         # Get MinIO client and bucket
#         minio_client = get_minio_client()
        
#         # Get bucket name from scope selector config
#         try:
#             from ..scope_selector.config import get_settings
#             scope_settings = get_settings()
#             bucket_name = scope_settings.minio_bucket
#             logger.info(f"Using bucket from scope selector config: '{bucket_name}'")
#         except Exception as e:
#             bucket_name = "Quant_Matrix_AI_Schema"  # Fallback bucket
#             logger.info(f"Using fallback bucket: '{bucket_name}' (error: {e})")
        
#         # Initialize the stack training processor
#         from .mmm_stack_training import MMMStackModelDataProcessor
#         processor = MMMStackModelDataProcessor()
        
#         # Step 1: Prepare stack data
#         logger.info("Step 1: Preparing stack data...")
#         split_clustered_data = await processor.prepare_stack_model_data(
#             scope_number=scope_number,
#             combinations=combinations,
#             pool_by_identifiers=pool_by_identifiers,
#             x_variables=x_variables,
#             y_variable=y_variable,
#             minio_client=minio_client,
#             bucket_name=bucket_name,
#             n_clusters=n_clusters,
#             clustering_columns=clustering_columns
#         )
        
#         if not split_clustered_data:
#             raise HTTPException(status_code=400, detail="Failed to prepare stack data")
        
#         logger.info(f"Prepared {len(split_clustered_data.get('split_clustered_data', {}))} split clusters")
        
#         # Step 2: Train stack models for betas
#         logger.info("Step 2: Training stack models for betas...")
#         stack_model_results = await processor._train_stack_models_for_betas(
#             split_clustered_data=split_clustered_data,
#             x_variables=x_variables,
#             y_variable=y_variable,
#             variable_configs=variable_configs,
#             models_to_run=models_to_run,
#             custom_configs=custom_configs,
#             apply_interaction_terms=apply_interaction_terms,
#             numerical_columns_for_interaction=numerical_columns_for_interaction,
#             test_size=test_size,
#             price_column=price_column
#         )
        
#         logger.info(f"Trained {len(stack_model_results)} stack models")
        
#         # Step 3: Calculate individual combination metrics
#         logger.info("Step 3: Calculating individual combination metrics...")
#         individual_metrics = await processor._calculate_individual_combination_metrics(
#             scope_number=scope_number,
#             combinations=combinations,
#             x_variables=x_variables,
#             y_variable=y_variable,
#             minio_client=minio_client,
#             bucket_name=bucket_name,
#             stack_model_results=stack_model_results,
#             variable_configs=variable_configs,
#             price_column=price_column,
#             roi_config=roi_config
#         )
        
#         logger.info(f"Calculated individual metrics for {len(individual_metrics)} combinations")
        
#         # Return raw results without validation
#         return {
#             "status": "success",
#             "scope_number": scope_number,
#             "combinations": combinations,
#             "individual_metrics": individual_metrics,
#             "split_clustered_data_summary": {
#                 "total_clusters": len(split_clustered_data.get('split_clustered_data', {})),
#                 "cluster_keys": list(split_clustered_data.get('split_clustered_data', {}).keys()) if split_clustered_data.get('split_clustered_data') else []
#             }
#         }
        
#     except HTTPException:
#         raise
#     except Exception as e:
#         logger.error(f"Error in individual metrics extraction: {str(e)}")
#         raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")