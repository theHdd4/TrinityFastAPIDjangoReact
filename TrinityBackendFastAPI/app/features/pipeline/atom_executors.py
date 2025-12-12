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
        
        # Get primary input file
        primary_file = input_files[0] if input_files else configuration.get("file_key", "")
        
        # Check which endpoints were called
        has_init = False
        has_run = False
        has_save = False
        init_endpoint = None
        save_endpoint = None
        
        for api_call in api_calls:
            endpoint = api_call.get("endpoint", "")
            # Check for init endpoint
            if endpoint in ["/api/groupby/init", "/groupby/init"] or endpoint.endswith("/init"):
                has_init = True
                init_endpoint = api_call
            # Check for run endpoint (could be atom_execution_start, /groupby/run, etc.)
            if endpoint in ["atom_execution_start", "/api/groupby/run", "/groupby/run"] or ("run" in endpoint.lower() and "init" not in endpoint.lower()):
                has_run = True
            # Check for save endpoint
            if endpoint in ["/api/groupby/save", "/groupby/save"] or endpoint.endswith("/save"):
                has_save = True
                save_endpoint = api_call
        
        result_file = None
        task_response = None
        save_result = None
        init_result = None
        
        # Execute init endpoint if it was called (for replacement files)
        if has_init and init_endpoint:
            logger.info(
                f"🔄 GroupBy executor: Executing /init for atom {atom_instance_id} "
                f"with file: {primary_file}"
            )
            
            try:
                # Extract configuration from API call params
                init_config = init_endpoint.get("params", {})
                bucket_name = configuration.get("bucket_name", init_config.get("bucket_name", "trinity"))
                object_names = init_config.get("object_names", primary_file)
                
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
                    file_key=primary_file,
                )
                
                if init_result.get("status") != "SUCCESS":
                    logger.warning(f"⚠️ GroupBy init returned non-success status: {init_result.get('status')}")
                else:
                    logger.info(f"✅ GroupBy init completed successfully for replacement file: {primary_file}")
                    
            except Exception as e:
                logger.error(f"❌ Error executing groupby init: {e}", exc_info=True)
                # Don't fail the entire execution if init fails, but log it
        
        # Execute run endpoint if it was called
        if has_run:
            logger.info(
                f"🔄 GroupBy executor: Executing /run for atom {atom_instance_id} "
                f"with file: {primary_file}"
            )
            
            # Extract configuration
            identifiers = configuration.get("identifiers", [])
            aggregations = configuration.get("aggregations", {})
            bucket_name = configuration.get("bucket_name", "trinity")
            
            try:
                # Call run_groupby directly
                result = await run_groupby(
                    validator_atom_id=atom_instance_id,
                    file_key=primary_file,
                    bucket_name=bucket_name,
                    object_names=primary_file,
                    identifiers=json.dumps(identifiers),
                    aggregations=json.dumps(aggregations),
                    card_id=card_id,
                    canvas_position=kwargs.get("canvas_position", 0),
                )
                
                if isinstance(result, dict):
                    task_response = result
                    task_status = result.get("task_status", result.get("status", "unknown"))
                    result_file = result.get("result_file")
                    
                    if task_status != "success" or not result_file:
                        return {
                            "status": "failed" if task_status == "failure" else "pending",
                            "result_file": result_file,
                            "message": result.get("detail", "GroupBy execution failed"),
                            "task_response": task_response,
                            "additional_results": None
                        }
                else:
                    return {
                        "status": "failed",
                        "result_file": None,
                        "message": "GroupBy execution returned unexpected result",
                        "task_response": None,
                        "additional_results": None
                    }
                    
            except Exception as e:
                logger.error(f"❌ Error executing groupby run: {e}", exc_info=True)
                return {
                    "status": "failed",
                    "result_file": None,
                    "message": f"Error executing groupby: {str(e)}",
                    "task_response": None,
                    "additional_results": None
                }
        
        # Execute save endpoint if it was called and we have a result file
        if has_save and save_endpoint and result_file:
            logger.info(
                f"💾 GroupBy executor: Executing /save for atom {atom_instance_id} "
                f"with result file: {result_file}"
            )
            
            save_config = save_endpoint.get("params", {})
            filename = save_config.get("filename")
            
            if filename:
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
                            logger.info(f"✅ SaveAs completed successfully for atom {atom_instance_id}")
                        else:
                            logger.warning(f"⚠️ SaveAs failed for atom {atom_instance_id}")
                except Exception as save_error:
                    logger.error(f"❌ Error executing groupby save: {save_error}", exc_info=True)
                    save_result = {"status": "failed", "error": str(save_error)}
            else:
                logger.warning(f"⚠️ Save endpoint found but no filename in params")
        
        return {
            "status": "success",
            "result_file": result_file,
            "message": "GroupBy executed successfully",
            "task_response": task_response,
            "additional_results": {
                "save_result": save_result,
                "init_result": init_result  # Include init result for frontend
            } if (save_result or init_result) else {
                "init_result": init_result
            } if init_result else None
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
        
        # Get primary input file
        primary_file = input_files[0] if input_files else configuration.get("file_key", "")
        
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
                object_names = uniquecount_config.get("object_names", [primary_file])
                
                # Ensure object_names is a list
                if isinstance(object_names, str):
                    object_names = [object_names]
                
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
                        identifiers = [col for col in cfg.get("identifiers", []) if isinstance(col, str)]
                        measures = [col for col in cfg.get("measures", []) if isinstance(col, str)]
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
                object_names = summary_config.get("object_names", [primary_file])
                
                # Ensure object_names is a list
                if isinstance(object_names, str):
                    object_names = [object_names]
                
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
