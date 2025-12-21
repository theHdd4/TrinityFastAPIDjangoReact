"""Pipeline execution service functions."""

from __future__ import annotations

import logging
import os
import time
from datetime import datetime
from typing import Any, Dict, List, Optional

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorCollection

from app.core.mongo import build_host_mongo_uri

logger = logging.getLogger(__name__)

# MongoDB connection settings - use same pattern as project_state
# Try to use MONGO_URI from environment first, then build with correct credentials
MONGO_URI_ENV = os.getenv("MONGO_URI")
if MONGO_URI_ENV:
    MONGO_URI = MONGO_URI_ENV
else:
    # Build URI with root credentials (matching docker-compose setup)
    DEFAULT_MONGO_URI = build_host_mongo_uri(
        username="root",
        password="rootpass",
        auth_source="admin",
        default_host="mongo",
        default_port="27017",
    )
    MONGO_URI = DEFAULT_MONGO_URI
MONGO_DB = os.getenv("MONGO_DB", "trinity_db")


async def get_pipeline_collection() -> AsyncIOMotorCollection:
    """Get MongoDB collection for pipeline execution data."""
    client = AsyncIOMotorClient(MONGO_URI)
    db = client[MONGO_DB]
    return db["pipeline_execution"]


async def save_column_operations(
    client_name: str,
    app_name: str,
    project_name: str,
    input_file: str,
    output_file: Optional[str],
    overwrite_original: bool,
    operations: List[Dict[str, Any]],
    created_columns: List[str],
    identifiers: Optional[List[str]] = None,
    mode: str = "laboratory"
) -> Dict[str, Any]:
    """Save column operations to pipeline execution.
    
    Args:
        client_name: Client identifier
        app_name: App identifier
        project_name: Project identifier
        input_file: Input file path
        output_file: Output file path (if new file created, None if overwrite)
        overwrite_original: Whether original file was overwritten
        operations: List of operation dictionaries
        created_columns: List of created column names
        mode: Mode (laboratory, workflow, exhibition)
    
    Returns:
        Result dictionary with status
    """
    try:
        coll = await get_pipeline_collection()
        
        client_id = client_name
        app_id = app_name
        project_id = project_name
        
        # Build composite _id
        doc_id = f"{client_id}/{app_id}/{project_id}"
        
        # Get or create pipeline execution document
        existing_doc = await coll.find_one({"_id": doc_id})
        
        execution_timestamp = datetime.utcnow()
        
        # Build column operations config
        # IMPORTANT: Save original_input_file to help with matching during pipeline execution
        # This ensures save-as operations can match correctly even after overwrite operations
        # update input_file to replacement files
        col_ops_config = {
            "input_file": input_file,
            "original_input_file": input_file,  # Save original file for matching during pipeline execution
            "output_file": output_file,
            "overwrite_original": overwrite_original,
            "operations": operations,
            "created_columns": created_columns,
            "identifiers": identifiers,  # Save identifiers for operations that need grouping
            "saved_at": execution_timestamp,
            "execution_order": None  # Will be set during pipeline run based on file dependencies
        }
        
        if existing_doc:
            # Update existing document
            pipeline = existing_doc.get("pipeline", {})
            column_operations = pipeline.get("column_operations", [])
            
            # Normalize identifiers for comparison (sort and convert to tuple for comparison)
            new_identifiers_tuple = tuple(sorted(identifiers or []))
            
            # FIRST: Remove operations with same created_column_name from ALL configs for this file
            # This ensures the latest operation replaces older ones regardless of identifier group
            new_created_column_names = {op.get("created_column_name", "").lower().strip() 
                                      for op in operations 
                                      if op.get("created_column_name")}
            
            for col_op in column_operations:
                if col_op.get("input_file") == input_file:
                    existing_ops = col_op.get("operations", [])
                    existing_created_cols = col_op.get("created_columns", [])
                    
                    # Filter out operations that will be replaced
                    filtered_ops = []
                    filtered_created_cols = []
                    
                    for op in existing_ops:
                        created_col = op.get("created_column_name", "").lower().strip()
                        if created_col and created_col in new_created_column_names:
                            # This operation will be replaced by a new one, skip it
                            logger.info(
                                f"🗑️ Removing old operation for column '{op.get('created_column_name')}' "
                                f"from file {input_file} (will be replaced by new operation)"
                            )
                        else:
                            filtered_ops.append(op)
                            created_col_original = op.get("created_column_name")
                            if created_col_original and created_col_original not in filtered_created_cols:
                                filtered_created_cols.append(created_col_original)
                    
                    # Update the config with filtered operations
                    col_op["operations"] = filtered_ops
                    col_op["created_columns"] = filtered_created_cols
            
            # Clean up: Remove empty configs (configs with no operations after filtering)
            column_operations = [col_op for col_op in column_operations 
                               if col_op.get("operations") or col_op.get("input_file") != input_file]
            
            # SECOND: Find existing column operations config for this file with matching identifiers AND overwrite_original
            # IMPORTANT: Overwrite and save-as operations should be separate configs even if they have same identifiers
            # Also check if input_file matches any existing output_file (operation on previously created file)
            existing_index = None
            for idx, col_op in enumerate(column_operations):
                stored_input_file = col_op.get("input_file")
                stored_output_file = col_op.get("output_file")
                
                # Match if input_file matches stored input_file OR stored output_file
                if stored_input_file == input_file or stored_output_file == input_file:
                    existing_identifiers = col_op.get("identifiers") or []
                    existing_identifiers_tuple = tuple(sorted(existing_identifiers))
                    existing_overwrite = col_op.get("overwrite_original", True)
                    
                    # If input_file matches stored_output_file, this means we're operating on a previously created file
                    # In this case, if overwriting, we should update the previous operation
                    # If save-as, we should create a new operation entry
                    if stored_output_file == input_file:
                        # Operating on a previously created file
                        if overwrite_original:
                            # Overwriting the previously created file - update that previous operation
                            existing_index = idx
                            break
                        else:
                            # Creating a new file from the previously created file - don't match, create new entry
                            continue
                    else:
                        # Normal case: matching by input_file with matching identifiers and overwrite flag
                        if existing_identifiers_tuple == new_identifiers_tuple and existing_overwrite == overwrite_original:
                            existing_index = idx
                            break
            
            if existing_index is not None:
                # Merge operations: replace operations with same created_column_name, append others
                existing_ops = column_operations[existing_index].get("operations", [])
                existing_created_cols = set(column_operations[existing_index].get("created_columns", []))
                
                # Build a map of created_column_name to operation index in existing ops
                created_col_to_op_idx = {}
                for idx, op in enumerate(existing_ops):
                    created_col = op.get("created_column_name")
                    if created_col:
                        # Normalize column name for comparison (case-insensitive)
                        created_col_lower = created_col.lower().strip()
                        created_col_to_op_idx[created_col_lower] = idx
                
                # Process new operations
                operations_to_append = []
                replaced_count = 0
                
                for new_op in operations:
                    created_col = new_op.get("created_column_name")
                    if created_col:
                        created_col_lower = created_col.lower().strip()
                        if created_col_lower in created_col_to_op_idx:
                            # Replace existing operation with same created_column_name
                            existing_op_idx = created_col_to_op_idx[created_col_lower]
                            existing_ops[existing_op_idx] = new_op
                            replaced_count += 1
                            logger.info(
                                f"🔄 Replaced operation for column '{created_col}' in file {input_file}"
                            )
                        else:
                            # Append new operation
                            operations_to_append.append(new_op)
                            existing_created_cols.add(created_col)
                    else:
                        # No created_column_name, always append
                        operations_to_append.append(new_op)
                
                # Append new operations that don't conflict
                existing_ops.extend(operations_to_append)
                
                # Update created_columns list (union of existing and new)
                updated_created_cols = list(existing_created_cols.union(set(created_columns)))
                
                # Update the existing config
                column_operations[existing_index]["operations"] = existing_ops
                column_operations[existing_index]["created_columns"] = updated_created_cols
                column_operations[existing_index]["saved_at"] = execution_timestamp
                # Preserve original_input_file if it exists, otherwise set it (for backward compatibility)
                if "original_input_file" not in column_operations[existing_index]:
                    column_operations[existing_index]["original_input_file"] = input_file
                # Update output_file if provided (for save-as, this is the new file; for overwrite, it's None or same as input)
                if output_file is not None:
                    column_operations[existing_index]["output_file"] = output_file
                # overwrite_original should already match (that's how we found this config), but update it anyway
                column_operations[existing_index]["overwrite_original"] = overwrite_original
                
                logger.info(
                    f"🔄 Merged column operations for file {input_file} (identifiers: {identifiers}, "
                    f"overwrite: {overwrite_original}) in {doc_id}: {len(operations_to_append)} new, {replaced_count} replaced"
                )
            else:
                # No existing config for this file+identifiers+overwrite combination, add new one
                column_operations.append(col_ops_config)
                logger.info(
                    f"➕ Added new column operations for file {input_file} (identifiers: {identifiers}, "
                    f"overwrite: {overwrite_original}) in {doc_id}"
                )
            
            # Update document
            await coll.update_one(
                {"_id": doc_id},
                {
                    "$set": {
                        "execution_timestamp": execution_timestamp,
                        "pipeline.column_operations": column_operations
                    }
                }
            )
        else:
            # Create new document with column operations
            doc = {
                "_id": doc_id,
                "execution_id": f"exec_{int(time.time() * 1000)}",
                "client_id": client_id,
                "app_id": app_id,
                "project_id": project_id,
                "execution_timestamp": execution_timestamp,
                "user_id": "unknown",
                "pipeline": {
                    "root_files": [],
                    "execution_graph": [],
                    "lineage": {
                        "nodes": [],
                        "edges": []
                    },
                    "column_operations": [col_ops_config]
                },
                "summary": {
                    "total_atoms": 0,
                    "total_files": 0,
                    "root_files_count": 0,
                    "derived_files_count": 0,
                    "total_duration_ms": 0,
                    "status": "success"
                }
            }
            
            await coll.insert_one(doc)
            logger.info(
                f"✅ Created new pipeline execution document with column operations for {doc_id}"
            )
        
        return {
            "status": "success",
            "message": "Column operations saved successfully"
        }
        
    except Exception as e:
        logger.error(f"❌ Error saving column operations: {e}")
        return {
            "status": "error",
            "error": str(e)
        }


def _get_file_metadata(file_key: str, file_path: Optional[str] = None) -> Dict[str, Any]:
    """Get basic file metadata structure."""
    if file_path is None:
        file_path = file_key
    
    # Extract original name from file path
    original_name = file_key.split("/")[-1] if "/" in file_key else file_key
    
    return {
        "file_key": file_key,
        "file_path": file_path,
        "flight_path": file_path,  # Same as file_path for now
        "original_name": original_name,
        "columns": [],
        "dtypes": {},
        "row_count": 0,
        "uploaded_at": None
    }


def _build_input_file(file_key: str, file_path: Optional[str] = None, parent_atom_id: Optional[str] = None) -> Dict[str, Any]:
    """Build input file structure."""
    if file_path is None:
        file_path = file_key
    
    return {
        "file_key": file_key,
        "file_path": file_path,
        "flight_path": file_path,
        "role": "primary",
        "parent_atom_id": parent_atom_id
    }


def _build_output_file(
    file_key: str,
    file_path: Optional[str] = None,
    save_as_name: Optional[str] = None,
    is_default_name: bool = False,
    columns: List[str] = None,
    dtypes: Dict[str, str] = None,
    row_count: int = 0
) -> Dict[str, Any]:
    """Build output file structure."""
    if file_path is None:
        file_path = file_key
    
    return {
        "file_key": file_key,
        "file_path": file_path,
        "flight_path": file_path,
        "save_as_name": save_as_name,
        "is_default_name": is_default_name,
        "columns": columns or [],
        "dtypes": dtypes or {},
        "row_count": row_count
    }


async def record_atom_execution(
    client_name: str,
    app_name: str,
    project_name: str,
    atom_instance_id: str,
    card_id: str,
    atom_type: str,
    atom_title: str,
    input_files: List[str],
    configuration: Dict[str, Any],
    api_calls: List[Dict[str, Any]],
    output_files: List[Dict[str, Any]],
    execution_started_at: datetime,
    execution_completed_at: Optional[datetime] = None,
    execution_status: str = "success",
    execution_error: Optional[str] = None,
    user_id: str = "unknown",
    mode: str = "laboratory",
    canvas_position: int = 0
) -> Dict[str, Any]:
    """Record a single atom execution to the pipeline execution data.
    
    This function builds the new MongoDB structure with execution_graph, lineage, etc.
    
    Args:
        client_name: Client identifier
        app_name: App identifier
        project_name: Project identifier
        atom_instance_id: Unique atom instance identifier
        card_id: Card ID containing the atom
        atom_type: Atom type (e.g., "groupby-wtg-avg")
        atom_title: Atom title/name
        input_files: List of input file keys
        configuration: Atom configuration/parameters
        api_calls: List of API call records
        output_files: List of output file dictionaries
        execution_started_at: When execution started
        execution_completed_at: When execution completed (optional)
        execution_status: Execution status (success, failed, pending)
        execution_error: Error message if failed
        user_id: User identifier
        mode: Mode (laboratory, workflow, exhibition)
    
    Returns:
        Result dictionary with status
    """
    try:
        coll = await get_pipeline_collection()
        
        client_id = client_name
        app_id = app_name
        project_id = project_name
        
        # Build composite _id
        doc_id = f"{client_id}/{app_id}/{project_id}"
        
        # Get or create pipeline execution document
        existing_doc = await coll.find_one({"_id": doc_id})
        
        execution_timestamp = datetime.utcnow()
        execution_id = f"exec_{int(time.time() * 1000)}"
        
        # Calculate duration
        duration_ms = 0
        if execution_completed_at and execution_started_at:
            duration_ms = int((execution_completed_at - execution_started_at).total_seconds() * 1000)
        
        # Build execution graph step
        # step_index will be set correctly after checking for existing step
        step_index = 0
        
        # Build input files
        input_file_objects = []
        for input_file_key in input_files:
            # Check if this file is an output from a previous atom
            parent_atom_id = None
            if existing_doc and "pipeline" in existing_doc and "execution_graph" in existing_doc["pipeline"]:
                for step in existing_doc["pipeline"]["execution_graph"]:
                    for output in step.get("outputs", []):
                        if output.get("file_key") == input_file_key:
                            parent_atom_id = step.get("atom_instance_id")
                            break
                    if parent_atom_id:
                        break
            
            input_file_objects.append(_build_input_file(input_file_key, input_file_key, parent_atom_id))
        
        # Build execution info
        execution_info = {
            "started_at": execution_started_at,
            "completed_at": execution_completed_at,
            "duration_ms": duration_ms,
            "status": execution_status,
            "error": execution_error
        }
        
        # Build execution graph step
        execution_step = {
            "step_index": step_index,
            "atom_instance_id": atom_instance_id,
            "card_id": card_id,
            "atom_type": atom_type,
            "atom_title": atom_title,
            "inputs": input_file_objects,
            "configuration": configuration,
            "api_calls": api_calls,
            "outputs": output_files,
            "execution": execution_info,
            "canvas_position": canvas_position
        }
        
        if existing_doc:
            # Update existing document
            pipeline = existing_doc.get("pipeline", {})
            execution_graph = pipeline.get("execution_graph", [])
            
            # Check if this atom (same atom_instance_id and card_id) was already executed
            existing_step_index = None
            for idx, step in enumerate(execution_graph):
                if (step.get("atom_instance_id") == atom_instance_id and 
                    step.get("card_id") == card_id):
                    existing_step_index = idx
                    break
            
            if existing_step_index is not None:
                # Update existing step - only update configuration, api_calls, outputs, and execution info
                # DO NOT remove subsequent steps
                # DO NOT remove other API calls from the same atom (like /save)
                logger.info(
                    f"🔄 Updating existing execution step for atom {atom_instance_id} in card {card_id} "
                    f"(step_index: {existing_step_index})"
                )
                
                # Get the existing step to preserve its step_index
                existing_step = execution_graph[existing_step_index]
                
                # Merge API calls intelligently:
                # - Keep API calls that are NOT execution-related (like /save, /init, etc.)
                # - Replace execution-related API calls (atom_execution_start, atom_execution_complete)
                # - For chart-maker: Replace /chart-maker/charts calls (chart renders), preserve /chart-maker/load-saved-dataframe calls
                existing_api_calls = existing_step.get("api_calls", [])
                preserved_api_calls = []
                
                # Preserve API calls that are NOT execution-related
                execution_endpoints = ["atom_execution_start", "atom_execution_complete"]
                
                # For chart-maker atoms, we need special handling:
                # - Replace /chart-maker/charts calls (chart rendering) - these are updates to the same chart
                # - Preserve /chart-maker/load-saved-dataframe calls (data loading)
                if atom_type == "chart-maker":
                    chart_rendering_call_count = 0
                    for existing_call in existing_api_calls:
                        endpoint = existing_call.get("endpoint", "")
                        # Preserve data loading calls, but NOT chart rendering calls
                        if endpoint == "/chart-maker/load-saved-dataframe":
                            preserved_api_calls.append(existing_call)
                            logger.info(
                                f"📌 [CHART-MAKER] Preserving data loading API call: {endpoint}"
                            )
                        elif endpoint == "/chart-maker/charts":
                            # Skip chart rendering calls - they will be replaced by new ones
                            chart_rendering_call_count += 1
                            logger.info(
                                f"🔄 [CHART-MAKER] Replacing chart rendering API call: {endpoint} "
                                f"(removed {chart_rendering_call_count} old chart call(s))"
                            )
                        elif endpoint not in execution_endpoints:
                            # Preserve other non-execution calls
                            preserved_api_calls.append(existing_call)
                            logger.info(
                                f"📌 [CHART-MAKER] Preserving API call: {endpoint}"
                            )
                    
                    # Log summary of chart call replacement
                    if chart_rendering_call_count > 0:
                        logger.info(
                            f"🔄 [CHART-MAKER] Replaced {chart_rendering_call_count} old chart rendering call(s) "
                            f"with {len([c for c in api_calls if c.get('endpoint') == '/chart-maker/charts'])} new call(s)"
                        )
                    
                    # Merge preserved calls with new API calls
                    merged_api_calls = preserved_api_calls + api_calls
                    logger.info(
                        f"📋 [CHART-MAKER] Merged API calls: {len(preserved_api_calls)} preserved + {len(api_calls)} new"
                    )
                elif atom_type == "table":
                    # For table atoms, we need special handling:
                    # - Keep only the FIRST /table/load call (initial load)
                    # - Preserve all /table/update, /table/edit-cell, column ops, etc. (operations)
                    # - If a new /table/load comes in, replace the old one (it's just a refresh)
                    has_preserved_load = False
                    load_call_to_preserve = None
                    
                    for existing_call in existing_api_calls:
                        endpoint = existing_call.get("endpoint", "")
                        
                        if "/table/load" in endpoint.lower() or endpoint.endswith("/load"):
                            # Only preserve the first /table/load call
                            if not has_preserved_load:
                                load_call_to_preserve = existing_call
                                has_preserved_load = True
                                logger.info(
                                    f"📌 [TABLE] Preserving first /table/load call"
                                )
                            else:
                                # Skip subsequent /table/load calls (they're just refreshes)
                                logger.info(
                                    f"🔄 [TABLE] Skipping duplicate /table/load call (refresh)"
                                )
                        elif endpoint not in execution_endpoints:
                            # Preserve all other non-execution calls (update, edit-cell, column ops, etc.)
                            preserved_api_calls.append(existing_call)
                            logger.info(
                                f"📌 [TABLE] Preserving API call: {endpoint}"
                            )
                    
                    # Add the preserved load call at the beginning if it exists
                    if load_call_to_preserve:
                        preserved_api_calls.insert(0, load_call_to_preserve)
                    
                    # Check if new API calls include a /table/load
                    new_load_calls = [call for call in api_calls if "/table/load" in call.get("endpoint", "").lower() or call.get("endpoint", "").endswith("/load")]
                    new_operation_calls = [call for call in api_calls if call not in new_load_calls]
                    
                    # 🔧 CRITICAL: Check if the new load is loading a file that's an output from this same atom (save as scenario)
                    new_load_file = None
                    is_loading_own_output = False
                    if new_load_calls:
                        new_load_params = new_load_calls[0].get("params", {})
                        new_load_file = new_load_params.get("object_name", "")
                        
                        # Check if this file is in the outputs of the existing step (save as scenario)
                        existing_outputs = existing_step.get("outputs", [])
                        for output in existing_outputs:
                            if output.get("file_key") == new_load_file:
                                is_loading_own_output = True
                                logger.info(
                                    f"🔄 [TABLE] New /table/load is loading own output file '{new_load_file}' (save as scenario) - preserving all old operations"
                                )
                                break
                    
                    if new_load_calls:
                        if is_loading_own_output:
                            # Save as scenario: preserve ALL old operations (load, updates, etc.)
                            # Add new load at the beginning, but keep all old operations
                            merged_api_calls = new_load_calls + preserved_api_calls + new_operation_calls
                            logger.info(
                                f"📋 [TABLE] Save as scenario: {len(new_load_calls)} new load(s) + {len(preserved_api_calls)} preserved operations + {len(new_operation_calls)} new operations"
                            )
                        else:
                            # Regular file refresh: replace old load, preserve operations
                            if load_call_to_preserve:
                                logger.info(
                                    f"🔄 [TABLE] Replacing old /table/load with new one (file refresh)"
                                )
                                # Remove the old load call from preserved_api_calls
                                preserved_api_calls = [call for call in preserved_api_calls if call != load_call_to_preserve]
                            # Add the new load call at the beginning
                            # Then preserved operations, then new operations
                            merged_api_calls = new_load_calls + preserved_api_calls + new_operation_calls
                            logger.info(
                                f"📋 [TABLE] Merged API calls: {len(new_load_calls)} load(s) + {len(preserved_api_calls)} preserved + {len(new_operation_calls)} new operations"
                            )
                    else:
                        # No new load call, just append new operation calls (updates, etc.) at the end
                        merged_api_calls = preserved_api_calls + new_operation_calls
                        logger.info(
                            f"📋 [TABLE] Merged API calls: {len(preserved_api_calls)} preserved + {len(new_operation_calls)} new operations"
                        )
                elif atom_type == "groupby-wtg-avg":
                    # For groupby atoms: Preserve ALL API calls (including execution markers) to maintain full sequence
                    # This allows multiple init/run sequences for different files
                    # Example: init(file1) -> run(file1) -> init(file2) -> run(file2) -> save
                    merged_api_calls = existing_api_calls + api_calls
                    logger.info(
                        f"📋 [GROUPBY] Appended {len(api_calls)} new API call(s) to existing {len(existing_api_calls)} call(s). "
                        f"Total: {len(merged_api_calls)} API calls preserved."
                    )
                else:
                    # For other atom types, use the original logic
                    for existing_call in existing_api_calls:
                        endpoint = existing_call.get("endpoint", "")
                        # Keep API calls that are not execution-related (like /save, /init, etc.)
                        if endpoint not in execution_endpoints:
                            preserved_api_calls.append(existing_call)
                            logger.info(
                                f"📌 Preserving API call: {endpoint} (not execution-related)"
                            )
                    
                    # Add new execution API calls
                    merged_api_calls = preserved_api_calls + api_calls
                
                # Update only the fields that might change (configuration, api_calls, outputs, execution)
                # Preserve step_index and other metadata
                existing_step["configuration"] = configuration
                existing_step["api_calls"] = merged_api_calls
                existing_step["execution"] = execution_info
                
                # Handle outputs: append for groupby, replace for others
                if atom_type == "groupby-wtg-avg":
                    # For groupby: append new output files to existing ones (avoid duplicates)
                    existing_outputs = existing_step.get("outputs", [])
                    existing_output_keys = {out.get("file_key") for out in existing_outputs if out.get("file_key")}
                    
                    for new_output in output_files:
                        new_output_key = new_output.get("file_key")
                        if new_output_key and new_output_key not in existing_output_keys:
                            existing_outputs.append(new_output)
                            existing_output_keys.add(new_output_key)
                            logger.info(
                                f"➕ [GROUPBY] Appended output file: {new_output_key}"
                            )
                        elif new_output_key in existing_output_keys:
                            # Update existing output with new data (e.g., updated save_as_name)
                            for idx, existing_out in enumerate(existing_outputs):
                                if existing_out.get("file_key") == new_output_key:
                                    existing_outputs[idx] = new_output
                                    logger.info(
                                        f"🔄 [GROUPBY] Updated existing output file: {new_output_key}"
                                    )
                                    break
                    
                    existing_step["outputs"] = existing_outputs
                else:
                    # For other atom types, replace outputs
                    existing_step["outputs"] = output_files
                
                # 🔧 Handle input file updates intelligently
                if atom_type == "groupby-wtg-avg":
                    # For groupby: append input files (avoid duplicates)
                    # Also extract input files from API call params to ensure all files are tracked
                    existing_inputs = existing_step.get("inputs", [])
                    existing_input_keys = {inp.get("file_key") for inp in existing_inputs if inp.get("file_key")}
                    
                    # Add input files from the new API calls' params
                    for api_call in api_calls:
                        params = api_call.get("params", {})
                        # Check multiple possible param keys that might contain file paths
                        file_param_keys = ["object_names", "file_key", "object_name", "source_object", "data_source", 
                                         "input_file", "input_files", "file1", "file2", "left_file", "right_file"]
                        for key in file_param_keys:
                            if key in params:
                                file_value = params[key]
                                # Handle both string and list of strings
                                if isinstance(file_value, str) and file_value:
                                    if file_value not in existing_input_keys:
                                        # Check if this file is an output from a previous atom
                                        parent_atom_id = None
                                        if existing_doc and "pipeline" in existing_doc and "execution_graph" in existing_doc["pipeline"]:
                                            for prev_step in existing_doc["pipeline"]["execution_graph"]:
                                                for output in prev_step.get("outputs", []):
                                                    if output.get("file_key") == file_value:
                                                        parent_atom_id = prev_step.get("atom_instance_id")
                                                        break
                                                if parent_atom_id:
                                                    break
                                        
                                        new_input_obj = _build_input_file(file_value, file_value, parent_atom_id)
                                        existing_inputs.append(new_input_obj)
                                        existing_input_keys.add(file_value)
                                        logger.info(
                                            f"➕ [GROUPBY] Appended input file from API call params: {file_value} (param: {key})"
                                        )
                                elif isinstance(file_value, list):
                                    # Handle list of files
                                    for file_item in file_value:
                                        if isinstance(file_item, str) and file_item and file_item not in existing_input_keys:
                                            # Check if this file is an output from a previous atom
                                            parent_atom_id = None
                                            if existing_doc and "pipeline" in existing_doc and "execution_graph" in existing_doc["pipeline"]:
                                                for prev_step in existing_doc["pipeline"]["execution_graph"]:
                                                    for output in prev_step.get("outputs", []):
                                                        if output.get("file_key") == file_item:
                                                            parent_atom_id = prev_step.get("atom_instance_id")
                                                            break
                                                    if parent_atom_id:
                                                        break
                                            
                                            new_input_obj = _build_input_file(file_item, file_item, parent_atom_id)
                                            existing_inputs.append(new_input_obj)
                                            existing_input_keys.add(file_item)
                                            logger.info(
                                                f"➕ [GROUPBY] Appended input file from API call params: {file_item} (param: {key})"
                                            )
                    
                    # Also add input files from input_file_objects (from the function parameter)
                    for new_input in input_file_objects:
                        new_input_key = new_input.get("file_key")
                        if new_input_key and new_input_key not in existing_input_keys:
                            existing_inputs.append(new_input)
                            existing_input_keys.add(new_input_key)
                            logger.info(
                                f"➕ [GROUPBY] Appended input file: {new_input_key}"
                            )
                    
                    existing_step["inputs"] = existing_inputs
                else:
                    # For other atom types, use the original logic
                    # 1. If new inputs are empty: preserve existing inputs (for operations like /update, /edit-cell)
                    # 2. If new input is a derived file from this same atom (save as scenario): update inputs but preserve old operations
                    # 3. If new input is a different file (file replacement): update inputs
                    if input_file_objects:
                        # Check if the new input file is an output from this same step (save as scenario)
                        new_input_file = input_file_objects[0].get("file_key") if input_file_objects else None
                        existing_outputs = existing_step.get("outputs", [])
                        is_loading_own_output = False
                        
                        if new_input_file:
                            for output in existing_outputs:
                                if output.get("file_key") == new_input_file:
                                    is_loading_own_output = True
                                    logger.info(
                                        f"🔄 [TABLE] New input file '{new_input_file}' is own output (save as) - updating inputs but preserving operations"
                                    )
                                    break
                        
                        if is_loading_own_output:
                            # Save as scenario: update inputs to the new file, but operations are already preserved above
                            existing_step["inputs"] = input_file_objects
                        else:
                            # Regular file replacement or initial load: update inputs
                            existing_step["inputs"] = input_file_objects
                    # Otherwise, keep existing inputs (they were set by the initial /load call)
                
                # Update the step in place
                execution_graph[existing_step_index] = existing_step
                
                logger.info(
                    f"✅ Updated execution step configuration, api_calls ({len(merged_api_calls)} total, "
                    f"{len(preserved_api_calls)} preserved), outputs, and execution info. "
                    f"All subsequent steps preserved. Execution graph has {len(execution_graph)} steps."
                )
            else:
                # New execution, set step_index and append it
                execution_step["step_index"] = len(execution_graph)
                execution_graph.append(execution_step)
                logger.info(
                    f"➕ Added new execution step for atom {atom_instance_id} in card {card_id} "
                    f"(step_index: {execution_step['step_index']})"
                )
            
            # Update root files - add input files that aren't outputs from previous steps
            root_files = pipeline.get("root_files", [])
            root_file_keys = {rf.get("file_key") for rf in root_files}
            
            # 🔧 CRITICAL: Remove files from root_files if they become outputs (derived files)
            # This ensures that when a file is saved (save as), it's marked as derived, not root
            output_file_keys = {output.get("file_key") for output in output_files}
            root_files = [rf for rf in root_files if rf.get("file_key") not in output_file_keys]
            root_file_keys = {rf.get("file_key") for rf in root_files}
            
            # Check if input files are already in root_files or are outputs from previous steps
            # Also check if they're outputs from column operations
            column_operations = pipeline.get("column_operations", [])
            column_op_output_files = set()
            for col_op in column_operations:
                col_op_output = col_op.get("output_file")
                col_op_input = col_op.get("input_file")
                overwrite = col_op.get("overwrite_original", True)
                # Consider it a derived file if:
                # 1. It's explicitly a save-as (not overwrite), OR
                # 2. output_file exists and is different from input_file (save-as scenario, even if flag is wrong)
                if col_op_output:
                    if not overwrite or (col_op_input and col_op_output != col_op_input):
                        column_op_output_files.add(col_op_output)
            
            for input_file_key in input_files:
                is_output = False
                # Check if it's an output from a previous atom step
                for step in execution_graph[:-1]:  # Exclude the step we just added
                    for output in step.get("outputs", []):
                        if output.get("file_key") == input_file_key:
                            is_output = True
                            break
                    if is_output:
                        break
                
                # Also check if it's an output from column operations
                if not is_output and input_file_key in column_op_output_files:
                    is_output = True
                
                if not is_output and input_file_key not in root_file_keys:
                    root_files.append(_get_file_metadata(input_file_key))
                    root_file_keys.add(input_file_key)
            
            # Rebuild lineage from scratch to ensure it's correct after updates
            lineage = {"nodes": [], "edges": []}
            nodes = []
            edges = []
            all_file_keys = set()
            
            # Collect all file keys from root files
            for rf in root_files:
                file_key = rf.get("file_key")
                if file_key:
                    all_file_keys.add(file_key)
            
            # Build lineage from execution graph (top to bottom)
            for step in execution_graph:
                atom_node_id = step.get("atom_instance_id")
                atom_title = step.get("atom_title", step.get("atom_type", "Unknown"))
                
                # Add atom node
                if not any(n.get("id") == atom_node_id for n in nodes):
                    nodes.append({
                        "id": atom_node_id,
                        "type": "atom",
                        "label": atom_title
                    })
                
                # Add input file nodes and edges
                for input_file in step.get("inputs", []):
                    file_key = input_file.get("file_key")
                    if file_key:
                        file_node_id = file_key
                        all_file_keys.add(file_key)
                        
                        # Add file node if not exists
                        if not any(n.get("id") == file_node_id for n in nodes):
                            file_name = file_key.split("/")[-1] if "/" in file_key else file_key
                            nodes.append({
                                "id": file_node_id,
                                "type": "file",
                                "label": file_name
                            })
                        
                        # Add edge from file to atom
                        edge_exists = any(
                            (e.get("from") == file_node_id or e.get("from_node") == file_node_id) and 
                            (e.get("to") == atom_node_id or e.get("to_node") == atom_node_id)
                            for e in edges
                        )
                        if not edge_exists:
                            edges.append({
                                "from": file_node_id,
                                "to": atom_node_id
                            })
                
                # Add output file nodes and edges
                for output_file in step.get("outputs", []):
                    file_key = output_file.get("file_key")
                    if file_key:
                        file_node_id = file_key
                        all_file_keys.add(file_key)
                        # Handle None values explicitly - if save_as_name is None or missing, use file_key filename
                        save_as_name = output_file.get("save_as_name")
                        if not save_as_name:
                            save_as_name = file_key.split("/")[-1] if "/" in file_key else file_key
                        if not save_as_name:
                            save_as_name = "output_file"
                        
                        # Add file node if not exists
                        if not any(n.get("id") == file_node_id for n in nodes):
                            nodes.append({
                                "id": file_node_id,
                                "type": "file",
                                "label": save_as_name
                            })
                        
                        # Add edge from atom to file
                        edge_exists = any(
                            (e.get("from") == atom_node_id or e.get("from_node") == atom_node_id) and 
                            (e.get("to") == file_node_id or e.get("to_node") == file_node_id)
                            for e in edges
                        )
                        if not edge_exists:
                            edges.append({
                                "from": atom_node_id,
                                "to": file_node_id
                            })
            
            lineage["nodes"] = nodes
            lineage["edges"] = edges
            
            # Update summary
            summary = existing_doc.get("summary", {})
            summary["total_atoms"] = len(execution_graph)
            
            # Count all unique files (only .arrow files, exclude CSV temp files)
            arrow_file_keys = {fk for fk in all_file_keys if fk.endswith(".arrow")}
            
            summary["total_files"] = len(arrow_file_keys)
            summary["root_files_count"] = len([rf for rf in root_files if rf.get("file_key", "").endswith(".arrow")])
            summary["derived_files_count"] = summary["total_files"] - summary["root_files_count"]
            
            # Recalculate total duration from all steps
            total_duration = 0
            for step in execution_graph:
                exec_info = step.get("execution", {})
                if exec_info.get("duration_ms"):
                    total_duration += exec_info.get("duration_ms", 0)
            summary["total_duration_ms"] = total_duration
            
            # Update status
            if execution_status == "failed":
                summary["status"] = "failed"
            elif summary.get("status") == "success" and execution_status == "success":
                summary["status"] = "success"
            else:
                summary["status"] = "partial"
            
            # Update document
            await coll.update_one(
                {"_id": doc_id},
                {
                    "$set": {
                        "execution_timestamp": execution_timestamp,
                        "pipeline.execution_graph": execution_graph,
                        "pipeline.root_files": root_files,
                        "pipeline.lineage.nodes": nodes,
                        "pipeline.lineage.edges": edges,
                        "summary": summary
                    }
                }
            )
        else:
            # Create new document
            root_files = []
            for input_file_key in input_files:
                root_files.append(_get_file_metadata(input_file_key))
            
            # Build initial lineage
            nodes = []
            edges = []
            
            # Add input file nodes
            for input_file_key in input_files:
                file_name = input_file_key.split("/")[-1] if "/" in input_file_key else input_file_key
                nodes.append({
                    "id": input_file_key,
                    "type": "file",
                    "label": file_name
                })
            
            # Add atom node
            nodes.append({
                "id": atom_instance_id,
                "type": "atom",
                "label": atom_title
            })
            
            # Add edges from input files to atom
            for input_file_key in input_files:
                edges.append({
                    "from": input_file_key,
                    "to": atom_instance_id
                })
            
            # Add output file nodes and edges
            for output_file in output_files:
                file_key = output_file.get("file_key")
                if file_key:
                    # Use save_as_name if provided, otherwise use file_key filename, otherwise use default
                    save_as_name = output_file.get("save_as_name")
                    if not save_as_name:
                        save_as_name = file_key.split("/")[-1] if "/" in file_key else file_key
                    if not save_as_name:
                        save_as_name = "chart_maker_output"
                    nodes.append({
                        "id": file_key,
                        "type": "file",
                        "label": save_as_name
                    })
                    edges.append({
                        "from": atom_instance_id,
                        "to": file_key
                    })
            
            # Build summary (only .arrow files, exclude CSV temp files)
            all_file_keys = set()
            for rf in root_files:
                file_key = rf.get("file_key")
                if file_key and file_key.endswith(".arrow"):
                    all_file_keys.add(file_key)
            for output_file in output_files:
                file_key = output_file.get("file_key")
                # Only count .arrow files, exclude CSV temp files
                if file_key and file_key.endswith(".arrow"):
                    all_file_keys.add(file_key)
            
            summary = {
                "total_atoms": 1,
                "total_files": len(all_file_keys),
                "root_files_count": len(root_files),
                "derived_files_count": len(all_file_keys) - len(root_files),
                "total_duration_ms": duration_ms,
                "status": execution_status
            }
            
            doc = {
                "_id": doc_id,
                "execution_id": execution_id,
                "client_id": client_id,
                "app_id": app_id,
                "project_id": project_id,
                "execution_timestamp": execution_timestamp,
                "user_id": user_id,
                "pipeline": {
                    "root_files": root_files,
                    "execution_graph": [execution_step],
                    "lineage": {
                        "nodes": nodes,
                        "edges": edges
                    }
                },
                "summary": summary
            }
            
            await coll.insert_one(doc)
        
        logger.info(
            f"✅ Recorded atom execution: {atom_type} ({atom_instance_id}) "
            f"for {client_id}/{app_id}/{project_id}"
        )
        
        return {
            "status": "success",
            "message": "Atom execution recorded successfully"
        }
        
    except Exception as e:
        logger.error(f"❌ Error recording atom execution: {e}")
        return {
            "status": "error",
            "error": str(e)
        }


async def record_column_operations_execution(
    client_name: str,
    app_name: str,
    project_name: str,
    input_file: str,
    output_file: Optional[str],
    operations: List[Dict[str, Any]],
    created_columns: List[str],
    execution_started_at: datetime,
    execution_completed_at: Optional[datetime] = None,
    execution_status: str = "success",
    execution_error: Optional[str] = None,
    identifiers: Optional[List[str]] = None,
    original_input_file: Optional[str] = None,  # Original file from config (for matching)
    mode: str = "laboratory"
) -> Dict[str, Any]:
    """Record column operations execution to the pipeline execution data.
    
    Args:
        client_name: Client identifier
        app_name: App identifier
        project_name: Project identifier
        input_file: Input file path
        output_file: Output file path
        operations: List of operation dictionaries
        created_columns: List of created column names
        execution_started_at: When execution started
        execution_completed_at: When execution completed (optional)
        execution_status: Execution status (success, failed, pending)
        execution_error: Error message if failed
        mode: Mode (laboratory, workflow, exhibition)
    
    Returns:
        Result dictionary with status
    """
    try:
        coll = await get_pipeline_collection()
        
        client_id = client_name
        app_id = app_name
        project_id = project_name
        
        # Build composite _id
        doc_id = f"{client_id}/{app_id}/{project_id}"
        
        # Get existing document (may not exist if cleared and no atoms executed yet)
        existing_doc = await coll.find_one({"_id": doc_id})
        
        execution_timestamp = datetime.utcnow()
        
        # Calculate duration
        duration_ms = 0
        if execution_completed_at and execution_started_at:
            duration_ms = int((execution_completed_at - execution_started_at).total_seconds() * 1000)
        
        # Build execution info
        execution_info = {
            "started_at": execution_started_at,
            "completed_at": execution_completed_at,
            "duration_ms": duration_ms,
            "status": execution_status,
            "error": execution_error
        }
        
        if existing_doc:
            # Document exists, update it
            pipeline = existing_doc.get("pipeline", {})
            column_operations = pipeline.get("column_operations", [])
            execution_graph = pipeline.get("execution_graph", [])  # Define early so it's available in all branches
            
            # Find the column operations config for this input_file
            # When a file is replaced, input_file will be the replacement file, but we need to match
            # by the original_input_file from the config (preserved from initial save) or from function parameter
            col_op_index = None
            match_input_file = original_input_file if original_input_file else input_file
            
            for idx, col_op in enumerate(column_operations):
                stored_input_file = col_op.get("input_file")
                stored_original_input_file = col_op.get("original_input_file")  # Get original file from config
                # Use stored_original_input_file if available (for matching against original file),
                # otherwise fall back to stored_input_file (backward compatibility)
                config_original_file = stored_original_input_file if stored_original_input_file else stored_input_file
                
                # CRITICAL FIX: Match using multiple strategies to handle file replacements:
                # 1. Match by original_input_file from config (preserved from initial save)
                # 2. Match by stored input_file (current file in config, may have been updated by overwrite)
                # 3. Match by current input_file (replacement file being used now)
                # This ensures save-as operations can match even after overwrite updates input_file
                matches_file = (
                    config_original_file == match_input_file or  # Original file from config matches
                    stored_input_file == match_input_file or  # Stored file matches original
                    stored_input_file == input_file or  # Stored file matches current file
                    (original_input_file and config_original_file == original_input_file)  # Config original matches parameter original
                )
                
                if matches_file:
                    # Also check identifiers match (in case there are multiple configs for same file)
                    existing_identifiers = tuple(sorted(col_op.get("identifiers") or []))
                    new_identifiers = tuple(sorted(identifiers or [])) if identifiers is not None else tuple()
                    # Also check overwrite_original to distinguish between overwrite and save-as
                    existing_overwrite = col_op.get("overwrite_original", True)
                    new_overwrite = (output_file is None or output_file == input_file)  # None or same = overwrite
                    
                    if existing_identifiers == new_identifiers and existing_overwrite == new_overwrite:
                        col_op_index = idx
                        break
                    # If no identifiers specified, match first config for this file with matching overwrite (backward compatibility)
                    elif identifiers is None and existing_identifiers == tuple() and existing_overwrite == new_overwrite:
                        col_op_index = idx
                        break
            
            if col_op_index is not None:
                # Update existing config with execution info
                column_operations[col_op_index]["execution"] = execution_info
                # Update input_file to the replacement file if it was replaced
                column_operations[col_op_index]["input_file"] = input_file  # Update to replacement file
                # IMPORTANT: Preserve original_input_file - don't overwrite it, it's used for matching
                # Only set it if it doesn't exist (backward compatibility)
                if "original_input_file" not in column_operations[col_op_index]:
                    column_operations[col_op_index]["original_input_file"] = original_input_file if original_input_file else input_file
                # For overwrite, output_file should be None or same as input_file
                if output_file is None or output_file == input_file:
                    column_operations[col_op_index]["output_file"] = None  # Overwrite: no separate output file
                    column_operations[col_op_index]["overwrite_original"] = True
                else:
                    column_operations[col_op_index]["output_file"] = output_file  # Save-as: separate output file
                    column_operations[col_op_index]["overwrite_original"] = False
                
                # If column operations created a new file (save-as scenario), ensure it's NOT in root_files
                # It should be treated as a derived file (output from column operations)
                # Check if output_file is different from input_file (save-as) or explicitly not overwrite
                overwrite_original = column_operations[col_op_index].get("overwrite_original", True)
                input_file_from_config = column_operations[col_op_index].get("input_file")
                is_save_as = output_file and (not overwrite_original or (input_file_from_config and output_file != input_file_from_config))
                if is_save_as:
                    # Remove output_file from root_files if it exists there
                    root_files = pipeline.get("root_files", [])
                    root_files = [rf for rf in root_files if rf.get("file_key") != output_file]
                    
                    # Update summary counts
                    summary = existing_doc.get("summary", {})
                    root_files_count = len([rf for rf in root_files if rf.get("file_key", "").endswith(".arrow")])
                    all_file_keys = set()
                    for rf in root_files:
                        file_key = rf.get("file_key")
                        if file_key and file_key.endswith(".arrow"):
                            all_file_keys.add(file_key)
                    # Add column operation output files
                    for col_op in column_operations:
                        col_op_output = col_op.get("output_file")
                        col_op_overwrite = col_op.get("overwrite_original", True)
                        if col_op_output and not col_op_overwrite and col_op_output.endswith(".arrow"):
                            all_file_keys.add(col_op_output)
                    # Add atom output files
                    for step in execution_graph:
                        for output in step.get("outputs", []):
                            file_key = output.get("file_key")
                            if file_key and file_key.endswith(".arrow"):
                                all_file_keys.add(file_key)
                    derived_files_count = len(all_file_keys) - root_files_count
                    summary["root_files_count"] = root_files_count
                    summary["derived_files_count"] = derived_files_count
                    summary["total_files"] = len(all_file_keys)
                    
                    # Update document with both column_operations, root_files, and summary
                    await coll.update_one(
                        {"_id": doc_id},
                        {
                            "$set": {
                                "pipeline.column_operations": column_operations,
                                "pipeline.root_files": root_files,
                                "summary": summary,
                                "execution_timestamp": execution_timestamp
                            }
                        }
                    )
                    logger.info(
                        f"✅ Updated column operations execution for {input_file} in {doc_id}, "
                        f"removed output file {output_file} from root_files (it's a derived file)"
                    )
                else:
                    # Just update column_operations
                    await coll.update_one(
                        {"_id": doc_id},
                        {
                            "$set": {
                                "pipeline.column_operations": column_operations,
                                "execution_timestamp": execution_timestamp
                            }
                        }
                    )
                    logger.info(
                        f"✅ Updated column operations execution for {input_file} in {doc_id}"
                    )
            else:
                # Config not found, create new one
                # This can happen when:
                # 1. Document was cleared and this is the first operation
                # 2. Multiple operations on same file with different overwrite_original values
                # 3. File was replaced and matching failed
                logger.warning(
                    f"⚠️ Column operations config not found for input_file={input_file}, "
                    f"original_input_file={original_input_file}, output_file={output_file}, "
                    f"overwrite={output_file is None or output_file == input_file} in {doc_id}, creating new config. "
                    f"Checked {len(column_operations)} existing configs."
                )
                # Determine overwrite_original based on output_file
                # If output_file is None or same as input_file, it's an overwrite operation
                overwrite_original = (output_file is None or output_file == input_file)
                
                new_col_op_config = {
                    "input_file": input_file,
                    "original_input_file": original_input_file if original_input_file else input_file,  # Save original for matching
                    "output_file": output_file,
                    "overwrite_original": overwrite_original,
                    "operations": operations,
                    "created_columns": created_columns,
                    "identifiers": identifiers,
                    "saved_at": execution_timestamp,
                    "execution_order": None,
                    "execution": execution_info
                }
                column_operations.append(new_col_op_config)
                
                # If column operations created a new file (save-as scenario), ensure it's NOT in root_files
                overwrite_original = new_col_op_config.get("overwrite_original", True)
                input_file_from_config = new_col_op_config.get("input_file")
                is_save_as = output_file and (not overwrite_original or (input_file_from_config and output_file != input_file_from_config))
                if is_save_as:
                    # Remove output_file from root_files if it exists there
                    root_files = pipeline.get("root_files", [])
                    root_files = [rf for rf in root_files if rf.get("file_key") != output_file]
                    
                    # Update summary counts
                    summary = existing_doc.get("summary", {})
                    root_files_count = len([rf for rf in root_files if rf.get("file_key", "").endswith(".arrow")])
                    all_file_keys = set()
                    for rf in root_files:
                        file_key = rf.get("file_key")
                        if file_key and file_key.endswith(".arrow"):
                            all_file_keys.add(file_key)
                    # Add column operation output files (save-as scenarios)
                    for col_op in column_operations:
                        col_op_output = col_op.get("output_file")
                        col_op_input = col_op.get("input_file")
                        col_op_overwrite = col_op.get("overwrite_original", True)
                        # Include if it's a save-as (not overwrite OR output differs from input)
                        if col_op_output and col_op_output.endswith(".arrow"):
                            if not col_op_overwrite or (col_op_input and col_op_output != col_op_input):
                                all_file_keys.add(col_op_output)
                    # Add atom output files
                    execution_graph = pipeline.get("execution_graph", [])
                    for step in execution_graph:
                        for output in step.get("outputs", []):
                            file_key = output.get("file_key")
                            if file_key and file_key.endswith(".arrow"):
                                all_file_keys.add(file_key)
                    derived_files_count = len(all_file_keys) - root_files_count
                    summary["root_files_count"] = root_files_count
                    summary["derived_files_count"] = derived_files_count
                    summary["total_files"] = len(all_file_keys)
                    
                    update_result = await coll.update_one(
                        {"_id": doc_id},
                        {
                            "$set": {
                                "pipeline.column_operations": column_operations,
                                "pipeline.root_files": root_files,
                                "summary": summary,
                                "execution_timestamp": execution_timestamp
                            }
                        }
                    )
                    logger.info(
                        f"✅ Created new column operations config and updated document for {input_file} -> {output_file} "
                        f"(save-as) in {doc_id}, matched_count={update_result.matched_count}, "
                        f"modified_count={update_result.modified_count}"
                    )
                else:
                    update_result = await coll.update_one(
                        {"_id": doc_id},
                        {
                            "$set": {
                                "pipeline.column_operations": column_operations,
                                "execution_timestamp": execution_timestamp
                            }
                        }
                    )
                    logger.info(
                        f"✅ Created new column operations config and updated document for {input_file} "
                        f"(overwrite) in {doc_id}, matched_count={update_result.matched_count}, "
                        f"modified_count={update_result.modified_count}"
                    )
        else:
            # Document doesn't exist yet (cleared and no atoms executed), create it
            import time
            execution_id = f"exec_{int(time.time() * 1000)}"
            
            # Determine overwrite_original based on output_file
            # If output_file is None or same as input_file, it's an overwrite operation
            overwrite_original = (output_file is None or output_file == input_file)
            
            new_col_op_config = {
                "input_file": input_file,
                "original_input_file": original_input_file if original_input_file else input_file,  # Save original for matching
                "output_file": output_file,
                "overwrite_original": overwrite_original,
                "operations": operations,
                "created_columns": created_columns,
                "identifiers": identifiers,
                "saved_at": execution_timestamp,
                "execution_order": None,
                "execution": execution_info
            }
            
            doc = {
                "_id": doc_id,
                "execution_id": execution_id,
                "client_id": client_id,
                "app_id": app_id,
                "project_id": project_id,
                "execution_timestamp": execution_timestamp,
                "user_id": "unknown",
                "pipeline": {
                    "root_files": [],
                    "execution_graph": [],
                    "lineage": {
                        "nodes": [],
                        "edges": []
                    },
                    "column_operations": [new_col_op_config]
                },
                "summary": {
                    "total_atoms": 0,
                    "total_files": 0,
                    "root_files_count": 0,
                    "derived_files_count": 0,
                    "total_duration_ms": duration_ms,
                    "status": execution_status
                }
            }
            
            await coll.insert_one(doc)
            logger.info(
                f"✅ Created new pipeline document with column operations execution for {doc_id}"
            )
        
        logger.info(
            f"✅ Recorded column operations execution: {input_file} -> {output_file} "
            f"for {client_id}/{app_id}/{project_id}"
        )
        
        return {
            "status": "success",
            "message": "Column operations execution recorded successfully"
        }
        
    except Exception as e:
        logger.error(f"❌ Error recording column operations execution: {e}")
        return {
            "status": "error",
            "error": str(e)
        }


async def get_pipeline_execution(
    client_name: str,
    app_name: str,
    project_name: str,
    mode: str = "laboratory"
) -> Optional[Dict[str, Any]]:
    """Retrieve pipeline execution data from MongoDB.
    
    Args:
        client_name: Client identifier
        app_name: App identifier
        project_name: Project identifier
        mode: Mode (laboratory, workflow, exhibition) - not used in new structure but kept for compatibility
    
    Returns:
        Pipeline execution data dictionary or None if not found
    """
    try:
        coll = await get_pipeline_collection()
        
        client_id = client_name
        app_id = app_name
        project_id = project_name
        
        # Build composite _id
        doc_id = f"{client_id}/{app_id}/{project_id}"
        
        # Query for pipeline data
        pipeline_doc = await coll.find_one({"_id": doc_id})
        
        if not pipeline_doc:
            logger.info(
                f"📦 No pipeline execution data found for {client_id}/{app_id}/{project_id} "
                f"(doc_id: {doc_id})"
            )
            return None
        
        # Convert ObjectId to string if present (shouldn't happen with string _id, but just in case)
        if "_id" in pipeline_doc and not isinstance(pipeline_doc["_id"], str):
            pipeline_doc["_id"] = str(pipeline_doc["_id"])
        
        # Check if document has valid pipeline structure
        pipeline = pipeline_doc.get("pipeline", {})
        execution_graph = pipeline.get("execution_graph", [])
        column_operations = pipeline.get("column_operations", [])
        
        # If document exists but has no execution graph and no column operations, it's essentially empty
        # But we should still return it if it has at least column operations (they can run even without atoms)
        if len(execution_graph) == 0 and len(column_operations) == 0:
            logger.warning(
                f"⚠️ Pipeline document exists but is empty (no atoms, no column operations) for {doc_id}"
            )
            return None
        
        logger.info(
            f"📦 Retrieved pipeline execution data for {client_id}/{app_id}/{project_id} "
            f"(atoms: {len(execution_graph)}, column_ops: {len(column_operations)})"
        )
        
        return pipeline_doc
        
    except Exception as e:
        logger.error(f"❌ Error retrieving pipeline execution data: {e}")
        return None


async def save_pipeline_execution(
    client_name: str,
    app_name: str,
    project_name: str,
    pipeline_data: Dict[str, Any],
    mode: str = "laboratory"
) -> Dict[str, Any]:
    """Save pipeline execution data to MongoDB.
    
    This is a bulk save function. For incremental updates, use record_atom_execution instead.
    
    Args:
        client_name: Client identifier
        app_name: App identifier
        project_name: Project identifier
        pipeline_data: Pipeline execution data dictionary (should match PipelineExecutionDocument structure)
        mode: Mode (laboratory, workflow, exhibition)
    
    Returns:
        Result dictionary with status
    """
    try:
        coll = await get_pipeline_collection()
        
        client_id = client_name
        app_id = app_name
        project_id = project_name
        
        # Build composite _id
        doc_id = f"{client_id}/{app_id}/{project_id}"
        
        # Prepare document - ensure it has _id
        doc = dict(pipeline_data)
        doc["_id"] = doc_id
        doc["client_id"] = client_id
        doc["app_id"] = app_id
        doc["project_id"] = project_id
        doc["execution_timestamp"] = doc.get("execution_timestamp", datetime.utcnow())
        
        # Delete existing pipeline data for this project/mode
        await coll.delete_many({
            "_id": doc_id
        })
        
        # Insert new pipeline data
        result = await coll.insert_one(doc)
        
        logger.info(
            f"✅ Saved pipeline execution data for {client_id}/{app_id}/{project_id} "
            f"(execution_graph steps: {len(doc.get('pipeline', {}).get('execution_graph', []))})"
        )
        
        return {
            "status": "success",
            "inserted_id": str(result.inserted_id),
            "message": "Pipeline execution data saved successfully"
        }
        
    except Exception as e:
        logger.error(f"❌ Error saving pipeline execution data: {e}")
        return {
            "status": "error",
            "error": str(e)
        }


async def remove_pipeline_steps_by_card_id(
    client_name: str,
    app_name: str,
    project_name: str,
    card_id: str,
    mode: str = "laboratory"
) -> Dict[str, Any]:
    """Remove all pipeline execution steps for a specific card_id.
    
    Args:
        client_name: Client identifier
        app_name: App identifier
        project_name: Project identifier
        card_id: Card ID to remove steps for
        mode: Mode (laboratory, workflow, exhibition)
    
    Returns:
        Dictionary with status and message
    """
    try:
        coll = await get_pipeline_collection()
        
        client_id = client_name
        app_id = app_name
        project_id = project_name
        
        # Build composite _id
        doc_id = f"{client_id}/{app_id}/{project_id}"
        
        # Get existing document
        existing_doc = await coll.find_one({"_id": doc_id})
        
        if not existing_doc:
            logger.info(f"📦 No pipeline execution data found for {doc_id}, nothing to remove")
            return {
                "status": "success",
                "message": "No pipeline execution data found",
                "removed_steps": 0
            }
        
        pipeline = existing_doc.get("pipeline", {})
        execution_graph = pipeline.get("execution_graph", [])
        
        # Filter out steps with matching card_id
        original_count = len(execution_graph)
        filtered_graph = [step for step in execution_graph if step.get("card_id") != card_id]
        removed_count = original_count - len(filtered_graph)
        
        if removed_count == 0:
            logger.info(f"📦 No pipeline steps found for card_id {card_id} in {doc_id}")
            return {
                "status": "success",
                "message": "No steps found for this card",
                "removed_steps": 0
            }
        
        # Update document with filtered execution graph
        await coll.update_one(
            {"_id": doc_id},
            {
                "$set": {
                    "pipeline.execution_graph": filtered_graph
                }
            }
        )
        
        logger.info(
            f"🗑️ Removed {removed_count} pipeline step(s) for card_id {card_id} from {doc_id} "
            f"(remaining: {len(filtered_graph)})"
        )
        
        return {
            "status": "success",
            "message": f"Removed {removed_count} pipeline step(s) for card",
            "removed_steps": removed_count
        }
        
    except Exception as e:
        logger.error(f"❌ Error removing pipeline steps by card_id: {e}")
        return {
            "status": "error",
            "error": str(e),
            "removed_steps": 0
        }
