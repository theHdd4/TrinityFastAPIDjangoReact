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
                    
                    # 🔧 CRITICAL: Refresh identifiers from the actual file being used (case-insensitive)
                    # This ensures identifiers match the replacement file's columns
                    identifiers = run_params.get("identifiers")
                    if not identifiers:
                        identifiers = configuration.get("identifiers", [])
                    
                    # 🔧 Refresh identifiers from the file's classifier config (after file replacement)
                    # This ensures we use identifiers that actually exist in the replacement file
                    try:
                        from app.features.column_classifier.database import get_classifier_config_from_mongo
                        import os
                        client_name = run_params.get("client_name") or os.getenv("CLIENT_NAME", "")
                        app_name = run_params.get("app_name") or os.getenv("APP_NAME", "")
                        project_name = run_params.get("project_name") or os.getenv("PROJECT_NAME", "")
                        
                        if client_name and app_name and project_name and run_file:
                            file_cfg = get_classifier_config_from_mongo(client_name, app_name, project_name, run_file)
                            if file_cfg and file_cfg.get("identifiers"):
                                # Use identifiers from the file's classifier config (case-insensitive matching)
                                file_identifiers = file_cfg.get("identifiers", [])
                                # Filter to only identifiers that were in the original request (if any)
                                # This preserves user's selection while ensuring they exist in the file
                                if identifiers:
                                    # Create case-insensitive mapping
                                    file_id_lower = {str(id).lower(): id for id in file_identifiers}
                                    req_id_lower = {str(id).lower(): id for id in identifiers}
                                    # Keep identifiers that exist in both (file config and original request)
                                    refreshed_identifiers = [
                                        file_id_lower[req_lower] 
                                        for req_lower in req_id_lower.keys() 
                                        if req_lower in file_id_lower
                                    ]
                                    if refreshed_identifiers:
                                        identifiers = refreshed_identifiers
                                        logger.info(
                                            f"🔄 Refreshed identifiers from file {run_file}: {identifiers}"
                                        )
                                else:
                                    # No original identifiers, use all from file
                                    identifiers = file_identifiers
                                    logger.info(
                                        f"🔄 Using identifiers from file {run_file}: {identifiers}"
                                    )
                    except Exception as e:
                        logger.warning(
                            f"⚠️ Could not refresh identifiers from file {run_file}: {e}. "
                            f"Using original identifiers: {identifiers}"
                        )
                    
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
        
        # Get input files (merge needs 2 files) - fallback only
        file1_default = input_files[0] if len(input_files) > 0 else configuration.get("file1", "")
        file2_default = input_files[1] if len(input_files) > 1 else configuration.get("file2", "")
        
        # For merge atoms, process each API call SEQUENTIALLY to maintain init->perform->save sequences
        # Each API call may have its own file pair (file1, file2) in params
        # This allows multiple init/perform/save sequences for different file pairs/configurations
        
        # 🔧 CRITICAL: Track current file context for each sequence
        current_file1_context = file1_default
        current_file2_context = file2_default
        
        result_file = None
        task_response = None
        save_results = []  # Track all save results (not just the last one)
        init_results = []
        all_saved_files = []  # Track all saved files
        csv_data_context = None  # Track CSV data from perform for subsequent save
        
        # Process API calls sequentially to maintain sequence: init -> perform -> save -> init -> perform -> save
        i = 0
        while i < len(api_calls):
            api_call = api_calls[i]
            endpoint = api_call.get("endpoint", "")
            params = api_call.get("params", {})
            
            # Extract files from params (file_replacements already applied in endpoint.py)
            call_file1 = params.get("file1", current_file1_context)
            call_file2 = params.get("file2", current_file2_context)
            
            # Check for init endpoint
            if endpoint in ["/api/merge/init", "/merge/init"] or endpoint.endswith("/init"):
                # Update current file context when we see an init call
                current_file1_context = call_file1
                current_file2_context = call_file2
                logger.info(
                    f"🔄 [MERGE] Executing /init for atom {atom_instance_id} with files: {call_file1}, {call_file2}"
                )
                
                try:
                    # Extract configuration from API call params
                    init_config = params
                    bucket_name = configuration.get("bucket_name", init_config.get("bucket_name", "trinity"))
                    
                    # Call init_merge directly
                    init_result = await init_merge(
                        file1=call_file1,
                        file2=call_file2,
                        bucket_name=bucket_name,
                        validator_atom_id=atom_instance_id,
                        card_id=card_id,
                        canvas_position=kwargs.get("canvas_position", 0),
                    )
                    
                    init_results.append(init_result)
                    
                    if isinstance(init_result, dict):
                        if init_result.get("status") != "SUCCESS":
                            logger.warning(f"⚠️ Merge init returned non-success status: {init_result.get('status')}")
                        else:
                            logger.info(f"✅ Merge init completed successfully for files: {call_file1}, {call_file2}")
                    else:
                        logger.warning("⚠️ Merge init returned unexpected result")
                        
                except Exception as e:
                    logger.error(f"❌ Error executing merge init: {e}", exc_info=True)
                    # Don't fail the entire execution if init fails, but log it
                
                i += 1
                
            # Check for perform endpoint
            elif endpoint in ["/api/merge/perform", "/merge/perform"] or "merge/perform" in endpoint.lower():
                logger.info(
                    f"🔄 [MERGE] Executing /perform for atom {atom_instance_id} with files: {call_file1}, {call_file2}"
                )
                
                try:
                    # Extract configuration from API call params
                    perform_config = params
                    
                    # Parse join_columns if it's a string
                    join_columns = perform_config.get("join_columns", [])
                    if isinstance(join_columns, str):
                        try:
                            join_columns = json.loads(join_columns)
                        except json.JSONDecodeError:
                            join_columns = []
                    
                    bucket_name = configuration.get("bucket_name", perform_config.get("bucket_name", "trinity"))
                    
                    # Call perform_merge with files from this API call (already has replacements applied)
                    result = await perform_merge(
                        file1=call_file1,
                        file2=call_file2,
                        bucket_name=bucket_name,
                        join_columns=json.dumps(join_columns),
                        join_type=perform_config.get("join_type", "inner"),
                        validator_atom_id=atom_instance_id,
                        card_id=card_id,
                        canvas_position=kwargs.get("canvas_position", 0),
                    )
                    
                    if isinstance(result, dict):
                        task_response = result
                        # Update result_file for this sequence
                        if result.get("result_file"):
                            result_file = result.get("result_file")
                        elif result.get("filename"):
                            result_file = result.get("filename")
                        
                        # Store CSV data for subsequent save
                        csv_data_context = result.get("data")
                        
                        logger.info(f"✅ Merge perform completed successfully, result_file: {result_file}")
                    else:
                        logger.error(f"❌ Merge perform returned unexpected result type")
                        # Continue to next sequence instead of failing entirely
                    
                except Exception as e:
                    logger.error(f"❌ Error executing merge perform: {e}", exc_info=True)
                    # Continue to next sequence instead of failing entirely
                
                i += 1
                
            # Check for save endpoint
            elif endpoint in ["/api/merge/save", "/merge/save"] or endpoint.endswith("/save"):
                logger.info(
                    f"💾 [MERGE] Executing /save for atom {atom_instance_id} "
                    f"with result file: {result_file}"
                )
                
                save_config = params
                filename = save_config.get("filename")
                
                # Get CSV data from context (from previous perform) or from save endpoint params
                csv_data = csv_data_context or save_config.get("csv_data", "")
                
                if filename and csv_data:
                    try:
                        # Call save_merged_dataframe
                        save_result = await save_merged_dataframe(
                            csv_data=csv_data,
                            filename=filename,
                            validator_atom_id=atom_instance_id,
                            card_id=card_id,
                            canvas_position=kwargs.get("canvas_position", 0),
                        )
                        
                        if isinstance(save_result, dict):
                            save_status = save_result.get("task_status", save_result.get("status", "unknown"))
                            if save_status == "success":
                                # Extract saved filename from result
                                saved_filename = save_result.get("result_file") or save_result.get("filename")
                                if saved_filename:
                                    all_saved_files.append(saved_filename)
                                    save_results.append(save_result)
                                    result_file = saved_filename  # Update result_file to saved file
                                    logger.info(f"✅ SaveAs completed successfully for atom {atom_instance_id}, saved to: {saved_filename}")
                                else:
                                    logger.info(f"✅ SaveAs completed successfully for atom {atom_instance_id}")
                            else:
                                logger.warning(f"⚠️ SaveAs failed for atom {atom_instance_id}")
                    except Exception as save_error:
                        logger.error(f"❌ Error executing merge save: {save_error}", exc_info=True)
                        save_results.append({"status": "failed", "error": str(save_error)})
                else:
                    if not filename:
                        logger.warning(f"⚠️ Save endpoint found but no filename in params")
                    if not csv_data:
                        logger.warning(f"⚠️ Save endpoint found but no CSV data available")
                
                i += 1
            else:
                # Unknown endpoint, skip it
                logger.warning(f"⚠️ [MERGE] Unknown endpoint: {endpoint}, skipping")
                i += 1
        
        # Build additional_results with saved file info
        additional_results_dict = {}
        if init_results:
            additional_results_dict["init_results"] = init_results
            # For backward compatibility, also include last init result
            if len(init_results) > 0:
                additional_results_dict["init_result"] = init_results[-1]
                additional_results_dict["common_columns"] = init_results[-1].get("common_columns", [])
                additional_results_dict["available_columns"] = init_results[-1].get("common_columns", [])
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
        if task_response:
            additional_results_dict["merge_results"] = task_response
            additional_results_dict["row_count"] = task_response.get("row_count")
            additional_results_dict["columns"] = task_response.get("columns")
            additional_results_dict["csv_data"] = task_response.get("data")
        
            return {
                "status": "success",
                "result_file": result_file,
                "message": "Merge executed successfully",
                "task_response": task_response,
            "additional_results": additional_results_dict if additional_results_dict else None
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
        
        # Get input files (concat needs 2 files) - fallback only
        file1_default = input_files[0] if len(input_files) > 0 else configuration.get("file1", "")
        file2_default = input_files[1] if len(input_files) > 1 else configuration.get("file2", "")
        
        # For concat atoms, process each API call SEQUENTIALLY to maintain init->perform->save sequences
        # Each API call may have its own file pair (file1, file2) in params
        # This allows multiple init/perform/save sequences for different file pairs/configurations
        
        # 🔧 CRITICAL: Track current file context for each sequence
        current_file1_context = file1_default
        current_file2_context = file2_default
        
        result_file = None
        task_response = None
        save_results = []  # Track all save results (not just the last one)
        init_results = []
        all_saved_files = []  # Track all saved files
        csv_data_context = None  # Track CSV data from perform for subsequent save
        
        # Process API calls sequentially to maintain sequence: init -> perform -> save -> init -> perform -> save
        i = 0
        while i < len(api_calls):
            api_call = api_calls[i]
            endpoint = api_call.get("endpoint", "")
            params = api_call.get("params", {})
            
            # Extract files from params (file_replacements already applied in endpoint.py)
            call_file1 = params.get("file1", current_file1_context)
            call_file2 = params.get("file2", current_file2_context)
            
            # Check for init endpoint
            if endpoint in ["/api/concat/init", "/concat/init"] or endpoint.endswith("/init"):
                # Update current file context when we see an init call
                current_file1_context = call_file1
                current_file2_context = call_file2
                logger.info(
                    f"🔄 [CONCAT] Executing /init for atom {atom_instance_id} with files: {call_file1}, {call_file2}"
                )
                
                try:
                    # Extract configuration from API call params
                    init_config = params
                    
                    # Call init_concat directly
                    init_result = await init_concat(
                        file1=call_file1,
                        file2=call_file2,
                        validator_atom_id=atom_instance_id,
                        card_id=card_id,
                        canvas_position=kwargs.get("canvas_position", 0),
                    )
                    
                    init_results.append(init_result)
                    
                    if isinstance(init_result, dict):
                        if init_result.get("status") != "SUCCESS":
                            logger.warning(f"⚠️ Concat init returned non-success status: {init_result.get('status')}")
                        else:
                            logger.info(f"✅ Concat init completed successfully for files: {call_file1}, {call_file2}")
                    else:
                        logger.warning("⚠️ Concat init returned unexpected result")
                        
                except Exception as e:
                    logger.error(f"❌ Error executing concat init: {e}", exc_info=True)
                    # Don't fail the entire execution if init fails, but log it
                
                i += 1
                
            # Check for perform endpoint
            elif endpoint in ["/api/concat/perform", "/concat/perform"] or "concat/perform" in endpoint.lower():
                logger.info(
                    f"🔄 [CONCAT] Executing /perform for atom {atom_instance_id} with files: {call_file1}, {call_file2}"
                )
                
                try:
                    # Extract configuration from API call params
                    perform_config = params
                    concat_direction = perform_config.get("concat_direction", "vertical")
                    
                    # Call perform_concat with files from this API call (already has replacements applied)
                    result = await perform_concat(
                        file1=call_file1,
                        file2=call_file2,
                        concat_direction=concat_direction,
                        validator_atom_id=atom_instance_id,
                        card_id=card_id,
                        canvas_position=kwargs.get("canvas_position", 0),
                    )
                    
                    if isinstance(result, dict):
                        task_response = result
                        # Update result_file for this sequence
                        if result.get("result_file"):
                            result_file = result.get("result_file")
                        elif result.get("filename"):
                            result_file = result.get("filename")
                        
                        # Store CSV data for subsequent save
                        csv_data_context = result.get("data")
                        
                        logger.info(f"✅ Concat perform completed successfully, result_file: {result_file}")
                    else:
                        logger.error(f"❌ Concat perform returned unexpected result type")
                        # Continue to next sequence instead of failing entirely
                    
                except Exception as e:
                    logger.error(f"❌ Error executing concat perform: {e}", exc_info=True)
                    # Continue to next sequence instead of failing entirely
                
                i += 1
                
            # Check for save endpoint
            elif endpoint in ["/api/concat/save", "/concat/save"] or endpoint.endswith("/save"):
                logger.info(
                    f"💾 [CONCAT] Executing /save for atom {atom_instance_id} "
                    f"with result file: {result_file}"
                )
                
                save_config = params
                filename = save_config.get("filename")
                
                # Get CSV data from context (from previous perform) or from save endpoint params
                csv_data = csv_data_context or save_config.get("csv_data", "")
                
                if filename and csv_data:
                    try:
                        # Call save_concat_dataframe
                        save_result = await save_concat_dataframe(
                            csv_data=csv_data,
                            filename=filename,
                            validator_atom_id=atom_instance_id,
                            card_id=card_id,
                            canvas_position=kwargs.get("canvas_position", 0),
                        )
                        
                        if isinstance(save_result, dict):
                            save_status = save_result.get("task_status", save_result.get("status", "unknown"))
                            if save_status == "success":
                                # Extract saved filename from result
                                saved_filename = save_result.get("result_file") or save_result.get("filename")
                                if saved_filename:
                                    all_saved_files.append(saved_filename)
                                    save_results.append(save_result)
                                    result_file = saved_filename  # Update result_file to saved file
                                    logger.info(f"✅ SaveAs completed successfully for atom {atom_instance_id}, saved to: {saved_filename}")
                                else:
                                    logger.info(f"✅ SaveAs completed successfully for atom {atom_instance_id}")
                            else:
                                logger.warning(f"⚠️ SaveAs failed for atom {atom_instance_id}")
                    except Exception as save_error:
                        logger.error(f"❌ Error executing concat save: {save_error}", exc_info=True)
                        save_results.append({"status": "failed", "error": str(save_error)})
                else:
                    if not filename:
                        logger.warning(f"⚠️ Save endpoint found but no filename in params")
                    if not csv_data:
                        logger.warning(f"⚠️ Save endpoint found but no CSV data available")
                
                i += 1
            else:
                # Unknown endpoint, skip it
                logger.warning(f"⚠️ [CONCAT] Unknown endpoint: {endpoint}, skipping")
                i += 1
        
        # Build additional_results with all collected data
        additional_results = {
            "init_results": init_results,
            "save_results": save_results,
            "saved_files": all_saved_files,
            "concat_results": task_response,
        }
        
        if task_response:
            additional_results["concat_id"] = task_response.get("concat_id")
            additional_results["row_count"] = task_response.get("result_shape", [0, 0])[0] if isinstance(task_response.get("result_shape"), list) else 0
            additional_results["columns"] = task_response.get("columns")
        
        # Return success if we had at least one perform call
        if task_response:
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
        
        # Get primary input file (fallback only)
        primary_file = input_files[0] if input_files else configuration.get("data_source", "")
        
        # For pivot-table atoms, process each API call SEQUENTIALLY to maintain compute->save sequences
        # Each API call may have its own data_source in params
        # This allows multiple compute/save sequences for different files/configurations
        
        # 🔧 CRITICAL: Track current file context for each sequence
        current_file_context = primary_file
        
        result_file = None
        task_response = None
        save_results = []  # Track all save results (not just the last one)
        compute_results = []
        all_saved_files = []  # Track all saved files
        
        # Process API calls sequentially to maintain sequence: compute -> save -> compute -> save
        i = 0
        while i < len(api_calls):
            api_call = api_calls[i]
            endpoint = api_call.get("endpoint", "")
            params = api_call.get("params", {})
            
            # Extract file from params (file_replacements already applied in endpoint.py)
            call_file = params.get("data_source", current_file_context)
            
            # Check for compute endpoint
            if "/pivot" in endpoint.lower() and "/compute" in endpoint.lower():
                # Update current file context when we see a compute call
                current_file_context = call_file
                logger.info(
                    f"🔄 [PIVOT-TABLE] Executing /compute for atom {atom_instance_id} with file: {call_file}"
                )
                
                try:
                    # Extract configuration from API call params
                    compute_config = params
                    
                    # 🔧 CRITICAL: Always use replacement file (call_file) instead of stored data_source
                    # Priority: 1. call_file (from params, already has replacements), 2. configuration.data_source, 3. compute_config.data_source
                    stored_data_source = compute_config.get("data_source", "")
                    config_data_source = configuration.get("data_source", "")
                    data_source = call_file if call_file else (config_data_source if config_data_source else stored_data_source)
                    if call_file and call_file != stored_data_source:
                        logger.info(f"📋 [PIVOT-TABLE] Using replacement file '{data_source}' instead of stored '{stored_data_source}'")
                    
                    # 🔧 CRITICAL: Always load column summary for the current file
                    # This ensures columns and filter options are always up-to-date
                    column_summary_result = None
                    if data_source:
                        try:
                            from app.features.feature_overview.routes import column_summary
                            column_summary_result = await column_summary(data_source)
                            
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
                            
                            logger.info(f"✅ [PIVOT-TABLE] Loaded {len(columns)} columns and filter options for file: {data_source}")
                        except Exception as e:
                            logger.warning(f"⚠️ [PIVOT-TABLE] Failed to load column summary for file: {e}")
                    
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
                        logger.error(f"❌ [PIVOT-TABLE] Compute returned unexpected result type")
                        i += 1
                        continue
                    
                    # Store pivot results
                    compute_result = {
                        "status": result_dict.get("status", "success"),
                        "data": result_dict.get("data", []),
                        "hierarchy": result_dict.get("hierarchy", []),
                        "column_hierarchy": result_dict.get("column_hierarchy", []),
                        "rows": result_dict.get("rows", 0),
                        "updated_at": result_dict.get("updated_at"),
                        "config_id": result_dict.get("config_id", atom_instance_id),
                    }
                    compute_results.append(compute_result)
                    task_response = compute_result  # Update task_response to latest
                    
                    logger.info(f"✅ [PIVOT-TABLE] Compute completed successfully for file: {call_file}")
                    
                except Exception as e:
                    logger.error(f"❌ Error executing pivot-table compute: {e}", exc_info=True)
                    # Continue to next sequence instead of failing entirely
                
                i += 1
                
            # Check for save endpoint
            elif "/pivot" in endpoint.lower() and "/save" in endpoint.lower():
                logger.info(
                    f"💾 [PIVOT-TABLE] Executing /save for atom {atom_instance_id}"
                )
                
                save_config = params
                filename = save_config.get("filename")
                
                if filename:
                    try:
                        # Build PivotSaveRequest
                        save_request = PivotSaveRequest(filename=filename)
                        
                        # Call save_pivot_endpoint
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
                            logger.warning("⚠️ [PIVOT-TABLE] Save returned unexpected result")
                            save_result_dict = {}
                        
                        save_status = save_result_dict.get("status", "unknown")
                        if save_status == "success":
                            # Extract saved filename from result
                            saved_filename = save_result_dict.get("object_name")
                            if saved_filename:
                                all_saved_files.append(saved_filename)
                                save_results.append(save_result_dict)
                                result_file = saved_filename  # Update result_file to saved file
                                logger.info(f"✅ [PIVOT-TABLE] SaveAs completed successfully, saved to: {saved_filename}")
                            else:
                                logger.info(f"✅ [PIVOT-TABLE] SaveAs completed successfully")
                        else:
                            logger.warning(f"⚠️ [PIVOT-TABLE] SaveAs failed")
                    except Exception as save_error:
                        logger.error(f"❌ Error executing pivot-table save: {save_error}", exc_info=True)
                        save_results.append({"status": "failed", "error": str(save_error)})
                else:
                    logger.warning(f"⚠️ [PIVOT-TABLE] Save endpoint found but no filename in params")
                
                i += 1
            else:
                # Unknown endpoint, skip it
                logger.warning(f"⚠️ [PIVOT-TABLE] Unknown endpoint: {endpoint}, skipping")
                i += 1
        
        # Build additional_results with all collected data
        additional_results = {
            "compute_results": compute_results,
            "save_results": save_results,
            "saved_files": all_saved_files,
            "pivot_results": task_response.get("data", []) if task_response else [],
        }
        
        if task_response:
            additional_results["pivot_hierarchy"] = task_response.get("hierarchy", [])
            additional_results["pivot_column_hierarchy"] = task_response.get("column_hierarchy", [])
            additional_results["pivot_row_count"] = task_response.get("rows", 0)
            additional_results["pivot_updated_at"] = task_response.get("updated_at")
        
        # Return success if we had at least one compute call
        if task_response:
            return {
                "status": "success",
                "result_file": result_file,
                "message": "Pivot table executed successfully",
                "task_response": task_response,
                "additional_results": additional_results
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
        # 🔧 CRITICAL: Use configuration.object_name as source of truth (it's the last loaded file)
        # Only fall back to input_files[0] if configuration doesn't have it
        primary_file = configuration.get("object_name") or (input_files[0] if input_files else "")
        
        # For table atoms, process each API call SEQUENTIALLY to maintain load->operations->save sequences
        # Each API call may have its own object_name in params (for /load)
        # This allows multiple load/operations/save sequences for different files/configurations
        
        # 🔧 CRITICAL: Track current file context and table_id for each sequence
        current_file_context = primary_file
        # Initialize with table_id from configuration (if available) to maintain consistency during pipeline runs
        current_table_id = configuration.get("table_id")
        
        result_file = None
        task_response = None
        save_results = []  # Track all save results (not just the last one)
        load_results = []
        all_saved_files = []  # Track all saved files
        column_lookup = {}  # Maps lowercase -> original case (built per file, reset on each load)
        
        # Process API calls sequentially to maintain sequence: load -> operations -> save -> load -> operations -> save
        i = 0
        while i < len(api_calls):
            api_call = api_calls[i]
            endpoint = api_call.get("endpoint", "")
            params = api_call.get("params", {})
            
            # Extract file from params (file_replacements already applied in endpoint.py)
            call_file = params.get("object_name", current_file_context)
            
            # Check for load endpoint
            if "/table/load" in endpoint.lower() or endpoint.endswith("/load"):
                # Update current file context when we see a load call
                current_file_context = call_file
                logger.info(
                    f"🔄 [TABLE] Executing /load for atom {atom_instance_id} with file: {call_file}"
                )
                
                try:
                    # Extract configuration from API call params
                    load_config = params
                    
                    # 🔧 CRITICAL: Always use replacement file (call_file) instead of stored object_name
                    stored_object_name = load_config.get("object_name", "")
                    object_name = call_file if call_file else stored_object_name
                    if call_file and call_file != stored_object_name:
                        logger.info(f"📋 [TABLE] Using replacement file '{object_name}' instead of stored '{stored_object_name}'")
                    
                    # 🔧 CRITICAL: Load column summary for the current file
                    # Also build column mapping for case-insensitive matching
                    # NOTE: We reset column_lookup for each new file load, but preserve it between operations
                    # This ensures operations after a load use the correct column names from that file
                    if object_name:
                        try:
                            from app.features.feature_overview.routes import column_summary
                            column_summary_result = await column_summary(object_name)
                            
                            # Extract columns from column summary
                            summary = column_summary_result.get("summary", [])
                            columns = [item.get("column") for item in summary if item.get("column")]
                            
                            # Build case-insensitive column lookup (lowercase -> original case)
                            # Reset column_lookup for this new file load
                            column_lookup = {}
                            for col in columns:
                                if col and isinstance(col, str):
                                    col_lower = col.lower()
                                    if col_lower not in column_lookup:
                                        column_lookup[col_lower] = col
                            
                            logger.info(f"✅ [TABLE] Loaded {len(columns)} columns for file: {object_name}")
                            logger.info(f"📋 [TABLE] Built column lookup with {len(column_lookup)} mappings: {list(column_lookup.values())[:10]}...")
                        except Exception as e:
                            logger.warning(f"⚠️ [TABLE] Failed to load column summary for file: {e}")
                            column_lookup = {}  # Reset to empty if failed
                    else:
                        column_lookup = {}  # Reset if no object_name
                    
                    # 🔧 CRITICAL: Reuse table_id from configuration during pipeline runs
                    # This keeps the table_id consistent so the frontend can continue using the same ID
                    reuse_table_id = None
                    if current_table_id is None:
                        # First load in this pipeline run - use table_id from configuration
                        reuse_table_id = configuration.get("table_id")
                        if reuse_table_id:
                            logger.info(f"🔄 [TABLE] First load: will reuse table_id from configuration: {reuse_table_id}")
                    else:
                        # Subsequent loads - keep using the current table_id
                        reuse_table_id = current_table_id
                        logger.info(f"🔄 [TABLE] Subsequent load: will reuse current table_id: {reuse_table_id}")
                    
                    # Build TableLoadRequest
                    request = TableLoadRequest(
                        object_name=object_name,
                        atom_id=atom_instance_id,
                        project_id=kwargs.get("project_name"),
                        reuse_table_id=reuse_table_id,
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
                        logger.error(f"❌ [TABLE] Load returned unexpected result type")
                        i += 1
                        continue
                    
                    # Extract table_id from load result
                    table_id = result_dict.get("table_id")
                    if not table_id:
                        logger.error(f"❌ [TABLE] Load did not return table_id")
                        i += 1
                        continue
                    
                    # 🔧 CRITICAL: Build column_lookup from ACTUAL table response columns (not just column_summary)
                    # This ensures we have the exact column names as they appear in the DataFrame
                    actual_columns = result_dict.get("columns", [])
                    if actual_columns:
                        # Rebuild column_lookup with actual columns from the loaded table
                        column_lookup = {}
                        for col in actual_columns:
                            if col and isinstance(col, str):
                                col_lower = col.lower()
                                # Use actual column name from DataFrame (preserves original case)
                                column_lookup[col_lower] = col
                        logger.info(
                            f"📋 [TABLE] Rebuilt column_lookup from actual table columns: "
                            f"{len(column_lookup)} mappings (e.g., {list(column_lookup.items())[:3]})"
                        )
                        # Debug: Check if 'Year' is in the lookup
                        if 'year' in column_lookup:
                            logger.info(f"✅ [TABLE] Column 'Year' found in column_lookup: 'year' -> '{column_lookup['year']}'")
                        else:
                            logger.warning(f"⚠️ [TABLE] Column 'Year' NOT found in column_lookup. Available keys: {sorted(list(column_lookup.keys()))[:10]}...")
                    
                    # Update current table_id
                    current_table_id = table_id
                    
                    # Store table response
                    load_result = result_dict
                    load_results.append(load_result)
                    task_response = load_result  # Update task_response to latest
                    
                    logger.info(f"✅ [TABLE] Load completed successfully, table_id: {table_id}")
                    
                except Exception as e:
                    logger.error(f"❌ Error executing table load: {e}", exc_info=True)
                    # Continue to next sequence instead of failing entirely
                
                i += 1
                
            # Check for save endpoint
            elif "/table/save" in endpoint.lower() or endpoint.endswith("/save"):
                logger.info(
                    f"💾 [TABLE] Executing /save for atom {atom_instance_id}"
                )
                
                save_config = params
                filename = save_config.get("filename")
                
                # 🔧 CRITICAL: ALWAYS override table_id with the one from current load operation
                # The stored params have the old table_id from original execution, but we need
                # to use the new table_id from the replacement file load
                if current_table_id:
                    old_table_id = save_config.get("table_id")
                    save_config["table_id"] = current_table_id
                    if old_table_id and old_table_id != current_table_id:
                        logger.info(
                            f"🔄 [TABLE] Overriding table_id in save from {old_table_id} to {current_table_id} "
                            f"(using new table_id from replacement file load)"
                        )
                
                # Use table_id from current context or params
                save_table_id = save_config.get("table_id", current_table_id)
                if not save_table_id:
                    logger.warning(f"⚠️ [TABLE] Save endpoint found but no table_id available")
                    i += 1
                    continue
                
                if filename:
                    try:
                        # Build TableSaveRequest
                        request = TableSaveRequest(
                            table_id=save_table_id,
                            filename=filename,
                            overwrite_original=save_config.get("overwrite_original", False),
                            use_header_row=save_config.get("use_header_row", False),
                            conditional_format_rules=save_config.get("conditional_format_rules"),
                            metadata=save_config.get("metadata"),
                            atom_id=save_config.get("atom_id", atom_instance_id),
                            project_id=save_config.get("project_id", kwargs.get("project_name")),
                        )
                        
                        # Call save_table endpoint
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
                            logger.warning("⚠️ [TABLE] Save returned unexpected result")
                            save_result_dict = {}
                        
                        save_status = save_result_dict.get("status", "unknown")
                        if save_status == "success":
                            # Extract saved filename from result
                            saved_filename = save_result_dict.get("object_name")
                            overwrite_original = save_config.get("overwrite_original", False)
                            
                            if saved_filename:
                                # CRITICAL: Only add to all_saved_files if it's NOT an overwrite save
                                # Overwrite saves are the same file, not a new derived file
                                # They should NOT be tracked in saved_files to prevent removal from root_files
                                if not overwrite_original:
                                    all_saved_files.append(saved_filename)
                                    logger.info(f"✅ [TABLE] SaveAs completed successfully, saved to: {saved_filename}")
                                else:
                                    logger.info(f"✅ [TABLE] Overwrite save completed successfully, saved to: {saved_filename} (not added to saved_files)")
                                
                                save_results.append(save_result_dict)
                                result_file = saved_filename  # Update result_file to saved file
                            else:
                                logger.info(f"✅ [TABLE] Save completed successfully")
                        else:
                            logger.warning(f"⚠️ [TABLE] Save failed")
                    except Exception as save_error:
                        logger.error(f"❌ Error executing table save: {save_error}", exc_info=True)
                        save_results.append({"status": "failed", "error": str(save_error)})
                else:
                    logger.warning(f"⚠️ [TABLE] Save endpoint found but no filename in params")
                
                i += 1
                
            # Check for other endpoints (update, edit-cell, column ops, etc.)
            else:
                # These operations require table_id from a previous load
                if not current_table_id:
                    logger.warning(f"⚠️ [TABLE] Skipping {endpoint} - no table_id available (load must come first)")
                    i += 1
                    continue
                
                logger.info(
                    f"🔄 [TABLE] Executing {endpoint} for atom {atom_instance_id}"
                )
                
                try:
                    # 🔧 CRITICAL: ALWAYS override table_id with the one from current load operation
                    # The stored params have the old table_id from original execution, but we need
                    # to use the new table_id from the replacement file load
                    old_table_id = params.get("table_id")
                    params["table_id"] = current_table_id
                    if old_table_id and old_table_id != current_table_id:
                        logger.info(
                            f"🔄 [TABLE] Overriding table_id from {old_table_id} to {current_table_id} "
                            f"(using new table_id from replacement file load)"
                        )
                    
                    # Route to appropriate endpoint handler
                    if "/table/update" in endpoint.lower() or endpoint.endswith("/update"):
                        # Build TableUpdateRequest
                        settings_dict = params.get("settings", {})
                        
                        # 🔧 CRITICAL: Map lowercase column names from MongoDB config to actual column names from replacement file
                        # This enables case-insensitive column matching when files are replaced
                        if column_lookup and settings_dict:
                            settings_dict = self._map_table_settings_columns(settings_dict, column_lookup)
                            logger.info(f"📋 [TABLE] Mapped column names in settings using column_lookup")
                        
                        request = TableUpdateRequest(
                            table_id=params.get("table_id", current_table_id),
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
                            logger.info(f"📋 [TABLE] Mapped column '{params.get('column')}' -> '{column}' for edit-cell")
                        
                        # 🔧 CRITICAL: ALWAYS use current_table_id (from replacement file load)
                        # Call edit_cell directly with params
                        result = await edit_cell(
                            table_id=current_table_id,
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
                            logger.info(f"📋 [TABLE] Mapped column '{params.get('column')}' -> '{column}' for delete-column")
                        
                        # 🔧 CRITICAL: ALWAYS use current_table_id (from replacement file load)
                        result = await delete_column(
                            table_id=current_table_id,
                            column=column,
                            atom_id=atom_instance_id,
                            project_id=kwargs.get("project_name"),
                            client_name=kwargs.get("client_name"),
                            app_name=kwargs.get("app_name"),
                            project_name=kwargs.get("project_name"),
                            card_id=card_id,
                            canvas_position=kwargs.get("canvas_position", 0),
                        )
                    
                    elif "/table/insert-column" in endpoint.lower() or endpoint.endswith("/insert-column"):
                        # 🔧 CRITICAL: ALWAYS use current_table_id (from replacement file load)
                        result = await insert_column(
                            table_id=current_table_id,
                            index=params.get("index"),
                            name=params.get("name"),
                            default_value=params.get("default_value"),
                            atom_id=atom_instance_id,
                            project_id=kwargs.get("project_name"),
                            client_name=kwargs.get("client_name"),
                            app_name=kwargs.get("app_name"),
                            project_name=kwargs.get("project_name"),
                            card_id=card_id,
                            canvas_position=kwargs.get("canvas_position", 0),
                        )
                    
                    elif "/table/rename-column" in endpoint.lower() or endpoint.endswith("/rename-column"):
                        # 🔧 CRITICAL: Map column name from lowercase to actual case
                        old_name_original = params.get("old_name")
                        new_name = params.get("new_name")
                        old_name = old_name_original
                        
                        logger.info(
                            f"🔄 [TABLE] Rename operation: '{old_name_original}' -> '{new_name}' "
                            f"(table_id: {current_table_id}, column_lookup available: {bool(column_lookup)})"
                        )
                        
                        if column_lookup and old_name:
                            old_name_lower = old_name.lower() if isinstance(old_name, str) else str(old_name).lower()
                            mapped_old_name = column_lookup.get(old_name_lower, old_name)
                            logger.info(
                                f"📋 [TABLE] Column mapping: '{old_name_original}' (lowercase: '{old_name_lower}') -> '{mapped_old_name}' "
                                f"(column_lookup keys: {list(column_lookup.keys())[:5]}...) "
                                f"(column_lookup values: {list(column_lookup.values())[:5]}...)"
                            )
                            if mapped_old_name != old_name:
                                logger.info(
                                    f"✅ [TABLE] Mapped column name: '{old_name}' -> '{mapped_old_name}' "
                                    f"(using column_lookup from replacement file)"
                                )
                            old_name = mapped_old_name
                        elif not column_lookup:
                            logger.warning(
                                f"⚠️ [TABLE] No column_lookup available for rename operation. "
                                f"Using original column name '{old_name}' as-is."
                            )
                        
                        try:
                            # 🔧 CRITICAL: ALWAYS use current_table_id (from replacement file load), not the old one from params
                            rename_table_id = current_table_id
                            old_table_id_from_params = params.get("table_id")
                            if old_table_id_from_params and old_table_id_from_params != current_table_id:
                                logger.info(
                                    f"🔄 [TABLE] Using current_table_id {current_table_id} for rename "
                                    f"(ignoring old table_id {old_table_id_from_params} from params)"
                                )
                            
                            logger.info(
                                f"🔧 [TABLE] Calling rename_column with: table_id={rename_table_id}, "
                                f"old_name='{old_name}' (original: '{old_name_original}'), new_name='{new_name}'"
                            )
                            
                            result = await rename_column(
                                table_id=rename_table_id,
                                old_name=old_name,
                                new_name=new_name,
                                atom_id=atom_instance_id,
                                project_id=kwargs.get("project_name"),
                                client_name=kwargs.get("client_name"),
                                app_name=kwargs.get("app_name"),
                                project_name=kwargs.get("project_name"),
                                card_id=card_id,
                                canvas_position=kwargs.get("canvas_position", 0),
                            )
                            logger.info(
                                f"✅ [TABLE] Rename operation completed: '{old_name}' -> '{new_name}' "
                                f"on table_id {rename_table_id}"
                            )
                        except Exception as rename_error:
                            logger.error(
                                f"❌ [TABLE] Rename operation failed: '{old_name}' -> '{new_name}'. "
                                f"Error: {rename_error}",
                                exc_info=True
                            )
                            raise  # Re-raise to be caught by outer exception handler
                    
                    elif "/table/round-column" in endpoint.lower() or endpoint.endswith("/round-column"):
                        # 🔧 CRITICAL: Map column name from lowercase to actual case
                        column = params.get("column")
                        if column_lookup and column:
                            column_lower = column.lower() if isinstance(column, str) else str(column).lower()
                            column = column_lookup.get(column_lower, column)
                            logger.info(f"📋 [TABLE] Mapped column '{params.get('column')}' -> '{column}' for round-column")
                        
                        # 🔧 CRITICAL: ALWAYS use current_table_id (from replacement file load)
                        result = await round_column(
                            table_id=current_table_id,
                            column=column,
                            decimal_places=params.get("decimal_places"),
                            atom_id=atom_instance_id,
                            project_id=kwargs.get("project_name"),
                            client_name=kwargs.get("client_name"),
                            app_name=kwargs.get("app_name"),
                            project_name=kwargs.get("project_name"),
                            card_id=card_id,
                            canvas_position=kwargs.get("canvas_position", 0),
                        )
                    
                    elif "/table/retype-column" in endpoint.lower() or endpoint.endswith("/retype-column"):
                        # 🔧 CRITICAL: Map column name from lowercase to actual case
                        column = params.get("column")
                        if column_lookup and column:
                            column_lower = column.lower() if isinstance(column, str) else str(column).lower()
                            column = column_lookup.get(column_lower, column)
                            logger.info(f"📋 [TABLE] Mapped column '{params.get('column')}' -> '{column}' for retype-column")
                        
                        # 🔧 CRITICAL: ALWAYS use current_table_id (from replacement file load)
                        result = await retype_column(
                            table_id=current_table_id,
                            column=column,
                            new_type=params.get("new_type"),
                            atom_id=atom_instance_id,
                            project_id=kwargs.get("project_name"),
                            client_name=kwargs.get("client_name"),
                            app_name=kwargs.get("app_name"),
                            project_name=kwargs.get("project_name"),
                            card_id=card_id,
                            canvas_position=kwargs.get("canvas_position", 0),
                        )
                    
                    elif "/table/transform-case" in endpoint.lower() or endpoint.endswith("/transform-case"):
                        # 🔧 CRITICAL: Map column name from lowercase to actual case
                        column = params.get("column")
                        if column_lookup and column:
                            column_lower = column.lower() if isinstance(column, str) else str(column).lower()
                            column = column_lookup.get(column_lower, column)
                            logger.info(f"📋 [TABLE] Mapped column '{params.get('column')}' -> '{column}' for transform-case")
                        
                        # 🔧 CRITICAL: ALWAYS use current_table_id (from replacement file load)
                        result = await transform_case(
                            table_id=current_table_id,
                            column=column,
                            case_type=params.get("case_type"),
                            atom_id=atom_instance_id,
                            project_id=kwargs.get("project_name"),
                            client_name=kwargs.get("client_name"),
                            app_name=kwargs.get("app_name"),
                            project_name=kwargs.get("project_name"),
                            card_id=card_id,
                            canvas_position=kwargs.get("canvas_position", 0),
                        )
                    
                    elif "/table/duplicate-column" in endpoint.lower() or endpoint.endswith("/duplicate-column"):
                        # 🔧 CRITICAL: Map column name from lowercase to actual case
                        column = params.get("column")
                        if column_lookup and column:
                            column_lower = column.lower() if isinstance(column, str) else str(column).lower()
                            column = column_lookup.get(column_lower, column)
                            logger.info(f"📋 [TABLE] Mapped column '{params.get('column')}' -> '{column}' for duplicate-column")
                        
                        # 🔧 CRITICAL: ALWAYS use current_table_id (from replacement file load)
                        result = await duplicate_column(
                            table_id=current_table_id,
                            column=column,
                            new_name=params.get("new_name"),
                            atom_id=atom_instance_id,
                            project_id=kwargs.get("project_name"),
                            client_name=kwargs.get("client_name"),
                            app_name=kwargs.get("app_name"),
                            project_name=kwargs.get("project_name"),
                            card_id=card_id,
                            canvas_position=kwargs.get("canvas_position", 0),
                        )
                    
                    elif "/table/create-blank" in endpoint.lower() or endpoint.endswith("/create-blank"):
                        result = await create_blank_table(
                            rows=params.get("rows"),
                            columns=params.get("columns"),
                            use_header_row=params.get("use_header_row", False),
                        )
                        # Extract table_id from create-blank result
                        if isinstance(result, dict) and result.get("table_id"):
                            current_table_id = result.get("table_id")
                    
                    else:
                        # Generic handler: Try to call the endpoint function directly if it exists
                        # This handles any endpoints we haven't explicitly coded yet
                        logger.warning(f"⚠️ [TABLE] Unknown endpoint {endpoint}, attempting generic execution")
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
                                logger.warning(f"⚠️ [TABLE] Could not find function for {endpoint}, skipping")
                                i += 1
                                continue
                        except Exception as e:
                            logger.error(f"❌ [TABLE] Failed to execute {endpoint} generically: {e}")
                            i += 1
                            continue
                    
                    # Update table_id if it changed (e.g., from create-blank)
                    if isinstance(result, dict) and result.get("table_id"):
                        current_table_id = result.get("table_id")
                    
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
                    
                    # If this result has table_id, it's a table response - update task_response
                    if result_dict and result_dict.get("table_id"):
                        task_response = result_dict  # Update task_response to latest state
                        logger.info(f"📊 [TABLE] Updated task_response after {endpoint} (table_id: {result_dict.get('table_id')}, rows: {len(result_dict.get('rows', []))})")
                    
                    logger.info(f"✅ [TABLE] Executed {endpoint} successfully")
                    
                except Exception as e:
                    logger.error(f"❌ Error executing table endpoint {endpoint}: {e}", exc_info=True)
                    # Continue with next endpoint instead of failing entire execution
                
                i += 1
        
        # Build additional_results with all collected data
        additional_results = {
            "load_results": load_results,
            "save_results": save_results,
            "saved_files": all_saved_files,
            "table_data": task_response if task_response else (load_results[-1] if load_results else None),
            "column_lookup": column_lookup,
        }
        
        # 🔧 CRITICAL: Always ensure table_data has the latest table_id
        # This is important because table_id might have changed during operations
        if "table_data" in additional_results and additional_results["table_data"] and current_table_id:
            additional_results["table_data"]["table_id"] = current_table_id
        
        # Return success if we had at least one load call
        if load_results:
            return {
                "status": "success",
                "result_file": result_file,
                "message": "Table executed successfully",
                "task_response": task_response,
                "additional_results": additional_results
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


class KPIDashboardExecutor(BaseAtomExecutor):
    """Executor for kpi-dashboard atom.
    
    Handles endpoints:
    - /kpi-dashboard/save-config (save configuration)
    - /kpi-dashboard/get-config (get configuration)
    
    KPI Dashboard stores its configuration in MongoDB's atom_list_configuration collection.
    During pipeline execution, we reload the saved configuration, apply file replacements
    to charts and tables within each box, and RE-EXECUTE them to get updated data.
    """
    
    def get_atom_type(self) -> str:
        return "kpi-dashboard"
    
    async def execute(
        self,
        atom_instance_id: str,
        card_id: str,
        configuration: Dict[str, Any],
        input_files: List[str],
        api_calls: List[Dict[str, Any]],
        **kwargs
    ) -> Dict[str, Any]:
        """Execute kpi-dashboard atom based on API calls from MongoDB."""
        from app.features.kpi_dashboard.mongodb_saver import get_kpi_dashboard_config, save_kpi_dashboard_config
        from app.features.chart_maker.endpoint import generate_chart
        from app.features.chart_maker.schemas import ChartRequest, ChartTrace
        from app.features.chart_maker.service import chart_service
        
        # Get client/app/project from kwargs
        client_name = kwargs.get("client_name", "")
        app_name = kwargs.get("app_name", "")
        project_name = kwargs.get("project_name", "")
        file_replacements = kwargs.get("file_replacements", {})
        
        logger.info(
            f"🔄 KPIDashboard executor: Executing for atom {atom_instance_id} "
            f"(client: {client_name}, app: {app_name}, project: {project_name})"
        )
        logger.info(f"📋 KPIDashboard executor: File replacements: {file_replacements}")
        
        task_response = None
        additional_results = {}
        
        # Check which endpoints were called and build box-specific file mappings
        has_save_config = False
        has_get_config = False
        save_config_endpoint = None
        get_config_endpoint = None
        
        # Build a map of box_id -> file info from per-box API calls
        # This helps apply file replacements correctly during pipeline rerun
        box_file_map = {}
        
        for api_call in api_calls:
            endpoint = api_call.get("endpoint", "")
            params = api_call.get("params", {})
            
            # Check for save-config endpoint
            if "save-config" in endpoint.lower() or "/kpi-dashboard/save-config" in endpoint:
                has_save_config = True
                save_config_endpoint = api_call
            # Check for get-config endpoint
            if "get-config" in endpoint.lower() or "/kpi-dashboard/get-config" in endpoint:
                has_get_config = True
                get_config_endpoint = api_call
            # Check for per-box API calls (chart, table, metric-card)
            if "/kpi-dashboard/box/" in endpoint:
                box_id = params.get("box_id")
                if box_id:
                    element_type = params.get("element_type")
                    if element_type == "chart":
                        box_file_map[box_id] = {
                            "type": "chart",
                            "file_id": params.get("file_id"),
                            "chart_config": params.get("chart_config", {})
                        }
                    elif element_type == "table":
                        box_file_map[box_id] = {
                            "type": "table",
                            "source_file": params.get("source_file"),
                            "table_id": params.get("table_id"),
                            "visible_columns": params.get("visible_columns"),
                            "page_size": params.get("page_size")
                        }
                    elif element_type == "metric-card":
                        box_file_map[box_id] = {
                            "type": "metric-card",
                            "variable_name_key": params.get("variable_name_key"),
                            "metric_value": params.get("metric_value"),
                            "formula": params.get("formula"),
                            "description": params.get("description")
                        }
        
        logger.info(f"📋 KPIDashboard executor: Found {len(box_file_map)} per-box API calls")
        
        # Step 1: Load existing configuration from MongoDB
        existing_config = None
        try:
            existing_config = await get_kpi_dashboard_config(
                client_name=client_name,
                app_name=app_name,
                project_name=project_name,
                atom_id=atom_instance_id
            )
            
            if existing_config:
                logger.info(
                    f"✅ KPIDashboard executor: Loaded existing configuration for atom {atom_instance_id}"
                )
                additional_results["loaded_config"] = True
            else:
                logger.info(
                    f"ℹ️ KPIDashboard executor: No existing configuration found for atom {atom_instance_id}"
                )
                additional_results["loaded_config"] = False
                # Return early if no config
                return {
                    "status": "success",
                    "result_file": None,
                    "message": "No KPI Dashboard configuration found",
                    "task_response": {"status": "success", "has_config": False},
                    "additional_results": additional_results
                }
                
        except Exception as e:
            logger.warning(f"⚠️ KPIDashboard executor: Failed to load configuration: {e}")
            additional_results["loaded_config"] = False
            additional_results["load_error"] = str(e)
            return {
                "status": "failed",
                "result_file": None,
                "message": f"Failed to load KPI Dashboard configuration: {e}",
                "task_response": None,
                "additional_results": additional_results
            }
        
        # Step 2: Apply file replacements and RE-EXECUTE charts and tables
        layouts = existing_config.get("layouts", [])
        updated_layouts = []
        files_replaced = []
        charts_regenerated = []
        tables_reloaded = []
        
        logger.info(
            f"📋 KPIDashboard: Loaded {len(layouts)} layout(s) from existing_config"
        )
        
        # Count elements by type
        chart_count = 0
        table_count = 0
        metric_count = 0
        for layout in layouts:
            for box in layout.get("boxes", []):
                element_type = box.get("elementType")
                if element_type == "chart":
                    chart_count += 1
                elif element_type == "table":
                    table_count += 1
                elif element_type == "metric-card":
                    metric_count += 1
        
        logger.info(
            f"📋 KPIDashboard: Found {chart_count} chart(s), {table_count} table(s), {metric_count} metric-card(s)"
        )
        
        # Get the primary input file for this KPI Dashboard (used when chart doesn't have fileId)
        primary_input_file = input_files[0] if input_files else None
        logger.info(f"📋 KPIDashboard: Primary input file (from input_files): {primary_input_file}")
        logger.info(f"📋 KPIDashboard: File replacements: {file_replacements}")
        
        for layout in layouts:
            updated_layout = layout.copy()
            updated_boxes = []
            
            for box in layout.get("boxes", []):
                updated_box = box.copy()
                box_id = box.get("id")
                
                # Check if we have per-box API call info for this box
                box_api_info = box_file_map.get(box_id, {})
                
                # Handle chart elements - replace file_id and RE-GENERATE chart
                if box.get("elementType") == "chart" and box.get("chartConfig"):
                    chart_config = box.get("chartConfig", {})
                    
                    # Get file_id from: 1) per-box API call, 2) chartConfig, 3) fallback sources
                    original_file_id = None
                    if box_api_info.get("type") == "chart" and box_api_info.get("file_id"):
                        original_file_id = box_api_info.get("file_id")
                        logger.info(f"📊 KPIDashboard: Using file_id from per-box API call: {original_file_id}")
                    else:
                        original_file_id = chart_config.get("fileId") or chart_config.get("file_id")
                    
                    logger.info(
                        f"📊 KPIDashboard: Processing chart box {box_id}, "
                        f"original_file_id: {original_file_id}"
                    )
                    
                    # If chart doesn't have a fileId, try to get it from:
                    # 1. The table's sourceFile in the same KPI Dashboard
                    # 2. The primary input file of the KPI Dashboard
                    if not original_file_id:
                        logger.info(f"📋 KPIDashboard: Chart has no fileId, searching for alternative source...")
                        
                        # Try to find a table's sourceFile in the layouts
                        for search_layout in layouts:
                            for search_box in search_layout.get("boxes", []):
                                if search_box.get("elementType") == "table" and search_box.get("tableSettings"):
                                    table_source = search_box.get("tableSettings", {}).get("sourceFile")
                                    logger.info(f"📋 KPIDashboard: Found table with sourceFile: {table_source}")
                                    if table_source:
                                        original_file_id = table_source
                                        logger.info(f"📋 KPIDashboard: Using table sourceFile as chart file: {original_file_id}")
                                        break
                            if original_file_id:
                                break
                        
                        # If still no file, use primary input file
                        if not original_file_id and primary_input_file:
                            original_file_id = primary_input_file
                            logger.info(f"📋 KPIDashboard: Using primary input file as chart file: {original_file_id}")
                    
                    logger.info(
                        f"📊 KPIDashboard: Final original_file_id for chart: {original_file_id}, "
                        f"file_replacements keys: {list(file_replacements.keys())}"
                    )
                    
                    # Determine the file to use (replacement or original)
                    target_file = original_file_id
                    if original_file_id and original_file_id in file_replacements:
                        target_file = file_replacements[original_file_id]
                        files_replaced.append({
                            "type": "chart",
                            "box_id": box_id,
                            "original": original_file_id,
                            "replacement": target_file
                        })
                        logger.info(
                            f"🔄 KPIDashboard: Replacing chart file {original_file_id} -> {target_file}"
                        )
                    elif original_file_id:
                        # No replacement found, but we have a file - still regenerate with the file
                        # This handles the case where the file is already the replacement file
                        logger.info(f"📋 KPIDashboard: No replacement mapping for {original_file_id}, using as-is")
                    else:
                        logger.warning(f"⚠️ KPIDashboard: No file found for chart in box {box.get('id')}")
                    
                    logger.info(f"📊 KPIDashboard: target_file for chart regeneration: {target_file}")
                    
                    # RE-GENERATE the chart with the target file
                    if target_file:
                        try:
                            # Load dataframe for column mapping
                            column_lookup = {}
                            actual_columns = []
                            try:
                                df = chart_service.get_file(target_file)
                                actual_columns = list(df.columns)
                                column_lookup = {col.lower(): col for col in actual_columns}
                                logger.info(f"📋 KPIDashboard: Loaded dataframe with {len(actual_columns)} columns")
                            except Exception as e:
                                logger.warning(f"⚠️ Could not load dataframe for column mapping: {e}")
                            
                            # Build traces from chart config
                            # KPI Dashboard stores chart config with xAxis, yAxis, type at top level
                            # NOT in a traces array like the chart-maker atom
                            traces = []
                            
                            # Get x and y axis from chart config (KPI Dashboard format)
                            x_axis = chart_config.get("xAxis", "")
                            y_axis = chart_config.get("yAxis", "")
                            second_y_axis = chart_config.get("secondYAxis", "")
                            chart_type_config = chart_config.get("type", "line")
                            aggregation = chart_config.get("aggregation", "sum")
                            legend_field = chart_config.get("legendField")
                            is_advanced_mode = chart_config.get("isAdvancedMode", False)
                            
                            logger.info(
                                f"📊 KPIDashboard: Chart config - xAxis: {x_axis}, yAxis: {y_axis}, "
                                f"secondYAxis: {second_y_axis}, type: {chart_type_config}, "
                                f"isAdvancedMode: {is_advanced_mode}"
                            )
                            
                            # Check if chart has advanced mode traces
                            if is_advanced_mode and chart_config.get("traces"):
                                # Use advanced mode traces
                                for trace_config in chart_config.get("traces", []):
                                    trace_y_axis = trace_config.get("yAxis", "")
                                    trace_name = trace_config.get("name", trace_y_axis)
                                    trace_aggregation = trace_config.get("aggregation", "sum")
                                    trace_filters = trace_config.get("filters", {})
                                    
                                    # Map to actual column names (case-insensitive)
                                    x_column = column_lookup.get(x_axis.lower(), x_axis) if x_axis else ""
                                    y_column = column_lookup.get(trace_y_axis.lower(), trace_y_axis) if trace_y_axis else ""
                                    
                                    if x_column and y_column:
                                        trace = ChartTrace(
                                            x_column=x_column,
                                            y_column=y_column,
                                            name=trace_name,
                                            chart_type=chart_type_config if chart_type_config != "stacked_bar" else "bar",
                                            aggregation=trace_aggregation,
                                            filters=trace_filters if trace_filters else None,
                                        )
                                        traces.append(trace)
                            else:
                                # Simple mode - build traces from xAxis, yAxis, secondYAxis
                                # Map to actual column names (case-insensitive)
                                x_column = column_lookup.get(x_axis.lower(), x_axis) if x_axis else ""
                                y_column = column_lookup.get(y_axis.lower(), y_axis) if y_axis else ""
                                
                                if x_column and y_column:
                                    # Primary trace
                                    trace = ChartTrace(
                                        x_column=x_column,
                                        y_column=y_column,
                                        name=y_axis,
                                        chart_type=chart_type_config if chart_type_config != "stacked_bar" else "bar",
                                        aggregation=aggregation,
                                        legend_field=legend_field if legend_field and legend_field != "aggregate" else None,
                                    )
                                    traces.append(trace)
                                    
                                    # Secondary trace (if secondYAxis is set and not in single axis mode)
                                    dual_axis_mode = chart_config.get("dualAxisMode", "dual")
                                    if second_y_axis and dual_axis_mode != "single":
                                        second_y_column = column_lookup.get(second_y_axis.lower(), second_y_axis) if second_y_axis else ""
                                        if second_y_column:
                                            trace2 = ChartTrace(
                                                x_column=x_column,
                                                y_column=second_y_column,
                                                name=second_y_axis,
                                                chart_type=chart_type_config if chart_type_config != "stacked_bar" else "bar",
                                                aggregation=aggregation,
                                                legend_field=legend_field if legend_field and legend_field != "aggregate" else None,
                                            )
                                            traces.append(trace2)
                            
                            logger.info(f"📊 KPIDashboard: Built {len(traces)} trace(s) for chart")
                            
                            # 🔧 CRITICAL: Reset/remove filters during pipeline rerun
                            # When running pipeline with replacement files, filters from the original file
                            # may not be valid for the new file (different column values, etc.)
                            # So we clear all filters to ensure clean chart regeneration
                            filters = None
                            if chart_config.get("filters"):
                                logger.info(
                                    f"🔄 KPIDashboard: Resetting filters for chart in box {box_id} during pipeline rerun. "
                                    f"Original filters: {list(chart_config.get('filters', {}).keys())}"
                                )
                            
                            # Build chart request
                            chart_type = chart_type_config
                            if chart_type == "stacked_bar":
                                chart_type = "bar"
                            
                            # Only proceed if we have valid traces
                            if not traces:
                                logger.warning(
                                    f"⚠️ KPIDashboard: No valid traces built for chart in box {box_id}. "
                                    f"xAxis: {x_axis}, yAxis: {y_axis}"
                                )
                                charts_regenerated.append({
                                    "box_id": box_id,
                                    "file": target_file,
                                    "status": "skipped",
                                    "reason": "No valid traces (missing xAxis or yAxis)"
                                })
                            else:
                                request = ChartRequest(
                                    file_id=target_file,
                                    chart_type=chart_type,
                                    traces=traces,
                                    title=chart_config.get("title"),
                                    filters=filters,  # Always None - filters are reset during pipeline rerun
                                    validator_atom_id=atom_instance_id,
                                    card_id=card_id,
                                    canvas_position=kwargs.get("canvas_position", 0),
                                    skip_pipeline_recording=True,  # Don't record as separate step - this is part of KPI Dashboard
                                )
                                
                                # Generate chart
                                logger.info(
                                    f"📊 KPIDashboard: Calling generate_chart with file_id={target_file}, "
                                    f"chart_type={chart_type}, traces_count={len(traces)}"
                                )
                                result = await generate_chart(request)
                                
                                logger.info(
                                    f"📊 KPIDashboard: generate_chart returned type={type(result)}, "
                                    f"has_model_dump={hasattr(result, 'model_dump')}, "
                                    f"has_dict={hasattr(result, 'dict')}, "
                                    f"is_dict={isinstance(result, dict)}"
                                )
                                
                                # Convert result to dict
                                if hasattr(result, 'model_dump'):
                                    result_dict = result.model_dump()
                                elif hasattr(result, 'dict'):
                                    result_dict = result.dict()
                                elif isinstance(result, dict):
                                    result_dict = result
                                else:
                                    result_dict = {}
                                
                                logger.info(
                                    f"📊 KPIDashboard: result_dict keys={list(result_dict.keys())}, "
                                    f"has_chart_config={bool(result_dict.get('chart_config'))}, "
                                    f"task_status={result_dict.get('task_status')}"
                                )
                                
                                # Update chart config with new data
                                updated_chart_config = chart_config.copy()
                                updated_chart_config["fileId"] = target_file
                                updated_chart_config["file_id"] = target_file
                                
                                # 🔧 CRITICAL: Reset/clear filters during pipeline rerun
                                # Filters from the original file may not be valid for the replacement file
                                updated_chart_config["filters"] = {}
                                
                                # Merge new chart data into config
                                # CRITICAL: The frontend reads from chartConfig.chartConfig (nested structure)
                                # The API returns chart_config which contains data, traces, chart_type, etc.
                                if result_dict.get("chart_config"):
                                    new_chart_config = result_dict.get("chart_config", {})
                                    # Convert to dict if it's a Pydantic model
                                    if hasattr(new_chart_config, 'model_dump'):
                                        new_chart_config = new_chart_config.model_dump()
                                    elif hasattr(new_chart_config, 'dict'):
                                        new_chart_config = new_chart_config.dict()
                                    
                                    # Update the nested chartConfig with the ENTIRE chart_config from API
                                    updated_chart_config["chartConfig"] = new_chart_config
                                    # Also update filteredData (used by frontend for rendering)
                                    updated_chart_config["filteredData"] = new_chart_config.get("data", [])
                                    # Mark chart as rendered
                                    updated_chart_config["chartRendered"] = True
                                    
                                    logger.info(
                                        f"📊 KPIDashboard: Chart data updated - "
                                        f"data_points: {len(new_chart_config.get('data', []))}, "
                                        f"traces: {len(new_chart_config.get('traces', []))}, "
                                        f"filteredData_count: {len(updated_chart_config.get('filteredData', []))}, "
                                        f"filters_reset: True"
                                    )
                                else:
                                    logger.warning(
                                        f"⚠️ KPIDashboard: generate_chart did not return chart_config! "
                                        f"result_dict keys: {list(result_dict.keys())}"
                                    )
                                
                                updated_box["chartConfig"] = updated_chart_config
                                charts_regenerated.append({
                                    "box_id": box_id,
                                    "file": target_file,
                                    "status": "success",
                                    "filters_reset": True
                                })
                                logger.info(f"✅ KPIDashboard: Regenerated chart for box {box_id} (filters reset)")
                            
                        except Exception as e:
                            logger.error(f"❌ KPIDashboard: Failed to regenerate chart: {e}", exc_info=True)
                            charts_regenerated.append({
                                "box_id": box_id,
                                "file": target_file,
                                "status": "failed",
                                "error": str(e)
                            })
                            # Keep original chart config but update file reference and reset filters
                            updated_chart_config = chart_config.copy()
                            updated_chart_config["fileId"] = target_file
                            updated_chart_config["file_id"] = target_file
                            updated_chart_config["filters"] = {}  # Reset filters even on error
                            updated_box["chartConfig"] = updated_chart_config
                
                # Handle table elements - replace sourceFile and reload table data
                if box.get("elementType") == "table" and box.get("tableSettings"):
                    table_settings = box.get("tableSettings", {})
                    
                    # Get source_file from: 1) per-box API call, 2) tableSettings
                    original_source_file = None
                    if box_api_info.get("type") == "table" and box_api_info.get("source_file"):
                        original_source_file = box_api_info.get("source_file")
                        logger.info(f"📋 KPIDashboard: Using source_file from per-box API call: {original_source_file}")
                    else:
                        original_source_file = table_settings.get("sourceFile")
                    
                    existing_table_id = table_settings.get("tableId") or table_settings.get("tableData", {}).get("table_id")
                    
                    logger.info(
                        f"📋 KPIDashboard: Processing table box {box_id}, "
                        f"original_source_file: {original_source_file}, existing_table_id: {existing_table_id}"
                    )
                    
                    # Determine the file to use (replacement or original)
                    target_file = original_source_file
                    if original_source_file and original_source_file in file_replacements:
                        target_file = file_replacements[original_source_file]
                        files_replaced.append({
                            "type": "table",
                            "box_id": box_id,
                            "original": original_source_file,
                            "replacement": target_file
                        })
                        logger.info(
                            f"🔄 KPIDashboard: Replacing table file {original_source_file} -> {target_file}"
                        )
                    
                    # Reload table data from the target file
                    if target_file:
                        try:
                            # Import table session management
                            from app.features.table.routes import SESSIONS as TABLE_SESSIONS
                            from app.features.table.service import load_table_from_minio, get_column_types
                            import uuid as uuid_module
                            
                            # Load the dataframe from MinIO
                            df, conditional_format_styles, table_metadata = load_table_from_minio(target_file)
                            
                            # Create a new table session directly (without calling the API endpoint)
                            # This avoids recording a separate pipeline step for the table
                            new_table_id = str(uuid_module.uuid4())
                            TABLE_SESSIONS[new_table_id] = df
                            logger.info(f"📋 KPIDashboard: Created new table session {new_table_id} for {target_file}")
                            
                            # Get visible columns from: 1) per-box API call, 2) tableSettings, 3) all columns
                            visible_columns = None
                            if box_api_info.get("type") == "table" and box_api_info.get("visible_columns"):
                                visible_columns = box_api_info.get("visible_columns")
                            else:
                                visible_columns = table_settings.get("visibleColumns", list(df.columns))
                            
                            # Filter to only columns that exist in the new file
                            existing_columns = [col for col in visible_columns if col in df.columns]
                            if not existing_columns:
                                existing_columns = list(df.columns)
                            
                            # Get page_size from: 1) per-box API call, 2) tableSettings
                            page_size = box_api_info.get("page_size") if box_api_info.get("type") == "table" else None
                            if page_size is None:
                                page_size = table_settings.get("pageSize", 50)
                            
                            # Get table data (limited rows for performance)
                            rows = df.head(page_size).to_dicts()
                            
                            # Get column types using the table service function
                            column_types = get_column_types(df)
                            
                            # Update table settings - preserve the tableData structure
                            updated_table_settings = table_settings.copy()
                            updated_table_settings["sourceFile"] = target_file
                            
                            # Build new tableData with the new session ID
                            updated_table_data = {
                                "table_id": new_table_id,
                                "rows": rows,
                                "columns": list(df.columns),
                                "row_count": len(df),
                                "column_types": column_types,
                                "object_name": target_file,
                            }
                            
                            # Include conditional format styles if available
                            if conditional_format_styles:
                                updated_table_data["conditional_format_styles"] = conditional_format_styles
                            
                            updated_table_settings["tableData"] = updated_table_data
                            # Set the new tableId at the settings level
                            updated_table_settings["tableId"] = new_table_id
                            updated_table_settings["visibleColumns"] = existing_columns
                            updated_table_settings["columnOrder"] = existing_columns
                            # Reset to page 1 when data changes
                            updated_table_settings["currentPage"] = 1
                            
                            updated_box["tableSettings"] = updated_table_settings
                            tables_reloaded.append({
                                "box_id": box.get("id"),
                                "file": target_file,
                                "table_id": new_table_id,
                                "rows": len(rows),
                                "total_rows": len(df),
                                "columns": len(existing_columns),
                                "status": "success"
                            })
                            logger.info(
                                f"✅ KPIDashboard: Reloaded table for box {box.get('id')} "
                                f"(table_id: {new_table_id}, {len(rows)} rows displayed, {len(df)} total rows)"
                            )
                            
                        except Exception as e:
                            logger.error(f"❌ KPIDashboard: Failed to reload table: {e}", exc_info=True)
                            tables_reloaded.append({
                                "box_id": box.get("id"),
                                "file": target_file,
                                "status": "failed",
                                "error": str(e)
                            })
                            # Keep original table settings but update file reference
                            updated_table_settings = table_settings.copy()
                            updated_table_settings["sourceFile"] = target_file
                            updated_box["tableSettings"] = updated_table_settings
                
                # Handle metric-card elements - refresh variable values from MongoDB
                if box.get("elementType") == "metric-card":
                    variable_name_key = box.get("variableNameKey") or box.get("variableName")
                    if variable_name_key:
                        try:
                            # Fetch updated variable value from MongoDB
                            from app.features.laboratory.mongodb_saver import get_config_variable_collection
                            
                            collection = get_config_variable_collection()
                            doc_id = f"{client_name}/{app_name}/{project_name}"
                            document = await collection.find_one({"_id": doc_id})
                            
                            if document:
                                variables = document.get("variables", {})
                                # Try to find the variable by variableNameKey or variableName
                                variable_data = variables.get(variable_name_key)
                                
                                if variable_data:
                                    # Update the metric-card with the new value
                                    updated_box["metricValue"] = variable_data.get("value", box.get("metricValue", "0"))
                                    updated_box["value"] = variable_data.get("value", box.get("value", "0"))
                                    updated_box["formula"] = variable_data.get("formula", box.get("formula"))
                                    updated_box["description"] = variable_data.get("description", box.get("description"))
                                    updated_box["updatedAt"] = variable_data.get("updated_at")
                                    
                                    logger.info(
                                        f"✅ KPIDashboard: Updated metric-card '{variable_name_key}' "
                                        f"with value: {variable_data.get('value')}"
                                    )
                                else:
                                    logger.warning(
                                        f"⚠️ KPIDashboard: Variable '{variable_name_key}' not found in MongoDB"
                                    )
                            else:
                                logger.warning(
                                    f"⚠️ KPIDashboard: No variables document found for {doc_id}"
                                )
                        except Exception as e:
                            logger.error(f"❌ KPIDashboard: Failed to fetch variable '{variable_name_key}': {e}")
                
                updated_boxes.append(updated_box)
            
            updated_layout["boxes"] = updated_boxes
            updated_layouts.append(updated_layout)
        
        # Store results
        additional_results["files_replaced"] = files_replaced
        additional_results["charts_regenerated"] = charts_regenerated
        additional_results["tables_reloaded"] = tables_reloaded
        additional_results["layouts"] = updated_layouts
        
        logger.info(
            f"✅ KPIDashboard executor: Processed {len(files_replaced)} file replacement(s), "
            f"{len(charts_regenerated)} chart(s), {len(tables_reloaded)} table(s)"
        )
        
        # Determine the new selectedFile/dataSource based on file replacements
        # Use the first replacement file as the new data source for the settings tab
        new_selected_file = None
        new_data_source = None
        
        if files_replaced:
            # Get the first replacement file (typically the main data source)
            first_replacement = files_replaced[0]
            new_selected_file = first_replacement.get("replacement")
            if new_selected_file:
                # Extract filename from path for dataSource
                new_data_source = new_selected_file.split("/")[-1] if "/" in new_selected_file else new_selected_file
                logger.info(
                    f"📋 KPIDashboard: Updating selectedFile to '{new_selected_file}', dataSource to '{new_data_source}'"
                )
        elif primary_input_file:
            # No replacements, but we have a primary input file - use it
            new_selected_file = primary_input_file
            new_data_source = primary_input_file.split("/")[-1] if "/" in primary_input_file else primary_input_file
        
        # Step 3: Save the updated configuration back to MongoDB
        try:
            kpi_data = {
                "layouts": updated_layouts,
                "title": existing_config.get("title", "KPI Dashboard"),
                "activeLayoutIndex": existing_config.get("activeLayoutIndex", 0),
                "editInteractionsMode": existing_config.get("editInteractionsMode", False),
                "elementInteractions": existing_config.get("elementInteractions", {}),
            }
            
            # Include selectedFile and dataSource if we have them
            if new_selected_file:
                kpi_data["selectedFile"] = new_selected_file
            if new_data_source:
                kpi_data["dataSource"] = new_data_source
            
            save_result = await save_kpi_dashboard_config(
                client_name=client_name,
                app_name=app_name,
                project_name=project_name,
                atom_id=atom_instance_id,
                kpi_dashboard_data=kpi_data,
                user_id="pipeline",
                project_id=None,
                explicit_save=False  # Autosave mode during pipeline
            )
            
            if save_result.get("status") == "success":
                logger.info(
                    f"✅ KPIDashboard executor: Updated configuration saved to MongoDB for atom {atom_instance_id}"
                )
                additional_results["save_result"] = save_result
            else:
                logger.warning(
                    f"⚠️ KPIDashboard executor: Failed to save configuration: {save_result.get('error')}"
                )
                additional_results["save_error"] = save_result.get("error")
                
        except Exception as e:
            logger.error(f"❌ KPIDashboard executor: Error saving configuration: {e}")
            additional_results["save_error"] = str(e)
        
        # Store final kpi_data for frontend (includes selectedFile and dataSource for settings tab)
        additional_results["kpi_data"] = {
            "layouts": updated_layouts,
            "title": existing_config.get("title", "KPI Dashboard"),
        }
        
        # Include selectedFile and dataSource in kpi_data for frontend settings tab update
        if new_selected_file:
            additional_results["kpi_data"]["selectedFile"] = new_selected_file
        if new_data_source:
            additional_results["kpi_data"]["dataSource"] = new_data_source
        
        # Build task response
        task_response = {
            "status": "success",
            "atom_id": atom_instance_id,
            "has_config": True,
            "layouts_count": len(updated_layouts),
            "files_replaced_count": len(files_replaced),
            "charts_regenerated_count": len(charts_regenerated),
            "tables_reloaded_count": len(tables_reloaded),
        }
        
        # Return success
        return {
            "status": "success",
            "result_file": None,  # KPI Dashboard doesn't produce output files
            "message": f"KPI Dashboard updated: {len(charts_regenerated)} chart(s), {len(tables_reloaded)} table(s)",
            "task_response": task_response,
            "additional_results": additional_results
        }


_kpi_dashboard_executor = KPIDashboardExecutor()
register_atom_executor(_kpi_dashboard_executor)


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