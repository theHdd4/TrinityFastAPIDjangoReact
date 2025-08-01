from fastapi import APIRouter, HTTPException, Query, Path
import logging
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
    ModelResult
)



####mmm settings 
# Data processing imports
import pandas as pd
import numpy as np
from io import StringIO, BytesIO

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

# Marketing helper functions
from .marketing_helpers import (
    apply_transformations_by_region,
    calculate_media_elasticity,
    calculate_contributions,
    save_dataframe_to_minio,
    save_transformation_metadata,
    get_transformation_metadata,
    get_file_from_source,
    calculate_model_metrics,
    adstock_function,
    logistic_function,
    power_function
)

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



@router.post("/train-models", response_model=ModelTrainingResponse, tags=["Model Training"])
async def train_models(request: ModelTrainingRequest):
    """
    Train models with enhanced result tracking and storage.
    """
    try:
        # Generate unique run ID
        run_id = str(uuid.uuid4())
        logger.info(f"Starting enhanced model training with run_id: {run_id}")
        
        # Get scope combinations
        scope_data = await get_scope_set_with_columns(request.scope_id, request.set_name)
        
        if not scope_data:
            raise HTTPException(
                status_code=404,
                detail=f"Scope {request.scope_id} with set {request.set_name} not found"
            )
        
        # Validate variables
        available_columns = scope_data['columns']
        all_variables = request.x_variables + [request.y_variable]
        missing_vars = [var for var in all_variables if var not in available_columns]
        
        if missing_vars:
            raise HTTPException(
                status_code=400,
                detail=f"Variables not found in data: {missing_vars}"
            )
        
        # Process each combination
        combination_results = []
        total_saved = 0
        all_variable_stats = {}
        
        for combination in scope_data['combinations']:
            logger.info(f"Training models for combination: {combination['combination_id']}")
            
            # Train models with enhanced tracking
            # Train models with enhanced tracking
            model_results, variable_data = await train_models_for_combination_enhanced(
                file_key=combination['file_key'],
                x_variables=request.x_variables,
                y_variable=request.y_variable,
                price_column=request.price_column,  # ← Add this line
                standardization=request.standardization,
                k_folds=request.k_folds,
                models_to_run=request.models_to_run,
                custom_configs=request.custom_model_configs
            )
            
            
            # ⭐ ADD YOUR CODE HERE ⭐
            # Extract fold elasticities from model results
            for model_result in model_results:
                fold_elasticities = []
                if 'fold_results' in model_result:
                    for fold in model_result['fold_results']:
                        if fold.get('price_elasticity') is not None:
                            fold_elasticities.append(fold['price_elasticity'])
                
                # Add to model result
                if fold_elasticities:
                    model_result['fold_elasticities'] = fold_elasticities
            
            # Store variable statistics for this combination
            all_variable_stats[combination['combination_id']] = variable_data



            # Store variable statistics for this combination
            all_variable_stats[combination['combination_id']] = variable_data
            
            # Save enhanced results to MongoDB
            try:
                saved_ids = await save_model_results_enhanced(
                    scope_id=request.scope_id,
                    scope_name=scope_data['scope_name'],
                    set_name=request.set_name,
                    combination=combination,
                    model_results=model_results,
                    x_variables=request.x_variables,
                    y_variable=request.y_variable,
                    price_column=request.price_column,  # ADD THIS LINE
                    standardization=request.standardization,
                    k_folds=request.k_folds,
                    run_id=run_id,
                    variable_data=variable_data
                )


                total_saved += len(saved_ids)
                logger.info(f"Saved {len(saved_ids)} enhanced models for {combination['combination_id']}")
                
            except Exception as e:
                logger.error(f"Failed to save results for {combination['combination_id']}: {e}")
            
            combination_results.append({
                "combination_id": combination['combination_id'],
                "channel": combination['channel'],
                "brand": combination['brand'],
                "ppg": combination['ppg'],
                "file_key": combination['file_key'],
                "total_records": combination.get('record_count', 0),
                "model_results": model_results,
                "variable_averages": variable_data.get("variable_averages", {})
            })
        
        # Enhanced summary
        summary = {
            "total_models_per_combination": len(model_results) if model_results else 0,
            "best_model_by_mape": {},
            "best_model_by_r2": {},
            "run_id": run_id,
            "total_models_saved": total_saved,
            "save_status": "success" if total_saved > 0 else "failed",
            "variable_summary": all_variable_stats
        }
        
        # Find best models
        for combo_result in combination_results:
            combo_id = combo_result['combination_id']
            
            if combo_result['model_results']:
                # Best by MAPE
                best_mape = min(combo_result['model_results'], key=lambda x: x['mape_test'])
                summary["best_model_by_mape"][combo_id] = {
                    "model": best_mape['model_name'],
                    "mape_test": best_mape['mape_test'],
                    "mape_test_std": best_mape.get('mape_test_std', 0)
                }
                
                # Best by R2
                best_r2 = max(combo_result['model_results'], key=lambda x: x['r2_test'])
                summary["best_model_by_r2"][combo_id] = {
                    "model": best_r2['model_name'],
                    "r2_test": best_r2['r2_test'],
                    "r2_test_std": best_r2.get('r2_test_std', 0)
                }
        
        return ModelTrainingResponse(
            scope_id=request.scope_id,
            set_name=request.set_name,
            x_variables=request.x_variables,
            y_variable=request.y_variable,
            standardization=request.standardization,
            k_folds=request.k_folds,
            total_combinations=len(combination_results),
            combination_results=combination_results,
            summary=summary
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in enhanced model training: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    
    


@router.get("/model-results/detailed/{run_id}", tags=["Model Results"])
async def get_detailed_model_results(
    run_id: str = Path(..., description="Run ID from training session"),
    include_folds: bool = Query(False, description="Include fold-wise details")
):
    """Retrieve detailed model results with variable statistics."""
    if build_collection is None:
        raise HTTPException(status_code=503, detail="MongoDB not available")
    
    try:
        # Query for aggregated results only
        query = {"run_id": run_id, "is_fold_result": False}
        results = []
        
        cursor = build_collection.find(query)
        async for doc in cursor:
            doc["_id"] = str(doc["_id"])
            if not include_folds:
                doc.pop("fold_results", None)
            results.append(doc)
        
        if not results:
            raise HTTPException(status_code=404, detail=f"No results found for run_id: {run_id}")
        
        # Extract variable averages from first result
        variable_averages_summary = {}
        if results:
            for var, avg in results[0].get("variable_averages", {}).items():
                variable_averages_summary[var] = avg
        
        return {
            "run_id": run_id,
            "total_models": len(results),
            "variable_averages": variable_averages_summary,
            "results": results
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving detailed results: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/model-results/variable-stats/{run_id}", tags=["Model Results"])
async def get_variable_statistics(
    run_id: str = Path(..., description="Run ID from training session")
):
    """Get variable statistics for all combinations in a training run."""
    if build_collection is None:
        raise HTTPException(status_code=503, detail="MongoDB not available")
    
    try:
        pipeline = [
            {"$match": {"run_id": run_id, "is_fold_result": False}},
            {
                "$group": {
                    "_id": "$combination_id",
                    "channel": {"$first": "$channel"},
                    "brand": {"$first": "$brand"},
                    "ppg": {"$first": "$ppg"},
                    "variable_statistics": {"$first": "$variable_statistics"},
                    "variable_averages": {"$first": "$variable_averages"}
                }
            }
        ]
        
        results = []
        async for doc in build_collection.aggregate(pipeline):
            results.append({
                "combination_id": doc["_id"],
                "channel": doc["channel"],
                "brand": doc["brand"],
                "ppg": doc["ppg"],
                "variable_statistics": doc["variable_statistics"],
                "variable_averages": doc["variable_averages"]
            })
        
        return {
            "run_id": run_id,
            "combinations": results
        }
        
    except Exception as e:
        logger.error(f"Error retrieving variable statistics: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    
    
    
    
    
from fastapi.responses import StreamingResponse
from typing import Optional

@router.get("/model-results/export/{run_id}", tags=["Model Results"])
async def export_model_results_csv(
    run_id: str = Path(..., description="Run ID from training session"),
    include_folds: bool = Query(False, description="Include fold-wise details"),
    save_only: bool = Query(False, description="Only save to MinIO without downloading")
):
    """
    Export model results to CSV format with MinIO storage.
    
    Features:
    - Downloads CSV file by default
    - Saves to MinIO bucket for permanent storage
    - Option to only save without downloading
    - Includes fold-level details if requested
    
    Returns:
    - CSV file download (default)
    - JSON response with MinIO path if save_only=True
    """
    try:
        # Generate CSV and save to MinIO
        csv_data, minio_file_key = await export_results_to_csv_and_minio(run_id, include_folds)
        
        if save_only:
            # Return JSON response with file location
            return {
                "status": "success",
                "message": "CSV saved to MinIO",
                "minio_bucket": settings.minio_results_bucket,
                "file_key": minio_file_key,
                "download_url": f"/api/v1/model-results/download/{minio_file_key}"
            }
        else:
            # Return CSV as download
            filename = f"model_results_{run_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
            
            return StreamingResponse(
                iter([csv_data.getvalue()]),
                media_type="text/csv",
                headers={
                    "Content-Disposition": f"attachment; filename={filename}",
                    "X-MinIO-Path": minio_file_key  # Include MinIO path in headers
                }
            )
        
    except Exception as e:
        logger.error(f"Error exporting results to CSV: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error exporting results: {str(e)}"
        )


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



##########################################################################

@router.post("/marketing/prepare-data", response_model=MarketingDataPreparationResponse, tags=["Marketing Mix Modeling"])
async def prepare_marketing_data(request: MarketingDataPreparationRequest):
    """Prepare data for marketing mix modeling using scope system."""
    run_id = str(uuid.uuid4())
    logger.info(f"Starting data preparation with run_id: {run_id}")
    
    try:
        # Get scope combinations
        scope_data = await get_scope_set_with_columns(request.scope_id, request.set_name)
        if not scope_data:
            raise HTTPException(
                status_code=404,
                detail=f"Scope {request.scope_id} with set {request.set_name} not found"
            )
        
        # Process each combination
        all_prepared_files = []
        total_rows = 0
        columns_removed_summary = {}
        last_df = None  # Keep track of last DataFrame for column count
        
        for combination in scope_data['combinations']:
            logger.info(f"Processing combination: {combination['combination_id']}")
            
            # Load data from combination file
            file_data = get_file_from_source(combination['file_key'])
            
            # Read file based on extension
            if combination['file_key'].endswith(('.xlsx', '.xls')):
                df = pd.read_excel(file_data)
            else:
                df = pd.read_csv(file_data)
            
            logger.info(f"Loaded {combination['combination_id']} with shape: {df.shape}")
            
            # Filter by fiscal years
            if "Fiscal Year" in df.columns:
                df = df[df["Fiscal Year"].isin(request.fiscal_years)]
                logger.info(f"Filtered to fiscal years: {request.fiscal_years}")
            
            # Remove zero columns
            columns_removed = []
            if request.remove_zero_columns:
                initial_cols = df.columns.tolist()
                df = df.loc[:, (df != 0).any(axis=0)]
                columns_removed = list(set(initial_cols) - set(df.columns.tolist()))
                if columns_removed:
                    columns_removed_summary[combination['combination_id']] = columns_removed
            
            # Save prepared data for this combination
            combo_id = combination['combination_id']
            prepared_key = f"marketing-prepared/{run_id}/{combo_id}/data.xlsx"
            save_dataframe_to_minio(df, prepared_key, format="excel")
            
            all_prepared_files.append({
                "combination_id": combo_id,
                "file_key": prepared_key,
                "rows": len(df),
                "columns": len(df.columns)
            })
            
            total_rows += len(df)
            last_df = df  # Keep reference to last processed DataFrame
        
        # ⚡ CRITICAL FIX: Save metadata using marketing_helpers function
        metadata = {
            "run_id": run_id,
            "scope_id": request.scope_id,
            "set_name": request.set_name,
            "combinations": all_prepared_files,
            "fiscal_years": request.fiscal_years,
            "columns_removed_summary": columns_removed_summary
        }
        
        # Import the function if not already imported
        from marketing_helpers import save_transformation_metadata
        
        # Save the metadata
        await save_transformation_metadata(run_id, metadata)
        logger.info(f"✅ Metadata saved for run_id: {run_id}")
        
        return MarketingDataPreparationResponse(
            run_id=run_id,
            status="success",
            rows=total_rows,
            columns=len(last_df.columns) if last_df is not None else 0,
            prepared_data_key=f"marketing-prepared/{run_id}/",
            fiscal_years_included=request.fiscal_years,
            columns_removed=None
        )
        
    except Exception as e:
        logger.error(f"Error in data preparation: {e}")
        raise HTTPException(status_code=500, detail=str(e))



@router.post("/marketing/transform-variables", response_model=MarketingTransformationResponse, tags=["Marketing Mix Modeling"])
async def transform_marketing_variables(request: MarketingTransformationRequest):
    """Apply transformations to marketing variables for all combinations."""
    transform_id = str(uuid.uuid4())
    logger.info(f"Starting variable transformation with transform_id: {transform_id}")
    
    try:
        # Get preparation metadata
        prep_metadata = await get_transformation_metadata(request.run_id)
        combinations = prep_metadata.get("combinations", [])
        
        if not combinations:
            raise HTTPException(status_code=404, detail="No prepared data found")
        
        all_transformed_files = []
        all_variable_stats = {}
        all_regions = set()
        
        # Process each combination
        for combo_info in combinations:
            combo_id = combo_info["combination_id"]
            file_key = combo_info["file_key"]
            
            logger.info(f"Transforming variables for combination: {combo_id}")
            
            # Load prepared data
            file_data = get_file_from_source(file_key)
            df = pd.read_excel(file_data)
            
            # Get unique regions in this combination's data
            regions = df["Region"].unique().tolist() if "Region" in df.columns else []
            all_regions.update(regions)
            
            # Apply transformations
            df_transformed = apply_transformations_by_region(
                df=df,
                media_variables=request.media_variables,
                other_variables=request.other_variables,
                non_scaled_variables=request.non_scaled_variables,
                transformation_params=request.transformation_params,
                standardization_method=request.standardization_method.value,
                transformation_type=request.transformation_type.value
            )
            
            # Calculate statistics for this combination
            variable_stats = {}
            for col in df_transformed.columns:
                if col.endswith("_transformed") or col.endswith("_scaled"):
                    stats_by_region = {}
                    for region in regions:
                        if region in df_transformed["Region"].unique():
                            region_data = df_transformed[df_transformed["Region"] == region][col]
                            stats_by_region[region] = {
                                "mean": float(region_data.mean()),
                                "std": float(region_data.std()),
                                "min": float(region_data.min()),
                                "max": float(region_data.max())
                            }
                    variable_stats[col] = stats_by_region
            
            # Save transformed data
            transform_key = f"marketing-transformed/{transform_id}/{combo_id}/data.xlsx"
            save_dataframe_to_minio(df_transformed, transform_key, format="excel")
            
            all_transformed_files.append({
                "combination_id": combo_id,
                "file_key": transform_key,
                "regions": regions
            })
            
            all_variable_stats[combo_id] = variable_stats
        
        # Save transformation metadata
        metadata = {
            "run_id": request.run_id,
            "transform_id": transform_id,
            "transformation_type": request.transformation_type.value,
            "standardization_method": request.standardization_method.value,
            "transformation_params": request.transformation_params,
            "media_variables": request.media_variables,
            "other_variables": request.other_variables,
            "non_scaled_variables": request.non_scaled_variables,
            "combinations": all_transformed_files,
            "variable_stats": all_variable_stats
        }
        
        await save_transformation_metadata(transform_id, metadata)
        
        return MarketingTransformationResponse(
            transform_id=transform_id,
            status="success",
            transformed_data_key=f"marketing-transformed/{transform_id}/",
            variable_statistics=all_variable_stats,
            regions_processed=list(all_regions),
            media_variables_transformed=request.media_variables
        )
        
    except Exception as e:
        logger.error(f"Error in variable transformation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/marketing/train-models", response_model=MarketingModelTrainingResponse, tags=["Marketing Mix Modeling"])
async def train_marketing_models(request: MarketingModelTrainingRequest):
    """Train marketing mix models for all combinations with optional constraints."""
    training_id = str(uuid.uuid4())
    start_time = datetime.now()
    logger.info(f"Starting model training with training_id: {training_id}")
    
    try:
        # Get transformation metadata
        transform_metadata = await get_transformation_metadata(request.run_id)
        combinations = transform_metadata.get("combinations", [])
        
        if not combinations:
            raise HTTPException(status_code=404, detail="No transformed data found")
        
        all_results = []
        model_counter = 0
        combinations_processed = 0
        
        # Process each combination
        for combo_info in combinations:
            combo_id = combo_info["combination_id"]
            file_key = combo_info["file_key"]
            
            logger.info(f"Training models for combination: {combo_id}")
            
            # Load transformed data
            file_data = get_file_from_source(file_key)
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
                        
                        metrics = calculate_model_metrics(y_train, y_train_pred, len(x_columns))
                        test_metrics = calculate_model_metrics(y_test, y_test_pred, len(x_columns))
                        
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
        if all_results:
            saved_ids = await save_marketing_model_results(
                training_id,
                all_results,
                {
                    "transform_id": request.run_id,
                    "training_params": request.dict(),
                    "total_models": len(all_results),
                    "scope_id": transform_metadata.get("scope_id"),
                    "set_name": transform_metadata.get("set_name"),
                    "constraints_used": request.use_constraints
                }
            )
        else:
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




@router.post("/marketing/calculate-elasticity", response_model=MarketingElasticityResponse, tags=["Marketing Mix Modeling"])
async def calculate_marketing_elasticity(request: MarketingElasticityRequest):
    """Calculate elasticities for marketing models."""
    try:
        # Get model results
        results = await get_marketing_results(request.run_id)
        
        if not results:
            raise HTTPException(status_code=404, detail=f"No results found for run_id: {request.run_id}")
        
        # Filter by model IDs if specified
        if request.model_ids:
            results = [r for r in results if r.get("model_id") in request.model_ids]
        
        # Get transformation metadata from first result
        transform_id = results[0].get("transform_id")
        if not transform_id:
            raise HTTPException(status_code=400, detail="No transform_id found in results")
            
        transform_metadata = await get_transformation_metadata(transform_id)
        
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
                        elasticity = calculate_media_elasticity(
                            beta, growth_rate, sensitivity, carryover, y_mean
                        )
                        
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
                contributions = calculate_contributions(
                    result.get("coefficients", {}),
                    variable_means
                )
            
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
    
    
    

@router.get("/marketing/results/{run_id}", response_model=List[MarketingModelResult], tags=["Marketing Mix Modeling"])
async def get_marketing_model_results(
    run_id: str = Path(..., description="Training run ID"),
    model_ids: Optional[List[int]] = Query(None, description="Filter by specific model IDs"),
    brand: Optional[str] = Query(None, description="Filter by brand"),
    region: Optional[str] = Query(None, description="Filter by region")
):
    """Retrieve marketing model results by run_id with optional filters."""
    try:
        # Get all results for run_id
        results = await get_marketing_results(run_id)
        
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




@router.get("/marketing/download/{file_path:path}", tags=["Marketing Mix Modeling"])
async def download_marketing_export(
    file_path: str = Path(..., description="Export file path")
):
    """Download exported marketing results file (Excel or CSV)."""
    try:
        # Get file from MinIO - Use dataformodel bucket
        if minio_client is None:
            raise HTTPException(status_code=503, detail="MinIO not available")
        
        bucket = settings.minio_source_bucket  # dataformodel
        
        response = minio_client.get_object(bucket, file_path)
        data = BytesIO(response.read())
        response.close()
        response.release_conn()
        data.seek(0)
        
        # Extract filename and determine content type
        filename = file_path.split('/')[-1]
        
        if filename.endswith('.xlsx'):
            content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        elif filename.endswith('.xls'):
            content_type = "application/vnd.ms-excel"
        else:
            content_type = "text/csv"
        
        return StreamingResponse(
            data,
            media_type=content_type,
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )
        
    except Exception as e:
        logger.error(f"Error downloading file from bucket '{bucket}': {e}")
        error_msg = "File not found" if "NoSuchKey" in str(e) else str(e)
        raise HTTPException(status_code=404, detail=error_msg)
