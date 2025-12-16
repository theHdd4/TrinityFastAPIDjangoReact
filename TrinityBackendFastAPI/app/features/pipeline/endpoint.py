"""Pipeline execution endpoints."""

from fastapi import APIRouter, Query, HTTPException, Body
from typing import Dict, Any, List, Optional
import logging
import json
import asyncio

from .schemas import (
    PipelineGetResponse,
    RunPipelineRequest,
    RunPipelineResponse,
    PipelineExecutionDocument,
)
from .service import save_pipeline_execution, get_pipeline_execution, record_atom_execution, get_pipeline_collection, save_column_operations, record_column_operations_execution, remove_pipeline_steps_by_card_id
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
        # DROP COLUMNS FROM REPLACEMENT FILES THAT MATCH COLUMN OPERATION COLUMNS
        # ========================================================================
        # This ensures column operations can create columns without conflicts
        if file_replacements and column_operations:
            from app.features.createcolumn.deps import get_minio_df, minio_client, MINIO_BUCKET
            from app.features.dataframe_operations.app.routes import get_object_prefix as get_df_prefix
            import pandas as pd
            import pyarrow as pa
            import pyarrow.ipc as ipc
            import io
            
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
        
        immediate_col_ops = []
        deferred_col_ops = {}  # Map of file_key -> list of operations
        
        for col_op in column_operations:
            input_file = col_op.get("input_file")
            
            # CRITICAL FIX: Apply file replacements to input_file BEFORE categorizing
            # If the original input file has been replaced, use the replacement file
            # This ensures column operations work with the new file, not the old one
            actual_input_file = file_replacements.get(input_file, input_file)
            
            # IMPORTANT: Check if this file is derived in multiple ways:
            # 1. It's in the derived_files set (from execution graph outputs)
            # 2. It's NOT in root_files (it's not an original uploaded file)
            # 3. It contains certain path patterns that indicate it's a saved/processed file
            is_root_file = actual_input_file in root_file_keys
            is_in_derived_set = actual_input_file in derived_files
            
            # If it's NOT a root file, treat it as derived (conservative approach)
            # This ensures that any file created by an atom is properly deferred
            if is_in_derived_set or not is_root_file:
                # Must wait for file to be created - defer this operation
                if actual_input_file not in deferred_col_ops:
                    deferred_col_ops[actual_input_file] = []
                deferred_col_ops[actual_input_file].append(col_op)
            else:
                # File exists (root file) - can execute immediately
                immediate_col_ops.append(col_op)
        
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
        
        # Execute immediate column operations
        from app.features.createcolumn.task_service import submit_perform_task, submit_save_task
        from app.features.dataframe_operations.app.routes import get_object_prefix as get_df_prefix
        from app.core.task_queue import format_task_response, task_result_store
        from datetime import datetime
        import os
        import time
        import csv
        import io
        
        # Define MINIO connection variables once for all column operations (immediate and deferred)
        MINIO_BUCKET = os.getenv("MINIO_BUCKET", "trinity")
        MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
        MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minio")
        MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minio123")
        
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
        
        for col_op in immediate_col_ops:
            execution_start_time = datetime.utcnow()
            try:
                original_input_file = col_op.get("input_file")  # Original file from config
                operations = col_op.get("operations", [])
                overwrite = col_op.get("overwrite_original", False)
                output_file = col_op.get("output_file")
                
                if not operations:
                    logger.warning(f"⚠️ Skipping column operations for {original_input_file}: no operations found")
                    continue
                
                # Apply file replacements
                actual_input_file = file_replacements.get(original_input_file, original_input_file)
                
                operation_type = "OVERWRITE" if overwrite else "SAVE-AS"
                logger.info(
                    f"🔄 Executing column operations ({operation_type}) for file: {original_input_file} "
                    f"-> {actual_input_file if overwrite else (output_file if output_file else actual_input_file)} "
                    f"({len(operations)} operations: {[op.get('type') for op in operations]})"
                )
                
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
                    bucket_name=MINIO_BUCKET,
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
                    logger.error(f"❌ Column operations failed for {original_input_file}: {perform_result.get('error')}")
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
                    logger.info(f"✅ Column operations completed for {input_file} -> {output_file}")
                    execution_log.append({
                        "type": "column_operations",
                        "input_file": input_file,
                        "output_file": output_file,
                        "status": "success",
                        "message": f"Created {len(col_op.get('created_columns', []))} columns"
                    })
                    success_count += 1
                    
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
                else:
                    execution_end_time = datetime.utcnow()
                    logger.error(f"❌ Failed to save column operations result for {input_file}")
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
                logger.error(f"❌ Error executing column operations for {col_op.get('input_file')}: {e}")
                execution_log.append({
                    "type": "column_operations",
                    "input_file": col_op.get("input_file"),
                    "status": "failed",
                    "message": str(e)
                })
                failed_count += 1
                
                # Record failed execution to MongoDB
                # Get original and actual input files
                original_input_file_for_error = col_op.get("input_file")
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
                    
                    # Get all output files from the step (including saved files)
                    # Check both the execution result and the step's outputs array
                    output_files_to_check = []
                    if result_file:
                        output_files_to_check.append(result_file)
                        log_entry["result_file"] = result_file
                        logger.info(f"✅ Atom {atom_type} ({atom_instance_id}) created new result file: {result_file}")
                        
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
                    step_api_calls = step.get("api_calls", [])
                    for api_call in step_api_calls:
                        endpoint = api_call.get("endpoint", "")
                        response_data = api_call.get("response_data", {})
                        # Check for /save endpoints (groupby/save, etc.)
                        if "/save" in endpoint and response_data.get("status") == "SUCCESS":
                            saved_filename = response_data.get("filename")
                            if saved_filename and saved_filename not in output_files_to_check:
                                output_files_to_check.insert(0, saved_filename)
                    
                    # Check each output file for deferred column operations
                    for output_file in output_files_to_check:
                        if output_file in deferred_col_ops:
                            for deferred_col_op in deferred_col_ops[output_file]:
                                deferred_execution_start_time = datetime.utcnow()
                                try:
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
                                        logger.error(f"❌ Deferred column operations failed for {output_file}: {deferred_perform_result.get('error')}")
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
                                            import io
                                            import pandas as pd
                                            import pyarrow as pa
                                            import pyarrow.parquet as pq
                                            
                                            # Load the result file from MinIO (it should be the transformed data)
                                            minio_client = Minio(
                                                MINIO_ENDPOINT,
                                                access_key=MINIO_ACCESS_KEY,
                                                secret_key=MINIO_SECRET_KEY,
                                                secure=False
                                            )
                                            
                                            # Get the object from MinIO
                                            response = minio_client.get_object(MINIO_BUCKET, deferred_result_file)
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
                                            logger.error(f"❌ [STEP {step.get('step_index')}] Failed to load transformed Arrow file: {e}")
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
                                            logger.info(f"✅ Deferred column operations completed for {output_file} -> {deferred_output_file}")
                                            execution_log.append({
                                                "type": "column_operations",
                                                "input_file": output_file,  # Use output_file from the loop
                                                "output_file": deferred_output_file,
                                                "status": "success",
                                                "message": f"Created {len(deferred_col_op.get('created_columns', []))} columns"
                                            })
                                            success_count += 1
                                            
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
                                            logger.error(f"❌ Failed to save deferred column operations result for {output_file}")
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
                                    logger.error(f"❌ Error executing deferred column operations for {output_file}: {e}")
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
        logger.error(f"❌ Error removing pipeline steps by card_id: {e}")
        return {
            "status": "error",
            "error": str(e),
            "removed_steps": 0
        }

