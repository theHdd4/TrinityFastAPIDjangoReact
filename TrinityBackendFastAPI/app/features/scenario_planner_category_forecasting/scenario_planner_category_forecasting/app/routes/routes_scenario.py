from fastapi import APIRouter, HTTPException, Query, Body
import logging
from ..config import cache, scenario_values_collection, select_models_collection, saved_predictions_collection
from ..schemas import RunRequest, RunResponse, CacheWarmResponse, StatusResponse, IdentifiersResponse, FeaturesResponse, CacheClearResponse, ReferenceRequest, ReferenceResponse, ScenarioValuesRequest, ScenarioValuesResponse

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
#  POST /api/scenario/scenario-values
# ────────────────────────────────────────────────────────────────────────────
@router.post("/scenario-values", response_model=ScenarioValuesResponse)
async def get_scenario_values(
    payload: ScenarioValuesRequest = Body(..., description="Scenario calculation parameters")
):
    """
    Calculate and return scenario values based on reference values and cluster-specific tweaks.
    
    This endpoint shows what the scenario values would be without running the full
    prediction pipeline. Useful for validating scenario definitions before execution.
    
    Note: The 'identifiers' field in the payload is NOT used for scenario calculation.
    It's only used in the /run endpoint for result filtering.
    
    Prerequisites:
    - Must call GET /init-cache first to load and cache a dataset
    
    Returns:
    - scenario_values_by_model: Dictionary mapping model IDs to their scenario values
    - reference_values_by_model: Dictionary mapping model IDs to their reference values
    - applied_changes: Summary of what changes were applied to each model
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
        
        # ✅ Calculate scenario values PER MODEL (same logic as run_scenario)
        from ..scenario.scenario_service import ScenarioService
        scenario_values_by_model = {}
        reference_values_by_model = {}
        applied_changes = {}
        
        for meta in models:
            model_id = meta.get("training_id", "unknown")
            ident = meta["identifiers"]
            
            try:
                # Get the same sliced data that would be used in scenario planning
                df_slice = DataService.get_cluster_dataframe(current_file_key, ident)
                
                # Calculate reference for this model's slice
                ref_vals = ScenarioService._calc_reference(
                    df=df_slice,
                    x_vars=meta["x_variables"],
                    stat=payload.stat,
                    start=payload.start_date,
                    end=payload.end_date
                )
                
                # Find matching cluster and apply tweaks
                local_defs = {}
                for cl in payload.clusters:
                    if hasattr(cl, 'identifiers'):
                        cl_identifiers = cl.identifiers
                        cl_scenario_defs = getattr(cl, 'scenario_defs', {})
                    else:
                        cl_identifiers = cl["identifiers"]
                        cl_scenario_defs = cl.get("scenario_defs", {})
                        
                    if cl_identifiers == ident:
                        local_defs = cl_scenario_defs
                        # Convert Pydantic models to dict if needed
                        if hasattr(local_defs, 'dict'):
                            local_defs = local_defs.dict()
                        elif isinstance(local_defs, dict):
                            local_defs = {
                                k: v.dict() if hasattr(v, 'dict') else v
                                for k, v in local_defs.items()
                            }
                        break
                
                from ..scenario.scenario_service import apply_tweaks
                # Apply tweaks to get scenario values
                scen_vals =apply_tweaks(ref_vals, local_defs)
                
                # Calculate percentage changes for each feature
                pct_changes = {}
                for feature in meta["x_variables"]:
                    if feature in ref_vals and feature in scen_vals:
                        ref_val = ref_vals[feature]
                        scen_val = scen_vals[feature]
                        
                        # Avoid division by zero
                        if ref_val != 0:
                            pct_change = ((scen_val - ref_val) / ref_val) * 100
                            pct_changes[feature] = round(pct_change, 4)  # Round to 4 decimal places
                        else:
                            # If reference is 0, scenario value becomes the percentage change
                            pct_changes[feature] = 100.0 if scen_val > 0 else 0.0
                    else:
                        pct_changes[feature] = 0.0
                
                # Store results
                reference_values_by_model[model_id] = {
                    "identifiers": ident,
                    "features": meta["x_variables"],
                    "reference_values": ref_vals,
                    "data_slice_rows": len(df_slice)
                }
                
                scenario_values_by_model[model_id] = {
                    "identifiers": ident,
                    "features": meta["x_variables"],
                    "scenario_values": scen_vals,
                    "percentage_changes": pct_changes,  # Add percentage changes
                    "data_slice_rows": len(df_slice)
                }
                
                # Track what changes were applied
                applied_changes[model_id] = {
                    "identifiers": ident,
                    "changes_applied": local_defs,
                    "features_modified": list(local_defs.keys()) if local_defs else [],
                    "percentage_changes_summary": pct_changes  # Add percentage changes summary
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
                scenario_values_by_model[model_id] = {
                    "identifiers": ident,
                    "features": meta["x_variables"],
                    "scenario_values": {},
                    "percentage_changes": {},
                    "data_slice_rows": 0,
                    "error": "Cluster slice not found"
                }
                applied_changes[model_id] = {
                    "identifiers": ident,
                    "changes_applied": {},
                    "features_modified": [],
                    "percentage_changes_summary": {},
                    "error": "Cluster slice not found"
                }
        
        # ✅ Prepare response
        response = {
            "scenario_values_by_model": scenario_values_by_model,
            "reference_values_by_model": reference_values_by_model,
            "applied_changes": applied_changes,
            "scenario_config": {
                "statistic_used": payload.stat,
                "date_range": {
                    "start_date": payload.start_date,
                    "end_date": payload.end_date
                },
                "clusters_configured": len(payload.clusters) if payload.clusters else 0
            },
            "data_info": {
                "dataset_key": current_file_key,
                "total_rows": len(df),
                "models_processed": len(models),
                "total_features": sum(len(model["x_variables"]) for model in models)
            },
            "message": f"Scenario values calculated for {len(models)} models using {payload.stat} statistic"
        }
        
        # ✅ Save to MongoDB with unique ID
        try:
            from datetime import datetime
            import uuid
            
            scenario_doc = {
                "_id": str(uuid.uuid4()),
                "created_at": datetime.utcnow(),
                "dataset_key": current_file_key,
                "scenario_config": response["scenario_config"],
                "data_info": response["data_info"],
                "scenario_values_by_model": scenario_values_by_model,
                "reference_values_by_model": reference_values_by_model,
                "applied_changes": applied_changes,
                "total_models": len(models),
                "status": "completed"
            }
            
            await scenario_values_collection.insert_one(scenario_doc)
            logger.info("✅ Scenario values saved to MongoDB with ID: %s", scenario_doc["_id"])
            
            # Add the MongoDB ID to the response
            response["scenario_id"] = scenario_doc["_id"]
            response["saved_at"] = scenario_doc["created_at"].isoformat()
            
        except Exception as save_error:
            logger.warning("⚠️ Failed to save scenario values to MongoDB: %s", str(save_error))
            # Don't fail the request if saving fails, just log it
        
        logger.info("✅ Scenario values calculated for %d models using %s", len(models), payload.stat)
        return response
        
    except HTTPException as he:
        raise he
    except Exception as exc:
        logger.exception("Failed to calculate scenario values: %s", str(exc))
        raise HTTPException(status_code=500, detail=f"Scenario values calculation failed: {str(exc)}")

# ────────────────────────────────────────────────────────────────────────────
#  GET /api/scenario/scenario-values/{scenario_id}
# ────────────────────────────────────────────────────────────────────────────
@router.get("/scenario-values/{scenario_id}")
async def get_saved_scenario_values(scenario_id: str):
    """
    Retrieve saved scenario values by MongoDB ID.
    
    This endpoint allows you to fetch previously calculated scenario values
    without recalculating them.
    """
    try:
        # Query MongoDB for the saved scenario values
        scenario_doc = await scenario_values_collection.find_one({"_id": scenario_id})
        
        if not scenario_doc:
            raise HTTPException(
                status_code=404,
                detail=f"Scenario values with ID '{scenario_id}' not found"
            )
        
        # Convert MongoDB document to response format
        response = {
            "scenario_id": scenario_doc["_id"],
            "created_at": scenario_doc["created_at"].isoformat(),
            "dataset_key": scenario_doc["dataset_key"],
            "scenario_config": scenario_doc["scenario_config"],
            "data_info": scenario_doc["data_info"],
            "scenario_values_by_model": scenario_doc["scenario_values_by_model"],
            "reference_values_by_model": scenario_doc["reference_values_by_model"],
            "applied_changes": scenario_doc["applied_changes"],
            "total_models": scenario_doc["total_models"],
            "status": scenario_doc["status"],
            "message": f"Retrieved saved scenario values for {scenario_doc['total_models']} models"
        }
        
        logger.info("✅ Retrieved saved scenario values with ID: %s", scenario_id)
        return response
        
    except HTTPException as he:
        raise he
    except Exception as exc:
        logger.exception("Failed to retrieve scenario values for ID %s: %s", scenario_id, str(exc))
        raise HTTPException(status_code=500, detail=f"Failed to retrieve scenario values: {str(exc)}")

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
                df_slice = DataService.get_cluster_dataframe(current_file_key, ident)
                
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

# ────────────────────────────────────────────────────────────────────────────
#  GET /api/scenario/cache-status
# ────────────────────────────────────────────────────────────────────────────
@router.get("/cache-status")
async def get_cache_status(
    d0_key: str = Query(None, description="Dataset key to check cache status for"),
    d0_key_alt: str = Query(None, alias="d0-key", description="Alternative parameter name for dataset key")
):
    # Handle both parameter names
    if d0_key is None and d0_key_alt is None:
        raise HTTPException(status_code=422, detail="Either 'd0_key' or 'd0-key' parameter is required")
    
    # Use whichever parameter is provided
    actual_d0_key = d0_key if d0_key is not None else d0_key_alt
    """
    Get detailed cache status for a dataset.
    
    Returns:
    - cache_exists: Whether cache exists
    - cache_age: Human-readable age
    - data_changed: Whether source data has changed
    - cache_size: Number of cached items
    - last_updated: When cache was last updated
    """
    try:
        cache_exists = await DataService.is_cache_fresh(actual_d0_key, max_age_hours=24*365)  # Check if any cache exists
        cache_age = await DataService.get_cache_age(actual_d0_key) if cache_exists else "N/A"
        data_changed = await DataService.has_data_changed(actual_d0_key) if cache_exists else True
        
        # Get cache metadata
        from ..scenario.data_service import _redis_get
        metadata = _redis_get(f"cache_metadata:{actual_d0_key}")
        
        return {
            "d0_key": actual_d0_key,
            "cache_exists": cache_exists,
            "cache_age": cache_age,
            "data_changed": data_changed,
            "cache_size": metadata.get("data_size", 0) if metadata else 0,
            "models_cached": metadata.get("models_count", 0) if metadata else 0,
            "last_updated": metadata.get("cached_at", "N/A") if metadata else "N/A",
            "recommendation": "refresh" if data_changed else "reuse" if cache_exists else "initialize"
        }

    except Exception as exc:
        logger.exception("Failed to get cache status for: %s", actual_d0_key)
        raise HTTPException(status_code=500, detail=str(exc))

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
            "message": "Available identifiers from cached dataset"
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
    """
    try:
        models = await DataService.fetch_selected_models()
        if not models:
            raise HTTPException(status_code=404, detail="No selected models found.")

        feature_data = extract_features_from_models(models)
        return feature_data

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
        logger.info("🔍 Identifiers count: %d", len(payload.identifiers) if payload.identifiers else 0)
        logger.info("🔍 Identifiers content: %s", payload.identifiers)
        if payload.identifiers:
            for key, spec in payload.identifiers.items():
                logger.info("🔍 Identifier %s: column=%s, values=%s", key, spec.column, spec.values)
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

        # ✅ Aggregation + storage - NOW WITH AWAIT!
        response_nests = await AggregationService.aggregate_and_store(
            result_rows, payload, run_id
        )

        # ✅ Response
        out = {
            "run_id": run_id,
            "dataset_used": current_file_key,
            "created_at": datetime.utcnow().isoformat(),
            "models_processed": len(models),
            **response_nests,
        }
        
        logger.info("✅ Scenario run %s finished successfully", run_id)
        return RunResponse(**out)

    except HTTPException as he:
        raise he
    except Exception as exc:
        logger.exception("🚨 Scenario run %s failed: %s", run_id or "unknown", str(exc))
        raise HTTPException(status_code=500, detail=f"Scenario run failed: {str(exc)}")


# ---------------------------------------------------------------------------------------------------------------
#                                  Save Model Metadata
# -----------------------------------------------------------------------------------------------------------------

@router.post("/save-metadata")
async def save_metadata(
    payload: dict = Body(..., description="Your custom metadata to save")
):
    """
    Save your custom metadata for scenario planning.
    
    This endpoint allows saving any metadata structure you provide
    directly to MongoDB using insert_one.
    """
    try:
        from datetime import datetime
        import uuid
        
        # Add timestamp and ID if not provided
        if "_id" not in payload:
            payload["_id"] = str(uuid.uuid4())
        if "created_at" not in payload:
            payload["created_at"] = datetime.utcnow()
        
        # Save to MongoDB
        await select_models_collection.insert_one(payload)
        
        logger.info("✅ Metadata saved with ID: %s", payload["_id"])
        
        return {
            "metadata_id": payload["_id"],
            "message": "Metadata saved successfully",
            "saved_at": payload["created_at"].isoformat() if isinstance(payload["created_at"], datetime) else payload["created_at"]
        }
        
    except Exception as exc:
        logger.exception("Failed to save metadata: %s", str(exc))
        raise HTTPException(status_code=500, detail=f"Failed to save metadata: {str(exc)}")

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