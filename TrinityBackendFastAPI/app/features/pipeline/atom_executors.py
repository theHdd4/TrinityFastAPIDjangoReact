"""Atom executor registry for pipeline re-execution.

This module provides a generic way to re-execute atoms based on their stored
configuration in MongoDB. Each atom type registers its executor, which handles
re-execution by checking API calls from MongoDB and executing the appropriate
endpoints in order.
"""

from __future__ import annotations

import logging
import os
from abc import ABC, abstractmethod
from typing import Any, Dict, Optional, List
from datetime import datetime

logger = logging.getLogger(__name__)


class BaseAtomExecutor(ABC):
    """Base class for atom executors.
    
    Each atom type should implement this interface to handle re-execution.
    The executor checks API calls from MongoDB and executes endpoints accordingly.
    """
    
    @abstractmethod
    def get_atom_type(self) -> str:
        """Return the atom type identifier (e.g., 'groupby-wtg-avg')."""
        pass
    
    @abstractmethod
    async def execute(
        self,
        atom_instance_id: str,
        card_id: str,
        configuration: Dict[str, Any],
        input_files: List[str],
        api_calls: List[Dict[str, Any]],
        **kwargs
    ) -> Dict[str, Any]:
        """Execute atom based on API calls from MongoDB.
        
        This method should:
        1. Check which endpoints were called (from api_calls)
        2. Execute those endpoints in order using the configuration
        3. Return execution results
        
        Args:
            atom_instance_id: Unique atom instance identifier
            card_id: Card ID containing the atom
            configuration: Atom configuration from MongoDB
            input_files: List of input file keys (after replacements)
            api_calls: List of API calls from MongoDB execution step
            **kwargs: Additional parameters (canvas_position, etc.)
        
        Returns:
            Dictionary with execution results:
            {
                "status": "success" | "failed" | "pending",
                "result_file": str | None,
                "message": str,
                "task_response": Dict | None,  # For frontend polling
                "additional_results": Dict | None  # Any other results
            }
        """
        pass


class GroupByExecutor(BaseAtomExecutor):
    """Executor for groupby-wtg-avg atom.
    
    Handles endpoints:
    - /api/groupby/run (or atom_execution_start/complete)
    - /api/groupby/save
    """
    
    def get_atom_type(self) -> str:
        return "groupby-wtg-avg"
    
    async def execute(
        self,
        atom_instance_id: str,
        card_id: str,
        configuration: Dict[str, Any],
        input_files: List[str],
        api_calls: List[Dict[str, Any]],
        **kwargs
    ) -> Dict[str, Any]:
        """Execute groupby atom based on API calls from MongoDB."""
        from app.features.groupby.routes import run_groupby, save_groupby
        from app.features.groupby.service import load_dataframe, MINIO_BUCKET
        import json
        
        # Get primary input file (fallback for backward compatibility)
        primary_file = input_files[0] if input_files else configuration.get("file_key", "")
        
        # For groupby atoms, process each API call SEQUENTIALLY to maintain init->run->save sequences
        # Each API call may have its own input file in params
        # This allows multiple init/run/save sequences for different files/configurations
        
        # 🔧 CRITICAL: Track current file context for execution markers
        # Execution markers (atom_execution_start, atom_execution_complete) don't have file info
        # So we use the file from the most recent /init call
        current_file_context = primary_file  # Default to primary file
        
        result_file = None
        task_response = None
        save_results = []  # Track all save results (not just the last one)
        init_results = []
        all_saved_files = []  # Track all saved files
        
        # Process API calls sequentially to maintain sequence: init -> run -> save -> init -> run -> save
        i = 0
        while i < len(api_calls):
            api_call = api_calls[i]
            endpoint = api_call.get("endpoint", "")
            params = api_call.get("params", {})
            
            # Extract file from params (file_replacements already applied in endpoint.py)
            # For execution markers, use the current file context (from previous init)
            call_file = None
            if endpoint in ["atom_execution_start", "atom_execution_complete"]:
                # Execution markers don't have file info, use context from previous init
                call_file = current_file_context
                logger.info(
                    f"📋 [GROUPBY] Execution marker '{endpoint}' using file context: {call_file}"
                )
            else:
                # For other endpoints, try to extract file from params
                call_file = (
                    params.get("object_names") or 
                    params.get("file_key") or 
                    params.get("object_name") or
                    current_file_context  # Fall back to current context
                )
            
            # Check for init endpoint
            if endpoint in ["/api/groupby/init", "/groupby/init"] or endpoint.endswith("/init"):
                # Update current file context when we see an init call
                current_file_context = call_file
                logger.info(
                    f"🔄 [GROUPBY] Executing /init for atom {atom_instance_id} with file: {call_file}"
                )
                
                try:
                    # Extract configuration from API call params
                    init_config = params
                    bucket_name = configuration.get("bucket_name", init_config.get("bucket_name", "trinity"))
                    object_names = call_file
                    
                    # Get client/app/project from config or environment
                    client_name = init_config.get("client_name") or os.getenv("CLIENT_NAME", "")
                    app_name = init_config.get("app_name") or os.getenv("APP_NAME", "")
                    project_name = init_config.get("project_name") or os.getenv("PROJECT_NAME", "")
                    
                    # Call initialize_groupby directly
                    from app.features.groupby.service import initialize_groupby
                    init_result = initialize_groupby(
                        bucket_name=bucket_name,
                        object_name=object_names,
                        client_name=client_name,
                        app_name=app_name,
                        project_name=project_name,
                        file_key=call_file,
                    )
                    
                    init_results.append(init_result)
                    
                    if init_result.get("status") != "SUCCESS":
                        logger.warning(f"⚠️ GroupBy init returned non-success status: {init_result.get('status')}")
                    else:
                        logger.info(f"✅ GroupBy init completed successfully for file: {call_file}")
                        
                except Exception as e:
                    logger.error(f"❌ Error executing groupby init: {e}", exc_info=True)
                    # Don't fail the entire execution if init fails, but log it
                
                i += 1
                
            # Check for run endpoint (could be atom_execution_start, /groupby/run, etc.)
            elif endpoint in ["atom_execution_start", "/api/groupby/run", "/groupby/run"] or ("run" in endpoint.lower() and "init" not in endpoint.lower()):
                # Find the matching atom_execution_complete (next call if this is start)
                run_start_call = api_call if endpoint == "atom_execution_start" else None
                run_complete_call = None
                run_file = call_file
                
                # If this is atom_execution_start, find the matching complete
                if endpoint == "atom_execution_start":
                    # Look ahead for atom_execution_complete
                    if i + 1 < len(api_calls):
                        next_call = api_calls[i + 1]
                        if next_call.get("endpoint") == "atom_execution_complete":
                            run_complete_call = next_call
                            i += 1  # Skip the complete call, we'll process it here
                
                logger.info(
                    f"🔄 [GROUPBY] Executing /run for atom {atom_instance_id} with file: {run_file}"
                )
                
                try:
                    # Extract configuration from API call params (use complete if available, else start)
                    run_params = run_complete_call.get("params", {}) if run_complete_call else params
                    
                    # Get identifiers and aggregations from this specific API call's params
                    identifiers = run_params.get("identifiers")
                    if not identifiers:
                        identifiers = configuration.get("identifiers", [])
                    
                    aggregations = run_params.get("aggregations")
                    if not aggregations:
                        aggregations = configuration.get("aggregations", {})
                    
                    bucket_name = configuration.get("bucket_name", run_params.get("bucket_name", "trinity"))
                    
                    # Call run_groupby with file from this API call (already has replacements applied)
                    result = await run_groupby(
                        validator_atom_id=atom_instance_id,
                        file_key=run_file,
                        bucket_name=bucket_name,
                        object_names=run_file,
                        identifiers=json.dumps(identifiers) if isinstance(identifiers, list) else identifiers,
                        aggregations=json.dumps(aggregations) if isinstance(aggregations, dict) else aggregations,
                        card_id=card_id,
                        canvas_position=kwargs.get("canvas_position", 0),
                    )
                    
                    if isinstance(result, dict):
                        task_response = result
                        task_status = result.get("task_status", result.get("status", "unknown"))
                        # Update result_file for this sequence
                        if result.get("result_file"):
                            result_file = result.get("result_file")
                        
                        if task_status == "failure":
                            logger.error(f"❌ GroupBy run failed: {result.get('detail', 'Unknown error')}")
                            # Continue to next sequence instead of failing entirely
                        else:
                            logger.info(f"✅ GroupBy run completed successfully, result_file: {result_file}")
                    else:
                        logger.error(f"❌ GroupBy run returned unexpected result type")
                        
                except Exception as e:
                    logger.error(f"❌ Error executing groupby run: {e}", exc_info=True)
                    # Continue to next sequence instead of failing entirely
                
                i += 1
                
            # Check for save endpoint
            elif endpoint in ["/api/groupby/save", "/groupby/save"] or endpoint.endswith("/save"):
                logger.info(
                    f"💾 [GROUPBY] Executing /save for atom {atom_instance_id} "
                    f"with result file: {result_file}"
                )
                
                save_config = params
                filename = save_config.get("filename")
                
                if filename and result_file:
                    try:
                        # Load result file and convert to CSV
                        df = load_dataframe(MINIO_BUCKET, result_file)
                        csv_data = df.to_csv(index=False)
                        
                        # Call save_groupby
                        save_payload = {
                            "csv_data": csv_data,
                            "filename": filename,
                            "validator_atom_id": atom_instance_id,
                            "card_id": card_id,
                            "canvas_position": kwargs.get("canvas_position", 0),
                        }
                        
                        save_result = await save_groupby(save_payload)
                        
                        if isinstance(save_result, dict):
                            save_status = save_result.get("task_status", save_result.get("status", "unknown"))
                            if save_status == "success":
                                # Extract saved filename from result
                                saved_filename = save_result.get("filename") or save_result.get("result_file")
                                if saved_filename:
                                    all_saved_files.append(saved_filename)
                                    save_results.append(save_result)
                                    logger.info(f"✅ SaveAs completed successfully for atom {atom_instance_id}, saved to: {saved_filename}")
                                else:
                                    logger.info(f"✅ SaveAs completed successfully for atom {atom_instance_id}")
                            else:
                                logger.warning(f"⚠️ SaveAs failed for atom {atom_instance_id}")
                    except Exception as save_error:
                        logger.error(f"❌ Error executing groupby save: {save_error}", exc_info=True)
                        save_results.append({"status": "failed", "error": str(save_error)})
                else:
                    if not filename:
                        logger.warning(f"⚠️ Save endpoint found but no filename in params")
                    if not result_file:
                        logger.warning(f"⚠️ Save endpoint found but no result_file available")
                
                i += 1
            else:
                # Unknown endpoint, skip it
                logger.warning(f"⚠️ [GROUPBY] Unknown endpoint: {endpoint}, skipping")
                i += 1
        
        # Build additional_results with saved file info
        additional_results_dict = {}
        if init_results:
            additional_results_dict["init_results"] = init_results
            # For backward compatibility, also include last init result
            if len(init_results) > 0:
                additional_results_dict["init_result"] = init_results[-1]
        if save_results:
            # Include all save results (not just the last one)
            additional_results_dict["save_results"] = save_results
            # For backward compatibility, include last save result
            if len(save_results) > 0:
                additional_results_dict["save_result"] = save_results[-1]
            # Include all saved files
            if all_saved_files:
                additional_results_dict["saved_files"] = all_saved_files
                additional_results_dict["saved_file"] = all_saved_files[-1]  # Last saved file for backward compatibility
        
        return {
            "status": "success",
            "result_file": result_file,
            "message": "GroupBy executed successfully",
            "task_response": task_response,
            "additional_results": additional_results_dict if additional_results_dict else None
        }


class FeatureOverviewExecutor(BaseAtomExecutor):
    """Executor for feature-overview atom.
    
    Handles endpoints:
    - /api/feature_overview/uniquecount
    - /api/feature_overview/summary
    """
    
    def get_atom_type(self) -> str:
        return "feature-overview"
    
    async def execute(
        self,
        atom_instance_id: str,
        card_id: str,
        configuration: Dict[str, Any],
        input_files: List[str],
        api_calls: List[Dict[str, Any]],
        **kwargs
    ) -> Dict[str, Any]:
        """Execute feature_overview atom based on API calls from MongoDB."""
        from app.features.feature_overview.deps import (
            get_unique_dataframe_results_collection,
            get_summary_results_collection,
            get_validator_atoms_collection
        )
        from app.features.feature_overview.mongodb_saver import fetch_dimensions_dict
        from app.core.task_queue import celery_task_client, format_task_response
        from app.features.feature_overview.routes import _as_bool
        import json
        
        # Get primary input file (keep original case - file paths are case-sensitive)
        # ALWAYS use input_files[0] - never fall back to configuration.get("file_key") as it may be lowercase
        primary_file = input_files[0] if input_files else ""
        if not primary_file:
            logger.warning(
                f"⚠️ FeatureOverview executor: No input_files provided for atom {atom_instance_id}, "
                f"this may cause file path issues"
            )
        
        # Check which endpoints were called
        has_uniquecount = False
        has_summary = False
        uniquecount_endpoint = None
        summary_endpoint = None
        
        for api_call in api_calls:
            endpoint = api_call.get("endpoint", "")
            # Check for uniquecount endpoint
            if endpoint in ["/api/feature_overview/uniquecount", "/feature_overview/uniquecount"] or "uniquecount" in endpoint.lower():
                has_uniquecount = True
                uniquecount_endpoint = api_call
            # Check for summary endpoint
            if endpoint in ["/api/feature_overview/summary", "/feature_overview/summary"] or (endpoint.endswith("/summary") and "feature_overview" in endpoint.lower()):
                has_summary = True
                summary_endpoint = api_call
        
        task_response = None
        additional_results = {}
        
        # Execute uniquecount endpoint if it was called
        if has_uniquecount and uniquecount_endpoint:
            logger.info(
                f"🔄 FeatureOverview executor: Executing /uniquecount for atom {atom_instance_id} "
                f"with file: {primary_file}"
            )
            
            try:
                # Extract configuration from API call params
                uniquecount_config = uniquecount_endpoint.get("params", {})
                bucket_name = configuration.get("bucket_name", uniquecount_config.get("bucket_name", "trinity"))
                
                # 🔧 CRITICAL: ALWAYS use primary_file from input_files to preserve original case
                # Never use stored object_names from params as they may be lowercase
                # input_files comes from pipeline execution with correct case
                if not primary_file:
                    return {
                        "status": "failed",
                        "result_file": None,
                        "message": "No input file provided for feature_overview uniquecount",
                        "task_response": None,
                        "additional_results": None
                    }
                
                # Always use primary_file - never fall back to stored params
                object_names = [primary_file]
                
                # Ensure object_names is a list (keep original case - file paths are case-sensitive)
                if isinstance(object_names, str):
                    object_names = [object_names]
                else:
                    object_names = [str(name) for name in object_names]
                
                # Resolve dependencies manually
                results_collection = await get_unique_dataframe_results_collection()
                validator_collection = await get_validator_atoms_collection()
                
                # Get client/app/project from config or environment (for fetching identifiers/measures)
                client_name = uniquecount_config.get("client_name") or os.getenv("CLIENT_NAME", "")
                app_name = uniquecount_config.get("app_name") or os.getenv("APP_NAME", "")
                project_name = uniquecount_config.get("project_name") or os.getenv("PROJECT_NAME", "")
                
                # Fetch identifiers and measures from classifier (after auto-classification, like groupby init)
                identifiers = []
                measures = []
                numeric_measures = []
                try:
                    from app.features.column_classifier.database import get_classifier_config_from_mongo
                    cfg = get_classifier_config_from_mongo(client_name, app_name, project_name, primary_file)
                    if cfg:
                        # Convert identifiers and measures to lowercase for consistency with file columns
                        identifiers = [col.lower() if isinstance(col, str) else col for col in cfg.get("identifiers", []) if isinstance(col, str)]
                        measures = [col.lower() if isinstance(col, str) else col for col in cfg.get("measures", []) if isinstance(col, str)]
                except Exception as e:
                    logger.warning(f"⚠️ Failed to get classifier config for feature-overview: {e}")
                
                # Fetch dimensions
                dimensions = await fetch_dimensions_dict(
                    atom_instance_id, primary_file, validator_collection
                )
                
                # If we don't have numeric_measures from classifier, try to get numeric columns from dataframe
                if not numeric_measures and measures:
                    # Measures are typically numeric, but let's verify by loading the dataframe
                    try:
                        from app.features.groupby.service import load_dataframe
                        df = load_dataframe(bucket_name, primary_file)
                        numeric_cols = df.select_dtypes(include=["number"]).columns.tolist()
                        # Use measures that are numeric
                        numeric_measures = [col.lower() for col in measures if col.lower() in [c.lower() for c in numeric_cols]]
                    except Exception as e:
                        logger.warning(f"⚠️ Failed to load dataframe for numeric columns: {e}")
                        # Fallback: assume all measures are numeric
                        numeric_measures = [col.lower() for col in measures]
                
                collection_name = results_collection.name
                database_name = results_collection.database.name
                
                # Submit celery task directly (same as the endpoint does)
                submission = celery_task_client.submit_callable(
                    name="feature_overview.uniquecount",
                    dotted_path="app.features.feature_overview.service.run_unique_count_task",
                    kwargs={
                        "bucket_name": bucket_name,
                        "object_names": object_names,
                        "dimensions": dimensions,
                        "validator_atom_id": atom_instance_id,
                        "file_key": primary_file,
                        "mongo_db": database_name,
                        "collection_name": collection_name,
                    },
                    metadata={
                        "atom": "feature_overview",
                        "operation": "unique_count",
                        "bucket_name": bucket_name,
                        "object_names": list(object_names),
                        "validator_atom_id": atom_instance_id,
                        "file_key": primary_file,
                    },
                )
                
                result = format_task_response(submission)
                
                if isinstance(result, dict):
                    task_response = result
                    task_status = result.get("task_status", result.get("status", "unknown"))
                    
                    if task_status == "failure":
                        return {
                            "status": "failed",
                            "result_file": None,
                            "message": result.get("detail", "FeatureOverview uniquecount failed"),
                            "task_response": task_response,
                            "additional_results": None
                        }
                    
                    additional_results["uniquecount_result"] = result
                    # Include dimensions info for frontend (to restore originalDimensionMap)
                    additional_results["dimensions"] = dimensions
                    # Include identifiers and measures (like groupby init_result) - fetched after auto-classification
                    additional_results["identifiers"] = identifiers
                    additional_results["measures"] = measures
                    additional_results["numeric_measures"] = numeric_measures
                else:
                    return {
                        "status": "failed",
                        "result_file": None,
                        "message": "FeatureOverview uniquecount returned unexpected result",
                        "task_response": None,
                        "additional_results": None
                    }
                    
            except Exception as e:
                logger.error(f"❌ Error executing feature_overview uniquecount: {e}", exc_info=True)
                return {
                    "status": "failed",
                    "result_file": None,
                    "message": f"Error executing feature_overview uniquecount: {str(e)}",
                    "task_response": None,
                    "additional_results": None
                }
        
        # Execute summary endpoint if it was called
        if has_summary and summary_endpoint:
            logger.info(
                f"🔄 FeatureOverview executor: Executing /summary for atom {atom_instance_id} "
                f"with file: {primary_file}"
            )
            
            try:
                # Extract configuration from API call params
                summary_config = summary_endpoint.get("params", {})
                bucket_name = configuration.get("bucket_name", summary_config.get("bucket_name", "trinity"))
                
                # 🔧 CRITICAL: ALWAYS use primary_file from input_files to preserve original case
                # Never use stored object_names from params as they may be lowercase
                # input_files comes from pipeline execution with correct case
                if not primary_file:
                    return {
                        "status": "failed",
                        "result_file": None,
                        "message": "No input file provided for feature_overview summary",
                        "task_response": task_response,
                        "additional_results": additional_results
                    }
                
                # Always use primary_file - never fall back to stored params
                object_names = [primary_file]
                
                # Ensure object_names is a list (keep original case - file paths are case-sensitive)
                if isinstance(object_names, str):
                    object_names = [object_names]
                else:
                    object_names = [str(name) for name in object_names]
                
                create_hierarchy = summary_config.get("create_hierarchy", False)
                create_summary = summary_config.get("create_summary", False)
                combination = summary_config.get("combination")
                
                # Resolve dependencies manually
                results_collection = await get_summary_results_collection()
                validator_collection = await get_validator_atoms_collection()
                
                # Fetch dimensions
                dimensions = await fetch_dimensions_dict(
                    atom_instance_id, primary_file, validator_collection
                )
                
                # Parse combination if provided
                combination_dict: Dict[str, Any] | None = None
                if combination:
                    try:
                        parsed = json.loads(combination) if isinstance(combination, str) else combination
                        if isinstance(parsed, dict):
                            combination_dict = parsed
                    except json.JSONDecodeError:
                        logger.warning(f"Invalid combination format: {combination}")
                
                collection_name = results_collection.name
                database_name = results_collection.database.name
                
                # Submit celery task directly (same as the endpoint does)
                submission = celery_task_client.submit_callable(
                    name="feature_overview.summary",
                    dotted_path="app.features.feature_overview.service.run_feature_overview_summary_task",
                    kwargs={
                        "bucket_name": bucket_name,
                        "object_names": object_names,
                        "dimensions": dimensions,
                        "validator_atom_id": atom_instance_id,
                        "file_key": primary_file,
                        "create_hierarchy": _as_bool(create_hierarchy),
                        "create_summary": _as_bool(create_summary),
                        "selected_combination": combination_dict,
                        "mongo_db": database_name,
                        "collection_name": collection_name,
                    },
                    metadata={
                        "atom": "feature_overview",
                        "operation": "summary",
                        "bucket_name": bucket_name,
                        "object_names": list(object_names),
                        "validator_atom_id": atom_instance_id,
                        "file_key": primary_file,
                        "create_hierarchy": _as_bool(create_hierarchy),
                        "create_summary": _as_bool(create_summary),
                    },
                )
                
                result = format_task_response(submission)
                
                if isinstance(result, dict):
                    # Use summary result as primary task_response if uniquecount wasn't called
                    if not task_response:
                        task_response = result
                    
                    task_status = result.get("task_status", result.get("status", "unknown"))
                    
                    if task_status == "failure":
                        return {
                            "status": "failed",
                            "result_file": None,
                            "message": result.get("detail", "FeatureOverview summary failed"),
                            "task_response": task_response,
                            "additional_results": additional_results
                        }
                    
                    additional_results["summary_result"] = result
                else:
                    return {
                        "status": "failed",
                        "result_file": None,
                        "message": "FeatureOverview summary returned unexpected result",
                        "task_response": task_response,
                        "additional_results": additional_results
                    }
                    
            except Exception as e:
                logger.error(f"❌ Error executing feature_overview summary: {e}", exc_info=True)
                return {
                    "status": "failed",
                    "result_file": None,
                    "message": f"Error executing feature_overview summary: {str(e)}",
                    "task_response": task_response,
                    "additional_results": additional_results
                }
        
        # If no endpoints were found, return error
        if not has_uniquecount and not has_summary:
            logger.warning(f"⚠️ No recognized feature_overview endpoints found in API calls")
            return {
                "status": "failed",
                "result_file": None,
                "message": "No recognized feature_overview endpoints found in API calls",
                "task_response": None,
                "additional_results": None
            }
        
        return {
            "status": "success",
            "result_file": None,  # FeatureOverview doesn't produce file outputs, results are in MongoDB
            "message": "FeatureOverview executed successfully",
            "task_response": task_response,
            "additional_results": additional_results if additional_results else None
        }


class ChartMakerExecutor(BaseAtomExecutor):
    """Executor for chart-maker atom.
    
    Handles endpoints:
    - /chart-maker/load-saved-dataframe (file selection)
    - /chart-maker/charts (chart generation)
    """
    
    def get_atom_type(self) -> str:
        return "chart-maker"
    
    async def execute(
        self,
        atom_instance_id: str,
        card_id: str,
        configuration: Dict[str, Any],
        input_files: List[str],
        api_calls: List[Dict[str, Any]],
        **kwargs
    ) -> Dict[str, Any]:
        """Execute chart-maker atom based on API calls from MongoDB."""
        from app.features.chart_maker.endpoint import load_saved_dataframe, generate_chart
        from app.features.chart_maker.schemas import LoadSavedDataframeRequest, ChartRequest, ChartTrace
        import json
        
        # Get primary input file
        primary_file = input_files[0] if input_files else configuration.get("file_id", configuration.get("object_name", ""))
        
        # Check which endpoints were called
        has_load_dataframe = False
        has_generate_chart = False
        load_dataframe_endpoint = None
        generate_chart_endpoints = []  # Collect ALL chart API calls, not just the last one
        
        for api_call in api_calls:
            endpoint = api_call.get("endpoint", "")
            # Check for load-saved-dataframe endpoint
            if endpoint in ["/chart-maker/load-saved-dataframe", "/api/chart-maker/load-saved-dataframe"] or "load-saved-dataframe" in endpoint.lower():
                has_load_dataframe = True
                load_dataframe_endpoint = api_call
            # Check for charts endpoint - collect ALL of them
            if endpoint in ["/chart-maker/charts", "/api/chart-maker/charts"] or ("charts" in endpoint.lower() and "chart-maker" in endpoint.lower()):
                has_generate_chart = True
                generate_chart_endpoints.append(api_call)  # Collect all chart API calls
        
        task_response = None
        additional_results = {}
        result_file = None
        file_id = primary_file
        
        # 🔧 CRITICAL: Always load column summary (similar to pivot-table and feature-overview)
        # This ensures column options for each dropdown are always up-to-date, even if filename is the same
        # This is important because the file content might have changed
        if primary_file:
            logger.info(
                f"📋 ChartMaker executor: Loading column summary for file '{primary_file}' "
                f"(always loads to ensure column options are up-to-date)"
            )
            try:
                from app.features.feature_overview.routes import column_summary
                column_summary_result = await column_summary(primary_file)
                
                # Extract columns from column summary
                summary = column_summary_result.get("summary", [])
                columns = [item.get("column") for item in summary if item.get("column")]
                
                additional_results["column_summary"] = column_summary_result
                additional_results["columns"] = columns
                
                logger.info(f"✅ ChartMaker executor: Loaded {len(columns)} columns for dropdown options")
            except Exception as e:
                logger.warning(f"⚠️ ChartMaker executor: Failed to load column summary: {e}")
                # Don't fail the entire execution if column summary fails
        
        # Execute load-saved-dataframe endpoint if it was called
        if has_load_dataframe and load_dataframe_endpoint:
            logger.info(
                f"🔄 ChartMaker executor: Executing /load-saved-dataframe for atom {atom_instance_id} "
                f"with file: {primary_file}"
            )
            
            try:
                # Extract configuration from API call params
                load_config = load_dataframe_endpoint.get("params", {})
                # 🔧 CRITICAL: Use replacement file (primary_file) instead of stored object_name
                # The stored object_name is from the original execution, but we need the replacement file
                object_name = primary_file  # Always use the replacement file
                logger.info(f"📋 ChartMaker executor: Using replacement file '{object_name}' instead of stored '{load_config.get('object_name')}'")
                
                # Build request
                request = LoadSavedDataframeRequest(
                    object_name=object_name,
                    validator_atom_id=atom_instance_id,
                    card_id=card_id,
                    canvas_position=kwargs.get("canvas_position", 0),
                )
                
                # Call load_saved_dataframe endpoint
                result = await load_saved_dataframe(request)
                
                # Extract file_id from result
                if hasattr(result, "file_id"):
                    file_id = result.file_id
                elif isinstance(result, dict):
                    file_id = result.get("file_id", primary_file)
                
                additional_results["load_dataframe_result"] = result
                logger.info(f"✅ ChartMaker loaded dataframe: {file_id}")
                
            except Exception as e:
                logger.error(f"❌ Error executing chart-maker load-saved-dataframe: {e}", exc_info=True)
                # Don't fail the entire execution if load fails, but log it
        
        # If only load-saved-dataframe was called (no charts), return success
        if has_load_dataframe and not has_generate_chart:
            logger.info(f"✅ ChartMaker executor: Only load-saved-dataframe was called (no charts to generate)")
            return {
                "status": "success",
                "result_file": file_id or primary_file,
                "message": "Dataframe loaded successfully",
                "task_response": additional_results.get("load_dataframe_result"),
                "additional_results": additional_results
            }
        
        # Execute charts endpoint if it was called - execute ALL chart API calls
        chart_results = []
        if has_generate_chart and generate_chart_endpoints:
            logger.info(
                f"🔄 ChartMaker executor: Executing {len(generate_chart_endpoints)} /charts call(s) for atom {atom_instance_id} "
                f"with file: {file_id}"
            )
            
            # Load dataframe once for all charts (for column mapping)
            from app.features.chart_maker.service import chart_service
            column_lookup = {}
            actual_columns = []
            chart_file_id = file_id or primary_file
            
            try:
                df = chart_service.get_file(chart_file_id)
                actual_columns = list(df.columns)
                # Create case-insensitive lookup: lowercase -> original case
                column_lookup = {col.lower(): col for col in actual_columns}
                logger.info(f"📋 ChartMaker executor: Loaded dataframe with {len(actual_columns)} columns for case mapping")
            except Exception as e:
                logger.warning(f"⚠️ Could not load dataframe for column mapping: {e}, will use config columns as-is")
            
            # Execute each chart API call
            for chart_idx, generate_chart_endpoint in enumerate(generate_chart_endpoints, 1):
                try:
                    logger.info(
                        f"🔄 ChartMaker executor: Executing chart {chart_idx}/{len(generate_chart_endpoints)} for atom {atom_instance_id}"
                    )
                    
                    # Extract configuration from API call params
                    chart_config = generate_chart_endpoint.get("params", {})
                
                    # Use file_id from load step if available, otherwise from config
                    current_chart_file_id = file_id or chart_config.get("file_id", primary_file)
                    
                    # Build traces - map lowercase config columns to actual dataframe columns
                    traces = []
                    for trace_config in chart_config.get("traces", []):
                        # Get lowercase column names from config (as stored)
                        x_column_config = trace_config.get("x_column", "")
                        y_column_config = trace_config.get("y_column", "")
                        
                        # Map to actual column names (case-insensitive)
                        x_column_lower = x_column_config.lower() if x_column_config else ""
                        y_column_lower = y_column_config.lower() if y_column_config else ""
                        
                        # Use lookup to find actual column name, fallback to original if not found
                        x_column = column_lookup.get(x_column_lower, x_column_config)
                        y_column = column_lookup.get(y_column_lower, y_column_config)
                        
                        # Final fallback: if mapped column not in actual columns, use original
                        if actual_columns and x_column not in actual_columns:
                            x_column = x_column_config
                        if actual_columns and y_column not in actual_columns:
                            y_column = y_column_config
                        
                        logger.info(f"🔍 ChartMaker executor: Mapped columns '{x_column_config}' -> '{x_column}', '{y_column_config}' -> '{y_column}'")
                        
                        trace = ChartTrace(
                            x_column=x_column,
                            y_column=y_column,
                            name=trace_config.get("name"),
                            chart_type=trace_config.get("chart_type", "line"),
                            aggregation=trace_config.get("aggregation", "sum"),
                        )
                        traces.append(trace)
                    
                    # Build filters - map lowercase config keys to actual column names
                    filters = None
                    if chart_config.get("filters"):
                        mapped_filters = {}
                        for k, v in chart_config.get("filters", {}).items():
                            # Map lowercase key to actual column name
                            key_lower = k.lower() if k else ""
                            actual_key = column_lookup.get(key_lower, k)
                            # Fallback to original if mapped key not in actual columns
                            if actual_columns and actual_key not in actual_columns:
                                actual_key = k
                            mapped_filters[actual_key] = v
                        filters = mapped_filters if mapped_filters else None
                
                    # Build request
                    request = ChartRequest(
                        file_id=current_chart_file_id,
                        chart_type=chart_config.get("chart_type", "line"),
                        traces=traces,
                        title=chart_config.get("title"),
                        filters=filters,
                        validator_atom_id=atom_instance_id,
                        card_id=card_id,
                        canvas_position=kwargs.get("canvas_position", 0),
                    )
                    
                    # Call generate_chart endpoint
                    result = await generate_chart(request)
                    
                    # Convert Pydantic model to dict if needed
                    if hasattr(result, 'model_dump'):
                        result_dict = result.model_dump()
                    elif hasattr(result, 'dict'):
                        result_dict = result.dict()
                    elif isinstance(result, dict):
                        result_dict = result
                    else:
                        logger.error(f"❌ Chart {chart_idx} returned unexpected result type")
                        continue
                    
                    # Store result for this chart
                    chart_results.append(result_dict)
                    logger.info(f"✅ ChartMaker executor: Chart {chart_idx}/{len(generate_chart_endpoints)} generated successfully")
                    
                except Exception as e:
                    logger.error(f"❌ Error executing chart-maker chart {chart_idx}: {e}", exc_info=True)
                    # Continue with next chart instead of failing entire execution
                    continue
            
            # Use the last chart result as the primary result (for backward compatibility)
            if chart_results:
                result_dict = chart_results[-1]
                task_response = result_dict
                additional_results["chart_result"] = result_dict
                additional_results["chart_config"] = result_dict.get("chart_config")
                additional_results["data_summary"] = result_dict.get("data_summary")
                additional_results["all_chart_results"] = chart_results  # Store all results
                logger.info(f"✅ ChartMaker executor: Generated {len(chart_results)} chart(s) successfully")
                
                # Return success with all chart results
                return {
                    "status": "success",
                    "result_file": chart_file_id,  # Chart maker doesn't produce output files, but we return the input file
                    "message": f"Generated {len(chart_results)} chart(s) successfully",
                    "task_response": task_response,
                    "additional_results": additional_results
                }
            else:
                return {
                    "status": "failed",
                    "result_file": None,
                    "message": "No charts were generated successfully",
                    "task_response": None,
                    "additional_results": None
                }
        
        # If no matching endpoint found, return failure
        return {
            "status": "failed",
            "result_file": None,
            "message": "No matching chart-maker endpoint found in API calls",
            "task_response": None,
            "additional_results": None
        }


# Registry of atom executors
_ATOM_EXECUTOR_REGISTRY: Dict[str, BaseAtomExecutor] = {}


def register_atom_executor(executor: BaseAtomExecutor) -> None:
    """Register an atom executor.
    
    Args:
        executor: Instance of BaseAtomExecutor
    """
    atom_type = executor.get_atom_type()
    _ATOM_EXECUTOR_REGISTRY[atom_type] = executor
    logger.info(f"✅ Registered atom executor for type: {atom_type}")


def get_atom_executor(atom_type: str) -> Optional[BaseAtomExecutor]:
    """Get executor for an atom type.
    
    Args:
        atom_type: Atom type identifier
    
    Returns:
        Executor instance or None if not found
    """
    return _ATOM_EXECUTOR_REGISTRY.get(atom_type)


def get_all_registered_types() -> List[str]:
    """Get list of all registered atom types.
    
    Returns:
        List of atom type identifiers
    """
    return list(_ATOM_EXECUTOR_REGISTRY.keys())


class CorrelationExecutor(BaseAtomExecutor):
    """Executor for correlation atom.
    
    Handles endpoints:
    - /correlation/filter-and-correlate
    """
    
    def get_atom_type(self) -> str:
        return "correlation"
    
    async def execute(
        self,
        atom_instance_id: str,
        card_id: str,
        configuration: Dict[str, Any],
        input_files: List[str],
        api_calls: List[Dict[str, Any]],
        **kwargs
    ) -> Dict[str, Any]:
        """Execute correlation atom based on API calls from MongoDB."""
        from app.features.correlation.schema import FilterAndCorrelateRequest, IdentifierFilter, MeasureFilter
        from app.features.correlation.routes import filter_and_correlate
        import json
        
        # Get primary input file
        primary_file = input_files[0] if input_files else configuration.get("file_path", configuration.get("file_key", ""))
        
        # Check which endpoints were called
        has_filter_and_correlate = False
        filter_and_correlate_endpoint = None
        
        for api_call in api_calls:
            endpoint = api_call.get("endpoint", "")
            # Check for filter-and-correlate endpoint
            if endpoint in ["/correlation/filter-and-correlate", "/api/correlation/filter-and-correlate"] or ("filter-and-correlate" in endpoint.lower() and "correlation" in endpoint.lower()):
                has_filter_and_correlate = True
                filter_and_correlate_endpoint = api_call
                break
        
        task_response = None
        additional_results = {}
        
        # 🔧 CRITICAL: Always load column summary (similar to pivot-table and feature-overview)
        # This ensures filters and numerical columns are always up-to-date, even if filename is the same
        # This is important because the file content might have changed
        if primary_file:
            logger.info(
                f"📋 Correlation executor: Loading column summary for file '{primary_file}' "
                f"(always loads to ensure filters/numerical columns are up-to-date)"
            )
            try:
                from app.features.feature_overview.routes import column_summary
                column_summary_result = await column_summary(primary_file)
                
                # Extract columns and filter options from column summary
                summary = column_summary_result.get("summary", [])
                columns = [item.get("column") for item in summary if item.get("column")]
                filter_options: Dict[str, List[str]] = {}
                numerical_columns: List[str] = []
                
                for item in summary:
                    column = item.get("column")
                    if column:
                        # Extract filter options (unique values)
                        unique_values = item.get("unique_values", [])
                        if unique_values:
                            filter_options[column] = unique_values
                            filter_options[column.lower()] = unique_values
                        
                        # Identify numerical columns
                        data_type = str(item.get("data_type", "")).lower()
                        if any(num_type in data_type for num_type in ["int", "float", "number"]):
                            numerical_columns.append(column)
                
                additional_results["column_summary"] = column_summary_result
                additional_results["columns"] = columns
                additional_results["filter_options"] = filter_options
                additional_results["numerical_columns"] = numerical_columns
                
                logger.info(f"✅ Correlation executor: Loaded {len(columns)} columns, {len(numerical_columns)} numerical columns, and filter options")
            except Exception as e:
                logger.warning(f"⚠️ Correlation executor: Failed to load column summary: {e}")
                # Don't fail the entire execution if column summary fails
        
        # Execute filter-and-correlate endpoint if it was called
        if has_filter_and_correlate and filter_and_correlate_endpoint:
            logger.info(
                f"🔄 Correlation executor: Executing /filter-and-correlate for atom {atom_instance_id} "
                f"with file: {primary_file}"
            )
            
            try:
                # Extract configuration from API call params
                correlate_config = filter_and_correlate_endpoint.get("params", {})
                
                # Build FilterAndCorrelateRequest from stored configuration
                # Convert identifier_filters and measure_filters back to proper objects
                identifier_filters = None
                if correlate_config.get("identifier_filters"):
                    identifier_filters = [
                        IdentifierFilter(**f) if isinstance(f, dict) else f
                        for f in correlate_config.get("identifier_filters", [])
                    ]
                
                measure_filters = None
                if correlate_config.get("measure_filters"):
                    measure_filters = [
                        MeasureFilter(**f) if isinstance(f, dict) else f
                        for f in correlate_config.get("measure_filters", [])
                    ]
                
                # Build request object
                request = FilterAndCorrelateRequest(
                    file_path=primary_file,
                    identifier_columns=correlate_config.get("identifier_columns"),
                    measure_columns=correlate_config.get("measure_columns"),
                    identifier_filters=identifier_filters,
                    measure_filters=measure_filters,
                    method=correlate_config.get("method", "pearson"),
                    columns=correlate_config.get("columns"),
                    save_filtered=correlate_config.get("save_filtered", True),
                    include_preview=correlate_config.get("include_preview", True),
                    preview_limit=correlate_config.get("preview_limit", 10),
                    include_date_analysis=correlate_config.get("include_date_analysis", False),
                    date_column=correlate_config.get("date_column"),
                    date_range_filter=correlate_config.get("date_range_filter"),
                    aggregation_level=correlate_config.get("aggregation_level"),
                    validator_atom_id=atom_instance_id,
                    card_id=card_id,
                    canvas_position=kwargs.get("canvas_position", 0),
                )
                
                # Call filter_and_correlate endpoint
                result = await filter_and_correlate(request)
                
                # Convert Pydantic model to dict if needed
                if hasattr(result, 'model_dump'):
                    result_dict = result.model_dump()
                elif hasattr(result, 'dict'):
                    result_dict = result.dict()
                elif isinstance(result, dict):
                    result_dict = result
                else:
                    return {
                        "status": "failed",
                        "result_file": None,
                        "message": "Correlation execution returned unexpected result type",
                        "task_response": None,
                        "additional_results": None
                    }
                
                task_response = result_dict
                correlation_id = result_dict.get("correlation_id")
                filtered_file_path = result_dict.get("filtered_file_path")
                
                additional_results["correlation_results"] = result_dict.get("correlation_results")
                additional_results["correlation_id"] = correlation_id
                additional_results["filtered_file_path"] = filtered_file_path
                additional_results["columns_used"] = result_dict.get("columns_used")
                additional_results["filters_applied"] = result_dict.get("filters_applied")
                additional_results["date_analysis"] = result_dict.get("date_analysis")
                
                return {
                    "status": "success",
                    "result_file": filtered_file_path,
                    "message": "Correlation executed successfully",
                    "task_response": task_response,
                    "additional_results": additional_results
                }
                    
            except Exception as e:
                logger.error(f"❌ Error executing correlation filter-and-correlate: {e}", exc_info=True)
                return {
                    "status": "failed",
                    "result_file": None,
                    "message": f"Error executing correlation: {str(e)}",
                    "task_response": None,
                    "additional_results": None
                }
        
        # If no matching endpoint found, return failure
        return {
            "status": "failed",
            "result_file": None,
            "message": "No matching correlation endpoint found in API calls",
            "task_response": None,
            "additional_results": None
        }


class MergeExecutor(BaseAtomExecutor):
    """Executor for merge atom.
    
    Handles endpoints:
    - /merge/init - Gets common columns
    - /merge/perform - Performs the merge operation
    - /merge/save - Saves the merged result
    """
    
    def get_atom_type(self) -> str:
        return "merge"
    
    async def execute(
        self,
        atom_instance_id: str,
        card_id: str,
        configuration: Dict[str, Any],
        input_files: List[str],
        api_calls: List[Dict[str, Any]],
        **kwargs
    ) -> Dict[str, Any]:
        """Execute merge atom based on API calls from MongoDB."""
        from app.features.merge.routes import init_merge, perform_merge, save_merged_dataframe
        import json
        
        # Get input files (merge needs 2 files)
        file1 = input_files[0] if len(input_files) > 0 else configuration.get("file1", "")
        file2 = input_files[1] if len(input_files) > 1 else configuration.get("file2", "")
        
        # Check which endpoints were called
        has_init = False
        has_perform = False
        has_save = False
        init_endpoint = None
        perform_endpoint = None
        save_endpoint = None
        
        for api_call in api_calls:
            endpoint = api_call.get("endpoint", "")
            if endpoint in ["/merge/init", "/api/merge/init"] or "merge/init" in endpoint.lower():
                has_init = True
                init_endpoint = api_call
            elif endpoint in ["/merge/perform", "/api/merge/perform"] or "merge/perform" in endpoint.lower():
                has_perform = True
                perform_endpoint = api_call
            elif endpoint in ["/merge/save", "/api/merge/save"] or "merge/save" in endpoint.lower():
                has_save = True
                save_endpoint = api_call
        
        task_response = None
        additional_results = {}
        result_file = None
        
        # Execute init endpoint if it was called (for replacement files)
        if has_init and init_endpoint:
            logger.info(
                f"🔄 Merge executor: Executing /init for atom {atom_instance_id} "
                f"with files: {file1}, {file2}"
            )
            
            try:
                # Extract configuration from API call params
                init_config = init_endpoint.get("params", {})
                
                # Override file paths with current input files (which might be replacements)
                file1_path = file1 if file1 else init_config.get("file1", "")
                file2_path = file2 if file2 else init_config.get("file2", "")
                
                # Call init_merge function directly
                init_result = await init_merge(
                    file1=file1_path,
                    file2=file2_path,
                    bucket_name=init_config.get("bucket_name", "trinity"),
                    validator_atom_id=atom_instance_id,
                    card_id=card_id,
                    canvas_position=kwargs.get("canvas_position", 0),
                )
                
                if isinstance(init_result, dict):
                    additional_results["init_result"] = init_result
                    additional_results["common_columns"] = init_result.get("common_columns", [])
                    additional_results["available_columns"] = init_result.get("common_columns", [])
                else:
                    logger.warning("⚠️ Merge init returned unexpected result")
                    
            except Exception as e:
                logger.error(f"❌ Error executing merge init: {e}", exc_info=True)
                # Don't fail the whole execution if init fails, but log it
                logger.warning("⚠️ Merge init failed, continuing with perform")
        
        # Execute perform endpoint if it was called
        if has_perform and perform_endpoint:
            logger.info(
                f"🔄 Merge executor: Executing /perform for atom {atom_instance_id} "
                f"with files: {file1}, {file2}"
            )
            
            try:
                # Extract configuration from API call params
                perform_config = perform_endpoint.get("params", {})
                
                # Override file paths with current input files (which might be replacements)
                file1_path = file1 if file1 else perform_config.get("file1", "")
                file2_path = file2 if file2 else perform_config.get("file2", "")
                
                # Parse join_columns if it's a string
                join_columns = perform_config.get("join_columns", [])
                if isinstance(join_columns, str):
                    try:
                        join_columns = json.loads(join_columns)
                    except json.JSONDecodeError:
                        join_columns = []
                
                # Call perform_merge function directly
                result = await perform_merge(
                    file1=file1_path,
                    file2=file2_path,
                    bucket_name=perform_config.get("bucket_name", "trinity"),
                    join_columns=json.dumps(join_columns),
                    join_type=perform_config.get("join_type", "inner"),
                    validator_atom_id=atom_instance_id,
                    card_id=card_id,
                    canvas_position=kwargs.get("canvas_position", 0),
                )
                
                if isinstance(result, dict):
                    task_response = result
                    additional_results["merge_results"] = result
                    additional_results["row_count"] = result.get("row_count")
                    additional_results["columns"] = result.get("columns")
                    additional_results["csv_data"] = result.get("data")  # Store CSV data for save
                else:
                    return {
                        "status": "failed",
                        "result_file": None,
                        "message": "Merge perform returned unexpected result",
                        "task_response": None,
                        "additional_results": None
                    }
                
            except Exception as e:
                logger.error(f"❌ Error executing merge perform: {e}", exc_info=True)
                return {
                    "status": "failed",
                    "result_file": None,
                    "message": f"Error executing merge: {str(e)}",
                    "task_response": None,
                    "additional_results": None
                }
        
        # Execute save endpoint if it was called
        if has_save and save_endpoint:
            logger.info(
                f"🔄 Merge executor: Executing /save for atom {atom_instance_id}"
            )
            
            try:
                # Get CSV data from perform result or from save endpoint params
                csv_data = additional_results.get("csv_data") or save_endpoint.get("params", {}).get("csv_data", "")
                filename = save_endpoint.get("params", {}).get("filename", "")
                
                if not csv_data:
                    # If no CSV data, we can't save
                    logger.warning("⚠️ No CSV data available for merge save")
                    return {
                        "status": "success",
                        "result_file": None,
                        "message": "Merge performed but not saved (no CSV data)",
                        "task_response": task_response,
                        "additional_results": additional_results
                    }
                
                # Call save_merged_dataframe function directly
                save_result = await save_merged_dataframe(
                    csv_data=csv_data,
                    filename=filename,
                    validator_atom_id=atom_instance_id,
                    card_id=card_id,
                    canvas_position=kwargs.get("canvas_position", 0),
                )
                
                if isinstance(save_result, dict):
                    result_file = save_result.get("result_file")
                    additional_results["saved_file"] = result_file
                    additional_results["save_result"] = save_result
                else:
                    logger.warning("⚠️ Merge save returned unexpected result")
                    
            except Exception as e:
                logger.error(f"❌ Error executing merge save: {e}", exc_info=True)
                # Don't fail the whole execution if save fails
                logger.warning("⚠️ Merge save failed, but perform was successful")
        
        if has_perform:
            return {
                "status": "success",
                "result_file": result_file,
                "message": "Merge executed successfully",
                "task_response": task_response,
                "additional_results": additional_results
            }
        else:
            return {
                "status": "failed",
                "result_file": None,
                "message": "No matching merge endpoint found in API calls",
                "task_response": None,
                "additional_results": None
            }


# Register default executors
_groupby_executor = GroupByExecutor()
register_atom_executor(_groupby_executor)

_feature_overview_executor = FeatureOverviewExecutor()
register_atom_executor(_feature_overview_executor)

_correlation_executor = CorrelationExecutor()
register_atom_executor(_correlation_executor)

_chart_maker_executor = ChartMakerExecutor()
register_atom_executor(_chart_maker_executor)

_merge_executor = MergeExecutor()
register_atom_executor(_merge_executor)


class ConcatExecutor(BaseAtomExecutor):
    """Executor for concat atom.
    
    Handles endpoints:
    - /concat/init - Gets file info
    - /concat/perform - Performs the concatenation
    - /concat/save - Saves the concatenated result
    """
    
    def get_atom_type(self) -> str:
        return "concat"
    
    async def execute(
        self,
        atom_instance_id: str,
        card_id: str,
        configuration: Dict[str, Any],
        input_files: List[str],
        api_calls: List[Dict[str, Any]],
        **kwargs
    ) -> Dict[str, Any]:
        """Execute concat atom based on API calls from MongoDB."""
        from app.features.concat.routes import init_concat, perform_concat, save_concat_dataframe
        import json
        
        # Get input files (concat needs 2 files)
        file1 = input_files[0] if len(input_files) > 0 else configuration.get("file1", "")
        file2 = input_files[1] if len(input_files) > 1 else configuration.get("file2", "")
        
        # Check which endpoints were called
        has_init = False
        has_perform = False
        has_save = False
        init_endpoint = None
        perform_endpoint = None
        save_endpoint = None
        
        for api_call in api_calls:
            endpoint = api_call.get("endpoint", "")
            if endpoint in ["/concat/init", "/api/concat/init"] or "concat/init" in endpoint.lower():
                has_init = True
                init_endpoint = api_call
            elif endpoint in ["/concat/perform", "/api/concat/perform"] or "concat/perform" in endpoint.lower():
                has_perform = True
                perform_endpoint = api_call
            elif endpoint in ["/concat/save", "/api/concat/save"] or "concat/save" in endpoint.lower():
                has_save = True
                save_endpoint = api_call
        
        task_response = None
        additional_results = {}
        result_file = None
        
        # Execute init endpoint if it was called (for replacement files)
        if has_init and init_endpoint:
            logger.info(
                f"🔄 Concat executor: Executing /init for atom {atom_instance_id} "
                f"with files: {file1}, {file2}"
            )
            
            try:
                # Extract configuration from API call params
                init_config = init_endpoint.get("params", {})
                
                # Override file paths with current input files (which might be replacements)
                file1_path = file1 if file1 else init_config.get("file1", "")
                file2_path = file2 if file2 else init_config.get("file2", "")
                
                # Call init_concat function directly
                init_result = await init_concat(
                    file1=file1_path,
                    file2=file2_path,
                    validator_atom_id=atom_instance_id,
                    card_id=card_id,
                    canvas_position=kwargs.get("canvas_position", 0),
                )
                
                if isinstance(init_result, dict):
                    additional_results["init_result"] = init_result
                else:
                    logger.warning("⚠️ Concat init returned unexpected result")
                    
            except Exception as e:
                logger.error(f"❌ Error executing concat init: {e}", exc_info=True)
                # Don't fail the whole execution if init fails, but log it
                logger.warning("⚠️ Concat init failed, continuing with perform")
        
        # Execute perform endpoint if it was called
        if has_perform and perform_endpoint:
            logger.info(
                f"🔄 Concat executor: Executing /perform for atom {atom_instance_id} "
                f"with files: {file1}, {file2}"
            )
            
            try:
                # Extract configuration from API call params
                perform_config = perform_endpoint.get("params", {})
                
                # Override file paths with current input files (which might be replacements)
                file1_path = file1 if file1 else perform_config.get("file1", "")
                file2_path = file2 if file2 else perform_config.get("file2", "")
                concat_direction = perform_config.get("concat_direction", "vertical")
                
                # Call perform_concat function directly
                result = await perform_concat(
                    file1=file1_path,
                    file2=file2_path,
                    concat_direction=concat_direction,
                    validator_atom_id=atom_instance_id,
                    card_id=card_id,
                    canvas_position=kwargs.get("canvas_position", 0),
                )
                
                if isinstance(result, dict):
                    task_response = result
                    additional_results["concat_results"] = result
                    additional_results["concat_id"] = result.get("concat_id")
                    additional_results["row_count"] = result.get("result_shape", [0, 0])[0] if isinstance(result.get("result_shape"), list) else 0
                    additional_results["columns"] = result.get("columns")
                    additional_results["csv_data"] = result.get("data")  # Store CSV data for save
                else:
                    return {
                        "status": "failed",
                        "result_file": None,
                        "message": "Concat perform returned unexpected result",
                        "task_response": None,
                        "additional_results": None
                    }
                
            except Exception as e:
                logger.error(f"❌ Error executing concat perform: {e}", exc_info=True)
                return {
                    "status": "failed",
                    "result_file": None,
                    "message": f"Error executing concat: {str(e)}",
                    "task_response": None,
                    "additional_results": None
                }
        
        # Execute save endpoint if it was called
        if has_save and save_endpoint:
            logger.info(
                f"🔄 Concat executor: Executing /save for atom {atom_instance_id}"
            )
            
            try:
                # Get CSV data from perform result or from save endpoint params
                csv_data = additional_results.get("csv_data") or save_endpoint.get("params", {}).get("csv_data", "")
                filename = save_endpoint.get("params", {}).get("filename", "")
                
                if not csv_data:
                    # If no CSV data, we can't save
                    logger.warning("⚠️ No CSV data available for concat save")
                    return {
                        "status": "success",
                        "result_file": None,
                        "message": "Concat performed but not saved (no CSV data)",
                        "task_response": task_response,
                        "additional_results": additional_results
                    }
                
                # Call save_concat_dataframe function directly
                save_result = await save_concat_dataframe(
                    csv_data=csv_data,
                    filename=filename,
                    validator_atom_id=atom_instance_id,
                    card_id=card_id,
                    canvas_position=kwargs.get("canvas_position", 0),
                )
                
                if isinstance(save_result, dict):
                    result_file = save_result.get("result_file")
                    additional_results["saved_file"] = result_file
                    additional_results["save_result"] = save_result
                else:
                    logger.warning("⚠️ Concat save returned unexpected result")
                    
            except Exception as e:
                logger.error(f"❌ Error executing concat save: {e}", exc_info=True)
                # Don't fail the whole execution if save fails
                logger.warning("⚠️ Concat save failed, but perform was successful")
        
        if has_perform:
            return {
                "status": "success",
                "result_file": result_file,
                "message": "Concat executed successfully",
                "task_response": task_response,
                "additional_results": additional_results
            }
        else:
            return {
                "status": "failed",
                "result_file": None,
                "message": "No matching concat endpoint found in API calls",
                "task_response": None,
                "additional_results": None
            }


_concat_executor = ConcatExecutor()
register_atom_executor(_concat_executor)


class PivotTableExecutor(BaseAtomExecutor):
    """Executor for pivot-table atom.
    
    Handles endpoints:
    - /pivot/{config_id}/compute - Compute pivot table
    - /pivot/{config_id}/save - Save pivot table results
    """
    
    def get_atom_type(self) -> str:
        return "pivot-table"
    
    async def execute(
        self,
        atom_instance_id: str,
        card_id: str,
        configuration: Dict[str, Any],
        input_files: List[str],
        api_calls: List[Dict[str, Any]],
        **kwargs
    ) -> Dict[str, Any]:
        """Execute pivot-table atom based on API calls from MongoDB."""
        from app.features.pivot_table.routes import compute_pivot_endpoint, save_pivot_endpoint
        from app.features.pivot_table.schemas import PivotComputeRequest, PivotSaveRequest
        import json
        
        # Get primary input file
        primary_file = input_files[0] if input_files else configuration.get("data_source", "")
        
        # Get original data_source from stored API calls to detect if file was replaced
        original_data_source = None
        for api_call in api_calls:
            endpoint = api_call.get("endpoint", "")
            if "/pivot" in endpoint.lower() and "/compute" in endpoint.lower():
                params = api_call.get("params", {})
                original_data_source = params.get("data_source", "")
                break
        
        # Check which endpoints were called
        has_compute = False
        has_save = False
        compute_endpoint = None
        save_endpoint = None
        
        for api_call in api_calls:
            endpoint = api_call.get("endpoint", "")
            # Check for compute endpoint
            if "/pivot" in endpoint.lower() and "/compute" in endpoint.lower():
                has_compute = True
                compute_endpoint = api_call
            # Check for save endpoint
            elif "/pivot" in endpoint.lower() and "/save" in endpoint.lower():
                has_save = True
                save_endpoint = api_call
        
        task_response = None
        additional_results = {}
        result_file = None
        
        # 🔧 CRITICAL: Always load column summary (similar to feature-overview identifiers/measures)
        # This ensures columns and filter options are always up-to-date, even if filename is the same
        # This is important because the file content might have changed
        if primary_file:
            logger.info(
                f"📋 PivotTable executor: Loading column summary for file '{primary_file}' "
                f"(always loads to ensure columns/filter options are up-to-date)"
            )
            try:
                from app.features.feature_overview.routes import column_summary
                column_summary_result = await column_summary(primary_file)
                
                # Extract columns and filter options from column summary
                summary = column_summary_result.get("summary", [])
                columns = [item.get("column") for item in summary if item.get("column")]
                filter_options: Dict[str, List[str]] = {}
                
                for item in summary:
                    column = item.get("column")
                    if column:
                        unique_values = item.get("unique_values", [])
                        if unique_values:
                            filter_options[column] = unique_values
                            filter_options[column.lower()] = unique_values
                
                additional_results["column_summary"] = column_summary_result
                additional_results["columns"] = columns
                additional_results["filter_options"] = filter_options
                
                logger.info(f"✅ PivotTable executor: Loaded {len(columns)} columns and filter options for replacement file")
            except Exception as e:
                logger.warning(f"⚠️ PivotTable executor: Failed to load column summary for replacement file: {e}")
                # Don't fail the entire execution if column summary fails
        
        # Execute compute endpoint if it was called
        if has_compute and compute_endpoint:
            logger.info(
                f"🔄 PivotTable executor: Executing /compute for atom {atom_instance_id} "
                f"with file: {primary_file}"
            )
            
            try:
                # Extract configuration from API call params
                compute_config = compute_endpoint.get("params", {})
                
                # 🔧 CRITICAL: Always use replacement file (primary_file) instead of stored data_source
                # Priority: 1. primary_file (replacement from pipeline), 2. configuration.data_source (updated by pipeline), 3. compute_config.data_source (original)
                stored_data_source = compute_config.get("data_source", "")
                config_data_source = configuration.get("data_source", "")
                data_source = primary_file if primary_file else (config_data_source if config_data_source else stored_data_source)
                if primary_file and primary_file != stored_data_source:
                    logger.info(f"📋 PivotTable executor: Using replacement file '{data_source}' instead of stored '{stored_data_source}'")
                elif config_data_source and config_data_source != stored_data_source:
                    logger.info(f"📋 PivotTable executor: Using updated config data_source '{data_source}' instead of stored '{stored_data_source}'")
                else:
                    logger.info(f"📋 PivotTable executor: Using data_source '{data_source}'")
                
                # Build PivotComputeRequest from stored configuration
                from app.features.pivot_table.schemas import PivotValueConfig, PivotFilterConfig
                
                # Convert values to PivotValueConfig objects
                values = []
                for v in compute_config.get("values", []):
                    if isinstance(v, dict):
                        values.append(PivotValueConfig(**v))
                    else:
                        values.append(v)
                
                # Convert filters to PivotFilterConfig objects
                filters = []
                for f in compute_config.get("filters", []):
                    if isinstance(f, dict):
                        filters.append(PivotFilterConfig(**f))
                    else:
                        filters.append(f)
                
                request = PivotComputeRequest(
                    data_source=data_source,
                    rows=compute_config.get("rows", []),
                    columns=compute_config.get("columns", []),
                    values=values,
                    filters=filters,
                    sorting=compute_config.get("sorting", {}),
                    dropna=compute_config.get("dropna", True),
                    fill_value=compute_config.get("fill_value"),
                    limit=compute_config.get("limit"),
                    grand_totals=compute_config.get("grand_totals", "off"),
                )
                
                # Call compute_pivot_endpoint directly
                result = await compute_pivot_endpoint(
                    config_id=atom_instance_id,
                    payload=request,
                    client_name=kwargs.get("client_name"),
                    app_name=kwargs.get("app_name"),
                    project_name=kwargs.get("project_name"),
                    card_id=card_id,
                    canvas_position=kwargs.get("canvas_position", 0),
                )
                
                # Convert Pydantic model to dict if needed
                if hasattr(result, 'model_dump'):
                    result_dict = result.model_dump()
                elif hasattr(result, 'dict'):
                    result_dict = result.dict()
                elif isinstance(result, dict):
                    result_dict = result
                else:
                    return {
                        "status": "failed",
                        "result_file": None,
                        "message": "Pivot compute returned unexpected result type",
                        "task_response": None,
                        "additional_results": None
                    }
                
                # Store pivot results in task_response for frontend to access
                task_response = {
                    "status": result_dict.get("status", "success"),
                    "data": result_dict.get("data", []),
                    "hierarchy": result_dict.get("hierarchy", []),
                    "column_hierarchy": result_dict.get("column_hierarchy", []),
                    "rows": result_dict.get("rows", 0),
                    "updated_at": result_dict.get("updated_at"),
                    "config_id": result_dict.get("config_id", atom_instance_id),
                }
                
                # Also store in additional_results for pipeline endpoint
                additional_results["pivot_results"] = result_dict.get("data", [])
                additional_results["pivot_hierarchy"] = result_dict.get("hierarchy", [])
                additional_results["pivot_column_hierarchy"] = result_dict.get("column_hierarchy", [])
                additional_results["pivot_row_count"] = result_dict.get("rows", 0)
                additional_results["pivot_updated_at"] = result_dict.get("updated_at")
                
            except Exception as e:
                logger.error(f"❌ Error executing pivot-table compute: {e}", exc_info=True)
                return {
                    "status": "failed",
                    "result_file": None,
                    "message": f"Error executing pivot-table compute: {str(e)}",
                    "task_response": None,
                    "additional_results": None
                }
        
        # Execute save endpoint if it was called
        if has_save and save_endpoint:
            logger.info(
                f"💾 PivotTable executor: Executing /save for atom {atom_instance_id}"
            )
            
            try:
                # Extract configuration from API call params
                save_config = save_endpoint.get("params", {})
                filename = save_config.get("filename")
                
                # Build PivotSaveRequest
                save_request = PivotSaveRequest(filename=filename) if filename else None
                
                # Call save_pivot_endpoint directly
                save_result = await save_pivot_endpoint(
                    config_id=atom_instance_id,
                    payload=save_request,
                    client_name=kwargs.get("client_name"),
                    app_name=kwargs.get("app_name"),
                    project_name=kwargs.get("project_name"),
                    card_id=card_id,
                    canvas_position=kwargs.get("canvas_position", 0),
                )
                
                # Convert Pydantic model to dict if needed
                if hasattr(save_result, 'model_dump'):
                    save_result_dict = save_result.model_dump()
                elif hasattr(save_result, 'dict'):
                    save_result_dict = save_result.dict()
                elif isinstance(save_result, dict):
                    save_result_dict = save_result
                else:
                    logger.warning("⚠️ Pivot save returned unexpected result")
                    save_result_dict = {}
                
                result_file = save_result_dict.get("object_name")
                additional_results["saved_file"] = result_file
                additional_results["save_result"] = save_result_dict
                
            except Exception as e:
                logger.error(f"❌ Error executing pivot-table save: {e}", exc_info=True)
                # Don't fail the whole execution if save fails
                logger.warning("⚠️ Pivot save failed, but compute was successful")
        
        if has_compute:
            return {
                "status": "success",
                "result_file": result_file,
                "message": "Pivot table executed successfully",
                "task_response": task_response,
                "additional_results": additional_results if additional_results else None
            }
        else:
            return {
                "status": "failed",
                "result_file": None,
                "message": "No matching pivot-table endpoint found in API calls",
                "task_response": None,
                "additional_results": None
            }


_pivot_table_executor = PivotTableExecutor()
register_atom_executor(_pivot_table_executor)


class TableExecutor(BaseAtomExecutor):
    """Executor for table atom.
    
    Handles endpoints:
    - /table/load - Load table from MinIO
    - /table/update - Update table settings
    - /table/edit-cell - Edit a cell
    - /table/delete-column, /table/insert-column, /table/rename-column, etc. - Column operations
    - /table/create-blank - Create blank table
    - /table/save - Save table results
    """
    
    def get_atom_type(self) -> str:
        return "table"
    
    def _map_table_settings_columns(self, settings: Dict[str, Any], column_lookup: Dict[str, str]) -> Dict[str, Any]:
        """
        Map lowercase column names from MongoDB config to actual column names from replacement file.
        This enables case-insensitive column matching when files are replaced.
        
        Args:
            settings: Table settings dictionary with lowercase column names
            column_lookup: Dictionary mapping lowercase -> original case column names
            
        Returns:
            Settings dictionary with column names mapped to actual case from replacement file
        """
        mapped = settings.copy()
        
        def map_column(col: str) -> str:
            """Map a single column name from lowercase to actual case."""
            if not col or not isinstance(col, str):
                return col
            col_lower = col.lower()
            return column_lookup.get(col_lower, col)  # Use original if not found
        
        # Map visible_columns (list of column names)
        if "visible_columns" in mapped and isinstance(mapped["visible_columns"], list):
            mapped["visible_columns"] = [map_column(col) for col in mapped["visible_columns"]]
        
        # Map column_order (list of column names)
        if "column_order" in mapped and isinstance(mapped["column_order"], list):
            mapped["column_order"] = [map_column(col) for col in mapped["column_order"]]
        
        # Map column_widths (dict with column names as keys)
        if "column_widths" in mapped and isinstance(mapped["column_widths"], dict):
            mapped["column_widths"] = {
                map_column(col): width
                for col, width in mapped["column_widths"].items()
            }
        
        # Map filters (dict with column names as keys)
        if "filters" in mapped and isinstance(mapped["filters"], dict):
            mapped["filters"] = {
                map_column(col): filter_value
                for col, filter_value in mapped["filters"].items()
            }
        
        # Map sort_config (list of dicts with 'column' field)
        if "sort_config" in mapped and isinstance(mapped["sort_config"], list):
            mapped["sort_config"] = [
                {
                    **item,
                    "column": map_column(item.get("column", ""))
                }
                for item in mapped["sort_config"]
            ]
        
        # Map conditionalFormats (nested dict with column names as keys)
        if "conditionalFormats" in mapped and isinstance(mapped["conditionalFormats"], dict):
            mapped["conditionalFormats"] = {
                map_column(col): format_rules
                for col, format_rules in mapped["conditionalFormats"].items()
            }
        
        # Map cellFormatting (nested dict with column names as keys)
        if "cellFormatting" in mapped and isinstance(mapped["cellFormatting"], dict):
            mapped["cellFormatting"] = {
                map_column(col): cell_format
                for col, cell_format in mapped["cellFormatting"].items()
            }
        
        # Map totalRowConfig (dict with column names as keys)
        if "totalRowConfig" in mapped and isinstance(mapped["totalRowConfig"], dict):
            mapped["totalRowConfig"] = {
                map_column(col): agg_type
                for col, agg_type in mapped["totalRowConfig"].items()
            }
        
        # Map columnAlignment (nested dict with column names as keys)
        if "design" in mapped and isinstance(mapped["design"], dict):
            if "columnAlignment" in mapped["design"] and isinstance(mapped["design"]["columnAlignment"], dict):
                mapped["design"]["columnAlignment"] = {
                    map_column(col): alignment
                    for col, alignment in mapped["design"]["columnAlignment"].items()
                }
        
        # Map columnFontStyles (nested dict with column names as keys)
        if "design" in mapped and isinstance(mapped["design"], dict):
            if "columnFontStyles" in mapped["design"] and isinstance(mapped["design"]["columnFontStyles"], dict):
                mapped["design"]["columnFontStyles"] = {
                    map_column(col): font_style
                    for col, font_style in mapped["design"]["columnFontStyles"].items()
                }
        
        return mapped
    
    async def execute(
        self,
        atom_instance_id: str,
        card_id: str,
        configuration: Dict[str, Any],
        input_files: List[str],
        api_calls: List[Dict[str, Any]],
        **kwargs
    ) -> Dict[str, Any]:
        """Execute table atom based on API calls from MongoDB."""
        from app.features.table.routes import (
            load_table,
            update_table,
            save_table,
            edit_cell,
            delete_column,
            insert_column,
            rename_column,
            round_column,
            retype_column,
            transform_case,
            duplicate_column,
            create_blank_table,
        )
        from app.features.table.schemas import (
            TableLoadRequest,
            TableUpdateRequest,
            TableSaveRequest,
            TableSettings,
        )
        from app.features.table.service import SESSIONS
        
        # Get primary input file
        primary_file = input_files[0] if input_files else configuration.get("object_name", "")
        
        # Track table_id across operations (set by /load)
        table_id = None
        
        # Check which endpoints were called
        has_load = False
        has_save = False
        load_endpoint = None
        save_endpoint = None
        other_endpoints = []  # All other endpoints in order
        
        for api_call in api_calls:
            endpoint = api_call.get("endpoint", "")
            # Check for load endpoint
            if "/table/load" in endpoint.lower() or endpoint.endswith("/load"):
                has_load = True
                load_endpoint = api_call
            # Check for save endpoint
            elif "/table/save" in endpoint.lower() or endpoint.endswith("/save"):
                has_save = True
                save_endpoint = api_call
            # All other endpoints (update, edit-cell, column ops, etc.)
            else:
                other_endpoints.append(api_call)
        
        task_response = None
        additional_results = {}
        result_file = None
        
        # 🔧 CRITICAL: Always load column summary for replacement files (similar to pivot-table)
        # Also build column mapping for case-insensitive matching
        column_lookup = {}  # Maps lowercase -> original case
        if primary_file:
            logger.info(
                f"📋 Table executor: Loading column summary for file '{primary_file}' "
                f"(always loads to ensure columns are up-to-date)"
            )
            try:
                from app.features.feature_overview.routes import column_summary
                column_summary_result = await column_summary(primary_file)
                
                # Extract columns from column summary
                summary = column_summary_result.get("summary", [])
                columns = [item.get("column") for item in summary if item.get("column")]
                
                # Build case-insensitive column lookup (lowercase -> original case)
                for col in columns:
                    if col and isinstance(col, str):
                        col_lower = col.lower()
                        if col_lower not in column_lookup:
                            column_lookup[col_lower] = col
                
                additional_results["column_summary"] = column_summary_result
                additional_results["columns"] = columns
                additional_results["column_lookup"] = column_lookup
                
                logger.info(f"✅ Table executor: Loaded {len(columns)} columns for replacement file")
                logger.info(f"📋 Table executor: Built column lookup with {len(column_lookup)} mappings")
            except Exception as e:
                logger.warning(f"⚠️ Table executor: Failed to load column summary for replacement file: {e}")
                # Don't fail the entire execution if column summary fails
        
        # Execute load endpoint first (required to get table_id)
        if has_load and load_endpoint:
            logger.info(
                f"🔄 Table executor: Executing /load for atom {atom_instance_id} "
                f"with file: {primary_file}"
            )
            
            try:
                # Extract configuration from API call params
                load_config = load_endpoint.get("params", {})
                
                # 🔧 CRITICAL: Always use replacement file (primary_file) instead of stored object_name
                stored_object_name = load_config.get("object_name", "")
                object_name = primary_file if primary_file else stored_object_name
                
                if primary_file and primary_file != stored_object_name:
                    logger.info(f"📋 Table executor: Using replacement file '{object_name}' instead of stored '{stored_object_name}'")
                
                # Build TableLoadRequest
                request = TableLoadRequest(
                    object_name=object_name,
                    atom_id=atom_instance_id,
                    project_id=kwargs.get("project_name"),
                )
                
                # Call load_table endpoint directly
                result = await load_table(
                    request=request,
                    client_name=kwargs.get("client_name"),
                    app_name=kwargs.get("app_name"),
                    project_name=kwargs.get("project_name"),
                    card_id=card_id,
                    canvas_position=kwargs.get("canvas_position", 0),
                )
                
                # Convert Pydantic model to dict if needed
                if hasattr(result, 'model_dump'):
                    result_dict = result.model_dump()
                elif hasattr(result, 'dict'):
                    result_dict = result.dict()
                elif isinstance(result, dict):
                    result_dict = result
                else:
                    return {
                        "status": "failed",
                        "result_file": None,
                        "message": "Table load returned unexpected result type",
                        "task_response": None,
                        "additional_results": None
                    }
                
                # Extract table_id from load result
                table_id = result_dict.get("table_id")
                if not table_id:
                    return {
                        "status": "failed",
                        "result_file": None,
                        "message": "Table load did not return table_id",
                        "task_response": None,
                        "additional_results": None
                    }
                
                # Store table response for frontend
                task_response = result_dict
                additional_results["table_data"] = result_dict
                
                logger.info(f"✅ Table executor: Loaded table with table_id: {table_id}")
                
            except Exception as e:
                logger.error(f"❌ Error executing table load: {e}", exc_info=True)
                return {
                    "status": "failed",
                    "result_file": None,
                    "message": f"Error executing table load: {str(e)}",
                    "task_response": None,
                    "additional_results": None
                }
        
        # Execute other endpoints in order (update, edit-cell, column ops, etc.)
        for endpoint_call in other_endpoints:
            endpoint = endpoint_call.get("endpoint", "")
            params = endpoint_call.get("params", {})
            
            # 🔧 CRITICAL: ALWAYS override table_id with the one from load operation
            # The stored params have the old table_id from original execution, but we need
            # to use the new table_id from the replacement file load
            if table_id:
                old_table_id = params.get("table_id")
                params["table_id"] = table_id
                if old_table_id and old_table_id != table_id:
                    logger.info(
                        f"🔄 Table executor: Overriding table_id from {old_table_id} to {table_id} "
                        f"(using new table_id from replacement file load)"
                    )
            
            logger.info(
                f"🔄 Table executor: Executing {endpoint} for atom {atom_instance_id}"
            )
            
            try:
                # Route to appropriate endpoint handler
                if "/table/update" in endpoint.lower() or endpoint.endswith("/update"):
                    # Build TableUpdateRequest
                    settings_dict = params.get("settings", {})
                    
                    # 🔧 CRITICAL: Map lowercase column names from MongoDB config to actual column names from replacement file
                    # This enables case-insensitive column matching when files are replaced
                    if column_lookup and settings_dict:
                        settings_dict = self._map_table_settings_columns(settings_dict, column_lookup)
                        logger.info(f"📋 Table executor: Mapped column names in settings using column_lookup")
                    
                    request = TableUpdateRequest(
                        table_id=params.get("table_id", table_id),
                        settings=TableSettings(**settings_dict) if settings_dict else TableSettings(),
                        atom_id=params.get("atom_id", atom_instance_id),
                        project_id=params.get("project_id", kwargs.get("project_name")),
                    )
                    
                    result = await update_table(
                        request=request,
                        client_name=kwargs.get("client_name"),
                        app_name=kwargs.get("app_name"),
                        project_name=kwargs.get("project_name"),
                        card_id=card_id,
                        canvas_position=kwargs.get("canvas_position", 0),
                    )
                    
                elif "/table/edit-cell" in endpoint.lower() or endpoint.endswith("/edit-cell"):
                    # 🔧 CRITICAL: Map column name from lowercase to actual case
                    column = params.get("column")
                    if column_lookup and column:
                        column_lower = column.lower() if isinstance(column, str) else str(column).lower()
                        column = column_lookup.get(column_lower, column)
                    
                    # Call edit_cell directly with params
                    result = await edit_cell(
                        table_id=params.get("table_id", table_id),
                        row=params.get("row"),
                        column=column,
                        value=params.get("value"),
                        atom_id=params.get("atom_id", atom_instance_id),
                        project_id=params.get("project_id", kwargs.get("project_name")),
                        client_name=kwargs.get("client_name"),
                        app_name=kwargs.get("app_name"),
                        project_name=kwargs.get("project_name"),
                        card_id=card_id,
                        canvas_position=kwargs.get("canvas_position", 0),
                    )
                    
                elif "/table/delete-column" in endpoint.lower() or endpoint.endswith("/delete-column"):
                    # 🔧 CRITICAL: Map column name from lowercase to actual case
                    column = params.get("column")
                    if column_lookup and column:
                        column_lower = column.lower() if isinstance(column, str) else str(column).lower()
                        column = column_lookup.get(column_lower, column)
                    
                    result = await delete_column(
                        table_id=params.get("table_id", table_id),
                        column=column,
                    )
                    
                elif "/table/insert-column" in endpoint.lower() or endpoint.endswith("/insert-column"):
                    result = await insert_column(
                        table_id=params.get("table_id", table_id),
                        index=params.get("index"),
                        name=params.get("name"),
                        default_value=params.get("default_value"),
                    )
                    
                elif "/table/rename-column" in endpoint.lower() or endpoint.endswith("/rename-column"):
                    # 🔧 CRITICAL: Map column name from lowercase to actual case
                    old_name = params.get("old_name")
                    if column_lookup and old_name:
                        old_name_lower = old_name.lower() if isinstance(old_name, str) else str(old_name).lower()
                        old_name = column_lookup.get(old_name_lower, old_name)
                    
                    result = await rename_column(
                        table_id=params.get("table_id", table_id),
                        old_name=old_name,
                        new_name=params.get("new_name"),
                    )
                    
                elif "/table/round-column" in endpoint.lower() or endpoint.endswith("/round-column"):
                    # 🔧 CRITICAL: Map column name from lowercase to actual case
                    column = params.get("column")
                    if column_lookup and column:
                        column_lower = column.lower() if isinstance(column, str) else str(column).lower()
                        column = column_lookup.get(column_lower, column)
                    
                    result = await round_column(
                        table_id=params.get("table_id", table_id),
                        column=column,
                        decimal_places=params.get("decimal_places"),
                    )
                    
                elif "/table/retype-column" in endpoint.lower() or endpoint.endswith("/retype-column"):
                    # 🔧 CRITICAL: Map column name from lowercase to actual case
                    column = params.get("column")
                    if column_lookup and column:
                        column_lower = column.lower() if isinstance(column, str) else str(column).lower()
                        column = column_lookup.get(column_lower, column)
                    
                    result = await retype_column(
                        table_id=params.get("table_id", table_id),
                        column=column,
                        new_type=params.get("new_type"),
                    )
                    
                elif "/table/transform-case" in endpoint.lower() or endpoint.endswith("/transform-case"):
                    # 🔧 CRITICAL: Map column name from lowercase to actual case
                    column = params.get("column")
                    if column_lookup and column:
                        column_lower = column.lower() if isinstance(column, str) else str(column).lower()
                        column = column_lookup.get(column_lower, column)
                    
                    result = await transform_case(
                        table_id=params.get("table_id", table_id),
                        column=column,
                        case_type=params.get("case_type"),
                    )
                    
                elif "/table/duplicate-column" in endpoint.lower() or endpoint.endswith("/duplicate-column"):
                    # 🔧 CRITICAL: Map column name from lowercase to actual case
                    column = params.get("column")
                    if column_lookup and column:
                        column_lower = column.lower() if isinstance(column, str) else str(column).lower()
                        column = column_lookup.get(column_lower, column)
                    
                    result = await duplicate_column(
                        table_id=params.get("table_id", table_id),
                        column=column,
                        new_name=params.get("new_name"),
                    )
                    
                elif "/table/create-blank" in endpoint.lower() or endpoint.endswith("/create-blank"):
                    result = await create_blank_table(
                        rows=params.get("rows"),
                        columns=params.get("columns"),
                        use_header_row=params.get("use_header_row", False),
                    )
                    # Extract table_id from create-blank result
                    if isinstance(result, dict) and result.get("table_id"):
                        table_id = result.get("table_id")
                    
                else:
                    # Generic handler: Try to call the endpoint function directly if it exists
                    # This handles any endpoints we haven't explicitly coded yet
                    logger.warning(f"⚠️ Table executor: Unknown endpoint {endpoint}, attempting generic execution")
                    try:
                        # Try to import and call the endpoint function dynamically
                        from app.features.table import routes as table_routes
                        # Get the function from routes module
                        endpoint_func_name = endpoint.split("/")[-1].replace("-", "_")
                        if hasattr(table_routes, endpoint_func_name):
                            endpoint_func = getattr(table_routes, endpoint_func_name)
                            # Call with params as keyword arguments
                            result = await endpoint_func(**params)
                        else:
                            logger.warning(f"⚠️ Table executor: Could not find function for {endpoint}, skipping")
                            continue
                    except Exception as e:
                        logger.error(f"❌ Table executor: Failed to execute {endpoint} generically: {e}")
                        continue
                
                # Update table_id if it changed (e.g., from create-blank)
                if isinstance(result, dict) and result.get("table_id"):
                    table_id = result.get("table_id")
                
                # 🔧 CRITICAL: Update table_data after each operation that returns table data
                # This ensures the final table_data includes all operations (sort, rename, etc.)
                # Most table operations return a TableResponse with table_id, columns, rows, etc.
                # Convert Pydantic model to dict if needed (do this FIRST, before checking isinstance)
                result_dict = None
                if hasattr(result, 'model_dump'):
                    result_dict = result.model_dump()
                elif hasattr(result, 'dict'):
                    result_dict = result.dict()
                elif isinstance(result, dict):
                    result_dict = result
                
                # If this result has table_id, it's a table response - update table_data
                if result_dict and result_dict.get("table_id"):
                    additional_results["table_data"] = result_dict
                    task_response = result_dict  # Also update task_response to latest state
                    logger.info(f"📊 Table executor: Updated table_data after {endpoint} (table_id: {result_dict.get('table_id')}, rows: {len(result_dict.get('rows', []))})")
                elif result_dict:
                    logger.warning(f"⚠️ Table executor: Result from {endpoint} does not have table_id, skipping table_data update")
                
                logger.info(f"✅ Table executor: Executed {endpoint} successfully")
                
            except Exception as e:
                logger.error(f"❌ Error executing table endpoint {endpoint}: {e}", exc_info=True)
                # Continue with next endpoint instead of failing entire execution
                continue
        
        # Execute save endpoint if it was called
        if has_save and save_endpoint:
            logger.info(
                f"💾 Table executor: Executing /save for atom {atom_instance_id}"
            )
            
            try:
                # Extract configuration from API call params
                save_config = save_endpoint.get("params", {})
                
                # Use table_id from load or params
                save_table_id = save_config.get("table_id", table_id)
                if not save_table_id:
                    return {
                        "status": "failed",
                        "result_file": None,
                        "message": "Cannot save: table_id not found",
                        "task_response": task_response,
                        "additional_results": additional_results if additional_results else None
                    }
                
                # Build TableSaveRequest
                request = TableSaveRequest(
                    table_id=save_table_id,
                    filename=save_config.get("filename"),
                    overwrite_original=save_config.get("overwrite_original", False),
                    use_header_row=save_config.get("use_header_row", False),
                    conditional_format_rules=save_config.get("conditional_format_rules"),
                    metadata=save_config.get("metadata"),
                    atom_id=save_config.get("atom_id", atom_instance_id),
                    project_id=save_config.get("project_id", kwargs.get("project_name")),
                )
                
                # Call save_table endpoint directly
                save_result = await save_table(
                    request=request,
                    client_name=kwargs.get("client_name"),
                    app_name=kwargs.get("app_name"),
                    project_name=kwargs.get("project_name"),
                    card_id=card_id,
                    canvas_position=kwargs.get("canvas_position", 0),
                )
                
                # Convert Pydantic model to dict if needed
                if hasattr(save_result, 'model_dump'):
                    save_result_dict = save_result.model_dump()
                elif hasattr(save_result, 'dict'):
                    save_result_dict = save_result.dict()
                elif isinstance(save_result, dict):
                    save_result_dict = save_result
                else:
                    logger.warning("⚠️ Table save returned unexpected result")
                    save_result_dict = {}
                
                result_file = save_result_dict.get("object_name")
                additional_results["saved_file"] = result_file
                additional_results["save_result"] = save_result_dict
                
            except Exception as e:
                logger.error(f"❌ Error executing table save: {e}", exc_info=True)
                # Don't fail the whole execution if save fails
                logger.warning("⚠️ Table save failed, but other operations were successful")
        
        # 🔧 CRITICAL: Ensure we have the final table_data after all operations
        # If the last operation didn't return table_data, use the last one we have
        if table_id and "table_data" not in additional_results:
            if task_response and isinstance(task_response, dict) and task_response.get("table_id"):
                # Use the last task_response we have (from the last operation)
                additional_results["table_data"] = task_response
                logger.info(f"📊 Table executor: Using last task_response as final table_data (table_id: {table_id})")
            else:
                logger.warning(f"⚠️ Table executor: No table_data available after all operations (table_id: {table_id})")
        
        # 🔧 CRITICAL: Always ensure table_data has the latest table_id
        # This is important because table_id might have changed during operations
        if "table_data" in additional_results and table_id:
            additional_results["table_data"]["table_id"] = table_id
        
        if has_load:
            return {
                "status": "success",
                "result_file": result_file,
                "message": "Table executed successfully",
                "task_response": task_response,
                "additional_results": additional_results if additional_results else None
            }
        else:
            return {
                "status": "failed",
                "result_file": None,
                "message": "No matching table endpoint found in API calls",
                "task_response": None,
                "additional_results": None
            }


_table_executor = TableExecutor()
register_atom_executor(_table_executor)


async def execute_atom_step(
    atom_type: str,
    atom_instance_id: str,
    card_id: str,
    configuration: Dict[str, Any],
    input_files: List[str],
    api_calls: List[Dict[str, Any]],
    **kwargs
) -> Dict[str, Any]:
    """Execute an atom step based on its stored configuration.
    
    This is the main entry point for pipeline re-execution.
    It delegates to the appropriate executor which handles endpoint execution.
    
    Args:
        atom_type: Atom type identifier
        atom_instance_id: Unique atom instance identifier
        card_id: Card ID containing the atom
        configuration: Atom configuration from MongoDB
        input_files: List of input file keys (after replacements)
        api_calls: List of API calls from MongoDB execution step
        **kwargs: Additional parameters (canvas_position, etc.)
    
    Returns:
        Dictionary with execution results
    """
    executor = get_atom_executor(atom_type)
    
    if not executor:
        logger.warning(f"⚠️ No executor registered for atom type: {atom_type}")
        return {
            "status": "failed",
            "result_file": None,
            "message": f"Re-execution not implemented for atom type: {atom_type}",
            "task_response": None,
            "additional_results": None
        }
    
    try:
        logger.info(
            f"🔄 Executing {atom_type} for atom {atom_instance_id} "
            f"with {len(api_calls)} API call(s)"
        )
        
        # Delegate to executor - it handles all endpoint logic
        result = await executor.execute(
            atom_instance_id=atom_instance_id,
            card_id=card_id,
            configuration=configuration,
            input_files=input_files,
            api_calls=api_calls,
            **kwargs
        )
        
        return result
        
    except Exception as e:
        logger.error(
            f"❌ Error executing atom {atom_type} ({atom_instance_id}): {e}",
            exc_info=True
        )
        return {
            "status": "failed",
            "result_file": None,
            "message": str(e),
            "task_response": None,
            "additional_results": None
        }
