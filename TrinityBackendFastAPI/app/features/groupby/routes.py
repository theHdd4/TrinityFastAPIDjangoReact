from __future__ import annotations

import io
import json
import logging
import os
from datetime import datetime
from typing import Any, Dict, List
from urllib.parse import unquote

from fastapi import APIRouter, Body, Depends, Form, HTTPException, Query, Response

from app.core.observability import timing_dependency_factory
from app.core.task_queue import celery_task_client, format_task_response
from app.features.data_upload_validate.app.routes import get_object_prefix
from app.features.pipeline.service import record_atom_execution
from app.features.project_state.routes import get_atom_list_configuration

from .service import (
    MINIO_BUCKET,
    build_result_filename,
    ensure_prefixed_object,
    initialize_groupby,
    load_dataframe,
)

timing_dependency = timing_dependency_factory("app.features.groupby")
router = APIRouter(prefix="/groupby", tags=["groupby"], dependencies=[Depends(timing_dependency)])

logger = logging.getLogger(__name__)

logger = logging.getLogger(__name__)


@router.get("/")
async def root() -> Dict[str, Any]:
    return {
        "message": "GroupBy backend is running",
        "endpoints": [
            "/ping",
            "/init",
            "/run",
            "/cached_dataframe",
            "/cardinality",
            "/save",
            "/export_csv",
            "/export_excel",
        ],
    }


@router.get("/ping")
async def ping() -> Dict[str, str]:
    return {"msg": "GroupBy backend is alive"}


@router.post("/init")
async def init_groupby(
    bucket_name: str = Form(...),
    object_names: str = Form(...),
    client_name: str = Form(...),
    app_name: str = Form(...),
    project_name: str = Form(...),
    file_key: str = Form(...),
    validator_atom_id: str = Form(None),
    card_id: str = Form(None),
    canvas_position: int = Form(None),
) -> Dict[str, Any]:
    try:
        result = initialize_groupby(
            bucket_name=bucket_name,
            object_name=object_names,
            client_name=client_name,
            app_name=app_name,
            project_name=project_name,
            file_key=file_key,
        )
        
        # Record atom execution for pipeline tracking (if validator_atom_id is provided)
        if validator_atom_id and client_name and app_name and project_name:
            user_id = os.getenv("USER_ID", "unknown")
            
            # Get card_id and canvas_position from atom_list_configuration
            card_id_from_config = None
            canvas_position_from_config = None
            
            try:
                atom_config_response = await get_atom_list_configuration(
                    client_name=client_name,
                    app_name=app_name,
                    project_name=project_name,
                    mode="laboratory"
                )
                
                if atom_config_response.get("status") == "success":
                    cards = atom_config_response.get("cards", [])
                    for card in cards:
                        atoms = card.get("atoms", [])
                        for atom in atoms:
                            if atom.get("id") == validator_atom_id:
                                card_id_from_config = card.get("id")
                                canvas_position_from_config = card.get("canvas_position", 0)
                                break
                        if card_id_from_config:
                            break
            except Exception as e:
                logger.warning(f"Failed to get card_id from atom_list_configuration: {e}")
            
            # CRITICAL FIX: Prioritize card_id from request (pipeline execution passes the correct card_id)
            # Only use atom_list_configuration as fallback when no card_id is provided
            if card_id:
                final_card_id = card_id
            elif card_id_from_config:
                final_card_id = card_id_from_config
            else:
                final_card_id = validator_atom_id.split("-")[0] if "-" in validator_atom_id else validator_atom_id
            
            # CRITICAL FIX: Prioritize canvas_position from request too
            if canvas_position is not None:
                final_canvas_position = canvas_position
            elif canvas_position_from_config is not None:
                final_canvas_position = canvas_position_from_config
            else:
                final_canvas_position = 0
            
            # Build configuration
            configuration = {
                "bucket_name": bucket_name,
                "object_names": object_names,
                "file_key": file_key,
                "client_name": client_name,
                "app_name": app_name,
                "project_name": project_name,
            }
            
            # Build API calls
            execution_started_at = datetime.utcnow()
            api_calls = [
                {
                    "endpoint": "/groupby/init",
                    "method": "POST",
                    "timestamp": execution_started_at,
                    "params": configuration.copy(),
                    "response_status": 200 if result.get("status") == "SUCCESS" else 400,
                    "response_data": result
                }
            ]
            
            # Build output files (init doesn't produce file outputs)
            output_files = []
            execution_completed_at = datetime.utcnow()
            execution_status = "success" if result.get("status") == "SUCCESS" else "failed"
            execution_error = None
            
            # Record execution (async, don't wait for it)
            try:
                await record_atom_execution(
                    client_name=client_name,
                    app_name=app_name,
                    project_name=project_name,
                    atom_instance_id=validator_atom_id,
                    card_id=final_card_id,
                    atom_type="groupby-wtg-avg",
                    atom_title="GroupBy Weighted Average",
                    input_files=[object_names],
                    configuration=configuration,
                    api_calls=api_calls,
                    output_files=output_files,
                    execution_started_at=execution_started_at,
                    execution_completed_at=execution_completed_at,
                    execution_status=execution_status,
                    execution_error=execution_error,
                    user_id=user_id,
                    mode="laboratory",
                    canvas_position=final_canvas_position
                )
            except Exception as e:
                # Don't fail the request if pipeline recording fails
                logger.warning(f"Failed to record atom execution for pipeline: {e}")
        
        return result
    except Exception as exc:  # pragma: no cover - defensive logging
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/run")
async def run_groupby(
    validator_atom_id: str = Form(...),
    file_key: str = Form(...),
    bucket_name: str = Form(...),
    object_names: str = Form(...),
    identifiers: str = Form(...),
    aggregations: str = Form(...),
    card_id: str = Form(None),
    canvas_position: int = Form(None),
) -> Dict[str, Any]:
    try:
        identifiers_payload: List[str] = json.loads(identifiers) if isinstance(identifiers, str) else identifiers
        if not isinstance(identifiers_payload, list):
            raise ValueError("identifiers must be a list")
    except (ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=400, detail="Invalid identifiers payload") from exc

    try:
        aggregations_payload: Dict[str, Any] = json.loads(aggregations) if isinstance(aggregations, str) else aggregations
        if not isinstance(aggregations_payload, dict):
            raise ValueError("aggregations must be a mapping")
    except (ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=400, detail="Invalid aggregations payload") from exc

    prefix = await get_object_prefix()
    source_object = ensure_prefixed_object(object_names, prefix)
    
    # Check if there's a saved filename from previous execution (for pipeline re-execution)
    saved_filename = None
    try:
        from app.features.pipeline.service import get_pipeline_collection
        coll = await get_pipeline_collection()
        client_name = os.getenv("CLIENT_NAME", "")
        app_name = os.getenv("APP_NAME", "")
        project_name = os.getenv("PROJECT_NAME", "")
        if client_name and app_name and project_name:
            doc_id = f"{client_name}/{app_name}/{project_name}"
            existing_doc = await coll.find_one({"_id": doc_id})
            if existing_doc:
                pipeline = existing_doc.get("pipeline", {})
                execution_graph = pipeline.get("execution_graph", [])
                # Find the execution step for this atom
                for step in execution_graph:
                    if step.get("atom_instance_id") == validator_atom_id:
                        # Check outputs for saved file with save_as_name
                        outputs = step.get("outputs", [])
                        for output in outputs:
                            save_as_name = output.get("save_as_name")
                            if save_as_name and not output.get("is_default_name", True):
                                # Extract filename from file_key (format: prefix/groupby/filename.arrow)
                                file_key = output.get("file_key", "")
                                if file_key and "/groupby/" in file_key:
                                    saved_filename = file_key.split("/groupby/")[-1]
                                break
                        break
    except Exception as e:
        logger.warning(f"Could not check for saved filename: {e}")
    
    # Use saved filename if available, otherwise build default
    if saved_filename:
        result_filename = f"{prefix.rstrip('/')}/groupby/{saved_filename}" if prefix else f"groupby/{saved_filename}"
    else:
        result_filename = build_result_filename(validator_atom_id, file_key)

    submission = celery_task_client.submit_callable(
        name="groupby.run",
        dotted_path="app.features.groupby.service.perform_groupby_task",
        kwargs={
            "bucket_name": bucket_name,
            "source_object": source_object,
            "result_filename": result_filename,
            "identifiers": identifiers_payload,
            "aggregations": aggregations_payload,
        },
        metadata={
            "atom": "groupby",
            "operation": "run",
            "file_key": file_key,
            "source_object": source_object,
        },
    )

    if submission.status == "failure":
        raise HTTPException(status_code=500, detail=submission.detail or "Failed to execute groupby")

    # Record atom execution for pipeline tracking
    # Extract project context from environment
    client_name = os.getenv("CLIENT_NAME", "")
    app_name = os.getenv("APP_NAME", "")
    project_name = os.getenv("PROJECT_NAME", "")
    user_id = os.getenv("USER_ID", "unknown")
    
    # Get card_id and canvas_position from atom_list_configuration (same way atom_list_configuration does it)
    card_id_from_config = None
    canvas_position_from_config = None
    
    if client_name and app_name and project_name:
        try:
            # Get atom configuration to find card_id and canvas_position
            atom_config_response = await get_atom_list_configuration(
                client_name=client_name,
                app_name=app_name,
                project_name=project_name,
                mode="laboratory"
            )
            
            if atom_config_response.get("status") == "success":
                cards = atom_config_response.get("cards", [])
                # Find the atom in the cards
                for card in cards:
                    atoms = card.get("atoms", [])
                    for atom in atoms:
                        # Check if this atom's id matches validator_atom_id
                        if atom.get("id") == validator_atom_id:
                            card_id_from_config = card.get("id")
                            canvas_position_from_config = card.get("canvas_position", 0)
                            break
                    if card_id_from_config:
                        break
        except Exception as e:
            logger.warning(f"Failed to get card_id from atom_list_configuration: {e}")
    
    # CRITICAL FIX: Prioritize card_id from request (pipeline execution passes the correct card_id)
    # Only use atom_list_configuration as fallback when no card_id is provided
    # This prevents duplicate execution_graph entries when pipeline re-runs atoms
    if card_id:
        final_card_id = card_id
        logger.info(f"✅ Using card_id from request: {final_card_id} for atom {validator_atom_id}")
    elif card_id_from_config:
        final_card_id = card_id_from_config
        logger.info(f"Using card_id from atom_list_configuration: {final_card_id} for atom {validator_atom_id}")
    else:
        # Last resort fallback
        final_card_id = validator_atom_id.split("-")[0] if "-" in validator_atom_id else validator_atom_id
        logger.warning(f"⚠️ Using fallback card_id for {validator_atom_id}: {final_card_id}")
    
    # CRITICAL FIX: Prioritize canvas_position from request too
    if canvas_position is not None:
        final_canvas_position = canvas_position
        logger.info(f"✅ Using canvas_position from request: {final_canvas_position} for atom {validator_atom_id}")
    elif canvas_position_from_config is not None:
        final_canvas_position = canvas_position_from_config
        logger.info(f"Using canvas_position from atom_list_configuration: {final_canvas_position} for atom {validator_atom_id}")
    else:
        final_canvas_position = 0
        logger.warning(f"⚠️ Using default canvas_position for {validator_atom_id}: 0")
    
    # Build configuration
    configuration = {
        "identifiers": identifiers_payload,
        "aggregations": aggregations_payload,
        "bucket_name": bucket_name,
        "validator_atom_id": validator_atom_id,
        "button_clicked": "Perform",
        "click_timestamp": datetime.utcnow().isoformat()
    }
    
    # Build API calls
    execution_started_at = datetime.utcnow()
    api_calls = [
        {
            "endpoint": "atom_execution_start",
            "method": "EXECUTE",
            "timestamp": execution_started_at,
            "params": configuration.copy(),
            "response_status": 0,
            "response_data": None
        }
    ]
    
    # Build output files (will be updated when task completes)
    output_files = []
    execution_completed_at = None
    execution_status = "pending"
    execution_error = None
    
    # Try to get result if task completed synchronously
    if submission.status == "success" and hasattr(submission, "result"):
        try:
            result_data = submission.result
            if isinstance(result_data, dict) and result_data.get("result_file"):
                output_file_key = result_data.get("result_file")
                row_count = result_data.get("row_count", 0)
                columns = result_data.get("columns", [])
                
                output_files.append({
                    "file_key": output_file_key,
                    "file_path": output_file_key,
                    "flight_path": output_file_key,
                    "save_as_name": "groupby_result",
                    "is_default_name": False,
                    "columns": columns,
                    "dtypes": {},
                    "row_count": row_count
                })
                
                execution_completed_at = datetime.utcnow()
                execution_status = "success"
                
                # Add completion API call
                api_calls.append({
                    "endpoint": "atom_execution_complete",
                    "method": "EXECUTE",
                    "timestamp": execution_completed_at,
                    "params": configuration.copy(),
                    "response_status": 200,
                    "response_data": {
                        "status": "SUCCESS",
                        "result_file": output_file_key,
                        "row_count": row_count
                    }
                })
        except Exception:
            pass
    
    # Record execution (async, don't wait for it)
    if client_name and app_name and project_name:
        try:
            await record_atom_execution(
                client_name=client_name,
                app_name=app_name,
                project_name=project_name,
                atom_instance_id=validator_atom_id,
                card_id=final_card_id,
                atom_type="groupby-wtg-avg",
                atom_title="GroupBy Weighted Average",
                input_files=[source_object],
                configuration=configuration,
                api_calls=api_calls,
                output_files=output_files,
                execution_started_at=execution_started_at,
                execution_completed_at=execution_completed_at,
                execution_status=execution_status,
                execution_error=execution_error,
                user_id=user_id,
                mode="laboratory",
                canvas_position=final_canvas_position
            )
        except Exception as e:
            # Don't fail the request if pipeline recording fails
            logger.warning(f"Failed to record atom execution for pipeline: {e}")

    return format_task_response(submission)


@router.get("/cached_dataframe")
async def cached_dataframe(
    object_name: str,
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(50, ge=1, le=1000, description="Number of rows per page"),
) -> Dict[str, Any]:
    resolved_name = unquote(object_name)
    submission = celery_task_client.submit_callable(
        name="groupby.cached_dataframe",
        dotted_path="app.features.groupby.service.load_cached_dataframe_page",
        kwargs={"object_name": resolved_name, "page": page, "page_size": page_size},
        metadata={
            "atom": "groupby",
            "operation": "cached_dataframe",
            "object_name": resolved_name,
            "page": page,
            "page_size": page_size,
        },
    )

    if submission.status == "failure":
        raise HTTPException(status_code=400, detail=submission.detail or "Failed to load cached dataframe")

    return format_task_response(submission)


@router.get("/cardinality")
async def cardinality(object_name: str = Query(..., description="Object name/path of the dataframe")) -> Dict[str, Any]:
    resolved_name = unquote(object_name)
    submission = celery_task_client.submit_callable(
        name="groupby.cardinality",
        dotted_path="app.features.groupby.service.compute_cardinality_task",
        kwargs={"object_name": resolved_name},
        metadata={
            "atom": "groupby",
            "operation": "cardinality",
            "object_name": resolved_name,
        },
    )

    if submission.status == "failure":
        raise HTTPException(status_code=400, detail=submission.detail or "Failed to compute cardinality")

    return format_task_response(submission)


@router.post("/save")
async def save_groupby(
    payload: Dict[str, Any] = Body(..., description="Grouped CSV payload with optional atom tracking fields"),
) -> Dict[str, Any]:
    # Validate payload structure
    if not isinstance(payload, dict):
        raise HTTPException(status_code=422, detail="Request body must be a JSON object")
    
    csv_data = payload.get("csv_data")
    if not csv_data or not isinstance(csv_data, str) or not csv_data.strip():
        raise HTTPException(status_code=400, detail="csv_data must be a non-empty string")
    filename = payload.get("filename")
    if filename is not None and not isinstance(filename, str):
        raise HTTPException(status_code=400, detail="filename must be a string if provided")
    
    # Extract atom tracking fields from payload
    validator_atom_id = payload.get("validator_atom_id")
    card_id = payload.get("card_id")
    canvas_position = payload.get("canvas_position", 0)
    # Ensure canvas_position is an integer
    if canvas_position is not None:
        try:
            canvas_position = int(canvas_position)
        except (ValueError, TypeError):
            canvas_position = 0

    prefix = await get_object_prefix()
    save_started_at = datetime.utcnow()
    
    submission = celery_task_client.submit_callable(
        name="groupby.save",
        dotted_path="app.features.groupby.service.save_groupby_dataframe_task",
        kwargs={
            "csv_data": csv_data,
            "filename": filename,
            "object_prefix": prefix,
        },
        metadata={
            "atom": "groupby",
            "operation": "save",
            "object_prefix": prefix,
        },
    )

    if submission.status == "failure":
        raise HTTPException(status_code=500, detail=submission.detail or "Failed to save groupby dataframe")

    save_completed_at = datetime.utcnow()
    
    # Record save operation in pipeline (if atom_id is provided)
    if validator_atom_id:
        try:
            client_name = os.getenv("CLIENT_NAME", "")
            app_name = os.getenv("APP_NAME", "")
            project_name = os.getenv("PROJECT_NAME", "")
            user_id = os.getenv("USER_ID", "unknown")
            
            # Get result from submission
            saved_file_key = None
            is_default_name = not filename or filename.strip() == ""
            save_as_name = filename if filename else "groupby_result"
            
            if submission.status == "success" and hasattr(submission, "result"):
                result_data = submission.result
                if isinstance(result_data, dict) and result_data.get("filename"):
                    saved_file_key = result_data.get("filename")
            
            # Build API call for save operation
            save_api_call = {
                "endpoint": "/groupby/save",
                "method": "POST",
                "timestamp": save_started_at,
                "params": {
                    "filename": filename,
                    "is_default_name": is_default_name,
                },
                "response_status": 200 if submission.status == "success" else 500,
                "response_data": {
                    "status": "SUCCESS" if submission.status == "success" else "FAILED",
                    "filename": saved_file_key,
                } if saved_file_key else None
            }
            
            # Update the execution graph with the saved file
            if client_name and app_name and project_name and saved_file_key:
                # Get existing pipeline execution
                from app.features.pipeline.service import get_pipeline_collection
                coll = await get_pipeline_collection()
                doc_id = f"{client_name}/{app_name}/{project_name}"
                existing_doc = await coll.find_one({"_id": doc_id})
                
                if existing_doc:
                    pipeline = existing_doc.get("pipeline", {})
                    execution_graph = pipeline.get("execution_graph", [])
                    
                    # Find the execution step for this atom
                    for step in execution_graph:
                        if step.get("atom_instance_id") == validator_atom_id:
                            # Add save API call to the step
                            if "api_calls" not in step:
                                step["api_calls"] = []
                            step["api_calls"].append(save_api_call)
                            
                            # Update output files to include the saved file
                            if "outputs" not in step:
                                step["outputs"] = []
                            
                            # Check if this saved file already exists in outputs
                            existing_output = None
                            for output in step["outputs"]:
                                if output.get("file_key") == saved_file_key:
                                    existing_output = output
                                    break
                            
                            if existing_output:
                                # Update existing output with save_as_name
                                existing_output["save_as_name"] = save_as_name
                                existing_output["is_default_name"] = is_default_name
                            else:
                                # Add new output for saved file
                                step["outputs"].append({
                                    "file_key": saved_file_key,
                                    "file_path": saved_file_key,
                                    "flight_path": saved_file_key,
                                    "save_as_name": save_as_name,
                                    "is_default_name": is_default_name,
                                    "columns": [],
                                    "dtypes": {},
                                    "row_count": 0
                                })
                            
                            # Update the document
                            await coll.update_one(
                                {"_id": doc_id},
                                {
                                    "$set": {
                                        "pipeline.execution_graph": execution_graph,
                                        "execution_timestamp": datetime.utcnow()
                                    }
                                }
                            )
                            break
        except Exception as e:
            # Don't fail the save if pipeline recording fails
            logger.warning(f"Failed to record save operation in pipeline: {e}")

    return format_task_response(submission)


@router.get("/export_csv")
async def export_csv(object_name: str) -> Response:
    resolved_name = unquote(object_name)
    try:
        frame = load_dataframe(MINIO_BUCKET, resolved_name)
    except Exception as exc:  # pragma: no cover - defensive
        raise HTTPException(status_code=404, detail=f"Export failed: {exc}") from exc

    csv_bytes = frame.to_csv(index=False).encode("utf-8")
    filename = resolved_name.split("/")[-1].replace(".arrow", "").replace(".xlsx", "") or "groupby_result"
    return Response(
        content=csv_bytes,
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename={filename}.csv",
        },
    )


@router.get("/export_excel")
async def export_excel(object_name: str) -> Response:
    resolved_name = unquote(object_name)
    try:
        frame = load_dataframe(MINIO_BUCKET, resolved_name)
    except Exception as exc:  # pragma: no cover - defensive
        raise HTTPException(status_code=404, detail=f"Export failed: {exc}") from exc

    buffer = io.BytesIO()
    try:
        frame.to_excel(buffer, index=False, engine="openpyxl")
    except Exception:  # pragma: no cover - fallback for missing engine
        frame.to_excel(buffer, index=False)
    excel_bytes = buffer.getvalue()

    filename = resolved_name.split("/")[-1].replace(".arrow", "").replace(".csv", "") or "groupby_result"
    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f"attachment; filename={filename}.xlsx",
        },
    )
