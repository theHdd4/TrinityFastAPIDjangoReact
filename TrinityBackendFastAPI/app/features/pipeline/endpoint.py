"""Pipeline execution endpoints."""

from fastapi import APIRouter, Query, HTTPException, Body
from typing import Dict, Any, List, Optional
import logging
import json
import asyncio
import os

from .schemas import (
    PipelineGetResponse,
    RunPipelineRequest,
    RunPipelineResponse,
    PipelineExecutionDocument,
)
from .service import save_pipeline_execution, get_pipeline_execution, record_atom_execution, get_pipeline_collection, save_column_operations, save_variable_operations, record_column_operations_execution, record_variable_operations_execution, remove_pipeline_steps_by_card_id, get_priming_steps, save_priming_steps
from .atom_executors import execute_atom_step, get_atom_executor
from app.features.project_state.routes import get_atom_list_configuration
from app.features.data_upload_validate.app.routes import _background_auto_classify_files, get_object_prefix, read_minio_object
from app.features.data_upload_validate import service as data_upload_service
from app.features.data_upload_validate.file_ingestion import RobustFileReader
from app.features.createcolumn.deps import minio_client, MINIO_BUCKET
import pandas as pd
import polars as pl
import io
from pathlib import Path

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
        
        # 🔍 DEBUG: Log what we got from MongoDB
        # logger.info(f"🔍 [DEBUG] Raw pipeline_data keys: {list(pipeline_data.keys())}")
        # logger.info(f"🔍 [DEBUG] pipeline.pipeline exists: {'pipeline' in pipeline_data}")
        # if 'pipeline' in pipeline_data:
        #     logger.info(f"🔍 [DEBUG] pipeline.pipeline keys: {list(pipeline_data.get('pipeline', {}).keys())}")
        #     logger.info(f"🔍 [DEBUG] data_summary exists: {'data_summary' in pipeline_data.get('pipeline', {})}")
        #     logger.info(f"🔍 [DEBUG] data_summary length: {len(pipeline_data.get('pipeline', {}).get('data_summary', []))}")
        
        # Convert to response model (new structure)
        pipeline_execution = PipelineExecutionDocument(**pipeline_data)
        
        # 🔍 DEBUG: Log what Pydantic created
        if pipeline_execution and pipeline_execution.pipeline:
            logger.info(f"🔍 [DEBUG] Pydantic pipeline keys: {list(pipeline_execution.pipeline.model_dump().keys())}")
            logger.info(f"🔍 [DEBUG] Pydantic data_summary length: {len(pipeline_execution.pipeline.data_summary)}")
        
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


@router.post("/save-priming-steps")
async def save_priming_steps_endpoint(
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name"),
    mode: str = Query("laboratory", description="Mode"),
    file_key: str = Body(..., description="File identifier"),
    priming_steps: Dict[str, Any] = Body(..., description="Priming steps data")
):
    """Save priming steps (rename, dtypes, missing values) from guided flow.
    
    This endpoint saves priming operations performed during guided flow
    so they can be applied to replacement files during pipeline execution.
    """
    try:
        logger.info(f"🔍 [save-priming-steps] Received request: client={client_name}, app={app_name}, project={project_name}, file={file_key}")
        logger.info(f"🔍 [save-priming-steps] Priming steps: {priming_steps}")
        
        result = await save_priming_steps(
            client_name,
            app_name,
            project_name,
            file_key,
            priming_steps,
            mode
        )
        
        logger.info(f"🔍 [save-priming-steps] Result: {result}")
        return result
        
    except Exception as e:
        logger.error(f"❌ Error saving priming steps: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/save-column-operations")
async def save_column_operations_endpoint(
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name"),
    mode: str = Query("laboratory", description="Mode"),
    input_file: str = Body(..., description="Input file path"),
    output_file: Optional[str] = Body(None, description="Output file path (if new file created)"),
    overwrite_original: bool = Body(False, description="Whether to overwrite original file"),
    operations: List[Dict[str, Any]] = Body(..., description="List of column operations"),
    created_columns: List[str] = Body(..., description="List of created column names"),
    identifiers: Optional[List[str]] = Body(None, description="Global identifiers for grouping operations")
):
    """Save column operations from metrics tab to pipeline execution.
    
    This endpoint saves global column operations that are not tied to any atom/card.
    These operations will be executed when the pipeline runs.
    """
    try:
        result = await save_column_operations(
            client_name,
            app_name,
            project_name,
            input_file,
            output_file,
            overwrite_original,
            operations,
            created_columns,
            identifiers,
            mode
        )
        
        return result
        
    except Exception as e:
        logger.error(f"❌ Error saving column operations: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/save-variable-operations")
async def save_variable_operations_endpoint(
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name"),
    mode: str = Query("laboratory", description="Mode"),
    input_file: str = Body(..., description="Input file path (data source)"),
    compute_mode: str = Body("whole-dataframe", description="Compute mode: whole-dataframe or within-group"),
    operations: List[Dict[str, Any]] = Body(..., description="List of variable operations"),
    created_variables: List[str] = Body(..., description="List of created variable names"),
    identifiers: Optional[List[str]] = Body(None, description="Identifiers for within-group mode")
):
    """Save variable operations from metrics tab to pipeline execution.
    
    This endpoint saves variable operations that are not tied to any atom/card.
    These operations will be executed when the pipeline runs with replacement files.
    """
    try:
        result = await save_variable_operations(
            client_name,
            app_name,
            project_name,
            input_file,
            compute_mode,
            operations,
            created_variables,
            identifiers,
            mode
        )
        
        return result
        
    except Exception as e:
        logger.error(f"❌ Error saving variable operations: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def _apply_priming_to_replacement_file(
    replacement_file: str,
    priming_steps: Dict[str, Any],
    original_file: str,
    request_client_name: str,
    request_app_name: str,
    request_project_name: str,
    request_mode: str
) -> bool:
    """Apply priming steps to a replacement file.
    
    This is a separate function to avoid Python variable scoping issues
    where later assignments in run_pipeline would shadow module-level imports.
    
    Args:
        replacement_file: The replacement file to apply priming to
        priming_steps: The priming steps to apply
        original_file: The original file (for logging)
        request_client_name: Client name from request
        request_app_name: App name from request
        request_project_name: Project name from request
        request_mode: Mode from request
    
    Returns:
        True if priming was applied successfully, False otherwise
    """
    try:
        # Extract priming step components
        columns_to_drop = priming_steps.get("columns_to_drop", [])
        renames = priming_steps.get("renames", {})
        dtypes = priming_steps.get("dtypes", {})
        missing_values = priming_steps.get("missing_values", {})
        
        # Only apply if there are actual transformations
        has_transformations = (
            len(columns_to_drop) > 0 or
            len(renames) > 0 or
            len(dtypes) > 0 or
            len(missing_values) > 0
        )
        
        if not has_transformations:
            logger.info(
                f"ℹ️ No priming steps to apply for {original_file} (empty transformations)"
            )
            return True
        
        logger.info(
            f"📋 Priming steps to apply: "
            f"{len(columns_to_drop)} drops, "
            f"{len(renames)} renames, "
            f"{len(dtypes)} dtype changes, "
            f"{len(missing_values)} missing value strategies"
        )
        
        # Read file from MinIO
        data = read_minio_object(replacement_file)
        filename = Path(replacement_file).name
        
        # Parse based on file type
        if filename.lower().endswith(".csv") or filename.lower().endswith((".xls", ".xlsx")):
            df_result, _ = RobustFileReader.read_file_to_pandas(
                content=data,
                filename=filename,
                auto_detect_header=True,
                return_raw=False,
            )
            if isinstance(df_result, dict):
                df = list(df_result.values())[0]
            else:
                df = df_result
        elif filename.lower().endswith(".arrow"):
            df_pl = pl.read_ipc(io.BytesIO(data))
            df = df_pl.to_pandas()
        else:
            raise ValueError(f"Unsupported file type: {filename}")
        
        # 1. Drop columns first (before renames)
        if columns_to_drop:
            cols_to_drop_existing = [col for col in columns_to_drop if col in df.columns]
            if cols_to_drop_existing:
                df = df.drop(columns=cols_to_drop_existing)
                logger.info(f"✅ Dropped {len(cols_to_drop_existing)} columns: {cols_to_drop_existing}")
        
        # 2. Apply column renames (after drops)
        if renames:
            valid_renames = {old: new for old, new in renames.items() if old != new and old in df.columns}
            if valid_renames:
                df = df.rename(columns=valid_renames)
                logger.info(f"✅ Renamed {len(valid_renames)} columns: {valid_renames}")
        
        # 3. Apply missing value strategies
        for col_name, strategy_config in missing_values.items():
            if col_name not in df.columns:
                continue
            
            strategy = strategy_config.get("strategy", "none")
            if strategy == "none":
                continue
            elif strategy == "drop":
                df = df.dropna(subset=[col_name])
            elif strategy == "mean":
                if pd.api.types.is_numeric_dtype(df[col_name]):
                    df[col_name].fillna(df[col_name].mean(), inplace=True)
            elif strategy == "median":
                if pd.api.types.is_numeric_dtype(df[col_name]):
                    df[col_name].fillna(df[col_name].median(), inplace=True)
            elif strategy == "mode":
                mode_val = df[col_name].mode()
                if len(mode_val) > 0:
                    df[col_name].fillna(mode_val[0], inplace=True)
            elif strategy == "zero":
                df[col_name].fillna(0, inplace=True)
            elif strategy == "empty":
                df[col_name].fillna("", inplace=True)
            elif strategy == "custom":
                custom_value = strategy_config.get("value", "")
                if pd.api.types.is_numeric_dtype(df[col_name]):
                    numeric_value = pd.to_numeric(custom_value, errors='coerce')
                    if pd.notna(numeric_value):
                        df[col_name].fillna(numeric_value, inplace=True)
                else:
                    df[col_name].fillna(str(custom_value), inplace=True)
            elif strategy == "ffill":
                df[col_name] = df[col_name].ffill()
            elif strategy == "bfill":
                df[col_name] = df[col_name].bfill()
        
        # 4. Apply dtype changes
        for col_name, dtype_config in dtypes.items():
            if col_name not in df.columns:
                continue
            
            if isinstance(dtype_config, dict):
                new_dtype = dtype_config.get('dtype')
                datetime_format = dtype_config.get('format')
            else:
                new_dtype = dtype_config
                datetime_format = None
            
            try:
                if new_dtype == "int64":
                    numeric_col = pd.to_numeric(df[col_name], errors='coerce')
                    df[col_name] = numeric_col.round().astype('Int64')
                elif new_dtype == "float64":
                    df[col_name] = pd.to_numeric(df[col_name], errors='coerce')
                elif new_dtype == "object":
                    df[col_name] = df[col_name].astype(str)
                elif new_dtype == "datetime64":
                    if datetime_format:
                        df[col_name] = pd.to_datetime(df[col_name], format=datetime_format, errors='coerce')
                    else:
                        df[col_name] = pd.to_datetime(df[col_name], errors='coerce')
                elif new_dtype == "bool":
                    df[col_name] = df[col_name].astype(bool)
            except Exception as e:
                logger.warning(f"Could not convert {col_name} to {new_dtype}: {str(e)}")
        
        # Save back to MinIO
        buffer = io.BytesIO()
        if filename.lower().endswith(".csv"):
            df.to_csv(buffer, index=False)
        elif filename.lower().endswith((".xls", ".xlsx")):
            df.to_excel(buffer, index=False)
        elif filename.lower().endswith(".arrow"):
            df_pl_updated = pl.from_pandas(df)
            df_pl_updated.write_ipc(buffer)
        
        buffer.seek(0)
        minio_client.put_object(
            MINIO_BUCKET,
            replacement_file,
            buffer,
            length=buffer.getbuffer().nbytes,
            content_type="application/octet-stream",
        )
        
        logger.info(
            f"✅ Successfully applied priming steps to {replacement_file}: "
            f"{len(columns_to_drop)} drops, "
            f"{len(renames)} renames, "
            f"{len(dtypes)} dtype changes, "
            f"{len(missing_values)} missing value strategies"
        )
        
        # Save priming steps with replacement file as the new file_key
        await save_priming_steps(
            client_name=request_client_name,
            app_name=request_app_name,
            project_name=request_project_name,
            file_key=replacement_file,
            priming_steps=priming_steps,
            mode=request_mode
        )
        logger.info(
            f"💾 Saved priming steps for replacement file {replacement_file}"
        )
        
        return True
        
    except Exception as e:
        logger.warning(
            f"⚠️ Error applying priming steps to {replacement_file}: {e}. "
            f"Continuing with pipeline execution."
        )
        return False


@router.post("/run", response_model=RunPipelineResponse)
async def run_pipeline(
    request: RunPipelineRequest = Body(..., description="Pipeline execution request")
):
    """Run pipeline by re-executing all atoms per card.
    
    This endpoint:
    1. Retrieves the saved pipeline execution data
    2. Clears the pipeline_execution collection for this project
    3. Applies root file replacements if specified
    4. Re-executes all atoms in order
    5. Returns execution results
    """
    try:
        # Build document ID for consistency
        doc_id = f"{request.client_name}/{request.app_name}/{request.project_name}"
        
        # Get saved pipeline data
        pipeline_data = await get_pipeline_execution(
            request.client_name,
            request.app_name,
            request.project_name,
            request.mode
        )
        
        if not pipeline_data:
            # Try to check if document exists but was filtered out
            try:
                coll = await get_pipeline_collection()
                raw_doc = await coll.find_one({"_id": doc_id})
                if raw_doc:
                    logger.error(
                        f"❌ Document exists but get_pipeline_execution returned None for {doc_id}. "
                        f"Document structure: {list(raw_doc.keys())}"
                    )
            except Exception as e:
                logger.debug(f"Could not check raw document: {e}")
            
            logger.warning(
                f"⚠️ No pipeline execution data found for {doc_id}. "
                f"This might happen if column operations were saved but no atoms have been executed yet."
            )
            return RunPipelineResponse(
                status="error",
                message="No pipeline execution data found. Please execute atoms first to create pipeline data.",
                executed_atoms=0,
                successful_atoms=0,
                failed_atoms=0
            )
        
        # Log what we found
        execution_graph = pipeline_data.get('pipeline', {}).get('execution_graph', [])
        column_operations = pipeline_data.get('pipeline', {}).get('column_operations', [])
        logger.info(
            f"📦 Found pipeline execution data for {doc_id}: "
            f"{len(execution_graph)} atoms, {len(column_operations)} column operations"
        )
        
        # Only proceed if we have either atoms or column operations to execute
        if len(execution_graph) == 0 and len(column_operations) == 0:
            logger.warning(f"⚠️ Pipeline data exists but has no atoms or column operations for {doc_id}")
            return RunPipelineResponse(
                status="error",
                message="Pipeline data exists but has no atoms or column operations to execute.",
                executed_atoms=0,
                successful_atoms=0,
                failed_atoms=0
            )
        
        # Clear pipeline_execution collection for this project AFTER we've retrieved the data
        # This ensures new executions replace the old data
        # NOTE: We clear it here so that as atoms execute, they create fresh execution records
        # IMPORTANT: We clear AFTER we've extracted all needed data from pipeline_data
        # CRITICAL: Preserve data_summary section - extract it before deletion
        # Store it in a module-level dict so record_atom_execution can access it
        preserved_data_summary = pipeline_data.get('pipeline', {}).get('data_summary', [])
        if preserved_data_summary:
            logger.info(
                f"💾 Preserving data_summary section with {len(preserved_data_summary)} entries before clearing pipeline"
            )
            # Store in module-level dict for access in record_atom_execution
            if not hasattr(run_pipeline, '_preserved_data_summaries'):
                run_pipeline._preserved_data_summaries = {}
            run_pipeline._preserved_data_summaries[doc_id] = preserved_data_summary
        
        # Extract prime section (priming steps) before deletion for applying to replacement files
        # NOTE: We don't preserve it in module-level dict - instead we save it with replacement file after applying
        preserved_prime = pipeline_data.get('pipeline', {}).get('prime', [])
        if preserved_prime:
            logger.info(
                f"📋 Found prime section with {len(preserved_prime)} entries for applying to replacement files"
            )
        
        # CRITICAL: Preserve column_operations section before deletion
        # Column operations should persist across pipeline reruns (like data_summary)
        preserved_column_operations = pipeline_data.get('pipeline', {}).get('column_operations', [])
        if preserved_column_operations:
            logger.info(
                f"💾 Preserving column_operations section with {len(preserved_column_operations)} entries before clearing pipeline"
            )
            # Store in module-level dict for access in record_column_operations_execution
            if not hasattr(run_pipeline, '_preserved_column_operations'):
                run_pipeline._preserved_column_operations = {}
            run_pipeline._preserved_column_operations[doc_id] = preserved_column_operations
        
        # CRITICAL: Preserve variable_operations section before deletion
        # Variable operations should persist across pipeline reruns (like column_operations)
        preserved_variable_operations = pipeline_data.get('pipeline', {}).get('variable_operations', [])
        if preserved_variable_operations:
            logger.info(
                f"💾 Preserving variable_operations section with {len(preserved_variable_operations)} entries before clearing pipeline"
            )
            # Store in module-level dict for access during variable operations execution
            if not hasattr(run_pipeline, '_preserved_variable_operations'):
                run_pipeline._preserved_variable_operations = {}
            run_pipeline._preserved_variable_operations[doc_id] = preserved_variable_operations
            
            # ========================================================================
            # DELETE WITHIN-GROUP VARIABLES FROM CONFIG_VARIABLE COLLECTION
            # ========================================================================
            # When variable_operations is not empty, delete all variables with
            # compute_mode = 'within-group' from config_variable collection
            # This ensures fresh computation during pipeline run
            try:
                from app.features.laboratory.mongodb_saver import get_config_variable_collection
                
                config_var_collection = get_config_variable_collection()
                config_var_doc_id = f"{request.client_name}/{request.app_name}/{request.project_name}"
                
                # Get existing document
                existing_config_var_doc = await config_var_collection.find_one({"_id": config_var_doc_id})
                
                if existing_config_var_doc:
                    existing_variables = existing_config_var_doc.get("variables", {})
                    
                    # Find and remove variables with compute_mode = 'within-group'
                    variables_to_delete = []
                    for var_name, var_data in existing_variables.items():
                        metadata = var_data.get("metadata", {})
                        if metadata.get("compute_mode") == "within-group":
                            variables_to_delete.append(var_name)
                    
                    if variables_to_delete:
                        # Remove within-group variables from the variables dict
                        for var_name in variables_to_delete:
                            del existing_variables[var_name]
                        
                        # Update the document
                        await config_var_collection.update_one(
                            {"_id": config_var_doc_id},
                            {"$set": {"variables": existing_variables}}
                        )
                        
                        logger.info(
                            f"🗑️ Deleted {len(variables_to_delete)} within-group variable(s) from config_variable: "
                            f"{variables_to_delete[:5]}{'...' if len(variables_to_delete) > 5 else ''}"
                        )
                    else:
                        logger.info(f"ℹ️ No within-group variables found to delete in config_variable")
                else:
                    logger.info(f"ℹ️ No config_variable document found for {config_var_doc_id}")
                    
            except Exception as e:
                logger.warning(f"⚠️ Failed to delete within-group variables from config_variable: {e}")
                # Don't fail the pipeline if this cleanup fails
        
        try:
            coll = await get_pipeline_collection()
            delete_result = await coll.delete_many({"_id": doc_id})
            if delete_result.deleted_count > 0:
                logger.info(
                    f"🗑️ Cleared pipeline_execution data for {doc_id} "
                    f"(deleted {delete_result.deleted_count} document(s))"
                )
            else:
                logger.warning(
                    f"⚠️ Attempted to clear pipeline_execution data for {doc_id} but no documents were deleted"
                )
        except Exception as e:
            logger.warning(f"⚠️ Failed to clear pipeline_execution data: {e}")
            # Don't fail the entire operation if clearing fails - we'll just overwrite
        
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
        
        # ========================================================================
        # UPDATE PRESERVED COLUMN OPERATIONS WITH REPLACEMENT FILES
        # ========================================================================
        # If we have preserved column operations and file replacements, update the input_file
        # in preserved operations to use replacement files
        if file_replacements and preserved_column_operations:
            logger.info(
                f"🔄 Updating {len(preserved_column_operations)} preserved column operations with replacement files"
            )
            for col_op in preserved_column_operations:
                # CRITICAL FIX: Correct overwrite_original flag if it's inconsistent with output_file
                # If output_file exists and is different from input_file, it's a save-as operation
                output_file = col_op.get("output_file")
                input_file = col_op.get("input_file")
                overwrite_original = col_op.get("overwrite_original", True)
                
                # Fix inconsistency: if output_file exists and differs from input_file, it's save-as
                if output_file and output_file != input_file:
                    if overwrite_original:
                        logger.warning(
                            f"⚠️ Fixing inconsistent overwrite_original flag for {input_file}: "
                            f"has output_file={output_file} but overwrite_original=true, setting to false"
                        )
                        col_op["overwrite_original"] = False
                
                original_input_file = col_op.get("original_input_file") or col_op.get("input_file")
                if original_input_file in file_replacements:
                    replacement_file = file_replacements[original_input_file]
                    old_input_file = col_op.get("input_file")
                    col_op["input_file"] = replacement_file
                    logger.info(
                        f"🔄 Updated column operation input_file: {old_input_file} -> {replacement_file} "
                        f"(original: {original_input_file}, output: {col_op.get('output_file')})"
                    )
                    # Ensure original_input_file is preserved
                    if "original_input_file" not in col_op:
                        col_op["original_input_file"] = original_input_file
        
        # ========================================================================
        # APPLY PRIMING STEPS TO REPLACEMENT FILES
        # ========================================================================
        # When replacement files are used, apply the priming steps that were saved
        # for the original files (renames, dtypes, missing values, drop columns)
        # CRITICAL: Use preserved_prime from before pipeline deletion, not database query
        # NOTE: This is done in a separate helper function to avoid Python variable scoping issues
        if file_replacements:
            logger.info(f"🔧 Applying priming steps to {len(file_replacements)} replacement file(s)")
            
            # Build a map of file_key -> priming_steps from preserved_prime
            priming_steps_map = {}
            if preserved_prime:
                for priming_entry in preserved_prime:
                    file_key = priming_entry.get("file_key")
                    if file_key:
                        priming_steps_map[file_key] = priming_entry.get("priming_steps", {})
                logger.info(f"📋 Built priming steps map with {len(priming_steps_map)} entries: {list(priming_steps_map.keys())}")
            
            for original_file, replacement_file in file_replacements.items():
                # Get priming steps for the original file from preserved_prime
                logger.info(
                    f"🔍 Getting priming steps for original file: {original_file}"
                )
                
                # Use preserved priming steps instead of database query
                priming_steps = priming_steps_map.get(original_file)
                
                if priming_steps:
                    logger.info(
                        f"🔧 Applying priming steps from {original_file} to replacement file {replacement_file}"
                    )
                    # Use helper function to avoid variable scoping issues
                    await _apply_priming_to_replacement_file(
                        replacement_file=replacement_file,
                        priming_steps=priming_steps,
                        original_file=original_file,
                        request_client_name=request.client_name,
                        request_app_name=request.app_name,
                        request_project_name=request.project_name,
                        request_mode=request.mode
                    )
                else:
                    logger.info(
                        f"ℹ️ No priming steps found for original file {original_file}"
                    )
        
        # ========================================================================
        # DROP COLUMNS FROM REPLACEMENT FILES THAT MATCH COLUMN OPERATION COLUMNS
        # ========================================================================
        # This ensures column operations can create columns without conflicts
        if file_replacements and column_operations:
            from app.features.createcolumn.deps import get_minio_df
            from app.features.dataframe_operations.app.routes import get_object_prefix as get_df_prefix
            import pyarrow as pa
            import pyarrow.ipc as ipc
            
            prefix = await get_df_prefix(
                client_name=request.client_name,
                app_name=request.app_name,
                project_name=request.project_name
            )
            
            # Build a map of replacement_file -> set of columns that will be created by column operations
            # Column operations have input_file set to the original file name
            columns_to_drop_by_file = {}
            for col_op in column_operations:
                input_file = col_op.get("input_file")
                if not input_file:
                    continue
                
                # Check if this input_file (original file) has a replacement
                if input_file in file_replacements:
                    replacement_file = file_replacements[input_file]
                    
                    # Get all columns that will be created by this column operation
                    created_columns = col_op.get("created_columns", [])
                    operations = col_op.get("operations", [])
                    
                    # Collect all column names (case-insensitive)
                    columns_to_drop = set()
                    for col in created_columns:
                        if col:
                            columns_to_drop.add(str(col).lower().strip())
                            # Also add normalized versions
                            normalized = str(col).lower().strip().replace("_times_", "_x_").replace("_dividedby_", "_div_")
                            if normalized != str(col).lower().strip():
                                columns_to_drop.add(normalized)
                            reverse_normalized = str(col).lower().strip().replace("_x_", "_times_").replace("_div_", "_dividedby_")
                            if reverse_normalized != str(col).lower().strip():
                                columns_to_drop.add(reverse_normalized)
                    
                    for op in operations:
                        created_col = op.get("created_column_name")
                        if created_col:
                            columns_to_drop.add(str(created_col).lower().strip())
                            # Also add normalized versions
                            normalized = str(created_col).lower().strip().replace("_times_", "_x_").replace("_dividedby_", "_div_")
                            if normalized != str(created_col).lower().strip():
                                columns_to_drop.add(normalized)
                            reverse_normalized = str(created_col).lower().strip().replace("_x_", "_times_").replace("_div_", "_dividedby_")
                            if reverse_normalized != str(created_col).lower().strip():
                                columns_to_drop.add(reverse_normalized)
                    
                    if columns_to_drop:
                        if replacement_file not in columns_to_drop_by_file:
                            columns_to_drop_by_file[replacement_file] = set()
                        columns_to_drop_by_file[replacement_file].update(columns_to_drop)
            
            # For each replacement file, drop the conflicting columns
            for replacement_file, columns_to_drop in columns_to_drop_by_file.items():
                try:
                    # Resolve full path
                    full_object_path = (
                        replacement_file
                        if not prefix or replacement_file.startswith(prefix)
                        else f"{prefix}{replacement_file}"
                    )
                    
                    logger.info(
                        f"🔧 Dropping {len(columns_to_drop)} conflicting columns from replacement file: {replacement_file}"
                    )
                    
                    # Load the replacement file
                    df = get_minio_df(MINIO_BUCKET, full_object_path)
                    original_columns = list(df.columns)
                    
                    # Find columns to drop (case-insensitive matching)
                    columns_to_drop_actual = []
                    for col in df.columns:
                        col_lower = str(col).lower().strip()
                        if col_lower in columns_to_drop:
                            columns_to_drop_actual.append(col)
                    
                    if columns_to_drop_actual:
                        logger.info(
                            f"🗑️ Dropping columns from {replacement_file}: {columns_to_drop_actual}"
                        )
                        df = df.drop(columns=columns_to_drop_actual)
                        
                        # Save back to MinIO
                        if full_object_path.endswith(".parquet"):
                            # Save as parquet
                            buffer = io.BytesIO()
                            df.to_parquet(buffer, index=False, engine='pyarrow')
                            buffer.seek(0)
                            minio_client.put_object(
                                MINIO_BUCKET,
                                full_object_path,
                                data=buffer,
                                length=buffer.getbuffer().nbytes,
                                content_type="application/octet-stream"
                            )
                        elif full_object_path.endswith(".arrow"):
                            # Save as arrow
                            table = pa.Table.from_pandas(df)
                            arrow_buffer = pa.BufferOutputStream()
                            with ipc.new_file(arrow_buffer, table.schema) as writer:
                                writer.write_table(table)
                            arrow_bytes = arrow_buffer.getvalue().to_pybytes()
                            minio_client.put_object(
                                MINIO_BUCKET,
                                full_object_path,
                                data=io.BytesIO(arrow_bytes),
                                length=len(arrow_bytes),
                                content_type="application/octet-stream"
                            )
                        else:
                            # Default to CSV
                            buffer = io.BytesIO()
                            df.to_csv(buffer, index=False)
                            buffer.seek(0)
                            minio_client.put_object(
                                MINIO_BUCKET,
                                full_object_path,
                                data=buffer,
                                length=buffer.getbuffer().nbytes,
                                content_type="text/csv"
                            )
                        
                        logger.info(
                            f"✅ Successfully dropped {len(columns_to_drop_actual)} columns from {replacement_file}"
                        )
                    else:
                        logger.info(
                            f"ℹ️ No conflicting columns found in {replacement_file} (columns to drop: {list(columns_to_drop)})"
                        )
                        
                except Exception as e:
                    logger.warning(
                        f"⚠️ Failed to drop columns from replacement file {replacement_file}: {e}. "
                        f"Continuing with pipeline execution."
                    )
                    # Don't fail the entire pipeline if we can't drop columns
        
        # Execute pipeline using execution_graph
        execution_log = []
        executed_count = 0
        success_count = 0
        failed_count = 0
        
        pipeline = pipeline_data.get("pipeline", {})
        execution_graph = pipeline.get("execution_graph", [])
        column_operations = pipeline.get("column_operations", [])
        
        # ========================================================================
        # EXECUTE COLUMN OPERATIONS FIRST
        # ========================================================================
        # Build a map of all files that will be created by atoms (derived files)
        # Include BOTH:
        # 1. Files from outputs array (from previous runs)
        # 2. Files that match patterns indicating they're saved outputs (like "groupby/", "create-data/", etc.)
        # 3. Files that will be created by column operations (save-as operations)
        derived_files = set()
        for step in execution_graph:
            for output in step.get("outputs", []):
                file_key = output.get("file_key")
                if file_key:
                    derived_files.add(file_key)
                    # Also check if this is an explicitly saved file (not default name)
                    if output.get("save_as_name") and not output.get("is_default_name", True):
                        derived_files.add(file_key)
        
        # ADDITIONAL: Any file path containing these patterns is likely a derived file
        # This catches cases where outputs array isn't populated yet
        derived_patterns = ["/groupby/", "/create-data/", "/_processed/", "/_merged/"]
        for col_op in column_operations:
            input_file = col_op.get("input_file", "")
            for pattern in derived_patterns:
                if pattern in input_file:
                    derived_files.add(input_file)
                    break
        
        # CRITICAL: Add files that will be created by column operations (save-as operations)
        # These are derived files too and should be treated as such
        for col_op in column_operations:
            if not col_op.get("overwrite_original", False):
                # This is a save-as operation - it will create a new file
                output_file = col_op.get("output_file")
                if output_file:
                    derived_files.add(output_file)
                    logger.info(f"📋 Added column operation output to derived files: {output_file}")
        
        # Separate column operations into:
        # 1. Operations on root files or existing files (execute immediately)
        # 2. Operations on derived files (execute after the file is created)
        # CRITICAL FIX: Apply file replacements to root_file_keys so that when files are replaced,
        # column operations can correctly identify that the replacement file is still a root file
        root_file_keys_raw = {rf.get("file_key") for rf in pipeline.get("root_files", [])}
        root_file_keys = set()
        for root_file in root_file_keys_raw:
            # Apply file replacements to root file keys
            replacement_file = file_replacements.get(root_file, root_file)
            root_file_keys.add(replacement_file)
            # Also keep the original in case it's referenced elsewhere
            root_file_keys.add(root_file)
        
        # CRITICAL: Build a set of all files that will be created by column operations
        # This is needed to properly categorize chained operations (operation B depends on operation A's output)
        files_created_by_col_ops = set()
        for col_op in column_operations:
            if not col_op.get("overwrite_original", False):
                output_file = col_op.get("output_file")
                if output_file:
                    files_created_by_col_ops.add(output_file)
        
        logger.info(
            f"📋 Files that will be created by column operations: {files_created_by_col_ops}"
        )
        
        immediate_col_ops = []
        deferred_col_ops = {}  # Map of file_key -> list of operations
        
        for col_op in column_operations:
            # Get original input file from config (preserved from initial save)
            # Use original_input_file if available, otherwise fall back to input_file
            original_input_file = col_op.get("original_input_file") or col_op.get("input_file")
            input_file = col_op.get("input_file")
            
            # CRITICAL: When categorizing as immediate vs deferred, check the ORIGINAL input file
            # to determine if it's derived, not the replacement file. The replacement only matters
            # when actually executing the operation.
            # IMPORTANT: Check if this file is derived in multiple ways:
            # 1. It's in the derived_files set (from execution graph outputs OR column operation outputs)
            # 2. It's NOT in root_files (it's not an original uploaded file)
            # 3. It contains certain path patterns that indicate it's a saved/processed file
            is_root_file = original_input_file in root_file_keys
            is_in_derived_set = original_input_file in derived_files
            
            # If it's NOT a root file, treat it as derived (conservative approach)
            # This ensures that any file created by an atom or column operation is properly deferred
            if is_in_derived_set or not is_root_file:
                # Must wait for file to be created - defer this operation
                # Use original_input_file as the key for deferred operations
                if original_input_file not in deferred_col_ops:
                    deferred_col_ops[original_input_file] = []
                deferred_col_ops[original_input_file].append(col_op)
                logger.info(
                    f"📋 Deferred column operation: {original_input_file} (is_root={is_root_file}, is_derived={is_in_derived_set})"
                )
            else:
                # File exists (root file) - can execute immediately
                immediate_col_ops.append(col_op)
                logger.info(
                    f"📋 Immediate column operation: {original_input_file} (is_root={is_root_file})"
                )
        
        # IMPORTANT: Sort immediate_col_ops to ensure correct execution order:
        # 1. Overwrite operations (overwrite_original: true) should execute FIRST
        # 2. Save-as operations (overwrite_original: false) should execute AFTER
        # This ensures that if you have both overwrite and save-as on the same file,
        # the overwrite modifies the file first, then save-as reads the modified file
        immediate_col_ops.sort(key=lambda col_op: (
            col_op.get("input_file", ""),  # Group by input file first
            0 if col_op.get("overwrite_original", True) else 1  # Overwrite (0) before save-as (1)
        ))
        
        logger.info(
            f"📋 Sorted {len(immediate_col_ops)} immediate column operations: "
            f"{sum(1 for op in immediate_col_ops if op.get('overwrite_original', True))} overwrite, "
            f"{sum(1 for op in immediate_col_ops if not op.get('overwrite_original', True))} save-as"
        )
        for idx, col_op in enumerate(immediate_col_ops):
            logger.info(
                f"📋 [COL_OP {idx}] input_file={col_op.get('input_file')}, "
                f"original_input_file={col_op.get('original_input_file')}, "
                f"overwrite={col_op.get('overwrite_original')}, "
                f"output_file={col_op.get('output_file')}, "
                f"operations={[op.get('created_column_name') for op in col_op.get('operations', [])]}"
            )
        
        # Execute immediate column operations
        from app.features.createcolumn.task_service import submit_perform_task, submit_save_task
        from app.features.dataframe_operations.app.routes import get_object_prefix as get_df_prefix
        from app.core.task_queue import format_task_response, task_result_store
        from datetime import datetime
        import time
        import csv
        
        # Track executed column operations to prevent duplicates
        # Key: (original_input_file, created_column_names_tuple, overwrite_original)
        executed_col_ops = set()
        
        # Define MINIO connection variables once for all column operations (immediate and deferred)
        # Use different names to avoid shadowing the module-level imports
        COL_OPS_MINIO_BUCKET = os.getenv("MINIO_BUCKET", "trinity")
        COL_OPS_MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
        COL_OPS_MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minio")
        COL_OPS_MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minio123")
        
        # Calculate object prefix once for all column operations (immediate and deferred)
        prefix = await get_df_prefix(
            client_name=request.client_name,
            app_name=request.app_name,
            project_name=request.project_name
        )
        
        # JSON serializer for datetime objects
        def json_serializer(obj):
            """JSON serializer for objects not serializable by default json code"""
            if isinstance(obj, datetime):
                return obj.isoformat()
            raise TypeError(f"Type {type(obj)} not serializable")
        
        def build_form_items_from_operations(operations_list):
            """Build form_items from operations list, matching MetricsColOps format exactly."""
            form_items = []
            operation_types = []
            operations_added = 0
            
            for op in operations_list:
                op_type = op.get("type")
                op_columns = op.get("columns", [])
                op_rename = op.get("rename")
                op_param = op.get("param")
                
                # Filter out empty columns
                valid_columns = [c for c in op_columns if c]
                if not valid_columns:
                    continue
                
                col_string = ",".join(valid_columns)
                key = f"{op_type}_{operations_added}"
                
                # Handle different operation types with their specific parameters
                # Multi-column operations (add, subtract, multiply, divide, residual)
                if op_type in ["add", "subtract", "multiply", "divide", "residual"]:
                    if len(valid_columns) >= 2:
                        if op_rename:
                            form_items.append((f"{key}_rename", str(op_rename)))
                        form_items.append((key, col_string))
                        operation_types.append(op_type)
                        operations_added += 1
                
                # Single column operations with param (power, lag, lead, diff, rolling_*)
                elif op_type in ["power", "lag", "lead", "diff", "rolling_mean", "rolling_sum", "rolling_min", "rolling_max"]:
                    if op_param:
                        form_items.append((f"{key}_param", str(op_param)))
                    if op_rename:
                        form_items.append((f"{key}_rename", str(op_rename)))
                    form_items.append((key, col_string))
                    operation_types.append(op_type)
                    operations_added += 1
                
                # Growth rate (complex param object)
                elif op_type == "growth_rate":
                    if op_param and isinstance(op_param, dict):
                        if op_param.get("period"):
                            form_items.append((f"{key}_param", str(op_param["period"])))
                        frequency = op_param.get("frequency", "")
                        if frequency and frequency != "none":
                            form_items.append((f"{key}_frequency", frequency))
                        comparison_type = op_param.get("comparison_type")
                        if comparison_type and comparison_type != "period":
                            form_items.append((f"{key}_comparison_type", comparison_type))
                    elif op_param:
                        form_items.append((f"{key}_param", str(op_param)))
                    if op_rename:
                        form_items.append((f"{key}_rename", str(op_rename)))
                    form_items.append((key, col_string))
                    operation_types.append(op_type)
                    operations_added += 1
                
                # Logistic (param as JSON string)
                elif op_type == "logistic":
                    if op_param:
                        if isinstance(op_param, dict):
                            form_items.append((f"{key}_param", json.dumps(op_param)))
                        else:
                            form_items.append((f"{key}_param", str(op_param)))
                    if op_rename:
                        form_items.append((f"{key}_rename", str(op_rename)))
                    form_items.append((key, col_string))
                    operation_types.append(op_type)
                    operations_added += 1
                
                # Detrend/deseasonalize (period parameter)
                elif op_type in ["detrend", "deseasonalize", "detrend_deseasonalize"]:
                    if op_param:
                        form_items.append((f"{key}_period", str(op_param)))
                    if op_rename:
                        form_items.append((f"{key}_rename", str(op_rename)))
                    form_items.append((key, col_string))
                    operation_types.append(op_type)
                    operations_added += 1
                
                # Datetime operations
                elif op_type == "datetime":
                    if op_param:
                        form_items.append((f"{key}_param", str(op_param)))
                    if op_rename:
                        form_items.append((f"{key}_rename", str(op_rename)))
                    form_items.append((key, col_string))
                    operation_types.append(op_type)
                    operations_added += 1
                
                # Fiscal mapping
                elif op_type == "fiscal_mapping":
                    if op_param:
                        form_items.append((f"{key}_param", str(op_param)))
                    # fiscalStartMonth is stored separately in the op dict
                    fiscal_start_month = op.get("fiscalStartMonth", "1")
                    form_items.append((f"{key}_fiscal_start_month", str(fiscal_start_month)))
                    if op_rename:
                        form_items.append((f"{key}_rename", str(op_rename)))
                    form_items.append((key, col_string))
                    operation_types.append(op_type)
                    operations_added += 1
                
                # Filter operations
                elif op_type == "filter_rows_condition":
                    if op_param and isinstance(op_param, dict):
                        for idx, col in enumerate(valid_columns):
                            operator_key = f"{key}_condition_{idx}_operator"
                            value_key = f"{key}_condition_{idx}_value"
                            operator = op_param.get(f"condition_{idx}_operator")
                            value = op_param.get(f"condition_{idx}_value")
                            if operator is not None:
                                form_items.append((operator_key, str(operator)))
                            if value is not None and value != "":
                                form_items.append((value_key, str(value)))
                    form_items.append((key, col_string))
                    operation_types.append(op_type)
                    operations_added += 1
                
                elif op_type == "filter_top_n_per_group":
                    if op_param and isinstance(op_param, dict):
                        if op_param.get("n") is not None:
                            form_items.append((f"{key}_n", str(op_param["n"])))
                        if op_param.get("metric_col"):
                            form_items.append((f"{key}_metric_col", op_param["metric_col"]))
                        if op_param.get("ascending") is not None:
                            form_items.append((f"{key}_ascending", "true" if op_param["ascending"] else "false"))
                    form_items.append((key, col_string))
                    operation_types.append(op_type)
                    operations_added += 1
                
                elif op_type == "filter_percentile":
                    if op_param and isinstance(op_param, dict):
                        if op_param.get("percentile") is not None:
                            form_items.append((f"{key}_percentile", str(op_param["percentile"])))
                        if op_param.get("metric_col"):
                            form_items.append((f"{key}_metric_col", op_param["metric_col"]))
                        if op_param.get("direction"):
                            form_items.append((f"{key}_direction", op_param["direction"]))
                        # Use metric_col as the column value
                        metric_col = op_param.get("metric_col", "")
                        if metric_col:
                            form_items.append((key, metric_col))
                            operation_types.append(op_type)
                            operations_added += 1
                
                # Grouped metrics operations
                elif op_type == "compute_metrics_within_group":
                    if op_param and isinstance(op_param, dict):
                        metric_cols = op_param.get("metric_cols", [])
                        valid_pairs = [p for p in metric_cols if p.get("metric_col") and p.get("method")]
                        if valid_pairs:
                            form_items.append((key, col_string))
                            form_items.append((f"{key}_metric_cols", json.dumps([
                                {"metric_col": p["metric_col"], "method": p["method"], "rename": p.get("rename", "")}
                                for p in valid_pairs
                            ])))
                            operation_types.append(op_type)
                            operations_added += 1
                
                elif op_type == "group_share_of_total":
                    if op_param and isinstance(op_param, dict):
                        metric_cols = op_param.get("metric_cols", [])
                        valid_pairs = [p for p in metric_cols if p.get("metric_col")]
                        if valid_pairs:
                            form_items.append((key, col_string))
                            form_items.append((f"{key}_metric_cols", json.dumps([
                                {"metric_col": p["metric_col"], "rename": p.get("rename", "")}
                                for p in valid_pairs
                            ])))
                            operation_types.append(op_type)
                            operations_added += 1
                
                elif op_type == "group_contribution":
                    if op_param and isinstance(op_param, dict):
                        metric_cols = op_param.get("metric_cols", [])
                        valid_pairs = [p for p in metric_cols if p.get("metric_col")]
                        if valid_pairs:
                            form_items.append((key, col_string))
                            form_items.append((f"{key}_metric_cols", json.dumps([
                                {"metric_col": p["metric_col"], "rename": p.get("rename", "")}
                                for p in valid_pairs
                            ])))
                            operation_types.append(op_type)
                            operations_added += 1
                
                # Rename operation
                elif op_type == "rename":
                    if op_rename:
                        if isinstance(op_rename, dict):
                            # Multiple rename values - join with commas
                            rename_values = [op_rename.get(str(idx), "") for idx in range(len(valid_columns))]
                            rename_str = ",".join([v for v in rename_values if v])
                            if rename_str:
                                form_items.append((f"{key}_rename", rename_str))
                        else:
                            form_items.append((f"{key}_rename", str(op_rename)))
                    form_items.append((key, col_string))
                    operation_types.append(op_type)
                    operations_added += 1
                
                # Fill NA operation
                elif op_type == "fill_na":
                    if op_param and isinstance(op_param, dict):
                        strategy = op_param.get("strategy", "")
                        if strategy:
                            form_items.append((f"{key}_strategy", strategy))
                        if strategy == "custom" and op_param.get("customValue") is not None:
                            form_items.append((f"{key}_customValue", str(op_param["customValue"])))
                    form_items.append((key, col_string))
                    operation_types.append(op_type)
                    operations_added += 1
                
                # Replace operation
                elif op_type == "replace":
                    if op_param and isinstance(op_param, dict):
                        if op_param.get("oldValue") is not None:
                            form_items.append((f"{key}_oldValue", str(op_param["oldValue"])))
                        if op_param.get("newValue") is not None:
                            form_items.append((f"{key}_newValue", str(op_param["newValue"])))
                    form_items.append((key, col_string))
                    operation_types.append(op_type)
                    operations_added += 1
                
                # Default: simple operations (dummy, abs, log, sqrt, exp, etc.)
                else:
                    if op_rename:
                        form_items.append((f"{key}_rename", str(op_rename)))
                    form_items.append((key, col_string))
                    operation_types.append(op_type)
                    operations_added += 1
            
            # Add options and identifiers at the end
            if form_items:
                form_items.append(("options", ",".join(operation_types)))
                form_items.append(("identifiers", ""))  # Empty for now, can be enhanced later
            
            return form_items
        
        def get_col_op_key(col_op: Dict[str, Any]) -> str:
            """Generate a unique key for a column operation to track execution.
            
            Key is based on: original_input_file + created_column_names (lowercase) + overwrite_original
            This ensures we don't execute the same operation twice even if it appears in multiple lists.
            """
            original_input = col_op.get("original_input_file") or col_op.get("input_file") or ""
            overwrite = col_op.get("overwrite_original", True)
            # Get all created column names (lowercase for case-insensitive comparison)
            created_cols = sorted([
                (op.get("created_column_name") or "").lower().strip()
                for op in col_op.get("operations", [])
                if op.get("created_column_name")
            ])
            return f"{original_input}|{','.join(created_cols)}|{overwrite}"
        
        for col_op in immediate_col_ops:
            execution_start_time = datetime.utcnow()
            try:
                # Get original file from config - use original_input_file if available (preserved from initial save),
                # otherwise fall back to input_file (backward compatibility)
                original_input_file = col_op.get("original_input_file") or col_op.get("input_file")
                operations = col_op.get("operations", [])
                overwrite = col_op.get("overwrite_original", False)
                output_file = col_op.get("output_file")
                
                if not operations:
                    logger.warning(f"⚠️ Skipping column operations for {original_input_file}: no operations found")
                    continue
                
                # Check if this operation was already executed (prevent duplicates)
                col_op_key = get_col_op_key(col_op)
                if col_op_key in executed_col_ops:
                    logger.info(
                        f"⏭️ Skipping already executed column operation: {col_op_key}"
                    )
                    continue
                
                # Apply file replacements
                # CRITICAL: If col_op has input_file that's different from original_input_file,
                # it means the file was already replaced in a previous run. Use that as the base,
                # then check file_replacements for any new replacements.
                config_input_file = col_op.get("input_file")
                if config_input_file and config_input_file != original_input_file:
                    # Config already has replacement file from previous run
                    # Check if there's a newer replacement in file_replacements
                    actual_input_file = file_replacements.get(config_input_file, config_input_file)
                else:
                    # Normal case: use original_input_file and check file_replacements
                    actual_input_file = file_replacements.get(original_input_file, original_input_file)
                
                operation_type = "OVERWRITE" if overwrite else "SAVE-AS"
                # logger.info(
                #     f"🔄 Executing column operations ({operation_type}) for file: {original_input_file} "
                #     f"-> {actual_input_file if overwrite else (output_file if output_file else actual_input_file)} "
                #     f"({len(operations)} operations: {[op.get('type') for op in operations]})"
                # )
                
                # Build form_items from operations (same format as MetricsColOps)
                form_items = build_form_items_from_operations(operations)
                
                if not form_items:
                    continue
                
                # Get identifiers from column operations config
                identifiers_list = col_op.get("identifiers")
                identifiers_str = None
                if identifiers_list and isinstance(identifiers_list, list) and len(identifiers_list) > 0:
                    identifiers_str = ",".join(identifiers_list)
                    # Also add identifiers to form_items (backend expects it in form_items too)
                    form_items.append(("identifiers", identifiers_str))
                else:
                    # Empty identifiers if none provided
                    form_items.append(("identifiers", ""))
                
                # Execute perform task (using globally calculated prefix)
                perform_submission = submit_perform_task(
                    bucket_name=COL_OPS_MINIO_BUCKET,
                    object_name=actual_input_file,
                    object_prefix=prefix,
                    identifiers=identifiers_str,  # Pass identifiers for grouping operations
                    form_items=form_items,
                    client_name=request.client_name,
                    app_name=request.app_name,
                    project_name=request.project_name,
                )
                
                # Get task result (tasks run eagerly by default, so result should be available)
                perform_result = None
                if perform_submission.status == "success" and perform_submission.result:
                    # Task completed synchronously
                    perform_result = perform_submission.result
                    if isinstance(perform_result, dict):
                        perform_result.setdefault("status", "SUCCESS")
                elif perform_submission.status == "pending":
                    # Task is async, poll for result
                    max_wait = 60  # 60 seconds max wait
                    wait_interval = 0.5  # Check every 0.5 seconds
                    waited = 0
                    while waited < max_wait:
                        task_meta = task_result_store.fetch(perform_submission.task_id)
                        if task_meta and task_meta.get("status") in ["success", "failure"]:
                            perform_result = task_meta.get("result", {})
                            if task_meta.get("status") == "success":
                                perform_result.setdefault("status", "SUCCESS")
                            else:
                                perform_result = {"status": "FAILURE", "error": task_meta.get("error", "Task failed")}
                            break
                        await asyncio.sleep(wait_interval)
                        waited += wait_interval
                    if not perform_result:
                        perform_result = {"status": "FAILURE", "error": "Task timed out"}
                else:
                    # Task failed
                    perform_result = {"status": "FAILURE", "error": perform_submission.detail or "Task submission failed"}
                
                if not perform_result or perform_result.get("status") != "SUCCESS":
                    # logger.error(f"❌ Column operations failed for {original_input_file}: {perform_result.get('error')}")
                    execution_log.append({
                        "type": "column_operations",
                        "input_file": original_input_file,
                        "status": "failed",
                        "message": perform_result.get("error", "Column operations failed")
                    })
                    failed_count += 1
                    
                    # Record failed execution to MongoDB
                    await record_column_operations_execution(
                        client_name=request.client_name,
                        app_name=request.app_name,
                        project_name=request.project_name,
                        input_file=actual_input_file,  # Use actual file (replacement if replaced)
                        output_file=None,  # None on failure
                        operations=operations,
                        created_columns=col_op.get("created_columns", []),
                        execution_started_at=execution_start_time,
                        execution_completed_at=datetime.utcnow(),
                        execution_status="failed",
                        execution_error=perform_result.get("error", "Column operations failed"),
                        identifiers=col_op.get("identifiers"),
                        original_input_file=original_input_file,  # Pass original for matching
                        mode=request.mode
                    )
                    continue
                
                # Get result file
                result_file = perform_result.get("result_file")
                if not result_file:
                    logger.warning(f"⚠️ No result file from column operations for {input_file}")
                    continue
                
                # Save the result
                if overwrite:
                    # Overwrite original file (use actual_input_file which may be a replacement)
                    output_file = actual_input_file
                else:
                    # Use the output_file from config or generate one
                    output_file = col_op.get("output_file") or result_file
                
                # Get CSV data from results
                results = perform_result.get("results", [])
                if not results:
                    logger.warning(f"⚠️ No results from column operations for {input_file}")
                    continue
                
                # Convert results to CSV (simplified - in production, use proper CSV conversion)
                csv_buffer = io.StringIO()
                if results:
                    fieldnames = list(results[0].keys())
                    writer = csv.DictWriter(csv_buffer, fieldnames=fieldnames)
                    writer.writeheader()
                    writer.writerows(results)
                csv_data = csv_buffer.getvalue()
                
                # Build operation_details in the same format as frontend
                # Frontend sends: { input_file, operations: [{ operation_type, columns, rename, param, created_column_name }] }
                # IMPORTANT: Use actual_input_file (replacement file if file was replaced) so MongoDB
                # correctly records which file was actually processed
                operations_list = col_op.get("operations", [])
                operation_details_dict = {
                    "input_file": actual_input_file,  # Use actual file (replacement if replaced) for accurate MongoDB record
                    "operations": [
                        {
                            "operation_type": op.get("type", ""),
                            "columns": op.get("columns", []),
                            "rename": op.get("rename") if op.get("rename") else None,
                            "param": op.get("param") if op.get("param") else None,
                            "created_column_name": op.get("created_column_name", "")
                        }
                        for op in operations_list
                    ]
                }
                
                # Serialize to JSON string (handles datetime objects by converting to ISO format)
                operation_details_str = json.dumps(operation_details_dict, default=json_serializer)
                
                # Determine the filename to pass to submit_save_task
                # When overwriting, filename must be the FULL file path (e.g., "client/app/project/file.arrow")
                # When saving as new file, filename should be just the filename part (without .arrow)
                if overwrite:
                    # For overwrite, use the full file path (actual_input_file)
                    # save_dataframe_task expects the full path when overwrite_original=True
                    save_filename = actual_input_file
                else:
                    # For save-as, extract just the filename part
                    if output_file:
                        # Remove .arrow extension
                        filename_without_ext = output_file.replace(".arrow", "")
                        # Extract just the filename part (after last /)
                        if "/" in filename_without_ext:
                            # Check if it contains create-data folder
                            if "create-data/" in filename_without_ext:
                                # Extract filename after create-data/
                                filename_without_ext = filename_without_ext.split("create-data/")[-1]
                            else:
                                # Extract filename after last /
                                filename_without_ext = filename_without_ext.split("/")[-1]
                        save_filename = filename_without_ext
                    else:
                        save_filename = "column_ops_result"
                
                # Save the file
                save_submission = submit_save_task(
                    csv_data=csv_data,
                    filename=save_filename,
                    object_prefix=prefix,
                    overwrite_original=overwrite,
                    client_name=request.client_name,
                    app_name=request.app_name,
                    project_name=request.project_name,
                    user_id="pipeline",
                    project_id=None,
                    operation_details=operation_details_str,
                )
                
                # Get save task result
                save_result = None
                if save_submission.status == "success" and save_submission.result:
                    save_result = save_submission.result
                    if isinstance(save_result, dict):
                        save_result.setdefault("status", "SUCCESS")
                elif save_submission.status == "pending":
                    # Poll for async result
                    max_wait = 60
                    wait_interval = 0.5
                    waited = 0
                    while waited < max_wait:
                        task_meta = task_result_store.fetch(save_submission.task_id)
                        if task_meta and task_meta.get("status") in ["success", "failure"]:
                            save_result = task_meta.get("result", {})
                            if task_meta.get("status") == "success":
                                save_result.setdefault("status", "SUCCESS")
                            else:
                                save_result = {"status": "FAILURE", "error": task_meta.get("error", "Task failed")}
                            break
                        await asyncio.sleep(wait_interval)
                        waited += wait_interval
                    if not save_result:
                        save_result = {"status": "FAILURE", "error": "Task timed out"}
                else:
                    save_result = {"status": "FAILURE", "error": save_submission.detail or "Task submission failed"}
                
                if save_result and save_result.get("status") == "SUCCESS":
                    execution_end_time = datetime.utcnow()
                    # logger.info(f"✅ Column operations completed for {input_file} -> {output_file}")
                    execution_log.append({
                        "type": "column_operations",
                        "input_file": input_file,
                        "output_file": output_file,
                        "status": "success",
                        "message": f"Created {len(col_op.get('created_columns', []))} columns"
                    })
                    success_count += 1
                    
                    # Mark this operation as executed to prevent duplicates
                    executed_col_ops.add(col_op_key)
                    
                    # Record execution to MongoDB
                    # When a file is replaced, use the replacement file as input_file
                    # When overwriting, output_file should be None
                    # Pass original_input_file for matching the config, but record actual_input_file
                    await record_column_operations_execution(
                        client_name=request.client_name,
                        app_name=request.app_name,
                        project_name=request.project_name,
                        input_file=actual_input_file,  # Use replacement file if it was replaced
                        output_file=None if overwrite else output_file,  # None for overwrite, actual file for save-as
                        operations=operations,
                        created_columns=col_op.get("created_columns", []),
                        execution_started_at=execution_start_time,
                        execution_completed_at=execution_end_time,
                        execution_status="success",
                        execution_error=None,
                        identifiers=col_op.get("identifiers"),  # Pass identifiers to match config
                        original_input_file=original_input_file,  # Pass original for matching config
                        mode=request.mode
                    )
                    
                    # Update file replacements if overwrite
                    if overwrite:
                        # Map original file to replacement file (or itself if no replacement)
                        file_replacements[original_input_file] = actual_input_file
                    
                    # CRITICAL: If this was a save-as operation, check if there are deferred operations
                    # waiting for this output file and execute them immediately (chained operations)
                    if not overwrite and output_file:
                        logger.info(
                            f"🔍 Checking for chained column operations on newly created file: {output_file}"
                        )
                        
                        # Check if there are deferred operations for this output file
                        if output_file in deferred_col_ops:
                            chained_ops = deferred_col_ops[output_file]
                            logger.info(
                                f"✅ Found {len(chained_ops)} chained column operation(s) for {output_file}, executing now..."
                            )
                            
                            # Execute chained operations immediately
                            # Use the same execution logic as immediate operations
                            for chained_col_op in chained_ops:
                                chained_execution_start_time = datetime.utcnow()
                                try:
                                    # Check if this operation was already executed (prevent duplicates)
                                    chained_col_op_key = get_col_op_key(chained_col_op)
                                    if chained_col_op_key in executed_col_ops:
                                        logger.info(
                                            f"⏭️ Skipping already executed chained column operation: {chained_col_op_key}"
                                        )
                                        continue
                                    
                                    chained_original_input_file = chained_col_op.get("original_input_file") or chained_col_op.get("input_file")
                                    chained_operations = chained_col_op.get("operations", [])
                                    chained_overwrite = chained_col_op.get("overwrite_original", False)
                                    chained_output_file = chained_col_op.get("output_file")
                                    
                                    if not chained_operations:
                                        continue
                                    
                                    # The input file for chained operation is the output file we just created
                                    chained_actual_input_file = output_file
                                    
                                    logger.info(
                                        f"🔄 Executing chained column operation on {chained_actual_input_file}"
                                    )
                                    
                                    # Build form_items
                                    chained_form_items = build_form_items_from_operations(chained_operations)
                                    if not chained_form_items:
                                        continue
                                    
                                    # Get identifiers
                                    chained_identifiers_list = chained_col_op.get("identifiers")
                                    chained_identifiers_str = None
                                    if chained_identifiers_list and isinstance(chained_identifiers_list, list) and len(chained_identifiers_list) > 0:
                                        chained_identifiers_str = ",".join(chained_identifiers_list)
                                        chained_form_items.append(("identifiers", chained_identifiers_str))
                                    else:
                                        chained_form_items.append(("identifiers", ""))
                                    
                                    # Execute perform task
                                    chained_perform_submission = submit_perform_task(
                                        bucket_name=COL_OPS_MINIO_BUCKET,
                                        object_name=chained_actual_input_file,
                                        object_prefix=prefix,
                                        identifiers=chained_identifiers_str,
                                        form_items=chained_form_items,
                                        client_name=request.client_name,
                                        app_name=request.app_name,
                                        project_name=request.project_name,
                                    )
                                    
                                    # Get result (same polling logic)
                                    chained_perform_result = None
                                    if chained_perform_submission.status == "success" and chained_perform_submission.result:
                                        chained_perform_result = chained_perform_submission.result
                                        if isinstance(chained_perform_result, dict):
                                            chained_perform_result.setdefault("status", "SUCCESS")
                                    elif chained_perform_submission.status == "pending":
                                        max_wait = 60
                                        wait_interval = 0.5
                                        waited = 0
                                        while waited < max_wait:
                                            task_meta = task_result_store.fetch(chained_perform_submission.task_id)
                                            if task_meta and task_meta.get("status") in ["success", "failure"]:
                                                chained_perform_result = task_meta.get("result", {})
                                                if task_meta.get("status") == "success":
                                                    chained_perform_result.setdefault("status", "SUCCESS")
                                                else:
                                                    chained_perform_result = {"status": "FAILURE", "error": task_meta.get("error", "Task failed")}
                                                break
                                            await asyncio.sleep(wait_interval)
                                            waited += wait_interval
                                        if not chained_perform_result:
                                            chained_perform_result = {"status": "FAILURE", "error": "Task timed out"}
                                    else:
                                        chained_perform_result = {"status": "FAILURE", "error": chained_perform_submission.detail or "Task submission failed"}
                                    
                                    if not chained_perform_result or chained_perform_result.get("status") != "SUCCESS":
                                        logger.error(f"❌ Chained column operation failed: {chained_perform_result.get('error')}")
                                        failed_count += 1
                                        continue
                                    
                                    # Get result and save (same logic as immediate operations)
                                    chained_result_file = chained_perform_result.get("result_file")
                                    if not chained_result_file:
                                        continue
                                    
                                    chained_final_output_file = chained_actual_input_file if chained_overwrite else (chained_output_file or chained_result_file)
                                    
                                    # Get CSV data
                                    chained_results = chained_perform_result.get("results", [])
                                    if not chained_results:
                                        continue
                                    
                                    chained_csv_buffer = io.StringIO()
                                    chained_fieldnames = list(chained_results[0].keys())
                                    chained_writer = csv.DictWriter(chained_csv_buffer, fieldnames=chained_fieldnames)
                                    chained_writer.writeheader()
                                    chained_writer.writerows(chained_results)
                                    chained_csv_data = chained_csv_buffer.getvalue()
                                    
                                    # Build operation details
                                    chained_operations_list = chained_col_op.get("operations", [])
                                    chained_operation_details_dict = {
                                        "input_file": chained_actual_input_file,
                                        "operations": [
                                            {
                                                "operation_type": op.get("type", ""),
                                                "columns": op.get("columns", []),
                                                "rename": op.get("rename") if op.get("rename") else None,
                                                "param": op.get("param") if op.get("param") else None,
                                                "created_column_name": op.get("created_column_name", "")
                                            }
                                            for op in chained_operations_list
                                        ]
                                    }
                                    chained_operation_details_str = json.dumps(chained_operation_details_dict, default=json_serializer)
                                    
                                    # Determine filename for save
                                    if chained_overwrite:
                                        chained_save_filename = chained_actual_input_file
                                    else:
                                        if chained_output_file:
                                            chained_filename_without_ext = chained_output_file.replace(".arrow", "")
                                            if "/" in chained_filename_without_ext:
                                                if "create-data/" in chained_filename_without_ext:
                                                    chained_filename_without_ext = chained_filename_without_ext.split("create-data/")[-1]
                                                else:
                                                    chained_filename_without_ext = chained_filename_without_ext.split("/")[-1]
                                            chained_save_filename = chained_filename_without_ext
                                        else:
                                            chained_save_filename = "chained_column_ops_result"
                                    
                                    # Save the file
                                    chained_save_submission = submit_save_task(
                                        csv_data=chained_csv_data,
                                        filename=chained_save_filename,
                                        object_prefix=prefix,
                                        overwrite_original=chained_overwrite,
                                        client_name=request.client_name,
                                        app_name=request.app_name,
                                        project_name=request.project_name,
                                        user_id="pipeline",
                                        project_id=None,
                                        operation_details=chained_operation_details_str,
                                    )
                                    
                                    # Get save result (same polling logic)
                                    chained_save_result = None
                                    if chained_save_submission.status == "success" and chained_save_submission.result:
                                        chained_save_result = chained_save_submission.result
                                        if isinstance(chained_save_result, dict):
                                            chained_save_result.setdefault("status", "SUCCESS")
                                    elif chained_save_submission.status == "pending":
                                        max_wait = 60
                                        wait_interval = 0.5
                                        waited = 0
                                        while waited < max_wait:
                                            task_meta = task_result_store.fetch(chained_save_submission.task_id)
                                            if task_meta and task_meta.get("status") in ["success", "failure"]:
                                                chained_save_result = task_meta.get("result", {})
                                                if task_meta.get("status") == "success":
                                                    chained_save_result.setdefault("status", "SUCCESS")
                                                else:
                                                    chained_save_result = {"status": "FAILURE", "error": task_meta.get("error", "Task failed")}
                                                break
                                            await asyncio.sleep(wait_interval)
                                            waited += wait_interval
                                        if not chained_save_result:
                                            chained_save_result = {"status": "FAILURE", "error": "Task timed out"}
                                    else:
                                        chained_save_result = {"status": "FAILURE", "error": chained_save_submission.detail or "Task submission failed"}
                                    
                                    if chained_save_result and chained_save_result.get("status") == "SUCCESS":
                                        chained_execution_end_time = datetime.utcnow()
                                        logger.info(f"✅ Chained column operation completed: {chained_actual_input_file} -> {chained_final_output_file}")
                                        success_count += 1
                                        
                                        # Mark this operation as executed to prevent duplicates
                                        executed_col_ops.add(chained_col_op_key)
                                        
                                        # Record to MongoDB
                                        await record_column_operations_execution(
                                            client_name=request.client_name,
                                            app_name=request.app_name,
                                            project_name=request.project_name,
                                            input_file=chained_actual_input_file,
                                            output_file=None if chained_overwrite else chained_final_output_file,
                                            operations=chained_operations,
                                            created_columns=chained_col_op.get("created_columns", []),
                                            execution_started_at=chained_execution_start_time,
                                            execution_completed_at=chained_execution_end_time,
                                            execution_status="success",
                                            execution_error=None,
                                            identifiers=chained_col_op.get("identifiers"),
                                            original_input_file=chained_original_input_file,
                                            mode=request.mode
                                        )
                                    else:
                                        logger.error(f"❌ Failed to save chained column operation result")
                                        failed_count += 1
                                        
                                except Exception as e:
                                    logger.error(f"❌ Error executing chained column operation: {e}")
                                    failed_count += 1
                            
                            # Remove from deferred_col_ops so we don't execute them again
                            del deferred_col_ops[output_file]
                else:
                    execution_end_time = datetime.utcnow()
                    # logger.error(f"❌ Failed to save column operations result for {input_file}")
                    execution_log.append({
                        "type": "column_operations",
                        "input_file": input_file,
                        "status": "failed",
                        "message": save_result.get("error", "Save failed")
                    })
                    failed_count += 1
                    
                    # Record failed execution to MongoDB
                    await record_column_operations_execution(
                        client_name=request.client_name,
                        app_name=request.app_name,
                        project_name=request.project_name,
                        input_file=actual_input_file,  # Use actual file (replacement if replaced)
                        output_file=None,  # None on failure
                        operations=operations,
                        created_columns=col_op.get("created_columns", []),
                        execution_started_at=execution_start_time,
                        execution_completed_at=execution_end_time,
                        execution_status="failed",
                        execution_error=save_result.get("error", "Save failed"),
                        identifiers=col_op.get("identifiers"),  # Pass identifiers to match config
                        original_input_file=original_input_file,  # Pass original for matching
                        mode=request.mode
                    )
                    
            except Exception as e:
                execution_end_time = datetime.utcnow()
                # logger.error(f"❌ Error executing column operations for {col_op.get('input_file')}: {e}")
                execution_log.append({
                    "type": "column_operations",
                    "input_file": col_op.get("input_file"),
                    "status": "failed",
                    "message": str(e)
                })
                failed_count += 1
                
                # Record failed execution to MongoDB
                # Get original and actual input files
                # Use original_input_file from config if available, otherwise fall back to input_file
                original_input_file_for_error = col_op.get("original_input_file") or col_op.get("input_file")
                actual_input_file_for_error = file_replacements.get(original_input_file_for_error, original_input_file_for_error)
                
                await record_column_operations_execution(
                    client_name=request.client_name,
                    app_name=request.app_name,
                    project_name=request.project_name,
                    input_file=actual_input_file_for_error,  # Use actual file (replacement if replaced)
                    output_file=None,  # None on failure
                    operations=col_op.get("operations", []),
                    created_columns=col_op.get("created_columns", []),
                    execution_started_at=execution_start_time,
                    execution_completed_at=execution_end_time,
                    execution_status="failed",
                    execution_error=str(e),
                    identifiers=col_op.get("identifiers"),  # Pass identifiers to match config
                    original_input_file=original_input_file_for_error,  # Pass original for matching
                    mode=request.mode
                )
        
        # ========================================================================
        # EXECUTE VARIABLE OPERATIONS AFTER COLUMN OPERATIONS
        # ========================================================================
        # Variable operations create variables in MongoDB based on dataframe computations
        # When running pipeline with replacement files, apply same variable operations
        # to the replacement file with the same variable names (overwriting existing)
        # 
        # Similar to column operations, we separate into:
        # 1. Immediate operations (on root files) - execute now
        # 2. Deferred operations (on derived files) - execute after atoms create the files
        
        variable_operations = preserved_variable_operations if preserved_variable_operations else []
        
        # Separate variable operations into immediate and deferred
        immediate_var_ops = []
        deferred_var_ops = {}  # Map of file_key -> list of operations
        
        for var_op in variable_operations:
            original_input_file = var_op.get("original_input_file") or var_op.get("input_file")
            
            # Check if this is a root file or derived file
            is_root_file = original_input_file in root_file_keys
            is_in_derived_set = original_input_file in derived_files
            
            if is_in_derived_set or not is_root_file:
                # Must wait for file to be created - defer this operation
                if original_input_file not in deferred_var_ops:
                    deferred_var_ops[original_input_file] = []
                deferred_var_ops[original_input_file].append(var_op)
                logger.info(
                    f"📋 Deferred variable operation: {original_input_file} (is_root={is_root_file}, is_derived={is_in_derived_set})"
                )
            else:
                # File exists (root file) - can execute immediately
                immediate_var_ops.append(var_op)
                logger.info(
                    f"📋 Immediate variable operation: {original_input_file} (is_root={is_root_file})"
                )
        
        # Helper function to execute a single variable operation
        async def execute_variable_operation(var_op: Dict[str, Any], file_replacements_map: Dict[str, str]) -> Dict[str, Any]:
            """Execute a single variable operation and return result info."""
            from app.features.laboratory.routes import compute_variables
            from app.features.laboratory.models import VariableComputeRequest, VariableOperation
            
            original_input_file = var_op.get("original_input_file") or var_op.get("input_file")
            compute_mode = var_op.get("compute_mode", "whole-dataframe")
            operations = var_op.get("operations", [])
            identifiers = var_op.get("identifiers")
            
            if not operations:
                return {
                    "status": "skipped",
                    "message": "No operations found",
                    "original_input_file": original_input_file
                }
            
            # Apply file replacements - use replacement file if available
            actual_input_file = file_replacements_map.get(original_input_file, original_input_file)
            
            logger.info(
                f"🔄 Executing variable operations for file: {original_input_file} -> {actual_input_file} "
                f"(compute_mode: {compute_mode}, {len(operations)} operations)"
            )
            
            # Build the request model
            operation_inputs = [
                VariableOperation(
                    id=op.get("id", str(idx)),
                    numericalColumn=op.get("numericalColumn"),
                    method=op.get("method"),
                    secondColumn=op.get("secondColumn"),
                    secondValue=op.get("secondValue"),
                    customName=op.get("customName"),
                )
                for idx, op in enumerate(operations)
            ]
            
            compute_request = VariableComputeRequest(
                dataSource=actual_input_file,
                computeMode=compute_mode,
                identifiers=identifiers if compute_mode == "within-group" else None,
                operations=operation_inputs,
                client_name=request.client_name,
                app_name=request.app_name,
                project_name=request.project_name,
                confirmOverwrite=True,  # Always overwrite existing variables during pipeline run
            )
            
            # Call the compute_variables function directly
            result = await compute_variables(compute_request)
            
            if result.success:
                created_vars = result.new_columns or []
                logger.info(
                    f"✅ Variable operations completed for {actual_input_file}: "
                    f"created/updated {len(created_vars)} variable(s)"
                )
                
                # Record variable operations execution to MongoDB
                await record_variable_operations_execution(
                    client_name=request.client_name,
                    app_name=request.app_name,
                    project_name=request.project_name,
                    input_file=actual_input_file,
                    compute_mode=compute_mode,
                    operations=operations,
                    created_variables=created_vars,
                    execution_status="success",
                    execution_error=None,
                    identifiers=identifiers,
                    original_input_file=original_input_file,
                    mode=request.mode
                )
                
                return {
                    "status": "success",
                    "message": f"Created/updated {len(created_vars)} variable(s)",
                    "created_variables": created_vars,
                    "original_input_file": original_input_file,
                    "actual_input_file": actual_input_file
                }
            else:
                error_msg = result.error or "Variable operations failed"
                logger.error(f"❌ Variable operations failed for {actual_input_file}: {error_msg}")
                
                # Record failed variable operations execution to MongoDB
                await record_variable_operations_execution(
                    client_name=request.client_name,
                    app_name=request.app_name,
                    project_name=request.project_name,
                    input_file=actual_input_file,
                    compute_mode=compute_mode,
                    operations=operations,
                    created_variables=[],
                    execution_status="failed",
                    execution_error=error_msg,
                    identifiers=identifiers,
                    original_input_file=original_input_file,
                    mode=request.mode
                )
                
                return {
                    "status": "failed",
                    "message": error_msg,
                    "original_input_file": original_input_file,
                    "actual_input_file": actual_input_file
                }
        
        # Execute immediate variable operations (on root files)
        if immediate_var_ops:
            logger.info(
                f"📊 Executing {len(immediate_var_ops)} immediate variable operation config(s)"
            )
            
            for var_op in immediate_var_ops:
                try:
                    result_info = await execute_variable_operation(var_op, file_replacements)
                    
                    if result_info["status"] == "success":
                        execution_log.append({
                            "type": "variable_operations",
                            "input_file": result_info.get("actual_input_file"),
                            "original_input_file": result_info.get("original_input_file"),
                            "status": "success",
                            "message": result_info.get("message"),
                            "created_variables": result_info.get("created_variables", [])
                        })
                        success_count += 1
                    elif result_info["status"] == "failed":
                        execution_log.append({
                            "type": "variable_operations",
                            "input_file": result_info.get("actual_input_file"),
                            "original_input_file": result_info.get("original_input_file"),
                            "status": "failed",
                            "message": result_info.get("message")
                        })
                        failed_count += 1
                        
                except Exception as e:
                    logger.error(f"❌ Error executing variable operations for {var_op.get('input_file')}: {e}")
                    execution_log.append({
                        "type": "variable_operations",
                        "input_file": var_op.get("input_file"),
                        "status": "failed",
                        "message": str(e)
                    })
                    failed_count += 1
                    
                    # Record failed variable operations execution to MongoDB
                    await record_variable_operations_execution(
                        client_name=request.client_name,
                        app_name=request.app_name,
                        project_name=request.project_name,
                        input_file=var_op.get("input_file", ""),
                        compute_mode=var_op.get("compute_mode", "whole-dataframe"),
                        operations=var_op.get("operations", []),
                        created_variables=[],
                        execution_status="failed",
                        execution_error=str(e),
                        identifiers=var_op.get("identifiers"),
                        original_input_file=var_op.get("original_input_file") or var_op.get("input_file"),
                        mode=request.mode
                    )
        
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
                # For pivot-table atoms, also update data_source
                if atom_type == "pivot-table":
                    updated_config["data_source"] = primary_input_file
            
            # Get API calls from step for execution AND frontend access
            api_calls = step.get("api_calls", [])
            
            # For groupby, merge, concat, pivot-table, and table atoms, apply file replacements to each API call's params
            # This ensures each API call uses the correct replacement file based on the original file used
            # This is critical because these atoms can have multiple API calls with different input files
            if atom_type in ["groupby-wtg-avg", "merge", "concat", "pivot-table", "table"] or atom_type.startswith("groupby"):
                updated_api_calls = []
                for api_call in api_calls:
                    # Create a copy to avoid modifying the original
                    updated_call = api_call.copy()
                    params = updated_call.get("params", {}).copy()
                    
                    # Apply file replacements to file-related params
                    # Check multiple possible param keys that might contain file paths
                    # CRITICAL: Include "filename" for table/save endpoint which uses filename param for overwrite saves
                    file_param_keys = ["object_names", "file_key", "object_name", "source_object", "data_source", 
                                     "input_file", "input_files", "file1", "file2", "left_file", "right_file", "filename"]
                    for key in file_param_keys:
                        if key in params:
                            original_file = params[key]
                            # Handle both string and list of strings
                            if isinstance(original_file, str):
                                replacement = file_replacements.get(original_file, original_file)
                                if replacement != original_file:
                                    params[key] = replacement
                                    logger.info(
                                        f"🔄 [{atom_type.upper()}] Applied file replacement in API call '{updated_call.get('endpoint', '')}': "
                                        f"{original_file} -> {replacement} (param: {key})"
                                    )
                            elif isinstance(original_file, list):
                                # Replace each file in the list
                                replaced_list = []
                                for file_item in original_file:
                                    if isinstance(file_item, str):
                                        replacement = file_replacements.get(file_item, file_item)
                                        replaced_list.append(replacement)
                                        if replacement != file_item:
                                            logger.info(
                                                f"🔄 [{atom_type.upper()}] Applied file replacement in API call '{updated_call.get('endpoint', '')}': "
                                                f"{file_item} -> {replacement} (param: {key}[{original_file.index(file_item)}])"
                                            )
                                    else:
                                        replaced_list.append(file_item)
                                params[key] = replaced_list
                    
                    updated_call["params"] = params
                    updated_api_calls.append(updated_call)
                
                api_calls = updated_api_calls
            
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
                
                # logger.info(
                #     f"🔄 Executing atom {atom_type} ({atom_instance_id}) "
                #     f"with replacement file: {primary_input_file}"
                # )
                
                # Execute atom step using executor registry
                execution_result = await execute_atom_step(
                    atom_type=atom_type,
                    atom_instance_id=atom_instance_id,
                    card_id=card_id,
                    configuration=updated_config,
                    input_files=updated_input_files,
                    api_calls=api_calls,
                    canvas_position=step.get("canvas_position", 0),
                    client_name=request.client_name,
                    app_name=request.app_name,
                    project_name=request.project_name,
                    file_replacements=file_replacements,
                )
                
                # Process execution result
                if execution_result["status"] == "success":
                    log_entry["status"] = "success"
                    log_entry["message"] = execution_result.get("message", "Atom executed successfully")
                    
                    # Extract result data for frontend
                    result_file = execution_result.get("result_file")
                    task_response = execution_result.get("task_response")
                    additional_results = execution_result.get("additional_results")
                    
                    # 🔧 CRITICAL: Update log_entry with latest input file (for groupby/merge/concat/pivot/table)
                    # Find the replacement file for the latest original file that was in the canvas
                    if atom_type in ["groupby-wtg-avg", "merge", "concat", "pivot-table", "table"] or atom_type.startswith("groupby"):
                        # For merge atoms, handle file1 and file2 separately
                        if atom_type == "merge":
                            # 🔧 CRITICAL: Extract latest file1 and file2 from API calls (already have replacements applied)
                            # Check perform and init endpoints (they have file1 and file2)
                            latest_file1 = None
                            latest_file2 = None
                            logger.info(f"🔍 [MERGE] Searching {len(api_calls)} API calls for file1 and file2")
                            for api_call in reversed(api_calls):
                                endpoint = api_call.get("endpoint", "")
                                params = api_call.get("params", {})
                                # Check perform or init endpoints (they have file1 and file2)
                                if "/merge/perform" in endpoint or "/merge/init" in endpoint or "merge/perform" in endpoint.lower() or "merge/init" in endpoint.lower():
                                    file1 = params.get("file1")
                                    file2 = params.get("file2")
                                    if file1 or file2:
                                        latest_file1 = file1  # Already has replacements applied
                                        latest_file2 = file2  # Already has replacements applied
                                        logger.info(
                                            f"🔄 [MERGE] Found files from {endpoint}: file1={latest_file1}, file2={latest_file2}"
                                        )
                                        break
                            
                            # Fallback: if not found in perform/init, check any API call
                            if not latest_file1 and not latest_file2:
                                logger.info(f"🔍 [MERGE] Not found in perform/init, checking all API calls")
                                for api_call in reversed(api_calls):
                                    params = api_call.get("params", {})
                                    file1 = params.get("file1")
                                    file2 = params.get("file2")
                                    if file1 or file2:
                                        latest_file1 = file1
                                        latest_file2 = file2
                                        logger.info(
                                            f"🔄 [MERGE] Found files from fallback: file1={latest_file1}, file2={latest_file2}"
                                        )
                                        break
                            
                            # Update log_entry input_files with latest files
                            # Use files from API calls if found, otherwise use updated_input_files as fallback
                            if latest_file1 or latest_file2:
                                # Use files from API calls (already have replacements)
                                updated_input_files_list = []
                                if latest_file1:
                                    updated_input_files_list.append(latest_file1)
                                if latest_file2:
                                    updated_input_files_list.append(latest_file2)
                                log_entry["input_files"] = updated_input_files_list
                                logger.info(
                                    f"🔄 [MERGE] ✅ Updated log_entry input_files with latest files from API calls: {updated_input_files_list}"
                                )
                            elif updated_input_files:
                                # Fallback: use updated_input_files (from step inputs with replacements)
                                log_entry["input_files"] = updated_input_files
                                logger.info(
                                    f"🔄 [MERGE] ⚠️ Using updated_input_files as fallback: {updated_input_files}"
                                )
                            else:
                                logger.warning(f"⚠️ [MERGE] No files found in API calls or updated_input_files")
                            
                            # Update configuration with latest files (ALWAYS update if found)
                            if latest_file1:
                                updated_config["file1"] = latest_file1
                            if latest_file2:
                                updated_config["file2"] = latest_file2
                            
                            # Set primary_input_file to file2 (or file1 if file2 not available)
                            latest_file = latest_file2 or latest_file1
                            if latest_file:
                                log_entry["primary_input_file"] = latest_file
                                log_entry["file_key"] = latest_file  # For backward compatibility
                                updated_config["file_key"] = latest_file
                                updated_config["object_names"] = latest_file
                            
                            # Always log the update
                            logger.info(
                                f"🔄 [MERGE] Updated configuration: file1={latest_file1}, file2={latest_file2}, "
                                f"primary_input_file={latest_file}, updated_config keys: {list(updated_config.keys())}"
                            )
                        else:
                            # For other atoms (groupby, etc.), use single file logic
                            # Find the latest original file from the step (before replacements)
                            # This is the file that was shown in the canvas before execution
                            latest_original_file = None
                            original_inputs = step.get("inputs", [])
                            if original_inputs:
                                # Get the last input file (most recently added)
                                latest_original_file = original_inputs[-1].get("file_key") if isinstance(original_inputs[-1], dict) else original_inputs[-1]
                            
                            # If not found in inputs, check configuration
                            if not latest_original_file:
                                original_config = step.get("configuration", {})
                                latest_original_file = original_config.get("file_key") or original_config.get("object_names")
                            
                            # Find the replacement for the latest original file
                            latest_file = None
                            if latest_original_file and latest_original_file in file_replacements:
                                latest_file = file_replacements[latest_original_file]
                                logger.info(
                                    f"🔄 [{atom_type.upper()}] Found replacement for latest original file: {latest_original_file} -> {latest_file}"
                                )
                            elif latest_original_file:
                                # No replacement, use original
                                latest_file = latest_original_file
                            
                            # Fall back: find the latest file from API calls (reverse order to get the last one)
                            if not latest_file:
                                for api_call in reversed(api_calls):
                                    endpoint = api_call.get("endpoint", "")
                                    params = api_call.get("params", {})
                                    
                                    # For other atoms, check standard file params
                                    file_from_call = (
                                        params.get("object_names") or 
                                        params.get("file_key") or 
                                        params.get("object_name") or
                                        None
                                    )
                                    
                                    if file_from_call:
                                        latest_file = file_from_call
                                        break
                            
                            # Final fallback: use last input file from updated_input_files
                            if not latest_file and updated_input_files:
                                latest_file = updated_input_files[-1] if isinstance(updated_input_files, list) else updated_input_files[0] if updated_input_files else None
                            
                            if latest_file:
                                log_entry["primary_input_file"] = latest_file
                                log_entry["file_key"] = latest_file  # For backward compatibility
                                # Also update configuration with latest file (replacement)
                                updated_config["file_key"] = latest_file
                                updated_config["object_names"] = latest_file
                                logger.info(
                                    f"🔄 [{atom_type.upper()}] Updated configuration with latest file (replacement): {latest_file}"
                                )
                        
                        # 🔧 CRITICAL: For table atoms, update table_id in configuration from additional_results
                        # This ensures the frontend uses the correct table_id that has the renamed columns
                        if atom_type == "table" and additional_results:
                            current_table_id = None
                            table_data = additional_results.get("table_data")
                            if table_data and isinstance(table_data, dict):
                                current_table_id = table_data.get("table_id")
                            
                            # Fallback: check load_results if table_data doesn't have table_id
                            if not current_table_id:
                                load_results = additional_results.get("load_results", [])
                                if load_results:
                                    last_load = load_results[-1]
                                    if isinstance(last_load, dict):
                                        current_table_id = last_load.get("table_id")
                            
                            if current_table_id:
                                old_table_id = updated_config.get("table_id")
                                updated_config["table_id"] = current_table_id
                                if old_table_id and old_table_id != current_table_id:
                                    logger.info(
                                        f"🔄 [TABLE] Updated configuration table_id from {old_table_id} to {current_table_id} "
                                        f"(using table_id from rerun execution with renamed columns)"
                                    )
                                else:
                                    logger.info(
                                        f"✅ [TABLE] Configuration table_id set to {current_table_id} "
                                        f"(from rerun execution)"
                                    )
                            else:
                                logger.warning(
                                    f"⚠️ [TABLE] Could not extract table_id from additional_results. "
                                    f"Configuration table_id may be outdated."
                                )
                        
                        # 🔧 CRITICAL: Update log_entry configuration after all updates
                        log_entry["configuration"] = updated_config
                    
                    # Get all output files from the step (including saved files)
                    # Check both the execution result and the step's outputs array
                    output_files_to_check = []
                    if result_file:
                        output_files_to_check.append(result_file)
                        log_entry["result_file"] = result_file
                        # logger.info(f"✅ Atom {atom_type} ({atom_instance_id}) created new result file: {result_file}")
                        
                    # Also check the step's outputs array for saved files (especially from /save operations)
                    step_outputs = step.get("outputs", [])
                    for output in step_outputs:
                        output_file_key = output.get("file_key")
                        
                        # Prioritize saved files (those with save_as_name and not default name)
                        if output_file_key:
                            if output.get("save_as_name") and not output.get("is_default_name", True):
                                # This is a saved file - add it to the front of the list to check first
                                if output_file_key not in output_files_to_check:
                                    output_files_to_check.insert(0, output_file_key)
                            elif output_file_key not in output_files_to_check:
                                # Add other output files too
                                output_files_to_check.append(output_file_key)
                    
                    # CRITICAL FIX: Also check API calls for /save responses that contain saved filenames
                    # This catches saved files that might not be in step.outputs yet
                    # CRITICAL: Only add save-as files, NOT overwrite saves
                    step_api_calls = step.get("api_calls", [])
                    for api_call in step_api_calls:
                        endpoint = api_call.get("endpoint", "")
                        response_data = api_call.get("response_data", {})
                        # Check for /save endpoints (groupby/save, etc.)
                        if "/save" in endpoint and response_data.get("status") == "SUCCESS":
                            saved_filename = response_data.get("filename")
                            if saved_filename and saved_filename not in output_files_to_check:
                                # Check if this is an overwrite save
                                save_params = api_call.get("params", {})
                                is_overwrite = save_params.get("overwrite_original", False)
                                
                                # Only add if NOT an overwrite save
                                if not is_overwrite:
                                    output_files_to_check.insert(0, saved_filename)
                                else:
                                    logger.info(
                                        f"🔄 [PIPELINE] Skipping overwrite save '{saved_filename}' from step API calls "
                                        f"(it's the same file, not a derived file)"
                                    )
                    
                    # Check each output file for deferred column operations
                    # CRITICAL FIX: Match output files against ALL column operations (not just deferred)
                    # This ensures column operations on derived files are executed when the file is created,
                    # even if they were incorrectly categorized as immediate
                    # logger.info(
                    #     f"🔍 [STEP {step.get('step_index')}] Checking {len(output_files_to_check)} output files "
                    #     f"for matching column operations. Total column ops: {len(column_operations)}, "
                    #     f"Deferred ops count: {sum(len(ops) for ops in deferred_col_ops.values())}"
                    # )
                    
                    # Helper function to normalize file paths for comparison
                    def normalize_path(path):
                        """Normalize file path for comparison (remove leading/trailing slashes, normalize separators)."""
                        if not path:
                            return ""
                        # Remove leading/trailing slashes and normalize
                        normalized = path.strip().strip("/").strip("\\")
                        # Replace backslashes with forward slashes for consistency
                        normalized = normalized.replace("\\", "/")
                        return normalized
                    
                    for output_file in output_files_to_check:
                        # ========================================================================
                        # STEP 1: CHECK AND APPLY PRIMING STEPS TO OUTPUT FILE (if any)
                        # ========================================================================
                        # Before checking for column operations, check if this output file has
                        # priming steps that need to be applied (similar to replacement files)
                        logger.info(f"🔍 Checking output file '{output_file}' for priming steps...")
                        
                        # Get priming steps for this output file from the preserved prime section
                        output_priming_steps = None
                        if preserved_prime:
                            for priming_entry in preserved_prime:
                                if priming_entry.get("file_key") == output_file:
                                    output_priming_steps = priming_entry.get("priming_steps")
                                    break
                        
                        if output_priming_steps:
                            logger.info(
                                f"🔧 Found priming steps for output file {output_file}, applying..."
                            )
                            # Use helper function to apply priming steps
                            await _apply_priming_to_replacement_file(
                                replacement_file=output_file,
                                priming_steps=output_priming_steps,
                                original_file=output_file,  # For derived files, original = output
                                request_client_name=request.client_name,
                                request_app_name=request.app_name,
                                request_project_name=request.project_name,
                                request_mode=request.mode
                            )
                        
                        # ========================================================================
                        # STEP 2: CHECK AND APPLY COLUMN OPERATIONS TO OUTPUT FILE (if any)
                        # ========================================================================
                        # logger.info(
                        #     f"🔍 Checking output file '{output_file}' for matching column operations..."
                        # )
                        
                        # Normalize output file path for comparison
                        normalized_output_file = normalize_path(output_file)
                        
                        # Find all column operations (from ALL column_operations, not just deferred)
                        # that match this output file. This ensures we catch operations even if categorization was wrong.
                        matching_deferred_ops = []
                        
                        # First check deferred operations (most common case)
                        for deferred_file_key, deferred_ops_list in deferred_col_ops.items():
                            for deferred_col_op in deferred_ops_list:
                                # Get the input file from the column operation config (original, not replacement)
                                col_op_input_file = deferred_col_op.get("input_file")
                                col_op_original_input_file = deferred_col_op.get("original_input_file")
                                
                                # Normalize paths for comparison
                                normalized_col_op_input = normalize_path(col_op_input_file) if col_op_input_file else ""
                                normalized_col_op_original = normalize_path(col_op_original_input_file) if col_op_original_input_file else ""
                                normalized_deferred_key = normalize_path(deferred_file_key) if deferred_file_key else ""
                                
                                # Match if output_file matches (exact match or normalized match):
                                # 1. input_file from config (the file the column operation was saved for)
                                # 2. original_input_file from config (preserved from initial save)
                                # 3. deferred_file_key (original_input_file used as key)
                                if (output_file == col_op_input_file or 
                                    output_file == col_op_original_input_file or
                                    output_file == deferred_file_key or
                                    normalized_output_file == normalized_col_op_input or
                                    normalized_output_file == normalized_col_op_original or
                                    normalized_output_file == normalized_deferred_key):
                                    # Avoid duplicates
                                    if deferred_col_op not in matching_deferred_ops:
                                        matching_deferred_ops.append(deferred_col_op)
                                        # logger.info(
                                        #     f"✅ MATCH FOUND (deferred): output_file='{output_file}' matches "
                                        #     f"col_op_input_file='{col_op_input_file}' "
                                        #     f"(or original_input_file='{col_op_original_input_file}' or deferred_file_key='{deferred_file_key}')"
                                        # )
                        
                        # Also check ALL column operations in case some were incorrectly categorized as immediate
                        # but should actually be deferred (e.g., if derived_files wasn't populated correctly)
                        for col_op in column_operations:
                            # Skip if already in matching_deferred_ops
                            if col_op in matching_deferred_ops:
                                continue
                            
                            col_op_input_file = col_op.get("input_file")
                            col_op_original_input_file = col_op.get("original_input_file")
                            
                            # Normalize paths for comparison
                            normalized_col_op_input = normalize_path(col_op_input_file) if col_op_input_file else ""
                            normalized_col_op_original = normalize_path(col_op_original_input_file) if col_op_original_input_file else ""
                            
                            # Match if output_file matches the column operation's input file (exact or normalized)
                            if (output_file == col_op_input_file or 
                                output_file == col_op_original_input_file or
                                normalized_output_file == normalized_col_op_input or
                                normalized_output_file == normalized_col_op_original):
                                # Only add if it's not already executed (not in immediate_col_ops that were already executed)
                                # Actually, we should check if this was already executed, but for now, add it
                                # The execution logic will handle duplicates
                                matching_deferred_ops.append(col_op)
                                # logger.info(
                                #     f"✅ MATCH FOUND (all ops): output_file='{output_file}' matches "
                                #     f"col_op_input_file='{col_op_input_file}' "
                                #     f"(or original_input_file='{col_op_original_input_file}')"
                                # )
                        
                        if not matching_deferred_ops:
                            logger.warning(
                                f"⚠️ No matching column operations found for output file '{output_file}'. "
                                f"Available deferred ops keys: {list(deferred_col_ops.keys())}. "
                                f"All column ops input files: {[op.get('input_file') for op in column_operations]}"
                            )
                        else:
                            logger.info(
                                f"✅ Found {len(matching_deferred_ops)} matching column operation(s) for '{output_file}'"
                            )
                        
                        # Execute all matching deferred column operations
                        for deferred_col_op in matching_deferred_ops:
                                deferred_execution_start_time = datetime.utcnow()
                                try:
                                    # Check if this operation was already executed (prevent duplicates)
                                    deferred_col_op_key = get_col_op_key(deferred_col_op)
                                    if deferred_col_op_key in executed_col_ops:
                                        logger.info(
                                            f"⏭️ Skipping already executed deferred column operation: {deferred_col_op_key}"
                                        )
                                        continue
                                    
                                    # Execute column operations (same logic as immediate operations)
                                    deferred_operations = deferred_col_op.get("operations", [])
                                    deferred_overwrite = deferred_col_op.get("overwrite_original", False)
                                    
                                    if not deferred_operations:
                                        continue
                                    
                                    # Build form_items using the same function
                                    deferred_form_items = build_form_items_from_operations(deferred_operations)
                                    
                                    if not deferred_form_items:
                                        continue
                                    
                                    # Get identifiers from deferred column operations config
                                    deferred_identifiers_list = deferred_col_op.get("identifiers")
                                    deferred_identifiers_str = None
                                    if deferred_identifiers_list and isinstance(deferred_identifiers_list, list) and len(deferred_identifiers_list) > 0:
                                        deferred_identifiers_str = ",".join(deferred_identifiers_list)
                                        deferred_form_items.append(("identifiers", deferred_identifiers_str))
                                    else:
                                        deferred_form_items.append(("identifiers", ""))
                                    
                                    # Execute perform task
                                    deferred_perform_submission = submit_perform_task(
                                        bucket_name=MINIO_BUCKET,
                                        object_name=output_file,  # Use output_file from the loop
                                        object_prefix=prefix,
                                        identifiers=deferred_identifiers_str,  # Pass identifiers for grouping operations
                                        form_items=deferred_form_items,
                                        client_name=request.client_name,
                                        app_name=request.app_name,
                                        project_name=request.project_name,
                                    )
                                    
                                    # Get deferred perform task result
                                    deferred_perform_result = None
                                    if deferred_perform_submission.status == "success" and deferred_perform_submission.result:
                                        deferred_perform_result = deferred_perform_submission.result
                                        if isinstance(deferred_perform_result, dict):
                                            deferred_perform_result.setdefault("status", "SUCCESS")
                                    elif deferred_perform_submission.status == "pending":
                                        max_wait = 60
                                        wait_interval = 0.5
                                        waited = 0
                                        while waited < max_wait:
                                            task_meta = task_result_store.fetch(deferred_perform_submission.task_id)
                                            if task_meta and task_meta.get("status") in ["success", "failure"]:
                                                deferred_perform_result = task_meta.get("result", {})
                                                if task_meta.get("status") == "success":
                                                    deferred_perform_result.setdefault("status", "SUCCESS")
                                                else:
                                                    deferred_perform_result = {"status": "FAILURE", "error": task_meta.get("error", "Task failed")}
                                                break
                                            await asyncio.sleep(wait_interval)
                                            waited += wait_interval
                                        if not deferred_perform_result:
                                            deferred_perform_result = {"status": "FAILURE", "error": "Task timed out"}
                                    else:
                                        deferred_perform_result = {"status": "FAILURE", "error": deferred_perform_submission.detail or "Task submission failed"}
                                    
                                    if not deferred_perform_result or deferred_perform_result.get("status") != "SUCCESS":
                                        # logger.error(f"❌ Deferred column operations failed for {output_file}: {deferred_perform_result.get('error')}")
                                        execution_log.append({
                                            "type": "column_operations",
                                            "input_file": output_file,  # Use output_file from the loop
                                            "status": "failed",
                                            "message": deferred_perform_result.get("error", "Deferred column operations failed")
                                        })
                                        failed_count += 1
                                        continue
                                    
                                    # Get result and save
                                    deferred_result_file = deferred_perform_result.get("result_file")
                                    if not deferred_result_file:
                                        continue
                                    
                                    deferred_output_file = output_file if deferred_overwrite else (deferred_col_op.get("output_file") or deferred_result_file)
                                    
                                    # For Arrow files, the perform task saves the result to result_file
                                    # We need to load that result file and pass it to save task
                                    
                                    # Check if this is an Arrow file operation
                                    is_arrow_file = output_file.endswith('.arrow')
                                    
                                    # Initialize deferred_csv_data
                                    deferred_csv_data = None
                                    
                                    if is_arrow_file:
                                        # For Arrow files, we need to load the result from MinIO and pass it to save task
                                        # The perform task should have saved the transformed data to result_file
                                        try:
                                            from minio import Minio
                                            from minio.error import S3Error
                                            import pyarrow.parquet as pq
                                            
                                            # Load the result file from MinIO (it should be the transformed data)
                                            local_minio_client = Minio(
                                                COL_OPS_MINIO_ENDPOINT,
                                                access_key=COL_OPS_MINIO_ACCESS_KEY,
                                                secret_key=COL_OPS_MINIO_SECRET_KEY,
                                                secure=False
                                            )
                                            
                                            # Get the object from MinIO
                                            response = local_minio_client.get_object(COL_OPS_MINIO_BUCKET, deferred_result_file)
                                            data_bytes = response.read()
                                            response.close()
                                            
                                            # Check if result_file is CSV or Arrow
                                            if deferred_result_file.endswith('.csv'):
                                                # Result is CSV - read it directly
                                                csv_string = data_bytes.decode('utf-8')
                                                deferred_csv_data = csv_string
                                            else:
                                                # Result is Arrow - convert to CSV
                                                arrow_buffer = io.BytesIO(data_bytes)
                                                table = pq.read_table(arrow_buffer)
                                                df = table.to_pandas()
                                                # Convert to CSV for save task
                                                deferred_csv_data = df.to_csv(index=False)
                                            
                                        except Exception as e:
                                            # logger.error(f"❌ [STEP {step.get('step_index')}] Failed to load transformed Arrow file: {e}")
                                            execution_log.append({
                                                "type": "column_operations",
                                                "input_file": output_file,
                                                "status": "failed",
                                                "message": f"Failed to load transformed data: {str(e)}"
                                            })
                                            failed_count += 1
                                            continue
                                    else:
                                        # For CSV files, use the results array as before
                                        deferred_results = deferred_perform_result.get("results", [])
                                        if deferred_results:
                                            deferred_csv_buffer = io.StringIO()
                                            deferred_fieldnames = list(deferred_results[0].keys())
                                            deferred_writer = csv.DictWriter(deferred_csv_buffer, fieldnames=deferred_fieldnames)
                                            deferred_writer.writeheader()
                                            deferred_writer.writerows(deferred_results)
                                            deferred_csv_data = deferred_csv_buffer.getvalue()
                                        else:
                                            continue
                                    
                                    # Check if deferred_csv_data was successfully created
                                    if not deferred_csv_data:
                                        execution_log.append({
                                            "type": "column_operations",
                                            "input_file": output_file,
                                            "status": "failed",
                                            "message": "No CSV data generated for saving"
                                        })
                                        failed_count += 1
                                        continue
                                    
                                    # Build operation_details in the same format as frontend
                                    deferred_operations_list = deferred_col_op.get("operations", [])
                                    deferred_operation_details_dict = {
                                        "input_file": deferred_col_op.get("input_file", output_file),  # Use output_file from the loop
                                        "operations": [
                                            {
                                                "operation_type": op.get("type", ""),
                                                "columns": op.get("columns", []),
                                                "rename": op.get("rename") if op.get("rename") else None,
                                                "param": op.get("param") if op.get("param") else None,
                                                "created_column_name": op.get("created_column_name", "")
                                            }
                                            for op in deferred_operations_list
                                        ]
                                    }
                                    
                                    # Serialize to JSON string (handles datetime objects)
                                    deferred_operation_details_str = json.dumps(deferred_operation_details_dict, default=json_serializer)
                                    
                                    # logger.info(
                                    #     f"💾 [DEFERRED COL OPS] Preparing to save column operations result for '{output_file}'. "
                                    #     f"Overwrite: {deferred_overwrite}, Output file: {deferred_output_file}, "
                                    #     f"CSV data size: {len(deferred_csv_data) if deferred_csv_data else 0} bytes"
                                    # )
                                    
                                    # Determine the filename to pass to save task
                                    # CRITICAL: When overwriting, pass the FULL path (save_dataframe_task expects it)
                                    #           When NOT overwriting, pass just the short filename
                                    if deferred_overwrite:
                                        # Overwriting: pass the full file path without .arrow extension
                                        # save_dataframe_task will add .arrow back and use it as-is
                                        deferred_save_filename = output_file.replace(".arrow", "")
                                    else:
                                        # New file: extract just the filename (save_dataframe_task will add prefix and create-data/)
                                        if deferred_output_file:
                                            deferred_filename_without_ext = deferred_output_file.replace(".arrow", "")
                                            if "/" in deferred_filename_without_ext:
                                                if "create-data/" in deferred_filename_without_ext:
                                                    deferred_filename_without_ext = deferred_filename_without_ext.split("create-data/")[-1]
                                                else:
                                                    deferred_filename_without_ext = deferred_filename_without_ext.split("/")[-1]
                                            deferred_save_filename = deferred_filename_without_ext
                                        else:
                                            deferred_save_filename = "column_ops_result"
                                    
                                    deferred_save_submission = submit_save_task(
                                        csv_data=deferred_csv_data,
                                        filename=deferred_save_filename,
                                        object_prefix=prefix,
                                        overwrite_original=deferred_overwrite,
                                        client_name=request.client_name,
                                        app_name=request.app_name,
                                        project_name=request.project_name,
                                        user_id="pipeline",
                                        project_id=None,
                                        operation_details=deferred_operation_details_str,
                                    )
                                    
                                    # Get deferred save task result
                                    deferred_save_result = None
                                    if deferred_save_submission.status == "success" and deferred_save_submission.result:
                                        deferred_save_result = deferred_save_submission.result
                                        if isinstance(deferred_save_result, dict):
                                            deferred_save_result.setdefault("status", "SUCCESS")
                                    elif deferred_save_submission.status == "pending":
                                        max_wait = 60
                                        wait_interval = 0.5
                                        waited = 0
                                        while waited < max_wait:
                                            task_meta = task_result_store.fetch(deferred_save_submission.task_id)
                                            if task_meta and task_meta.get("status") in ["success", "failure"]:
                                                deferred_save_result = task_meta.get("result", {})
                                                if task_meta.get("status") == "success":
                                                    deferred_save_result.setdefault("status", "SUCCESS")
                                                else:
                                                    deferred_save_result = {"status": "FAILURE", "error": task_meta.get("error", "Task failed")}
                                                break
                                            await asyncio.sleep(wait_interval)
                                            waited += wait_interval
                                        if not deferred_save_result:
                                            deferred_save_result = {"status": "FAILURE", "error": "Task timed out"}
                                    else:
                                        deferred_save_result = {"status": "FAILURE", "error": deferred_save_submission.detail or "Task submission failed"}
                                    
                                    deferred_execution_end_time = datetime.utcnow()
                                    if deferred_save_result and deferred_save_result.get("status") == "SUCCESS":
                                        # logger.info(f"✅ Deferred column operations completed for {output_file} -> {deferred_output_file}")
                                        execution_log.append({
                                            "type": "column_operations",
                                            "input_file": output_file,  # Use output_file from the loop
                                            "output_file": deferred_output_file,
                                            "status": "success",
                                            "message": f"Created {len(deferred_col_op.get('created_columns', []))} columns"
                                        })
                                        success_count += 1
                                        
                                        # Mark this operation as executed to prevent duplicates
                                        executed_col_ops.add(deferred_col_op_key)
                                        
                                        # Record execution to MongoDB
                                        await record_column_operations_execution(
                                            client_name=request.client_name,
                                            app_name=request.app_name,
                                            project_name=request.project_name,
                                            input_file=deferred_col_op.get("input_file", output_file),  # Use original input_file from config
                                            output_file=deferred_output_file,
                                            operations=deferred_col_op.get("operations", []),
                                            created_columns=deferred_col_op.get("created_columns", []),
                                            execution_started_at=deferred_execution_start_time,
                                            execution_completed_at=deferred_execution_end_time,
                                            execution_status="success",
                                            execution_error=None,
                                            identifiers=deferred_col_op.get("identifiers"),  # Pass identifiers to match config
                                            mode=request.mode
                                        )
                                        
                                        # Update file replacements
                                        if deferred_overwrite:
                                            file_replacements[output_file] = deferred_output_file
                                    else:
                                        # logger.error(f"❌ Failed to save deferred column operations result for {output_file}")
                                        execution_log.append({
                                            "type": "column_operations",
                                            "input_file": output_file,  # Use output_file from the loop
                                            "status": "failed",
                                            "message": deferred_save_result.get("error", "Save failed") if deferred_save_result else "Save failed"
                                        })
                                        failed_count += 1
                                        
                                        # Record failed execution to MongoDB
                                        await record_column_operations_execution(
                                            client_name=request.client_name,
                                            app_name=request.app_name,
                                            project_name=request.project_name,
                                            input_file=deferred_col_op.get("input_file", output_file),  # Use original input_file from config
                                            output_file=output_file,  # Use input as output on failure
                                            operations=deferred_col_op.get("operations", []),
                                            created_columns=deferred_col_op.get("created_columns", []),
                                            execution_started_at=deferred_execution_start_time,
                                            execution_completed_at=deferred_execution_end_time,
                                            execution_status="failed",
                                            execution_error=deferred_save_result.get("error", "Save failed") if deferred_save_result else "Save failed",
                                            identifiers=deferred_col_op.get("identifiers"),  # Pass identifiers to match config
                                            mode=request.mode
                                        )
                                    
                                except Exception as e:
                                    deferred_execution_end_time = datetime.utcnow()
                                    # logger.error(f"❌ Error executing deferred column operations for {output_file}: {e}")
                                    execution_log.append({
                                        "type": "column_operations",
                                        "input_file": output_file,  # Use output_file from the loop
                                        "status": "failed",
                                        "message": str(e)
                                    })
                                    failed_count += 1
                                    
                                    # Record failed execution to MongoDB
                                    await record_column_operations_execution(
                                        client_name=request.client_name,
                                        app_name=request.app_name,
                                        project_name=request.project_name,
                                        input_file=deferred_col_op.get("input_file", output_file),  # Use original input_file from config
                                        output_file=output_file,  # Use input as output on failure
                                        operations=deferred_col_op.get("operations", []),
                                        created_columns=deferred_col_op.get("created_columns", []),
                                        execution_started_at=deferred_execution_start_time,
                                        execution_completed_at=deferred_execution_end_time,
                                        execution_status="failed",
                                        execution_error=str(e),
                                        identifiers=deferred_col_op.get("identifiers"),  # Pass identifiers to match config
                                        mode=request.mode
                                    )
                        
                        # ========================================================================
                        # STEP 3: CHECK AND APPLY DEFERRED VARIABLE OPERATIONS TO OUTPUT FILE
                        # ========================================================================
                        # Similar to deferred column operations, execute variable operations
                        # that were waiting for this derived file to be created
                        
                        # Find matching deferred variable operations for this output file
                        matching_deferred_var_ops = []
                        
                        for deferred_var_file_key, deferred_var_ops_list in deferred_var_ops.items():
                            for deferred_var_op in deferred_var_ops_list:
                                var_op_input_file = deferred_var_op.get("input_file")
                                var_op_original_input_file = deferred_var_op.get("original_input_file")
                                
                                # Normalize paths for comparison
                                normalized_var_op_input = normalize_path(var_op_input_file) if var_op_input_file else ""
                                normalized_var_op_original = normalize_path(var_op_original_input_file) if var_op_original_input_file else ""
                                normalized_deferred_var_key = normalize_path(deferred_var_file_key) if deferred_var_file_key else ""
                                
                                # Match if output_file matches any of the variable operation's file references
                                if (output_file == var_op_input_file or 
                                    output_file == var_op_original_input_file or
                                    output_file == deferred_var_file_key or
                                    normalized_output_file == normalized_var_op_input or
                                    normalized_output_file == normalized_var_op_original or
                                    normalized_output_file == normalized_deferred_var_key):
                                    if deferred_var_op not in matching_deferred_var_ops:
                                        matching_deferred_var_ops.append(deferred_var_op)
                        
                        if matching_deferred_var_ops:
                            logger.info(
                                f"📊 Found {len(matching_deferred_var_ops)} deferred variable operation(s) for '{output_file}'"
                            )
                            
                            for deferred_var_op in matching_deferred_var_ops:
                                try:
                                    # Execute the deferred variable operation
                                    # The file_replacements map should already have the correct mapping
                                    result_info = await execute_variable_operation(deferred_var_op, file_replacements)
                                    
                                    if result_info["status"] == "success":
                                        execution_log.append({
                                            "type": "variable_operations",
                                            "input_file": result_info.get("actual_input_file"),
                                            "original_input_file": result_info.get("original_input_file"),
                                            "status": "success",
                                            "message": result_info.get("message"),
                                            "created_variables": result_info.get("created_variables", [])
                                        })
                                        success_count += 1
                                        logger.info(
                                            f"✅ Deferred variable operations completed for {output_file}"
                                        )
                                    elif result_info["status"] == "failed":
                                        execution_log.append({
                                            "type": "variable_operations",
                                            "input_file": result_info.get("actual_input_file"),
                                            "original_input_file": result_info.get("original_input_file"),
                                            "status": "failed",
                                            "message": result_info.get("message")
                                        })
                                        failed_count += 1
                                        
                                except Exception as e:
                                    logger.error(f"❌ Error executing deferred variable operations for {output_file}: {e}")
                                    execution_log.append({
                                        "type": "variable_operations",
                                        "input_file": output_file,
                                        "status": "failed",
                                        "message": str(e)
                                    })
                                    failed_count += 1
                                    
                                    # Record failed variable operations execution to MongoDB
                                    await record_variable_operations_execution(
                                        client_name=request.client_name,
                                        app_name=request.app_name,
                                        project_name=request.project_name,
                                        input_file=output_file,
                                        compute_mode=deferred_var_op.get("compute_mode", "whole-dataframe"),
                                        operations=deferred_var_op.get("operations", []),
                                        created_variables=[],
                                        execution_status="failed",
                                        execution_error=str(e),
                                        identifiers=deferred_var_op.get("identifiers"),
                                        original_input_file=deferred_var_op.get("original_input_file") or output_file,
                                        mode=request.mode
                                    )
                    
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
                        
                        # Include table-specific results for frontend (after all operations)
                        if additional_results.get("table_data"):
                            log_entry["table_data"] = additional_results.get("table_data")
                        if additional_results.get("column_summary"):
                            log_entry["column_summary"] = additional_results.get("column_summary")
                        
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
                        
                        # Include pivot-table-specific results for frontend
                        if additional_results.get("pivot_results"):
                            log_entry["pivot_results"] = additional_results.get("pivot_results")
                        if additional_results.get("pivot_hierarchy"):
                            log_entry["pivot_hierarchy"] = additional_results.get("pivot_hierarchy")
                        if additional_results.get("pivot_column_hierarchy"):
                            log_entry["pivot_column_hierarchy"] = additional_results.get("pivot_column_hierarchy")
                        if additional_results.get("pivot_row_count") is not None:
                            log_entry["pivot_row_count"] = additional_results.get("pivot_row_count")
                        if additional_results.get("pivot_updated_at"):
                            log_entry["pivot_updated_at"] = additional_results.get("pivot_updated_at")
                        if additional_results.get("saved_file"):
                            log_entry["saved_file"] = additional_results.get("saved_file")
                        # Include column summary for replacement files
                        if additional_results.get("column_summary"):
                            log_entry["column_summary"] = additional_results.get("column_summary")
                        if additional_results.get("columns"):
                            log_entry["columns"] = additional_results.get("columns")
                        if additional_results.get("filter_options"):
                            log_entry["filter_options"] = additional_results.get("filter_options")
                        # Include column summary for correlation (filters and numerical columns)
                        if additional_results.get("numerical_columns"):
                            log_entry["numerical_columns"] = additional_results.get("numerical_columns")
                        # Include column summary for chartmaker (column options for dropdowns)
                        if additional_results.get("column_summary"):
                            log_entry["column_summary"] = additional_results.get("column_summary")
                        if additional_results.get("columns"):
                            log_entry["columns"] = additional_results.get("columns")
                        
                        # Include kpi-dashboard-specific results for frontend
                        if additional_results.get("kpi_data"):
                            log_entry["kpi_data"] = additional_results.get("kpi_data")
                        if additional_results.get("layouts"):
                            log_entry["layouts"] = additional_results.get("layouts")
                        if additional_results.get("loaded_config") is not None:
                            log_entry["loaded_config"] = additional_results.get("loaded_config")
                        
                        # Store all additional_results for frontend to access
                        log_entry["additional_results"] = additional_results
                    
                    success_count += 1
                    
                    # 🔧 CRITICAL: Record full execution back to MongoDB to preserve all API calls (init/run/save)
                    # This ensures that when pipeline runs, all API calls are preserved with file replacements applied
                    # For groupby/merge/concat/pivot/table/kpi-dashboard atoms, this preserves the full sequence of operations
                    if atom_type in ["groupby-wtg-avg", "merge", "concat", "pivot-table", "table", "kpi-dashboard"] or atom_type.startswith("groupby"):
                        try:
                            from datetime import datetime
                            from .service import record_atom_execution
                            
                            # Build output files from execution result and step outputs
                            recorded_output_files = []
                            
                            # CRITICAL: Build set of input files (including replacement files) for overwrite detection
                            # If a saved file matches any input file, it's an overwrite save (not a derived file)
                            # Normalize paths for comparison (remove .arrow extension, normalize separators)
                            def normalize_file_path(path):
                                """Normalize file path for comparison."""
                                if not path:
                                    return ""
                                # Remove .arrow extension if present
                                normalized = path.replace(".arrow", "") if path.endswith(".arrow") else path
                                # Normalize separators
                                normalized = normalized.replace("\\", "/")
                                # Remove trailing slashes
                                normalized = normalized.rstrip("/")
                                return normalized
                            
                            input_files_set = set()
                            input_files_normalized = {}  # Map normalized -> original for logging
                            
                            # Add updated input files (with replacements)
                            for input_file in updated_input_files:
                                if input_file:
                                    input_files_set.add(input_file)
                                    norm = normalize_file_path(input_file)
                                    input_files_normalized[norm] = input_file
                                    input_files_set.add(norm)  # Also add normalized version
                            
                            # Also add original input files from step inputs
                            for input_file_obj in inputs:
                                input_key = input_file_obj.get("file_key")
                                if input_key:
                                    input_files_set.add(input_key)
                                    norm = normalize_file_path(input_key)
                                    input_files_normalized[norm] = input_key
                                    input_files_set.add(norm)  # Also add normalized version
                            
                            logger.info(
                                f"🔍 [PIPELINE] Input files for overwrite detection: {list(input_files_set)[:5]}... "
                                f"(total: {len(input_files_set)})"
                            )
                            
                            # Add result file if available
                            # 🔧 CRITICAL: For concat, skip result_file if it's a concat_key (auto-generated Redis cache key)
                            # concat_key pattern: 8-char hex + "_concat.arrow" (e.g., "5771ec39_concat.arrow")
                            # These are temporary cache keys and should NOT be recorded as output files
                            if result_file:
                                is_concat_key = False
                                if atom_type == "concat":
                                    # Check if result_file matches concat_key pattern
                                    if result_file.endswith('_concat.arrow'):
                                        prefix = result_file.replace('_concat.arrow', '')
                                        if len(prefix) == 8 and all(c in '0123456789abcdef' for c in prefix.lower()):
                                            is_concat_key = True
                                
                            if not is_concat_key:
                                recorded_output_files.append({
                                    "file_key": result_file,
                                    "file_path": result_file,
                                    "flight_path": result_file,
                                    "save_as_name": "groupby_result" if atom_type.startswith("groupby") else None,
                                    "is_default_name": True,
                                    "columns": task_response.get("columns", []) if task_response else [],
                                    "dtypes": {},
                                    "row_count": task_response.get("row_count", 0) if task_response else 0
                                })
                            
                            # Add saved files from API calls (preserve save_as_name)
                            # CRITICAL: Only add save-as files, NOT overwrite saves
                            for api_call in api_calls:
                                endpoint = api_call.get("endpoint", "")
                                if "/save" in endpoint:
                                    response_data = api_call.get("response_data", {})
                                    if response_data and response_data.get("status") == "SUCCESS":
                                        saved_filename = response_data.get("filename")
                                        if saved_filename:
                                            # Check if already added
                                            if not any(out.get("file_key") == saved_filename for out in recorded_output_files):
                                                save_params = api_call.get("params", {})
                                                # Check if this is an overwrite save
                                                # Method 1: Check overwrite_original flag
                                                is_overwrite = save_params.get("overwrite_original", False)
                                                # Method 2: Check if saved file matches any input file (simpler, more reliable)
                                                saved_filename_norm = normalize_file_path(saved_filename)
                                                if not is_overwrite and (saved_filename in input_files_set or saved_filename_norm in input_files_set):
                                                    is_overwrite = True
                                                    matched_input = input_files_normalized.get(saved_filename_norm, saved_filename)
                                                    logger.info(
                                                        f"🔍 [PIPELINE] Detected overwrite save '{saved_filename}' "
                                                        f"(matches input file '{matched_input}', even though overwrite_original flag may be missing)"
                                                    )
                                                
                                                # Only add if NOT an overwrite save
                                                if not is_overwrite:
                                                    recorded_output_files.append({
                                                        "file_key": saved_filename,
                                                        "file_path": saved_filename,
                                                        "flight_path": saved_filename,
                                                        "save_as_name": save_params.get("filename", "saved_file"),
                                                        "is_default_name": save_params.get("is_default_name", True),
                                                        "columns": [],
                                                        "dtypes": {},
                                                        "row_count": 0
                                                    })
                                                else:
                                                    logger.info(
                                                        f"🔄 [PIPELINE] Skipping overwrite save '{saved_filename}' from API call response_data "
                                                        f"(it's the same file, not a derived file)"
                                                    )
                            
                            # Also check additional_results for saved files (from current execution)
                            # Handle both single save_result (backward compatibility) and save_results array
                            # CRITICAL: Only add save-as files to output_files, NOT overwrite saves
                            if additional_results:
                                # Check for save_results array (multiple saves)
                                save_results = additional_results.get("save_results", [])
                                if save_results and isinstance(save_results, list):
                                    for save_result in save_results:
                                        if isinstance(save_result, dict):
                                            save_status = save_result.get("task_status", save_result.get("status", "unknown"))
                                            if save_status == "success":
                                                saved_file = save_result.get("result", {}).get("filename") if isinstance(save_result.get("result"), dict) else save_result.get("filename")
                                                if saved_file and not any(out.get("file_key") == saved_file for out in recorded_output_files):
                                                    # Check if this was an overwrite save
                                                    is_overwrite = False
                                                    save_as_name = saved_file.split("/")[-1] if "/" in saved_file else saved_file
                                                    
                                                    # Match the saved_file to the correct save API call
                                                    for api_call in api_calls:
                                                        if api_call.get("endpoint", "").endswith("/save"):
                                                            save_params = api_call.get("params", {})
                                                            save_response = api_call.get("response_data", {})
                                                            
                                                            # Match by checking if saved_file matches params.filename or response_data
                                                            params_filename = save_params.get("filename", "")
                                                            response_filename = save_response.get("filename") or save_response.get("object_name", "")
                                                            
                                                            # Normalize paths for comparison
                                                            saved_file_normalized = saved_file.replace(".arrow", "") if saved_file.endswith(".arrow") else saved_file
                                                            params_filename_normalized = params_filename.replace(".arrow", "") if params_filename.endswith(".arrow") else params_filename
                                                            response_filename_normalized = response_filename.replace(".arrow", "") if response_filename.endswith(".arrow") else response_filename
                                                            
                                                            if (params_filename and (params_filename == saved_file or params_filename_normalized == saved_file_normalized)) or \
                                                               (response_filename and (response_filename == saved_file or response_filename_normalized == saved_file_normalized)):
                                                                save_as_name = save_params.get("filename", save_as_name)
                                                                is_overwrite = save_params.get("overwrite_original", False)
                                                                break
                                                    
                                                    # Also check if saved file matches any input file (simpler, more reliable)
                                                    saved_file_norm = normalize_file_path(saved_file)
                                                    if not is_overwrite and (saved_file in input_files_set or saved_file_norm in input_files_set):
                                                        is_overwrite = True
                                                        matched_input = input_files_normalized.get(saved_file_norm, saved_file)
                                                        logger.info(
                                                            f"🔍 [PIPELINE] Detected overwrite save '{saved_file}' "
                                                            f"(matches input file '{matched_input}', even though overwrite_original flag may be missing)"
                                                        )
                                                    
                                                    # Only add if NOT an overwrite save
                                                    if not is_overwrite:
                                                        recorded_output_files.append({
                                                            "file_key": saved_file,
                                                            "file_path": saved_file,
                                                            "flight_path": saved_file,
                                                            "save_as_name": save_as_name,
                                                            "is_default_name": False,
                                                            "columns": [],
                                                            "dtypes": {},
                                                            "row_count": 0
                                                        })
                                                    else:
                                                        logger.info(
                                                            f"🔄 [PIPELINE] Skipping overwrite save '{saved_file}' from output_files "
                                                            f"(save_results array)"
                                                        )
                                
                                # Also check for single save_result (backward compatibility)
                                save_result = additional_results.get("save_result")
                                if save_result and isinstance(save_result, dict):
                                    save_status = save_result.get("task_status", save_result.get("status", "unknown"))
                                    if save_status == "success":
                                        saved_file = save_result.get("result", {}).get("filename") if isinstance(save_result.get("result"), dict) else save_result.get("filename")
                                        if saved_file and not any(out.get("file_key") == saved_file for out in recorded_output_files):
                                            # Check if this was an overwrite save
                                            is_overwrite = False
                                            
                                            # Match the saved_file to the correct save API call
                                            for api_call in api_calls:
                                                if api_call.get("endpoint", "").endswith("/save"):
                                                    save_params = api_call.get("params", {})
                                                    save_response = api_call.get("response_data", {})
                                                    
                                                    # Match by checking if saved_file matches params.filename or response_data
                                                    params_filename = save_params.get("filename", "")
                                                    response_filename = save_response.get("filename") or save_response.get("object_name", "")
                                                    
                                                    # Normalize paths for comparison
                                                    saved_file_normalized = saved_file.replace(".arrow", "") if saved_file.endswith(".arrow") else saved_file
                                                    params_filename_normalized = params_filename.replace(".arrow", "") if params_filename.endswith(".arrow") else params_filename
                                                    response_filename_normalized = response_filename.replace(".arrow", "") if response_filename.endswith(".arrow") else response_filename
                                                    
                                                    if (params_filename and (params_filename == saved_file or params_filename_normalized == saved_file_normalized)) or \
                                                       (response_filename and (response_filename == saved_file or response_filename_normalized == saved_file_normalized)):
                                                        is_overwrite = save_params.get("overwrite_original", False)
                                                        break
                                            
                                            # Also check if saved file matches any input file (simpler, more reliable)
                                            if not is_overwrite and saved_file in input_files_set:
                                                is_overwrite = True
                                                logger.info(
                                                    f"🔍 [PIPELINE] Detected overwrite save '{saved_file}' "
                                                    f"(matches input file, even though overwrite_original flag may be missing)"
                                                )
                                            
                                            # Only add if NOT an overwrite save
                                            if not is_overwrite:
                                                recorded_output_files.append({
                                                    "file_key": saved_file,
                                                    "file_path": saved_file,
                                                    "flight_path": saved_file,
                                                    "save_as_name": saved_file.split("/")[-1] if "/" in saved_file else saved_file,
                                                    "is_default_name": False,
                                                    "columns": [],
                                                    "dtypes": {},
                                                    "row_count": 0
                                                })
                                            else:
                                                logger.info(
                                                    f"🔄 [PIPELINE] Skipping overwrite save '{saved_file}' from output_files "
                                                    f"(single save_result)"
                                                )
                                
                                # Also check for saved_files array
                                # CRITICAL: Only add save-as files to output_files, NOT overwrite saves
                                # Overwrite saves should NOT be treated as derived files (they're the same file)
                                saved_files = additional_results.get("saved_files", [])
                                if saved_files and isinstance(saved_files, list):
                                    for saved_file in saved_files:
                                        if saved_file and not any(out.get("file_key") == saved_file for out in recorded_output_files):
                                            # Check if this was an overwrite save by looking at the API call params
                                            is_overwrite = False
                                            save_as_name = saved_file.split("/")[-1] if "/" in saved_file else saved_file
                                            
                                            # Match the saved_file to the correct save API call
                                            # Check both params.filename and response_data.filename/object_name
                                            for api_call in api_calls:
                                                if api_call.get("endpoint", "").endswith("/save"):
                                                    save_params = api_call.get("params", {})
                                                    save_response = api_call.get("response_data", {})
                                                    
                                                    # Match by checking if saved_file matches:
                                                    # 1. params.filename (the file being saved to)
                                                    # 2. response_data.filename or object_name (the saved file path)
                                                    params_filename = save_params.get("filename", "")
                                                    response_filename = save_response.get("filename") or save_response.get("object_name", "")
                                                    
                                                    # Normalize paths for comparison (remove .arrow extension if present)
                                                    saved_file_normalized = saved_file.replace(".arrow", "") if saved_file.endswith(".arrow") else saved_file
                                                    params_filename_normalized = params_filename.replace(".arrow", "") if params_filename.endswith(".arrow") else params_filename
                                                    response_filename_normalized = response_filename.replace(".arrow", "") if response_filename.endswith(".arrow") else response_filename
                                                    
                                                    if (params_filename and (params_filename == saved_file or params_filename_normalized == saved_file_normalized)) or \
                                                       (response_filename and (response_filename == saved_file or response_filename_normalized == saved_file_normalized)):
                                                        save_as_name = save_params.get("filename", save_as_name)
                                                        # Check if overwrite_original is true
                                                        is_overwrite = save_params.get("overwrite_original", False)
                                                        logger.info(
                                                            f"🔍 [PIPELINE] Matched save API call for '{saved_file}': "
                                                            f"overwrite_original={is_overwrite}, params.filename={params_filename}"
                                                        )
                                                        break
                                            
                                            # Also check if saved file matches any input file (simpler, more reliable)
                                            if not is_overwrite and saved_file in input_files_set:
                                                is_overwrite = True
                                                logger.info(
                                                    f"🔍 [PIPELINE] Detected overwrite save '{saved_file}' "
                                                    f"(matches input file, even though overwrite_original flag may be missing)"
                                                )
                                            
                                            # Only add to output_files if it's NOT an overwrite save
                                            # Overwrite saves are the same file, not a new derived file
                                            if not is_overwrite:
                                                recorded_output_files.append({
                                                    "file_key": saved_file,
                                                    "file_path": saved_file,
                                                    "flight_path": saved_file,
                                                    "save_as_name": save_as_name,
                                                    "is_default_name": False,
                                                    "columns": [],
                                                    "dtypes": {},
                                                    "row_count": 0
                                                })
                                            else:
                                                logger.info(
                                                    f"🔄 [PIPELINE] Skipping overwrite save '{saved_file}' from output_files "
                                                    f"(it's the same file, not a derived file)"
                                                )
                            
                            # Also preserve existing outputs from step (for files that were saved in previous runs)
                            # CRITICAL: Only preserve save-as files, NOT overwrite saves
                            # Check API calls to determine if existing outputs are from overwrite saves
                            for existing_output in step.get("outputs", []):
                                existing_key = existing_output.get("file_key")
                                if existing_key and not any(out.get("file_key") == existing_key for out in recorded_output_files):
                                    # Check if this output is from an overwrite save by matching with API calls
                                    is_overwrite = False
                                    for api_call in api_calls:
                                        if api_call.get("endpoint", "").endswith("/save"):
                                            save_params = api_call.get("params", {})
                                            save_response = api_call.get("response_data", {})
                                            
                                            # Match by checking if existing_key matches params.filename or response_data
                                            params_filename = save_params.get("filename", "")
                                            response_filename = save_response.get("filename") or save_response.get("object_name", "")
                                            
                                            # Normalize paths for comparison
                                            existing_key_normalized = existing_key.replace(".arrow", "") if existing_key.endswith(".arrow") else existing_key
                                            params_filename_normalized = params_filename.replace(".arrow", "") if params_filename.endswith(".arrow") else params_filename
                                            response_filename_normalized = response_filename.replace(".arrow", "") if response_filename.endswith(".arrow") else response_filename
                                            
                                            if (params_filename and (params_filename == existing_key or params_filename_normalized == existing_key_normalized)) or \
                                               (response_filename and (response_filename == existing_key or response_filename_normalized == existing_key_normalized)):
                                                is_overwrite = save_params.get("overwrite_original", False)
                                                break
                                    
                                    # Also check if existing output matches any input file (simpler, more reliable)
                                    existing_key_norm = normalize_file_path(existing_key)
                                    if not is_overwrite and (existing_key in input_files_set or existing_key_norm in input_files_set):
                                        is_overwrite = True
                                        matched_input = input_files_normalized.get(existing_key_norm, existing_key)
                                        logger.info(
                                            f"🔍 [PIPELINE] Detected overwrite save '{existing_key}' "
                                            f"(matches input file '{matched_input}', even though overwrite_original flag may be missing)"
                                        )
                                    
                                    # Only add if NOT an overwrite save
                                    if not is_overwrite:
                                        recorded_output_files.append(existing_output)
                            
                            # 🔧 CRITICAL: Final safeguard - filter out any overwrite saves that might have slipped through
                            # Double-check all output files against input files before recording
                            filtered_output_files = []
                            for output_file in recorded_output_files:
                                output_key = output_file.get("file_key")
                                if output_key:
                                    output_key_norm = normalize_file_path(output_key)
                                    # If output file matches any input file, it's an overwrite save - skip it
                                    if output_key in input_files_set or output_key_norm in input_files_set:
                                        matched_input = input_files_normalized.get(output_key_norm, output_key)
                                        logger.warning(
                                            f"⚠️ [PIPELINE] FINAL SAFEGUARD: Removing overwrite save '{output_key}' from output_files "
                                            f"(matches input file '{matched_input}')"
                                        )
                                    else:
                                        filtered_output_files.append(output_file)
                            recorded_output_files = filtered_output_files
                            
                            # 🔧 CRITICAL: Update log_entry with output files so frontend can see them
                            log_entry["output_files"] = recorded_output_files
                            
                            # Record execution with all API calls preserved (file replacements already applied)
                            execution_started_at = datetime.utcnow()
                            execution_completed_at = datetime.utcnow() if execution_result["status"] == "success" else None
                            execution_status = execution_result["status"]
                            execution_error = None if execution_result["status"] == "success" else execution_result.get("message", "Execution failed")
                            
                            await record_atom_execution(
                                client_name=request.client_name,
                                app_name=request.app_name,
                                project_name=request.project_name,
                                atom_instance_id=atom_instance_id,
                                card_id=card_id,
                                atom_type=atom_type,
                                atom_title=atom_title,
                                input_files=updated_input_files,  # Use updated input files (with replacements)
                                configuration=updated_config,  # Use updated config (with replacements)
                                api_calls=api_calls,  # All API calls with file replacements applied
                                output_files=recorded_output_files,
                                execution_started_at=execution_started_at,
                                execution_completed_at=execution_completed_at,
                                execution_status=execution_status,
                                execution_error=execution_error,
                                user_id=os.getenv("USER_ID", "unknown"),
                                mode=request.mode,
                                canvas_position=step.get("canvas_position", 0),
                                is_pipeline_rerun=True  # This is a pipeline rerun, so replace endpoints instead of append
                            )
                            logger.info(
                                f"✅ Recorded full execution for {atom_type} ({atom_instance_id}) with {len(api_calls)} API calls preserved"
                            )
                        except Exception as record_error:
                            # Don't fail pipeline execution if recording fails
                            logger.warning(f"⚠️ Failed to record execution for {atom_type} ({atom_instance_id}): {record_error}")
                    
                elif execution_result["status"] == "failed":
                    log_entry["status"] = "failed"
                    log_entry["message"] = execution_result.get("message", "Atom execution failed")
                    failed_count += 1
                    # logger.error(f"❌ Atom execution failed: {log_entry['message']}")
                else:
                    # Pending or unknown status
                    log_entry["status"] = "success"  # Pending is OK, task is queued
                    log_entry["message"] = execution_result.get("message", "Atom execution queued")
                    success_count += 1
                
            except Exception as e:
                log_entry["status"] = "failed"
                log_entry["message"] = str(e)
                failed_count += 1
                # logger.error(f"❌ Error executing atom {atom_type} ({atom_instance_id}): {e}")
            
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
                from minio.error import S3Error
                
                local_minio_client = get_client()
                local_minio_bucket = os.getenv("MINIO_BUCKET", "trinity")
                
                try:
                    objects = list(
                        local_minio_client.list_objects(
                            local_minio_bucket, prefix=prefix, recursive=True
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
                    # logger.info(f"🔄 Starting auto-classification after atom {atom_type} ({atom_instance_id})")
                    await _background_auto_classify_files(
                        files=files,
                        env=env,
                        client_name=request.client_name,
                        app_name=request.app_name,
                        project_name=request.project_name,
                    )
                    # logger.info(f"✅ Auto-classification completed after atom {atom_type} ({atom_instance_id})")
                except S3Error as e:
                    logger.warning(f"⚠️ MinIO error during auto-classification trigger: {e}")
                except Exception as e:
                    logger.warning(f"⚠️ Failed to trigger auto-classification: {e}")
            except Exception as e:
                logger.warning(f"⚠️ Failed to get object prefix for auto-classification: {e}")
            
            # logger.info(
            #     f"🔄 Executed atom {atom_type} ({atom_instance_id}) in card {card_id} "
            #     f"- Status: {log_entry['status']}"
            # )
        
        return RunPipelineResponse(
            status="success",
            message=f"Pipeline execution initiated. {executed_count} atoms queued for execution.",
            executed_atoms=executed_count,
            successful_atoms=success_count,
            failed_atoms=failed_count,
            execution_log=execution_log
        )
        
    except Exception as e:
        # logger.error(f"❌ Error running pipeline: {e}")
        return RunPipelineResponse(
            status="error",
            message=str(e),
            executed_atoms=0,
            successful_atoms=0,
            failed_atoms=0
        )


@router.delete("/remove-steps-by-card")
async def remove_pipeline_steps_by_card_endpoint(
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name"),
    card_id: str = Query(..., description="Card ID to remove steps for"),
    mode: str = Query("laboratory", description="Mode")
):
    """Remove all pipeline execution steps for a specific card_id.
    
    This endpoint is called when a card is deleted to clean up
    the corresponding pipeline execution steps.
    """
    try:
        result = await remove_pipeline_steps_by_card_id(
            client_name,
            app_name,
            project_name,
            card_id,
            mode
        )
        return result
    except Exception as e:
        # logger.error(f"❌ Error removing pipeline steps by card_id: {e}")
        return {
            "status": "error",
            "error": str(e),
            "removed_steps": 0
        }

