from fastapi import APIRouter, HTTPException, Query, Body
import logging
import urllib.parse
from ..config import cache, scenario_values_collection, select_models_collection, saved_predictions_collection
from ..schemas import RunRequest, RunResponse, CacheWarmResponse, StatusResponse, IdentifiersResponse, FeaturesResponse, CacheClearResponse, ReferenceRequest, ReferenceResponse, ScenarioValuesRequest, ScenarioValuesResponse, SingleCombinationReferenceRequest, SingleCombinationReferenceResponse, AutoPopulateReferenceRequest, AutoPopulateReferenceResponse, CalculateReferencePointsRequest

from ..scenario.data_service import DataService
import uuid, logging
from datetime import datetime

from ..scenario.scenario_service import ScenarioService
from ..scenario.aggregation_service import AggregationService
from ..scenario.data_service import DataService
from ..utils.features import extract_features_from_models
from ..mongodb_saver import save_reference_points, save_scenario_configurations, get_reference_points_from_mongo, get_scenario_configurations_from_mongo

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
    model_id: str = Query(
        ...,
        description="Model _id to fetch and process"
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
        # URL decode d0_key to handle encoded characters like %2F and %20
        decoded_d0_key = urllib.parse.unquote(d0_key)
        
        # Handle both URL-encoded and non-URL-encoded model_ids
        if '%' in model_id:
            # URL-encoded, decode it
            decoded_model_id = urllib.parse.unquote(model_id)
            logger.info("🔧 URL-decoded model_id: %s -> %s", model_id, decoded_model_id)
        else:
            # Not URL-encoded, use as-is
            decoded_model_id = model_id
            logger.info("🔧 Using model_id as-is: %s", model_id)
        
        logger.info("🧠 Starting SMART init-cache for: %s (original: %s)", decoded_d0_key, d0_key)
        logger.info("🔧 Using model_id: %s (original: %s)", decoded_model_id, model_id)
        
        # Use smart caching logic with decoded parameters
        result = await DataService.cache_dataset_smart(decoded_d0_key, decoded_model_id, force_refresh=force_refresh)
        
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
        decoded_model_id = urllib.parse.unquote(payload.model_id)
        logger.info("🔧 Calculating reference for model_id: %s (original: %s)", decoded_model_id, payload.model_id)
        models = await DataService.fetch_selected_models(decoded_model_id)
        if not models:
            raise HTTPException(
                status_code=400,
                detail="No selected models found. Please ensure models are configured."
            )
        
        # ✅ Extract parameters from payload (Pydantic model)
        stat = payload.stat
        start_date = payload.start_date
        end_date = payload.end_date
        
        # ✅ Calculate reference values PER COMBINATION (grouped by combination_id)
        from ..scenario.scenario_service import ScenarioService
        reference_values_by_combination = {}
        
        for meta in models:
            combination_id = meta.get("combination", "unknown")
            ident = meta["identifiers"]
            
            try:
                # Get the model's specific data using its source file
                model_file_key = meta.get("file_key", "")
                if model_file_key:
                    # Load data directly from the model's source file
                    df_slice = DataService.get_d0_dataframe(model_file_key)
                    logger.info("✅ Loaded data from model's source file: %s (%d rows)", model_file_key, len(df_slice))
                else:
                    # Fallback to cluster dataframe if no file_key
                    logger.warning("⚠️ No file_key found for model, trying cluster approach")
                    df_slice = DataService.get_cluster_dataframe(current_file_key, ident, combination=meta.get("combination"))
                
                # Calculate reference for this model's slice (same as run_scenario)
                ref_vals = ScenarioService._calc_reference(
                    df=df_slice,  # Use sliced data, not entire d0
                    x_vars=meta["x_variables"],  # This model's features
                    stat=stat,
                    start=start_date,
                    end=end_date
                )
                
                # Group by combination_id instead of training_id
                if combination_id not in reference_values_by_combination:
                    reference_values_by_combination[combination_id] = {
                        "features": meta["x_variables"],
                        "reference_values": ref_vals,
                        "data_slice_rows": len(df_slice)
                    }
                else:
                    # If combination already exists, merge the reference values
                    existing_ref_vals = reference_values_by_combination[combination_id]["reference_values"]
                    for feature, value in ref_vals.items():
                        if feature not in existing_ref_vals:
                            existing_ref_vals[feature] = value
                    # Update data slice rows (use the larger count)
                    reference_values_by_combination[combination_id]["data_slice_rows"] = max(
                        reference_values_by_combination[combination_id]["data_slice_rows"],
                        len(df_slice)
                    )
                
            except KeyError as e:
                # Handle missing cluster slice
                logger.warning(f"Missing cluster slice for combination {combination_id}: {e}")
                if combination_id not in reference_values_by_combination:
                    reference_values_by_combination[combination_id] = {
                        "features": meta["x_variables"],
                        "reference_values": {},
                        "data_slice_rows": 0,
                        "error": "Cluster slice not found"
                    }
        
        # ✅ Prepare response
        response = {
            "reference_values_by_combination": reference_values_by_combination,
            "statistic_used": stat,
            "date_range": {
                "start_date": start_date,
                "end_date": end_date
            },
            "data_info": {
                "dataset_key": current_file_key,
                "total_rows": len(df),
                "combinations_processed": len(reference_values_by_combination),
                "total_features": sum(len(combo["features"]) for combo in reference_values_by_combination.values())
            },
            "message": f"Reference values calculated per combination using {stat} statistic"
        }
        
        # ✅ Auto-save reference points to MongoDB
        try:
            # Extract client, app, project from file_key
            # file_key format: "default_client/default_app/default_project/20250814_135348_D0.arrow"
            file_key_parts = current_file_key.split('/')
            if len(file_key_parts) >= 3:
                client_name = file_key_parts[0]
                app_name = file_key_parts[1]
                project_name = file_key_parts[2]
                
                # Prepare reference points data for saving
                reference_points_data = {
                    "reference_values_by_combination": reference_values_by_combination,
                    "statistic_used": stat,
                    "date_range": {
                        "start_date": start_date,
                        "end_date": end_date
                    },
                    "data_info": {
                        "dataset_key": current_file_key,
                        "total_rows": len(df),
                        "combinations_processed": len(reference_values_by_combination),
                        "total_features": sum(len(combo["features"]) for combo in reference_values_by_combination.values())
                    },
                    "models_processed": len(models),
                    "created_at": datetime.utcnow().isoformat(),
                    "description": f"Reference points calculated using {stat} statistic for {len(reference_values_by_combination)} combinations"
                }
                
                # Save to MongoDB
                mongo_result = await save_reference_points(
                    client_name=client_name,
                    app_name=app_name,
                    project_name=project_name,
                    reference_points_data=reference_points_data,
                    user_id="",  # You can add user_id if available
                    project_id=None  # You can add project_id if available
                )
                
                if mongo_result["status"] == "success":
                    logger.info(f"📦 Reference points saved to MongoDB: {mongo_result['mongo_id']}")
                    # Add MongoDB save info to response
                    response["mongo_save"] = {
                        "status": "success",
                        "mongo_id": mongo_result["mongo_id"],
                        "operation": mongo_result["operation"],
                        "collection": mongo_result["collection"]
                    }
                else:
                    logger.error(f"❌ Failed to save reference points to MongoDB: {mongo_result['error']}")
                    response["mongo_save"] = {
                        "status": "error",
                        "error": mongo_result["error"]
                    }
            else:
                logger.warning("⚠️ Could not extract client/app/project from file_key for MongoDB save")
                response["mongo_save"] = {
                    "status": "skipped",
                    "reason": "Could not extract client/app/project from file_key"
                }
        except Exception as mongo_error:
            logger.error(f"❌ Error saving reference points to MongoDB: {str(mongo_error)}")
            # Don't fail the entire request if MongoDB save fails
            response["mongo_save"] = {
                "status": "error",
                "error": str(mongo_error)
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
async def get_available_identifiers(model_id: str = Query(..., description="Model _id to fetch")):
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
        # Handle both URL-encoded and non-URL-encoded model_ids
        if '%' in model_id:
            # URL-encoded, decode it
            decoded_model_id = urllib.parse.unquote(model_id)
            logger.info("🔧 URL-decoded model_id: %s -> %s", model_id, decoded_model_id)
        else:
            # Not URL-encoded, use as-is
            decoded_model_id = model_id
            logger.info("🔧 Using model_id as-is: %s", model_id)
        
        logger.info("🔧 Fetching identifiers for model_id: %s (original: %s)", decoded_model_id, model_id)
        models = await DataService.fetch_selected_models(decoded_model_id)
        
        # ✅ Extract identifier columns from models
        identifier_columns = set()
        for model in models:
            identifier_columns.update(model["identifiers"].keys())
        
        logger.info("🔍 DEBUG: Found identifier columns: %s", list(identifier_columns))
        logger.info("🔍 DEBUG: Dataframe columns: %s", list(df.columns) if df is not None else "No dataframe")
        logger.info("🔍 DEBUG: Models count: %d", len(models))
        if models:
            logger.info("🔍 DEBUG: Sample model identifiers: %s", models[0].get("identifiers", {}))
        
        # ✅ Get identifier values from models (not from d0 - just extract from model metadata)
        identifier_values = {}
        for col in identifier_columns:
            # Extract the values directly from models without checking dataframe columns
            model_values = set()
            for model in models:
                if col in model.get("identifiers", {}):
                    model_values.add(model["identifiers"][col])
            
            # Convert to sorted list
            if model_values:  # Only add if we found values
                identifier_values[col] = sorted(list(model_values))
                logger.info("🔍 DEBUG: For column '%s', found values: %s", col, identifier_values[col])
        
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
#                             Get Available Combinations (Better than identifiers)
# ------------------------------------------------------------------------------------------------------------

@router.get("/combinations")
async def get_available_combinations(model_id: str = Query(..., description="Model _id to fetch")):
    """
    Get all available combinations that have trained models.
    This is better than constructing combinations from identifiers.
    
    Returns:
    - combinations: list of combination objects with details
    - total_combinations: count of available combinations
    """
    try:
        # Get models to extract available combinations
        # Handle both URL-encoded and non-URL-encoded model_ids
        if '%' in model_id:
            # URL-encoded, decode it
            decoded_model_id = urllib.parse.unquote(model_id)
            logger.info("🔧 URL-decoded model_id: %s -> %s", model_id, decoded_model_id)
        else:
            # Not URL-encoded, use as-is
            decoded_model_id = model_id
            logger.info("🔧 Using model_id as-is: %s", model_id)
        
        logger.info("🔧 Fetching combinations for model_id: %s (original: %s)", decoded_model_id, model_id)
        models = await DataService.fetch_selected_models(decoded_model_id)
        
        if not models:
            raise HTTPException(status_code=404, detail="No selected models found.")

        # ✅ Extract unique combinations with full data
        combinations = []
        seen_combinations = set()
        
        for model in models:
            combination_id = model.get("combination", "")
            if combination_id and combination_id not in seen_combinations:
                seen_combinations.add(combination_id)
                # Return full combination object with identifiers
                combinations.append({
                    "combination_id": combination_id,
                    "identifiers": model.get("identifiers", {})
                })
        
        # Sort for consistent ordering
        combinations.sort(key=lambda x: x["combination_id"])
        
        logger.info("Found %d unique combinations with trained models", len(combinations))
        
        return {
            "combinations": combinations,
            "total_combinations": len(combinations),
            "message": f"Found {len(combinations)} combinations with trained models"
        }

    except Exception as e:
        logger.error(f"Failed to fetch combinations: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# -----------------------------------------------------------------------------------------------------------
#                             Features for user Selection
# ------------------------------------------------------------------------------------------------------------

@router.get("/features", response_model=FeaturesResponse)
async def get_available_features(model_id: str = Query(..., description="Model _id to fetch")):
    """
    Extract and return features grouped by models,
    plus a combined list of all unique features.
    
    Updated to work with new model metadata structure.
    """
    try:
        # Handle both URL-encoded and non-URL-encoded model_ids
        if '%' in model_id:
            # URL-encoded, decode it
            decoded_model_id = urllib.parse.unquote(model_id)
            logger.info("🔧 URL-decoded model_id: %s -> %s", model_id, decoded_model_id)
        else:
            # Not URL-encoded, use as-is
            decoded_model_id = model_id
            logger.info("🔧 Using model_id as-is: %s", model_id)
        
        logger.info("🔧 Fetching features for model_id: %s (original: %s)", decoded_model_id, model_id)
        models = await DataService.fetch_selected_models(decoded_model_id)
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
#                                        Get Y-Variable Info
# -----------------------------------------------------------------------------------------------------------
@router.get("/y-variable")
async def get_y_variable_info(model_id: str = Query(..., description="Model _id to fetch y_variable info")):
    """
    Get the target variable (y_variable) information for the specified model.
    
    This endpoint helps users understand what variable they are planning for
    before running scenarios.
    
    Returns:
    - y_variable: The target variable name
    - model_info: Additional model information
    """
    try:
        # Decode the model_id
        decoded_model_id = urllib.parse.unquote(model_id)
        logger.info("🔍 Fetching y_variable info for model_id: %s", decoded_model_id)
        
        # Fetch models to get y_variable information
        models = await DataService.fetch_selected_models(decoded_model_id)
        if not models:
            raise HTTPException(
                status_code=404,
                detail="No models found for the specified model_id"
            )
        
        # Extract y_variable from the first model (all models should have the same y_variable)
        y_variable = ""
        model_info = {}
        
        if models and len(models) > 0:
            first_model = models[0]
            y_variable = first_model.get("y_variable", "")
            
            # Get additional model information
            model_info = {
                "model_type": first_model.get("model_type", "Unknown"),
                "training_id": first_model.get("training_id", ""),
                "combination": first_model.get("combination", ""),
                "x_variables_count": len(first_model.get("x_variables", [])),
                "x_variables": first_model.get("x_variables", [])
            }
            
            logger.info("🎯 Found y_variable: %s", y_variable)
        
        return {
            "y_variable": y_variable,
            "model_info": model_info,
            "models_count": len(models),
            "message": f"Target variable: {y_variable}" if y_variable else "No target variable found"
        }
        
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error("Failed to fetch y_variable info: %s", str(e), exc_info=True)
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
        decoded_model_id = urllib.parse.unquote(payload.model_id)
        logger.info("🔧 Running scenario for model_id: %s (original: %s)", decoded_model_id, payload.model_id)
        models = await DataService.fetch_selected_models(decoded_model_id)
        if not models:
            raise HTTPException(
                status_code=400,
                detail="No selected models found. Please ensure models are configured."
            )

        # ✅ Extract y_variable from the first model (all models should have the same y_variable)
        y_variable = ""
        if models and len(models) > 0:
            y_variable = models[0].get("y_variable", "")
            logger.info("🎯 Target variable (y_variable): %s", y_variable)

        # ✅ Update payload with decoded model_id for scenario service
        # Create a new payload object with the decoded model_id to avoid modifying the original
        updated_payload = payload.model_copy()
        updated_payload.model_id = decoded_model_id

        # ✅ Run scenario pipeline with current dataset
        result_rows = await ScenarioService.run_scenario(updated_payload, run_id, current_file_key)

        # ✅ Aggregation + storage for multiple views - NOW WITH AWAIT!
        response_data = await AggregationService.aggregate_and_store(
            result_rows, updated_payload, run_id
        )

        # ✅ Response with new view_results structure
        out = {
            "run_id": run_id,
            "dataset_used": current_file_key,
            "created_at": datetime.utcnow().isoformat(),
            "models_processed": len(models),
            "y_variable": y_variable,
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
        decoded_model_id = urllib.parse.unquote(payload.model_id)
        logger.info("🔧 Single combination reference for model_id: %s (original: %s)", decoded_model_id, payload.model_id)
        models = await DataService.fetch_selected_models(decoded_model_id)
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
    d0_key: str = Body(..., embed=True, description="Dataset key to force refresh"),
    model_id: str = Body(..., embed=True, description="Model _id to fetch and process")
):
    """
    Force refresh cache for a dataset regardless of whether data has changed.
    Useful when you want to ensure fresh data or clear stale cache.
    """
    try:
        logger.info("🔄 Force refreshing cache for: %s", d0_key)
        
        result = await DataService.cache_dataset_smart(d0_key, model_id, force_refresh=True)
        
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
#  GET /api/scenario/flattened-structure
# ────────────────────────────────────────────────────────────────────────────
@router.get("/forecasting/flattened-models")
async def get_flattened_models(model_id: str = Query(..., description="Model _id to fetch")):
    """
    Returns the flattened models for the given model_id.
    """
    # Handle both URL-encoded and non-URL-encoded model_ids
    if '%' in model_id:
        # URL-encoded, decode it
        decoded_model_id = urllib.parse.unquote(model_id)
        logger.info("🔧 URL-decoded model_id: %s -> %s", model_id, decoded_model_id)
        flattened_models = await DataService.fetch_selected_models(model_id=decoded_model_id)
    else:
        # Not URL-encoded, use as-is
        logger.info("🔧 Using model_id as-is: %s", model_id)
        flattened_models = await DataService.fetch_selected_models(model_id=model_id)
    
    if not flattened_models:
        raise HTTPException(status_code=404, detail="No models found for the given _id")
    return {"models": flattened_models}


@router.get("/get-reference-points")
async def get_reference_points_endpoint(
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name")
):
    """Get saved reference points from MongoDB"""
    try:
        result = await get_reference_points_from_mongo(
            client_name=client_name,
            app_name=app_name,
            project_name=project_name
        )
        
        if result:
            return {
                "success": True,
                "message": "Reference points retrieved successfully",
                "data": result
            }
        else:
            return {
                "success": False,
                "message": "No reference points found",
                "data": None
            }
            
    except Exception as e:
        logger.error(f"Error retrieving reference points: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve reference points: {str(e)}")


@router.post("/calculate-reference-points")
async def calculate_reference_points_endpoint(request: CalculateReferencePointsRequest):
    """Calculate reference points for specific combinations and features"""
    try:
        # Get models to extract available combinations
        model_id = request.model_id
        if '%' in model_id:
            decoded_model_id = urllib.parse.unquote(model_id)
        else:
            decoded_model_id = model_id
            
        models = await DataService.get_models_for_combinations(decoded_model_id)
        
        if not models:
            raise HTTPException(status_code=404, detail="No models found for the given model_id")
        
        # Filter models to only include requested combinations and features
        filtered_models = []
        for model in models:
            combination_id = model.get("combination", "")
            if combination_id in request.combination_ids:
                # Filter features to only include selected ones
                x_variables = model.get("x_variables", [])
                selected_features = [f for f in x_variables if f in request.feature_names]
                
                if selected_features:  # Only include if there are selected features
                    filtered_model = model.copy()
                    filtered_model["x_variables"] = selected_features
                    filtered_models.append(filtered_model)
        
        if not filtered_models:
            raise HTTPException(status_code=404, detail="No matching models found for the requested combinations and features")
        
        # Calculate reference values for filtered models
        reference_values_by_combination = {}
        
        for model in filtered_models:
            combination_id = model.get("combination", "unknown")
            ident = model["identifiers"]
            
            try:
                # Get the data slice for this combination
                df_slice = await DataService.get_data_slice_for_combination(
                    ident, 
                    start=request.start_date,
                    end=request.end_date
                )
                
                if df_slice is not None and not df_slice.empty:
                    # Calculate reference values for selected features only
                    ref_vals = {}
                    for feature in model["x_variables"]:
                        if feature in df_slice.columns:
                            if request.stat == 'period-mean':
                                ref_vals[feature] = float(df_slice[feature].mean())
                            elif request.stat == 'period-median':
                                ref_vals[feature] = float(df_slice[feature].median())
                            elif request.stat == 'period-max':
                                ref_vals[feature] = float(df_slice[feature].max())
                            elif request.stat == 'period-min':
                                ref_vals[feature] = float(df_slice[feature].min())
                            else:
                                ref_vals[feature] = float(df_slice[feature].mean())
                    
                    reference_values_by_combination[combination_id] = {
                        "features": model["x_variables"],
                        "reference_values": ref_vals,
                        "data_slice_rows": len(df_slice)
                    }
                    
            except KeyError as e:
                logger.warning(f"Missing cluster slice for combination {combination_id}: {e}")
                reference_values_by_combination[combination_id] = {
                    "features": model["x_variables"],
                    "reference_values": {},
                    "data_slice_rows": 0,
                }
        
        return {
            "success": True,
            "message": f"Reference points calculated for {len(reference_values_by_combination)} combinations",
            "data": {
                "reference_values_by_combination": reference_values_by_combination,
                "statistic_used": request.stat,
                "date_range": {
                    "start_date": request.start_date,
                    "end_date": request.end_date
                },
                "combinations_requested": request.combination_ids,
                "features_requested": request.feature_names,
                "combinations_calculated": list(reference_values_by_combination.keys())
            }
        }
        
    except Exception as e:
        logger.error(f"Error calculating reference points: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to calculate reference points: {str(e)}")

@router.get("/get-scenario-configurations")
async def get_scenario_configurations_endpoint(
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name")
):
    """Get saved scenario configurations from MongoDB"""
    try:
        result = await get_scenario_configurations_from_mongo(
            client_name=client_name,
            app_name=app_name,
            project_name=project_name
        )
        
        if result:
            return {
                "success": True,
                "message": "Scenario configurations retrieved successfully",
                "data": result
            }
        else:
            return {
                "success": False,
                "message": "No scenario configurations found",
                "data": None
            }
            
    except Exception as e:
        logger.error(f"Error retrieving scenario configurations: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve scenario configurations: {str(e)}")

@router.put("/update-reference-points")
async def update_reference_points_endpoint(
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name"),
    reference_points_data: dict = Body(..., description="Reference points data to update/overwrite"),
    user_id: str = Query("", description="User ID"),
    project_id: int = Query(None, description="Project ID")
):
    """Update/overwrite reference points in MongoDB"""
    try:
        result = await save_reference_points(
            client_name=client_name,
            app_name=app_name,
            project_name=project_name,
            reference_points_data=reference_points_data,
            user_id=user_id,
            project_id=project_id
        )
        
        if result["status"] == "success":
           return {
                "success": True,
                "message": f"Reference points updated successfully",
                "mongo_id": result["mongo_id"],
                "operation": result["operation"],
                "collection": result["collection"]
            }
        else:
            raise HTTPException(status_code=500, detail=f"Failed to update reference points: {result['error']}")
            
    except Exception as e:
        logger.error(f"Error updating reference points: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update reference points: {str(e)}")

@router.put("/update-scenario-configurations")
async def update_scenario_configurations_endpoint(
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name"),
    scenario_config_data: dict = Body(..., description="Scenario configuration data to update/overwrite"),
    user_id: str = Query("", description="User ID"),
    project_id: int = Query(None, description="Project ID")
):
    """Update/overwrite scenario configurations in MongoDB"""
    try:
        result = await save_scenario_configurations(
            client_name=client_name,
            app_name=app_name,
            project_name=project_name,
            scenario_config_data=scenario_config_data,
            user_id=user_id,
            project_id=project_id
        )
        
        if result["status"] == "success":
            return {
                "success": True,
                "message": f"Scenario configurations updated successfully",
                "mongo_id": result["mongo_id"],
                "operation": result["operation"],
                "collection": result["collection"]
             }
        else:
            raise HTTPException(status_code=500, detail=f"Failed to update scenario configurations: {result['error']}")
            
    except Exception as e:
        logger.error(f"Error updating scenario configurations: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update scenario configurations: {str(e)}")

    