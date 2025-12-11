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
                existing_step["outputs"] = output_files
                existing_step["execution"] = execution_info
                existing_step["inputs"] = input_file_objects  # Update inputs in case file was replaced
                
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
            
            # Check if input files are already in root_files or are outputs from previous steps
            for input_file_key in input_files:
                is_output = False
                for step in execution_graph[:-1]:  # Exclude the step we just added
                    for output in step.get("outputs", []):
                        if output.get("file_key") == input_file_key:
                            is_output = True
                            break
                    if is_output:
                        break
                
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
                f"📦 No pipeline execution data found for {client_id}/{app_id}/{project_id}"
            )
            return None
        
        # Convert ObjectId to string if present (shouldn't happen with string _id, but just in case)
        if "_id" in pipeline_doc and not isinstance(pipeline_doc["_id"], str):
            pipeline_doc["_id"] = str(pipeline_doc["_id"])
        
        logger.info(
            f"📦 Retrieved pipeline execution data for {client_id}/{app_id}/{project_id} "
            f"(atoms: {pipeline_doc.get('summary', {}).get('total_atoms', 0)})"
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
