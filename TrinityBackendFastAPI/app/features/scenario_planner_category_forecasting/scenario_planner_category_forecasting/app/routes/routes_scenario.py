from fastapi import APIRouter, HTTPException, Query, Body
import logging
import urllib.parse
from ..config import cache, scenario_values_collection, select_models_collection, saved_predictions_collection
from ..schemas import RunRequest, RunResponse, CacheWarmResponse, StatusResponse, IdentifiersResponse, FeaturesResponse, CacheClearResponse, ReferenceRequest, ReferenceResponse, ScenarioValuesRequest, ScenarioValuesResponse, SingleCombinationReferenceRequest, SingleCombinationReferenceResponse, AutoPopulateReferenceRequest, AutoPopulateReferenceResponse

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
    1. Check if existing cache is fresh (< 6 hours old)
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
        
        # ✅ Save scenario results to MongoDB (scenario-wise)
        try:
            # Extract client/app/project from model_id
            parts = decoded_model_id.split('/')
            if len(parts) >= 3:
                client_name = parts[0]
                app_name = parts[1] 
                project_name = '/'.join(parts[2:])
                
                # Extract scenario_id from payload
                scenario_id = payload.scenario_id
                
                # Prepare scenario results data
                scenario_results_data = {
                    "run_id": run_id,
                    "dataset_used": current_file_key,
                    "created_at": datetime.utcnow().isoformat(),
                    "models_processed": len(models),
                    "y_variable": y_variable,
                    "payload": payload.dict() if hasattr(payload, 'dict') else payload,
                    **response_data,  # Include all the view results
                }
                
                # Save to MongoDB
                mongo_result = await save_scenario_results(
                    client_name=client_name,
                    app_name=app_name,
                    project_name=project_name,
                    scenario_id=scenario_id,
                    scenario_results_data=scenario_results_data,
                    user_id="",  # You can add user_id if available
                    project_id=None  # You can add project_id if available
                )
                
                logger.info(f"📦 Scenario results saved to MongoDB: {mongo_result}")
                
        except Exception as mongo_error:
            # Don't fail the main request if MongoDB save fails
            logger.warning(f"⚠️ Failed to save scenario results to MongoDB: {mongo_error}")
        
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


@router.get("/get-reference-points-for-combinations")
async def get_reference_points_for_combinations_endpoint(
    model_id: str = Query(..., description="Model ID"),
    combination_ids: str = Query(..., description="Comma-separated combination IDs"),
    feature_names: str = Query(..., description="Comma-separated feature names")
):
    """Get reference points for specific combinations and features"""
    try:
        # Parse query parameters
        if '%' in model_id:
            decoded_model_id = urllib.parse.unquote(model_id)
        else:
            decoded_model_id = model_id
            
        # Parse combination_ids and feature_names from comma-separated strings
        combination_ids_list = [id.strip() for id in combination_ids.split(',') if id.strip()]
        feature_names_list = [name.strip() for name in feature_names.split(',') if name.strip()]
            
        # Parse model_id to extract client/app/project
        parts = decoded_model_id.split('/')
        if len(parts) >= 3:
            client_name = parts[0]
            app_name = parts[1] 
            project_name = '/'.join(parts[2:])  # Handle project names with slashes
        else:
            raise HTTPException(status_code=400, detail="Invalid model_id format")
        
        logger.info(f"🔍 Auto-population request for: {client_name}/{app_name}/{project_name}")
        logger.info(f"🔍 Requested combinations: {combination_ids_list}")
        logger.info(f"🔍 Requested features: {feature_names_list}")
        
        # STEP 1: Check if reference points exist in scenario_reference_points collection
        try:
            existing_reference_points = await get_reference_points_from_mongo(
                client_name=client_name,
                app_name=app_name,
                project_name=project_name
            )
            
            if existing_reference_points and existing_reference_points.get('reference_values_by_combination'):
                logger.info("✅ Found existing reference points in scenario_reference_points collection")
                
                # Filter existing reference points for requested combinations and features
                filtered_reference_values = {}
                for combination_id in combination_ids_list:
                    if combination_id in existing_reference_points['reference_values_by_combination']:
                        combination_data = existing_reference_points['reference_values_by_combination'][combination_id]
                        ref_values = combination_data.get('reference_values', {})
                        
                        # Filter for requested features only
                        filtered_ref_values = {
                            feature: value for feature, value in ref_values.items() 
                            if feature in feature_names_list
                        }
                        
                        if filtered_ref_values:
                            filtered_reference_values[combination_id] = {
                                "features": list(filtered_ref_values.keys()),
                                "reference_values": filtered_ref_values
                            }
                
                if filtered_reference_values:
                    return {
                        "success": True,
                        "message": f"Reference points retrieved from saved data for {len(filtered_reference_values)} combinations",
                        "data": {
                            "reference_values_by_combination": filtered_reference_values,
                            "source": "saved_reference_points",
                            "combinations_requested": combination_ids_list,
                            "features_requested": feature_names_list,
                            "combinations_found": list(filtered_reference_values.keys())
                        }
                    }
                else:
                    logger.info("⚠️ No matching combinations found in saved reference points, falling back to select metadata")
            else:
                logger.info("ℹ️ No existing reference points found, falling back to select metadata")
                
        except Exception as e:
            logger.warning(f"⚠️ Error checking existing reference points: {str(e)}, falling back to select metadata")
        
        # STEP 2: Fallback to select atom metadata
        logger.info("🔄 Falling back to select atom metadata for auto-population")
        
        # Get select atom metadata using the same _id
        from motor.motor_asyncio import AsyncIOMotorClient
        import os

        from ..config import select_models_collection, db
        # Query select atom metadata
        select_metadata = await select_models_collection.find_one({"_id": decoded_model_id})
        
        if not select_metadata:
            raise HTTPException(status_code=404, detail="No select atom metadata found for the given model_id")
        
        # Extract reference values from select metadata
        reference_values_by_combination = {}
        combinations_data = select_metadata.get('combinations', [])
        
        for combination_data in combinations_data:
            combination_id = combination_data.get('combination_id', '')
            
            if combination_id in combination_ids_list:
                complete_model_data = combination_data.get('complete_model_data', {})
                
                # Extract mean values for requested features
                ref_values = {}
                for feature in feature_names_list:
                    mean_key = f"{feature}_avg"
                    if mean_key in complete_model_data:
                        ref_values[feature] = float(complete_model_data[mean_key])
                
                if ref_values:
                    reference_values_by_combination[combination_id] = {
                        "features": list(ref_values.keys()),
                        "reference_values": ref_values
                    }
        
        if not reference_values_by_combination:
            raise HTTPException(status_code=404, detail="No matching combinations found in select atom metadata")
        
        return {
            "success": True,
            "message": f"Reference points retrieved from select metadata for {len(reference_values_by_combination)} combinations",
            "data": {
                "reference_values_by_combination": reference_values_by_combination,
                "source": "select_metadata",
                "combinations_requested": combination_ids_list,
                "features_requested": feature_names_list,
                "combinations_found": list(reference_values_by_combination.keys())
            }
        }
        
    except Exception as e:
        logger.error(f"Error in auto-population: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to auto-populate reference points: {str(e)}")


@router.get("/get-date-range")
async def get_date_range_endpoint(
    model_id: str = Query(..., description="Model ID")
):
    """Get the available date range from cluster slice data"""
    try:
        # Parse model_id to extract client/app/project
        if '%' in model_id:
            decoded_model_id = urllib.parse.unquote(model_id)
        else:
            decoded_model_id = model_id
            
        parts = decoded_model_id.split('/')
        if len(parts) >= 3:
            client_name = parts[0]
            app_name = parts[1] 
            project_name = '/'.join(parts[2:])
        else:  
            raise HTTPException(status_code=400, detail="Invalid model_id format")
        
        logger.info(f"🔍 Getting date range for: {client_name}/{app_name}/{project_name}")
        
        # Get models to find a sample combination for date range
        models = await DataService.fetch_selected_models(decoded_model_id)
        
        if not models:
            raise HTTPException(status_code=404, detail="No models found for the given model_id")
        
        # Use the first model to get date range
        sample_model = models[1]
        sample_identifiers = sample_model.get("identifiers", {})
        
        try:
            # Get a sample data slice to extract date range
            # Use the same approach as /reference endpoint - get data from model's source file
            model_file_key = sample_model.get("file_key", "")
            logger.info(f"🔍 Date range - model_file_key: {model_file_key}")
            
            if model_file_key:
                # Load data directly from the model's source file (same as /reference endpoint)
                df_slice = DataService.get_d0_dataframe(model_file_key)
                logger.info(f"🔍 Date range - df_slice shape: {df_slice.shape if df_slice is not None else 'None'}")
                logger.info(f"🔍 Date range - df_slice columns: {list(df_slice.columns) if df_slice is not None else 'None'}")
            else:
                # Fallback to full dataset if no file_key
                logger.warning("⚠️ No file_key found for model, using full dataset")
                df_slice = DataService.get_current_d0_dataframe()
                if df_slice is None:
                    raise HTTPException(status_code=400, detail="No dataset cached. Please call GET /init-cache first.")
                logger.info(f"🔍 Date range - full df_slice shape: {df_slice.shape if df_slice is not None else 'None'}")
            
            if df_slice is not None and not df_slice.empty:
                # Find date column (assuming it's named 'date', 'Date', or similar)
                date_columns = [col for col in df_slice.columns if 'date' in col.lower()]
                logger.info(f"🔍 Date range - date_columns: {date_columns}")
                
                if date_columns:
                    date_col = date_columns[0]
                    min_date = df_slice[date_col].min()
                    max_date = df_slice[date_col].max()
                    
                    # Convert to string format - handle both datetime objects and string dates
                    def format_date_for_html(date_value):
                        if hasattr(date_value, 'strftime'):
                            # It's a datetime object
                            return date_value.strftime('%Y-%m-%d')
                        else:
                            # It's a string, try to parse and reformat
                            date_str = str(date_value)
                            try:
                                # Try to parse DD-MMM-YYYY format
                                from datetime import datetime
                                parsed_date = datetime.strptime(date_str, '%d-%b-%Y')
                                return parsed_date.strftime('%Y-%m-%d')
                            except ValueError:
                                try:
                                    # Try to parse DD-MMM-YY format
                                    parsed_date = datetime.strptime(date_str, '%d-%b-%y')
                                    return parsed_date.strftime('%Y-%m-%d')
                                except ValueError:
                                    # If all parsing fails, return as is
                                    return date_str
                    
                    start_date = format_date_for_html(min_date)
                    end_date = format_date_for_html(max_date)
                    
                    logger.info(f"🔍 Date range conversion: {min_date} -> {start_date}, {max_date} -> {end_date}")
                    
                    return {
                        "success": True,
                        "message": "Date range retrieved successfully",
                        "data": {
                            "start_date": start_date,
                            "end_date": end_date,
                            "date_column": date_col,
                            "total_rows": len(df_slice)
                        }
                    }
                else:
                    # Fallback: use index if no date column found
                    return {
                        "success": True,
                        "message": "No date column found, using default range",
                        "data": {
                            "start_date": "2024-01-01",
                            "end_date": "2024-12-31",
                            "date_column": None,
                            "total_rows": len(df_slice)
                        }
                    }
            else:
                raise HTTPException(status_code=404, detail="No data found for date range extraction")
                
        except Exception as e:
            logger.warning(f"Error getting date range from data slice: {str(e)}")
            # Fallback to default range
            return {
                "success": True,
                "message": "Using default date range",
                "data": {
                    "start_date": "2024-01-01",
                    "end_date": "2024-12-31",
                    "date_column": None,
                    "total_rows": 0
                }
            }
        
    except Exception as e:
        logger.error(f"Error getting date range: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get date range: {str(e)}")




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

# ============================================================================
# SCENARIO RESULTS ENDPOINTS
# ============================================================================

@router.post("/save-scenario-results")
async def save_scenario_results_endpoint(
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name"),
    scenario_id: str = Query(..., description="Scenario ID"),
    scenario_results_data: dict = Body(..., description="Scenario results data to save"),
    user_id: str = Query("", description="User ID"),
    project_id: int = Query(None, description="Project ID")
):
    """Save scenario results to MongoDB - scenario-wise"""
    try:
        result = await save_scenario_results(
            client_name=client_name,
            app_name=app_name,
            project_name=project_name,
            scenario_id=scenario_id,
            scenario_results_data=scenario_results_data,
            user_id=user_id,
            project_id=project_id
        )
        
        if result["status"] == "success":
            return {
                "success": True,
                "message": f"Scenario results saved successfully for scenario {scenario_id}",
                "mongo_id": result["mongo_id"],
                "operation": result["operation"],
                "collection": result["collection"]
            }
        else:
            raise HTTPException(status_code=500, detail=f"Failed to save scenario results: {result['error']}")
            
    except Exception as e:
        logger.error(f"Error saving scenario results: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to save scenario results: {str(e)}")

@router.get("/get-scenario-results")
async def get_scenario_results_endpoint(
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name"),
    scenario_id: str = Query(None, description="Specific scenario ID (optional)")
):
    """Retrieve saved scenario results. If scenario_id is provided, get specific scenario, otherwise get all scenarios."""
    try:
        result = await get_scenario_results_from_mongo(
            client_name=client_name,
            app_name=app_name,
            project_name=project_name,
            scenario_id=scenario_id
        )
        
        if result is not None:
            return {
                "success": True,
                "message": f"Scenario results retrieved successfully",
                "data": result
            }
        else:
            return {
                "success": True,
                "message": "No scenario results found",
                "data": None
            }
            
    except Exception as e:
        logger.error(f"Error retrieving scenario results: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve scenario results: {str(e)}")


# ────────────────────────────────────────────────────────────────────────────
#  GET /api/scenario/select-configs/{model_id}
# ────────────────────────────────────────────────────────────────────────────
@router.get("/select-configs/{model_id:path}")
async def get_select_configs_metadata(model_id: str):
    """
    Fetch select_configs metadata by model_id.
    
    Args:
        model_id: The model _id to fetch metadata for
        
    Returns:
        Dictionary containing the select_configs metadata
    """
    try:
        # Handle URL-encoded model_ids
        if '%' in model_id:
            decoded_model_id = urllib.parse.unquote(model_id)
            logger.info("🔧 URL-decoded model_id: %s -> %s", model_id, decoded_model_id)
        else:
            decoded_model_id = model_id
            logger.info("🔧 Using model_id as-is: %s", model_id)
        
        # Fetch the select_configs document
        from ..config import select_models_collection
        
        logger.info("🔍 Searching for model_id: %s in select_configs collection", decoded_model_id)
        logger.info("🔍 Collection name: %s", select_models_collection.name)
        
        # First, let's check if the collection exists and has any documents
        collection_count = await select_models_collection.count_documents({})
        logger.info("📊 Total documents in select_configs collection: %d", collection_count)
        
        # List a few sample document IDs to help debug
        sample_docs = await select_models_collection.find({}, {"_id": 1}).limit(5).to_list(length=5)
        logger.info("📋 Sample document IDs in select_configs: %s", [doc["_id"] for doc in sample_docs])
        
        document = await select_models_collection.find_one({"_id": decoded_model_id})
        
        if not document:
            logger.warning("❌ No select_configs found for model_id: %s", decoded_model_id)
            
            # Try to find similar documents
            similar_docs = await select_models_collection.find(
                {"_id": {"$regex": decoded_model_id.split("/")[-1]}}, 
                {"_id": 1}
            ).limit(3).to_list(length=3)
            
            if similar_docs:
                logger.info("🔍 Found similar document IDs: %s", [doc["_id"] for doc in similar_docs])
            
            raise HTTPException(
                status_code=404, 
                detail=f"No select_configs metadata found for model_id: {decoded_model_id}"
            )
        
        # Convert ObjectId to string if present
        if "_id" in document and hasattr(document["_id"], '__str__'):
            document["_id"] = str(document["_id"])
        
        # Convert datetime objects to ISO strings
        for key, value in document.items():
            if hasattr(value, 'isoformat'):  # datetime objects
                document[key] = value.isoformat()
        
        logger.info("✅ Successfully retrieved select_configs for model_id: %s", decoded_model_id)
        
        return {
            "status": "success",
            "model_id": decoded_model_id,
            "data": document,
            "collection": "select_configs"
        }
        
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        logger.error(f"Error retrieving select_configs metadata: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to retrieve select_configs metadata: {str(e)}"
        )


# ────────────────────────────────────────────────────────────────────────────
#  GET /api/scenario/test-route
# ────────────────────────────────────────────────────────────────────────────
@router.get("/test-route")
async def test_route():
    """
    Test endpoint to verify the scenario router is working.
    """
    return {
        "status": "success",
        "message": "Scenario router is working",
        "timestamp": datetime.utcnow().isoformat()
    }


# ────────────────────────────────────────────────────────────────────────────
#  GET /api/scenario/test-path/{test_id:path}
# ────────────────────────────────────────────────────────────────────────────
@router.get("/test-path/{test_id:path}")
async def test_path_parameter(test_id: str):
    """
    Test endpoint to verify path parameters with slashes work.
    """
    logger.info("🔍 Test path parameter received: %s", test_id)
    return {
        "status": "success",
        "test_id": test_id,
        "message": "Path parameter with slashes is working",
        "timestamp": datetime.utcnow().isoformat()
    }


# ────────────────────────────────────────────────────────────────────────────
#  GET /api/scenario/list-models
# ────────────────────────────────────────────────────────────────────────────
@router.get("/list-models")
async def list_available_models():
    """
    List all available model IDs in the select_configs collection.
    """
    try:
        from ..config import select_models_collection
        
        # Get all document IDs
        documents = await select_models_collection.find({}, {"_id": 1}).to_list(length=None)
        model_ids = [doc["_id"] for doc in documents]
        
        logger.info("📋 Found %d models in select_configs collection", len(model_ids))
        
        return {
            "status": "success",
            "count": len(model_ids),
            "model_ids": model_ids,
            "collection": "select_configs"
        }
        
    except Exception as e:
        logger.error(f"Error listing models: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to list models: {str(e)}"
        )

    