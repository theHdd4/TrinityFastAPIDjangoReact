"""Pipeline execution endpoints."""

from fastapi import APIRouter, Query, HTTPException, Body
from typing import Dict, Any, List
import logging
import json
import asyncio

from .schemas import (
    PipelineGetResponse,
    RunPipelineRequest,
    RunPipelineResponse,
    PipelineExecutionDocument,
)
from .service import save_pipeline_execution, get_pipeline_execution, record_atom_execution
from .atom_executors import execute_atom_step, get_atom_executor
from app.features.project_state.routes import get_atom_list_configuration
from app.features.data_upload_validate.app.routes import _background_auto_classify_files, get_object_prefix

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="",
    tags=["Pipeline Execution"]
)


@router.get("/get", response_model=PipelineGetResponse)
async def get_pipeline_data(
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name"),
    mode: str = Query("laboratory", description="Mode (laboratory, workflow, exhibition)")
):
    """Get pipeline execution data for a project.
    
    Returns pipeline execution data including:
    - All cards with their atoms
    - Root files and derived files
    - API calls made for each atom
    - Execution history
    """
    try:
        pipeline_data = await get_pipeline_execution(client_name, app_name, project_name, mode)
        
        if not pipeline_data:
            return PipelineGetResponse(
                status="success",
                data=None,
                message="No pipeline execution data found for this project"
            )
        
        # Convert to response model (new structure)
        pipeline_execution = PipelineExecutionDocument(**pipeline_data)
        
        return PipelineGetResponse(
            status="success",
            data=pipeline_execution
        )
        
    except Exception as e:
        logger.error(f"❌ Error getting pipeline data: {e}")
        return PipelineGetResponse(
            status="error",
            message=str(e)
        )


@router.post("/save")
async def save_pipeline_data(
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name"),
    mode: str = Query("laboratory", description="Mode"),
    pipeline_data: Dict[str, Any] = Body(..., description="Pipeline execution data")
):
    """Save pipeline execution data.
    
    This endpoint should be called after atoms execute to record:
    - Which atoms were executed
    - What APIs were called
    - Input and output files
    - Execution parameters
    """
    try:
        result = await save_pipeline_execution(
            client_name,
            app_name,
            project_name,
            pipeline_data,
            mode
        )
        
        return result
        
    except Exception as e:
        logger.error(f"❌ Error saving pipeline data: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/run", response_model=RunPipelineResponse)
async def run_pipeline(
    request: RunPipelineRequest = Body(..., description="Pipeline execution request")
):
    """Run pipeline by re-executing all atoms per card.
    
    This endpoint:
    1. Retrieves the saved pipeline execution data
    2. Applies root file replacements if specified
    3. Re-executes all atoms in order
    4. Returns execution results
    """
    try:
        # Get saved pipeline data
        pipeline_data = await get_pipeline_execution(
            request.client_name,
            request.app_name,
            request.project_name,
            request.mode
        )
        
        if not pipeline_data:
            return RunPipelineResponse(
                status="error",
                message="No pipeline execution data found. Please execute atoms first to create pipeline data.",
                executed_atoms=0,
                successful_atoms=0,
                failed_atoms=0
            )
        
        # Get current atom list configuration to get atom settings
        atom_config = await get_atom_list_configuration(
            request.client_name,
            request.app_name,
            request.project_name,
            request.mode
        )
        
        if atom_config.get("status") != "success":
            return RunPipelineResponse(
                status="error",
                message="Failed to retrieve atom configuration",
                executed_atoms=0,
                successful_atoms=0,
                failed_atoms=0
            )
        
        # Build file replacement map
        file_replacements = {
            repl.original_file: repl.replacement_file
            for repl in request.file_replacements
            if not repl.keep_original and repl.replacement_file
        }
        
        # Execute pipeline using execution_graph
        execution_log = []
        executed_count = 0
        success_count = 0
        failed_count = 0
        
        pipeline = pipeline_data.get("pipeline", {})
        execution_graph = pipeline.get("execution_graph", [])
        
        # Build map of atom configurations by card and atom
        atom_configs_map = {}
        if "cards" in atom_config:
            for card in atom_config["cards"]:
                card_id = card.get("id")
                for atom in card.get("atoms", []):
                    atom_id = atom.get("id")
                    key = f"{card_id}:{atom_id}"
                    atom_configs_map[key] = atom.get("settings", {})
        
        # Execute atoms in order based on execution_graph
        
        def replace_file_in_config(config_value, file_replacements_map):
            """Recursively replace file paths in configuration values."""
            if isinstance(config_value, str):
                # Replace if this string matches any original file path
                for original, replacement in file_replacements_map.items():
                    if config_value == original:
                        return replacement
                return config_value
            elif isinstance(config_value, dict):
                return {k: replace_file_in_config(v, file_replacements_map) for k, v in config_value.items()}
            elif isinstance(config_value, list):
                return [replace_file_in_config(item, file_replacements_map) for item in config_value]
            else:
                return config_value
        
        for step in execution_graph:
            executed_count += 1
            atom_instance_id = step.get("atom_instance_id")
            card_id = step.get("card_id")
            atom_type = step.get("atom_type")
            atom_title = step.get("atom_title")
            configuration = step.get("configuration", {})
            inputs = step.get("inputs", [])
            
            # Apply file replacements to input files
            updated_input_files = []
            primary_input_file = None
            for input_file in inputs:
                original_key = input_file.get("file_key")
                replacement = file_replacements.get(original_key, original_key)
                updated_input_files.append(replacement)
                if primary_input_file is None:
                    primary_input_file = replacement
            
            # Recursively replace file paths throughout the entire configuration
            updated_config = replace_file_in_config(configuration, file_replacements)
            
            # Ensure critical fields use the replacement file
            if primary_input_file:
                updated_config["file_key"] = primary_input_file
                updated_config["object_names"] = primary_input_file
            
            # Get API calls from step for execution AND frontend access
            api_calls = step.get("api_calls", [])
            
            log_entry = {
                "step_index": step.get("step_index"),
                "atom_instance_id": atom_instance_id,
                "atom_type": atom_type,
                "atom_title": atom_title,
                "card_id": card_id,
                "input_files": updated_input_files,
                "configuration": updated_config,  # Include configuration for frontend
                "api_calls": api_calls,  # Include API calls for frontend restoration
                "status": "pending",
                "message": ""
            }
            
            try:
                # Use generic atom executor system
                
                logger.info(
                    f"🔄 Executing atom {atom_type} ({atom_instance_id}) "
                    f"with replacement file: {primary_input_file}"
                )
                
                # Execute atom step using executor registry
                execution_result = await execute_atom_step(
                    atom_type=atom_type,
                    atom_instance_id=atom_instance_id,
                    card_id=card_id,
                    configuration=updated_config,
                    input_files=updated_input_files,
                    api_calls=api_calls,
                    canvas_position=step.get("canvas_position", 0),
                )
                
                # Process execution result
                if execution_result["status"] == "success":
                    log_entry["status"] = "success"
                    log_entry["message"] = execution_result.get("message", "Atom executed successfully")
                    
                    # Extract result data for frontend
                    result_file = execution_result.get("result_file")
                    task_response = execution_result.get("task_response")
                    additional_results = execution_result.get("additional_results")
                    
                    if result_file:
                        log_entry["result_file"] = result_file
                        logger.info(f"✅ Atom {atom_type} ({atom_instance_id}) created new result file: {result_file}")
                    
                    # Store task response for frontend polling
                    if isinstance(task_response, dict):
                        log_entry["task_response"] = task_response
                        log_entry["task_id"] = task_response.get("task_id")
                        
                        if "row_count" in task_response:
                            log_entry["row_count"] = task_response.get("row_count")
                        if "columns" in task_response:
                            log_entry["columns"] = task_response.get("columns")
                        if "results" in task_response:
                            log_entry["results"] = task_response.get("results")
                    
                    # Handle additional results (like save_result, init_result)
                    if additional_results:
                        save_result = additional_results.get("save_result")
                        if save_result and isinstance(save_result, dict):
                            save_status = save_result.get("task_status", save_result.get("status", "unknown"))
                            if save_status == "success":
                                saved_file = save_result.get("result", {}).get("filename") if isinstance(save_result.get("result"), dict) else save_result.get("filename")
                                if saved_file:
                                    log_entry["message"] += f" | SaveAs completed: {saved_file}"
                            else:
                                log_entry["message"] += " | SaveAs failed"
                        
                        # Include init_result for frontend to update identifiers/measures (for groupby)
                        init_result = additional_results.get("init_result")
                        if init_result and isinstance(init_result, dict):
                            log_entry["init_result"] = init_result
                        
                        # Include identifiers/measures/dimensions for feature-overview (fetched after auto-classification)
                        if additional_results.get("identifiers"):
                            log_entry["identifiers"] = additional_results.get("identifiers")
                        if additional_results.get("measures"):
                            log_entry["measures"] = additional_results.get("measures")
                        if additional_results.get("numeric_measures"):
                            log_entry["numeric_measures"] = additional_results.get("numeric_measures")
                        if additional_results.get("dimensions"):
                            log_entry["dimensions"] = additional_results.get("dimensions")
                        
                        # Include correlation-specific results for frontend
                        if additional_results.get("correlation_results"):
                            log_entry["correlation_results"] = additional_results.get("correlation_results")
                        if additional_results.get("correlation_id"):
                            log_entry["correlation_id"] = additional_results.get("correlation_id")
                        if additional_results.get("filtered_file_path"):
                            log_entry["filtered_file_path"] = additional_results.get("filtered_file_path")
                        if additional_results.get("columns_used"):
                            log_entry["columns_used"] = additional_results.get("columns_used")
                        if additional_results.get("filters_applied"):
                            log_entry["filters_applied"] = additional_results.get("filters_applied")
                        if additional_results.get("date_analysis"):
                            log_entry["date_analysis"] = additional_results.get("date_analysis")
                        
                        # Include merge-specific results for frontend
                        if additional_results.get("merge_results"):
                            log_entry["merge_results"] = additional_results.get("merge_results")
                        if additional_results.get("saved_file"):
                            log_entry["saved_file"] = additional_results.get("saved_file")
                        if additional_results.get("row_count") is not None:
                            log_entry["row_count"] = additional_results.get("row_count")
                        if additional_results.get("columns"):
                            log_entry["columns"] = additional_results.get("columns")
                        if additional_results.get("save_result"):
                            log_entry["save_result"] = additional_results.get("save_result")
                        if additional_results.get("init_result"):
                            log_entry["init_result"] = additional_results.get("init_result")
                        if additional_results.get("common_columns"):
                            log_entry["common_columns"] = additional_results.get("common_columns")
                        if additional_results.get("available_columns"):
                            log_entry["available_columns"] = additional_results.get("available_columns")
                        
                        # Include concat-specific results for frontend
                        if additional_results.get("concat_results"):
                            log_entry["concat_results"] = additional_results.get("concat_results")
                        if additional_results.get("concat_id"):
                            log_entry["concat_id"] = additional_results.get("concat_id")
                        if additional_results.get("saved_file"):
                            log_entry["saved_file"] = additional_results.get("saved_file")
                        if additional_results.get("row_count") is not None:
                            log_entry["row_count"] = additional_results.get("row_count")
                        if additional_results.get("columns"):
                            log_entry["columns"] = additional_results.get("columns")
                        if additional_results.get("save_result"):
                            log_entry["save_result"] = additional_results.get("save_result")
                        if additional_results.get("init_result"):
                            log_entry["init_result"] = additional_results.get("init_result")
                        
                        # Store all additional_results for frontend to access
                        log_entry["additional_results"] = additional_results
                    
                    success_count += 1
                elif execution_result["status"] == "failed":
                    log_entry["status"] = "failed"
                    log_entry["message"] = execution_result.get("message", "Atom execution failed")
                    failed_count += 1
                    logger.error(f"❌ Atom execution failed: {log_entry['message']}")
                else:
                    # Pending or unknown status
                    log_entry["status"] = "success"  # Pending is OK, task is queued
                    log_entry["message"] = execution_result.get("message", "Atom execution queued")
                    success_count += 1
                
            except Exception as e:
                log_entry["status"] = "failed"
                log_entry["message"] = str(e)
                failed_count += 1
                logger.error(f"❌ Error executing atom {atom_type} ({atom_instance_id}): {e}")
            
            execution_log.append(log_entry)
            
            # Trigger auto-classification after each atom execution
            # This ensures new files created by atoms get classified immediately
            try:
                prefix, env, env_source = await get_object_prefix(
                    client_name=request.client_name,
                    app_name=request.app_name,
                    project_name=request.project_name,
                    include_env=True,
                )
                
                # Get list of files for auto-classification
                from app.DataStorageRetrieval.minio_utils import get_client
                from pathlib import Path
                from minio.error import S3Error
                import os
                
                minio_client = get_client()
                MINIO_BUCKET = os.getenv("MINIO_BUCKET", "trinity")
                
                try:
                    objects = list(
                        minio_client.list_objects(
                            MINIO_BUCKET, prefix=prefix, recursive=True
                        )
                    )
                    tmp_prefix = prefix + "tmp/"
                    files = []
                    for obj in sorted(objects, key=lambda o: o.object_name):
                        if not obj.object_name.endswith(".arrow"):
                            continue
                        if obj.object_name.startswith(tmp_prefix):
                            continue
                        last_modified = getattr(obj, "last_modified", None)
                        if last_modified is not None:
                            try:
                                modified_iso = last_modified.isoformat()
                            except Exception:
                                modified_iso = None
                        else:
                            modified_iso = None
                        entry = {
                            "object_name": obj.object_name,
                            "arrow_name": Path(obj.object_name).name,
                            "csv_name": Path(obj.object_name).name,
                        }
                        if modified_iso:
                            entry["last_modified"] = modified_iso
                        size = getattr(obj, "size", None)
                        if isinstance(size, int):
                            entry["size"] = size
                        files.append(entry)
                    
                    # Wait for auto-classification to complete before proceeding to next atom
                    # This ensures classification is available when next atom's /init runs
                    logger.info(f"🔄 Starting auto-classification after atom {atom_type} ({atom_instance_id})")
                    await _background_auto_classify_files(
                        files=files,
                        env=env,
                        client_name=request.client_name,
                        app_name=request.app_name,
                        project_name=request.project_name,
                    )
                    logger.info(f"✅ Auto-classification completed after atom {atom_type} ({atom_instance_id})")
                except S3Error as e:
                    logger.warning(f"⚠️ MinIO error during auto-classification trigger: {e}")
                except Exception as e:
                    logger.warning(f"⚠️ Failed to trigger auto-classification: {e}")
            except Exception as e:
                logger.warning(f"⚠️ Failed to get object prefix for auto-classification: {e}")
            
            logger.info(
                f"🔄 Executed atom {atom_type} ({atom_instance_id}) in card {card_id} "
                f"- Status: {log_entry['status']}"
            )
        
        return RunPipelineResponse(
            status="success",
            message=f"Pipeline execution initiated. {executed_count} atoms queued for execution.",
            executed_atoms=executed_count,
            successful_atoms=success_count,
            failed_atoms=failed_count,
            execution_log=execution_log
        )
        
    except Exception as e:
        logger.error(f"❌ Error running pipeline: {e}")
        return RunPipelineResponse(
            status="error",
            message=str(e),
            executed_atoms=0,
            successful_atoms=0,
            failed_atoms=0
        )

