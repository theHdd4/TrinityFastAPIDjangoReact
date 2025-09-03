from fastapi import APIRouter, HTTPException, Query, Body
import logging
from ..config import cache, scenario_values_collection, select_models_collection, saved_predictions_collection
from ..schemas import RunRequest, RunResponse, CacheWarmResponse, StatusResponse, IdentifiersResponse, FeaturesResponse, CacheClearResponse, ReferenceRequest, ReferenceResponse, ScenarioValuesRequest, ScenarioValuesResponse, SingleCombinationReferenceRequest, SingleCombinationReferenceResponse

from ..scenario.data_service import DataService
import uuid, logging
from datetime import datetime

from ..scenario.scenario_service import ScenarioService
from ..scenario.aggregation_service import AggregationService
from ..scenario.data_service import DataService
from ..utils.features import extract_features_from_models

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Scenario"])

# ────────────────────────────────────────────────────────────────────────────
#  GET /api/scenario/init-cache (SMART VERSION)
# ────────────────────────────────────────────────────────────────────────────
@router.get("/init-cache")
async def init_cache(
    d0_key: str = Query(
        ...,
        description="Object key of the raw data file in MinIO "
                    "(csv, tsv, xlsx, parquet, or arrow/feather)",
    ),
    force_refresh: bool = Query(
        False,
        description="Force refresh cache even if data hasn't changed"
    )
):
    """
    SMART cache initialization that only refreshes when needed.

    Steps
    -----
    1. Check if existing cache is fresh (< 24 hours old)
    2. Check if source data has actually changed
    3. Only rebuild cache when necessary
    4. Return detailed action taken (reused/extended/refreshed)

    After this call, POST /run can be called multiple times without
    specifying the file key again.
    """
    try:
        logger.info("🧠 Starting SMART init-cache for: %s", d0_key)
        
        # Use smart caching logic
        result = await DataService.cache_dataset_smart(d0_key, force_refresh=force_refresh)
        
        logger.info("✅ Smart init-cache completed: %s", result["action"])
        return result

    except FileNotFoundError:
        logger.error("File not found: %s", d0_key)
        raise HTTPException(status_code=404, detail=f"File '{d0_key}' not found in MinIO")
    except Exception as exc:
        logger.exception("Smart init-cache failed for: %s", d0_key)
        raise HTTPException(status_code=500, detail=f"Smart init-cache failed: {str(exc)}")


# ────────────────────────────────────────────────────────────────────────────
#  POST /api/scenario/reference
# ────────────────────────────────────────────────────────────────────────────
@router.post("/reference", response_model=ReferenceResponse)
async def get_reference_values(
    payload: ReferenceRequest = Body(..., description="Reference calculation parameters")
):
    """
    Get reference values for all features PER MODEL based on specified statistic and date range.
    
    This endpoint calculates reference points exactly as they would be calculated
    in scenario planning - using the same data slicing logic per model.
    
    Prerequisites:
    - Must call GET /init-cache first to load and cache a dataset
    
    Returns:
    - reference_values_by_model: Dictionary mapping model IDs to their reference values
    - statistic_used: The statistic that was applied
    - date_range: The date range used for calculation
    - data_info: Information about the dataset used
    """
    try:
        # ✅ Check if dataset is cached
        df = DataService.get_current_d0_dataframe()
        if df is None:
            raise HTTPException(
                status_code=400,
                detail="No dataset cached. Please call GET /init-cache first."
            )
        
        # ✅ Get current file key for reference
        current_file_key = DataService.get_current_d0_file_key()
        
        # ✅ Get features from cached models
        models = await DataService.fetch_selected_models()
        if not models:
            raise HTTPException(
                status_code=400,
                detail="No selected models found. Please ensure models are configured."
            )
        
        # ✅ Extract parameters from payload (Pydantic model)
        stat = payload.stat
        start_date = payload.start_date
        end_date = payload.end_date
        
        # ✅ Calculate reference values PER MODEL (same logic as run_scenario)
        from ..scenario.scenario_service import ScenarioService
        reference_values_by_model = {}
        
        for meta in models:
            model_id = meta.get("training_id", "unknown")
            ident = meta["identifiers"]
            
            try:
                # Get the same sliced data that would be used in scenario planning
                df_slice = DataService.get_cluster_dataframe(current_file_key, ident, combination=meta.get("combination"))
                
                # Calculate reference for this model's slice (same as run_scenario)
                ref_vals = ScenarioService._calc_reference(
                    df=df_slice,  # Use sliced data, not entire d0
                    x_vars=meta["x_variables"],  # This model's features
                    stat=stat,
                    start=start_date,
                    end=end_date
                )
                
                reference_values_by_model[model_id] = {
                    "identifiers": ident,
                    "features": meta["x_variables"],
                    "reference_values": ref_vals,
                    "data_slice_rows": len(df_slice)
                }
                
            except KeyError as e:
                # Handle missing cluster slice
                logger.warning(f"Missing cluster slice for model {model_id}: {e}")
                reference_values_by_model[model_id] = {
                    "identifiers": ident,
                    "features": meta["x_variables"],
                    "reference_values": {},
                    "data_slice_rows": 0,
                    "error": "Cluster slice not found"
                }
        
        # ✅ Prepare response
        response = {
            "reference_values_by_model": reference_values_by_model,
            "statistic_used": stat,
            "date_range": {
                "start_date": start_date,
                "end_date": end_date
            },
            "data_info": {
                "dataset_key": current_file_key,
                "total_rows": len(df),
                "models_processed": len(models),
                "total_features": sum(len(model["x_variables"]) for model in models)
            },
            "message": f"Reference values calculated per model using {stat} statistic"
        }
        
        logger.info("✅ Reference values calculated for %d models using %s", len(models), stat)
        return response
        
    except HTTPException as he:
        raise he
    except Exception as exc:
        logger.exception("Failed to calculate reference values: %s", str(exc))
        raise HTTPException(status_code=500, detail=f"Reference calculation failed: {str(exc)}")



# -------------------------------------------------------------------------------------------------------------------------------------------
#  Get Identifiers for User Selection
# --------------------------------------------------------------------------------------------------------------------------------------------

@router.get("/identifiers", response_model=IdentifiersResponse)
async def get_available_identifiers():
    """
    Get all available identifiers and their possible values from cached dataset.
    
    Returns:
    - identifier_columns: list of column names that can be used as identifiers
    - identifier_values: dict mapping each column to its unique values
    - selected_models_identifiers: identifiers currently used by selected models
    """
    try:
        # ✅ Check if dataset is cached
        df = DataService.get_current_d0_dataframe()
        if df is None:
            raise HTTPException(
                status_code=400,
                detail="No dataset cached. Please call GET /init-cache first."
            )

        # ✅ Get models to know which columns are used as identifiers
        models = await DataService.fetch_selected_models()
        
        # ✅ Extract identifier columns from models
        identifier_columns = set()
        for model in models:
            identifier_columns.update(model["identifiers"].keys())
        
        # ✅ Get identifier values from models (not all unique values from d0)
        identifier_values = {}
        for col in identifier_columns:
            if col in df.columns:
                # Extract only the values that are actually used by models for this column
                model_values = set()
                for model in models:
                    if col in model.get("identifiers", {}):
                        model_values.add(model["identifiers"][col])
                
                # Convert to sorted list
                identifier_values[col] = sorted(list(model_values))
        
        # ✅ Show what's currently used by models
        models_identifiers = {}
        for model in models:
            model_id = model.get("training_id", "unknown")
            models_identifiers[model_id] = model["identifiers"]

        return {
            "identifier_columns": list(identifier_columns),
            "identifier_values": identifier_values,
            "total_combinations": len(models),
            "message": f"Available identifiers from {len(models)} models"
        }

    except Exception as exc:
        logger.exception("Failed to get identifiers")
        raise HTTPException(status_code=500, detail=str(exc))


# -----------------------------------------------------------------------------------------------------------
#                             Features for user Selection
# ------------------------------------------------------------------------------------------------------------

@router.get("/features", response_model=FeaturesResponse)
async def get_available_features():
    """
    Extract and return features grouped by models,
    plus a combined list of all unique features.
    
    Updated to work with new model metadata structure.
    """
    try:
        models = await DataService.fetch_selected_models()
        if not models:
            raise HTTPException(status_code=404, detail="No selected models found.")

        # ✅ NEW: Handle both old and new model structures
        features_by_model = {}
        all_unique_features = set()
        
        for model in models:
            # Create a unique model identifier
            if "combination" in model and "model_type" in model:
                model_id = f"{model['combination']}_{model['model_type']}"
            elif "identifiers" in model:
                # Backward compatibility for old structure
                combo_str = "_".join([f"{k}_{v}" for k, v in model["identifiers"].items()])
                model_id = f"{combo_str}_model"
            else:
                model_id = f"model_{len(features_by_model)}"
            
            # Extract features from model
            x_variables = model.get("x_variables", [])
            if x_variables:
                features_by_model[model_id] = {
                    "x_variables": x_variables,
                    "y_variable": model.get("y_variable", ""),
                    "model_type": model.get("model_type", "Unknown"),
                    "combination": model.get("combination", ""),
                    "identifiers": model.get("identifiers", {})
                }
                
                # Add to unique features set
                all_unique_features.update(x_variables)
        
        logger.info("Found %d models with %d unique features", len(features_by_model), len(all_unique_features))
        
        return {
            "features_by_model": features_by_model,
            "all_unique_features": sorted(list(all_unique_features)),
            "message": f"Features extracted from {len(models)} models"
        }

    except Exception as e:
        # Log and return HTTP error
        logger.error(f"Failed to fetch features: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))



# -----------------------------------------------------------------------------------------------------------
#                                        Run the Scenario
# -----------------------------------------------------------------------------------------------------------
@router.post("/run", response_model=RunResponse)
async def run_scenario(
    payload: RunRequest = Body(..., description="Scenario-planner JSON payload")
):
    """
    Launches the complete scenario-planner pipeline using CACHED dataset.

    Prerequisites:
    - Must call GET /init-cache first to load and cache a dataset
    - Uses the currently cached dataset (no file_key needed in payload)

    Steps:
    1. Validates that dataset is cached
    2. Runs reference → cluster-specific scenario → prediction for all selected models
    3. Aggregates into flat/hierarchy/individuals JSON nests
    4. Persists results to Mongo and audit CSVs to MinIO
    5. Returns embedded JSON response with all three nests

    Payload fields (d0_file_key NOT needed):
    - start_date, end_date, stat, identifiers, clusters (with scenario_defs)
    """
    run_id = None
    try:
        run_id = str(uuid.uuid4())
        logger.info("⏳ Scenario run %s started", run_id)
        
        # ✅ DEBUG: Print the received payload
        logger.info("🔍 === RECEIVED PAYLOAD ===")
        logger.info("🔍 Payload type: %s", type(payload))
        logger.info("🔍 Clusters count: %d", len(payload.clusters) if payload.clusters else 0)
        logger.info("🔍 Views count: %d", len(payload.views) if payload.views else 0)
        if payload.views:
            for view_id, view_config in payload.views.items():
                logger.info("🔍 View %s: %d identifier groups", view_id, len(view_config.selected_identifiers))
        logger.info("=== RECEIVED PAYLOAD COMPLETED ===")

        # ✅ Check if dataset is cached (no file key needed)
        df = DataService.get_current_d0_dataframe()
        if df is None:
            raise HTTPException(
                status_code=400,
                detail="No dataset cached. Please call GET /init-cache with d0_key first."
            )

        current_file_key = DataService.get_current_d0_file_key()
        logger.info("Using cached dataset: %s (%d rows)", current_file_key, len(df))

        # ✅ Ensure models are available
        models = await DataService.fetch_selected_models()
        if not models:
            raise HTTPException(
                status_code=400,
                detail="No selected models found. Please ensure models are configured."
            )

        # ✅ Run scenario pipeline with current dataset
        result_rows = await ScenarioService.run_scenario(payload, run_id, current_file_key)

        # ✅ Aggregation + storage for multiple views - NOW WITH AWAIT!
        response_data = await AggregationService.aggregate_and_store(
            result_rows, payload, run_id
        )

        # ✅ Response with new view_results structure
        out = {
            "run_id": run_id,
            "dataset_used": current_file_key,
            "created_at": datetime.utcnow().isoformat(),
            "models_processed": len(models),
            **response_data,  # This now contains {"view_results": {...}}
        }
        
        logger.info("✅ Scenario run %s finished successfully", run_id)
        return RunResponse(**out)

    except HTTPException as he:
        raise he
    except Exception as exc:
        logger.exception("🚨 Scenario run %s failed: %s", run_id or "unknown", str(exc))
        raise HTTPException(status_code=500, detail=f"Scenario run failed: {str(exc)}")


# ---------------------------------------------------------------------------------------------------------------
#                                  clear all cache
# -----------------------------------------------------------------------------------------------------------------

@router.delete("/cache/all", response_model=CacheClearResponse)
async def clear_all_cache():
    try:
        cache.flushdb()  # ⚠️ Flushes all keys in current Redis DB
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to clear cache: {e}")
    return CacheClearResponse(message="Cache cleared successfully")

# ────────────────────────────────────────────────────────────────────────────
#  POST /api/scenario/single-combination-reference
# ────────────────────────────────────────────────────────────────────────────
@router.post("/single-combination-reference", response_model=SingleCombinationReferenceResponse)
async def get_single_combination_reference(
    payload: SingleCombinationReferenceRequest = Body(..., description="Single combination reference calculation parameters")
):
    """
    Calculate reference values for a single combination and selected features.
    
    This endpoint calculates reference values for one specific combination
    without requiring the full matching logic or scenario processing.
    
    Prerequisites:
    - Must call GET /init-cache first to load and cache a dataset
    
    Returns:
    - combination: The combination identifiers that were processed
    - features: List of features that were processed
    - reference_values: Dictionary mapping feature names to their reference values
    - statistic_used: The statistic that was applied
    - date_range: The date range used for calculation
    """
    try:
        # ✅ Check if dataset is cached
        df = DataService.get_current_d0_dataframe()
        if df is None:
            raise HTTPException(
                status_code=400,
                detail="No dataset cached. Please call GET /init-cache first."
            )
        
        # ✅ Get current file key for reference
        current_file_key = DataService.get_current_d0_file_key()
        
        # ✅ Get features from cached models
        models = await DataService.fetch_selected_models()
        if not models:
            raise HTTPException(
                status_code=400,
                detail="No models available. Please ensure models are selected and cached."
            )
        
        # ✅ Extract features from models
        available_features = extract_features_from_models(models)
        
        # ✅ Validate requested features exist
        invalid_features = [f for f in payload.features if f not in available_features]
        if invalid_features:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid features requested: {invalid_features}. Available features: {list(available_features.keys())}"
            )
        
        # ✅ Calculate reference values for the single combination
        scenario_service = ScenarioService()
        reference_values = {}
        
        for feature in payload.features:
            try:
                # Calculate reference value for this feature and combination
                ref_value = await scenario_service._calc_reference(
                    stat=payload.stat,
                    start_date=payload.start_date,
                    end_date=payload.end_date,
                    identifiers=payload.combination,
                    feature=feature
                )
                reference_values[feature] = ref_value
            except Exception as feature_exc:
                logger.warning(f"Failed to calculate reference for feature {feature}: {feature_exc}")
                reference_values[feature] = 0.0  # Default to 0 if calculation fails
        
        # ✅ Prepare response
        response_data = {
            "combination": payload.combination,
            "features": payload.features,
            "reference_values": reference_values,
            "statistic_used": payload.stat,
            "date_range": {
                "start_date": payload.start_date,
                "end_date": payload.end_date
            },
            "data_info": {
                "dataset_key": current_file_key,
                "models_processed": len(models),
                "features_available": list(available_features.keys()),
                "calculation_timestamp": datetime.utcnow().isoformat()
            },
            "message": f"Successfully calculated reference values for {len(payload.features)} features in combination {payload.combination}"
        }
        
        logger.info("✅ Single combination reference calculated: %s features for combination %s", 
                   len(payload.features), payload.combination)
        
        return response_data
        
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("🚨 Single combination reference calculation failed: %s", str(exc))
        raise HTTPException(status_code=500, detail=f"Single combination reference calculation failed: {str(exc)}")

# ────────────────────────────────────────────────────────────────────────────
#  POST /api/scenario/force-refresh
# ────────────────────────────────────────────────────────────────────────────
@router.post("/force-refresh")
async def force_refresh_cache(
    d0_key: str = Body(..., embed=True, description="Dataset key to force refresh")
):
    """
    Force refresh cache for a dataset regardless of whether data has changed.
    Useful when you want to ensure fresh data or clear stale cache.
    """
    try:
        logger.info("🔄 Force refreshing cache for: %s", d0_key)
        
        result = await DataService.cache_dataset_smart(d0_key, force_refresh=True)
        
        logger.info("✅ Force refresh completed for: %s", d0_key)
        return result

    except Exception as exc:
        logger.exception("Force refresh failed for: %s", d0_key)
        raise HTTPException(status_code=500, detail=f"Force refresh failed: {str(exc)}")

# ────────────────────────────────────────────────────────────────────────────
#  DELETE /api/scenario/cache/{d0_key}
# ────────────────────────────────────────────────────────────────────────────
@router.delete("/cache/{d0_key}")
async def clear_dataset_cache(d0_key: str):
    """
    Clear cache for a specific dataset.
    Useful when you want to free up memory or force fresh data loading.
    """
    try:
        logger.info("🗑️ Clearing cache for dataset: %s", d0_key)
        
        DataService.clear_dataset_cache(d0_key)
        
        return {
            "message": f"Cache cleared for dataset: {d0_key}",
            "action": "cleared"
        }

    except Exception as exc:
        logger.exception("Failed to clear cache for: %s", d0_key)
        raise HTTPException(status_code=500, detail=str(exc))


# ────────────────────────────────────────────────────────────────────────────
#  GET /api/scenario/test-fetch-scope
# ────────────────────────────────────────────────────────────────────────────
@router.get("/test-fetch-scope")
async def test_fetch_scope():
    """
    Test endpoint to directly test the fetch_scope_metadata_by_model_id method.
    """
    try:
        from ..scenario.data_service import DataService
        
        model_id = 'Quant_Matrix_AI_Schema/forecasting/New Forecasting Analysis Project'
        logger.info("🔍 Testing fetch_scope_metadata_by_model_id with model_id: %s", model_id)
        
        # Test the method directly
        scope_metadata = await DataService.fetch_scope_metadata_by_model_id(model_id)
        
        logger.info("🔍 fetch_scope_metadata_by_model_id returned: %s", scope_metadata)
        
        return {
            "message": "Scope test completed",
            "model_id": model_id,
            "scope_metadata": scope_metadata,
            "has_error": "error" in scope_metadata if isinstance(scope_metadata, dict) else False
        }
        
    except Exception as exc:
        logger.exception("🚨 Scope test failed: %s", str(exc))
        raise HTTPException(status_code=500, detail=f"Scope test failed: {str(exc)}")

# ────────────────────────────────────────────────────────────────────────────
#  GET /api/scenario/test-fetch-by-id
# ────────────────────────────────────────────────────────────────────────────
@router.get("/test-fetch-by-id")
async def test_fetch_by_id():
    """
    Test endpoint to directly test the fetch_models_by_id method.
    """
    try:
        from ..scenario.data_service import DataService
        
        model_id = 'Quant_Matrix_AI_Schema/forecasting/New Forecasting Analysis Project'
        logger.info("🔍 Testing fetch_models_by_id with model_id: %s", model_id)
        
        # Test the method directly
        models = await DataService.fetch_models_by_id(model_id)
        
        logger.info("🔍 fetch_models_by_id returned: %s", models)
        
        return {
            "message": "Test completed",
            "model_id": model_id,
            "models_found": len(models) if models else 0,
            "models": models
        }
        
    except Exception as exc:
        logger.exception("🚨 Test failed: %s", str(exc))
        raise HTTPException(status_code=500, detail=f"Test failed: {str(exc)}")

# ────────────────────────────────────────────────────────────────────────────
#  GET /api/scenario/get-all-scope
# ────────────────────────────────────────────────────────────────────────────
@router.get("/get-all-scope")
async def get_all_scope():
    """
    Simple endpoint to fetch all scope metadata from the scope collection.
    """
    try:
        from ..config import scope_collection
        
        logger.info("🔍 Fetching all scope metadata from collection...")
        
        # Get all documents from the scope collection
        cursor = scope_collection.find({})
        all_scope = await cursor.to_list(length=None)
        
        logger.info("✅ Found %d scope documents in collection", len(all_scope))
        
        # Extract just the _id and key fields for each scope document
        scope_summary = []
        for scope in all_scope:
            scope_summary.append({
                "_id": str(scope.get("_id", "NO_ID")),
                "project_name": scope.get("project_name", "NO_NAME"),
                "client_name": scope.get("client_name", "NO_CLIENT"),
                "app_name": scope.get("app_name", "NO_APP"),
                "operation_type": scope.get("operation_type", "NO_TYPE"),
                "scope_id": scope.get("scope_id", "NO_SCOPE_ID"),
                "scope_name": scope.get("scope_name", "NO_SCOPE_NAME")
            })
        
        return {
            "message": f"Successfully fetched {len(all_scope)} scope documents",
            "total_scope": len(all_scope),
            "scope_documents": scope_summary
        }
        
    except Exception as exc:
        logger.exception("🚨 Failed to fetch all scope: %s", str(exc))
        raise HTTPException(status_code=500, detail=f"Failed to fetch scope: {str(exc)}")

# ────────────────────────────────────────────────────────────────────────────
#  GET /api/scenario/get-all-models
# ────────────────────────────────────────────────────────────────────────────
@router.get("/get-all-models")
async def get_all_models():
    """
    Simple endpoint to fetch all models from the collection.
    """
    try:
        from ..config import select_models_collection
        
        logger.info("🔍 Fetching all models from collection...")
        
        # Get all documents from the collection
        cursor = select_models_collection.find({})
        all_models = await cursor.to_list(length=None)
        
        logger.info("✅ Found %d models in collection", len(all_models))
        
        # Extract just the _id and project_name for each model
        models_summary = []
        for model in all_models:
            models_summary.append({
                "_id": str(model.get("_id", "NO_ID")),
                "project_name": model.get("project_name", "NO_NAME"),
                "client_name": model.get("client_name", "NO_CLIENT"),
                "app_name": model.get("app_name", "NO_APP"),
                "operation_type": model.get("operation_type", "NO_TYPE"),
                "training_status": model.get("training_status", "NO_STATUS")
            })
        
        return {
            "message": f"Successfully fetched {len(all_models)} models",
            "total_models": len(all_models),
            "models": models_summary
        }
        
    except Exception as exc:
        logger.exception("🚨 Failed to fetch all models: %s", str(exc))
        raise HTTPException(status_code=500, detail=f"Failed to fetch models: {str(exc)}")

# ────────────────────────────────────────────────────────────────────────────
#  GET /api/scenario/debug-db
# ────────────────────────────────────────────────────────────────────────────
@router.get("/debug-db")
async def debug_database_connection():
    """
    Debug endpoint to test database connection and see what's in the collections.
    """
    try:
        from ..config import select_models_collection, scope_collection
        
        logger.info("🔍 DEBUG: Testing database connection...")
        
        # Test model collection
        model_count = await select_models_collection.count_documents({})
        logger.info("🔍 DEBUG: Model collection count: %d", model_count)
        
        # Get sample model documents
        sample_models = await select_models_collection.find({}).limit(5).to_list(length=None)
        model_ids = [doc.get("_id", "NO_ID") for doc in sample_models]
        
        # Test scope collection
        scope_count = await scope_collection.count_documents({})
        logger.info("🔍 DEBUG: Scope collection count: %d", scope_count)
        
        # Get sample scope documents
        sample_scopes = await scope_collection.find({}).limit(5).to_list(length=None)
        scope_ids = [doc.get("_id", "NO_ID") for doc in sample_scopes]
        
        return {
            "message": "Database connection test completed",
            "model_collection": {
                "name": select_models_collection.name,
                "database": select_models_collection.database.name,
                "total_documents": model_count,
                "sample_ids": model_ids
            },
            "scope_collection": {
                "name": scope_collection.name,
                "database": scope_collection.database.name,
                "total_documents": scope_count,
                "sample_ids": scope_ids
            }
        }
        
    except Exception as exc:
        logger.exception("🚨 Database debug failed: %s", str(exc))
        raise HTTPException(status_code=500, detail=f"Database debug failed: {str(exc)}")

# ────────────────────────────────────────────────────────────────────────────
#  GET /api/scenario/flattened-structure
# ────────────────────────────────────────────────────────────────────────────
@router.get("/forecasting/flattened-models")
async def get_flattened_models(model_id: str = Query(..., description="Model _id to fetch")):
    """
    Returns the flattened models for the given model_id.
    """
    flattened_models = await DataService.fetch_selected_models(model_id=model_id)
    if not flattened_models:
        raise HTTPException(status_code=404, detail="No models found for the given _id")
    return {"models": flattened_models}

    