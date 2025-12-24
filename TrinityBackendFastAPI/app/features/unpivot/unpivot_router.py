from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException

from app.core.observability import timing_dependency_factory
from .task_service import submit_compute_task, submit_save_task

from .unpivot_models import (
    UnpivotAutosaveResponse,
    UnpivotCacheResponse,
    UnpivotComputeRequest,
    UnpivotComputeResponse,
    UnpivotCreateRequest,
    UnpivotCreateResponse,
    UnpivotDatasetUpdatedRequest,
    UnpivotMetadataResponse,
    UnpivotPropertiesUpdate,
    UnpivotResultResponse,
    UnpivotSaveRequest,
    UnpivotSaveResponse,
    UnpivotValidateRequest,
    UnpivotValidateResponse,
    DatasetSchemaRequest,
    DatasetSchemaResponse,
)
from .unpivot_service import (
    autosave_atom_state,
    compute_unpivot,
    create_unpivot_atom,
    delete_unpivot_atom,
    get_cached_result,
    get_dataset_schema,
    get_unpivot_metadata,
    get_unpivot_result,
    handle_dataset_updated,
    save_unpivot_result,
    update_unpivot_properties,
    validate_unpivot_configuration,
)

logger = logging.getLogger(__name__)

timing_dependency = timing_dependency_factory("app.features.unpivot")

router = APIRouter(
    prefix="/v1/atoms/unpivot",
    tags=["Unpivot Atom"],
    dependencies=[Depends(timing_dependency)],
)


# ============================================================================
# A. Atom Lifecycle Endpoints
# ============================================================================

@router.post("/create", response_model=UnpivotCreateResponse)
async def create_unpivot_atom_endpoint(payload: UnpivotCreateRequest) -> UnpivotCreateResponse:
    """Create a new unpivot atom.
    
    Creates an unpivot atom, saves metadata to DB, and returns atom_id.
    """
    logger.info("unpivot.create atom_name=%s project_id=%s", payload.atom_name, payload.project_id)
    response = await create_unpivot_atom(payload)
    logger.info("unpivot.create.completed atom_id=%s", response.atom_id)
    return response


@router.get("/{atom_id}/metadata", response_model=UnpivotMetadataResponse)
async def get_unpivot_metadata_endpoint(atom_id: str) -> UnpivotMetadataResponse:
    """Get unpivot atom metadata.
    
    Returns all saved metadata for the atom including configuration.
    """
    logger.info("unpivot.metadata atom_id=%s", atom_id)
    response = await get_unpivot_metadata(atom_id)
    logger.info("unpivot.metadata.completed atom_id=%s", atom_id)
    return response


@router.delete("/{atom_id}", response_model=Dict[str, Any])
async def delete_unpivot_atom_endpoint(atom_id: str) -> Dict[str, Any]:
    """Delete an unpivot atom.
    
    Removes the atom and all its cached data.
    """
    logger.info("unpivot.delete atom_id=%s", atom_id)
    response = await delete_unpivot_atom(atom_id)
    logger.info("unpivot.delete.completed atom_id=%s", atom_id)
    return response


# ============================================================================
# B. Atom Configuration (Properties Panel Sync)
# ============================================================================

@router.patch("/{atom_id}/properties", response_model=UnpivotMetadataResponse)
async def update_unpivot_properties_endpoint(
    atom_id: str,
    payload: UnpivotPropertiesUpdate,
) -> UnpivotMetadataResponse:
    """Update unpivot properties.
    
    Updates the configuration (id_vars, value_vars, filters, etc.).
    If auto_refresh is true, automatically triggers computation.
    """
    logger.info(
        "unpivot.properties.update atom_id=%s id_vars=%s value_vars=%s auto_refresh=%s",
        atom_id,
        payload.id_vars,
        payload.value_vars,
        payload.auto_refresh,
    )
    response = await update_unpivot_properties(atom_id, payload)
    logger.info("unpivot.properties.update.completed atom_id=%s", atom_id)
    return response


# ============================================================================
# C. Core Computation Endpoints
# ============================================================================

@router.post("/{atom_id}/compute", response_model=UnpivotComputeResponse)
async def compute_unpivot_endpoint(
    atom_id: str,
    payload: UnpivotComputeRequest,
) -> UnpivotComputeResponse:
    """Compute unpivot transformation via Celery.
    
    Executes the unpivot operation with the current configuration.
    Returns the unpivoted dataframe, row count, summary, and computation time.
    """
    print(f"[UNPIVOT_ENDPOINT] compute_unpivot_endpoint called: atom_id={atom_id}")  # Debug print
    logger.info("unpivot.compute START atom_id=%s force_recompute=%s preview_limit=%s", 
                atom_id, payload.force_recompute, payload.preview_limit)
    
    try:
        # Submit task to Celery
        submission = submit_compute_task(
            atom_id=atom_id,
            force_recompute=payload.force_recompute,
            preview_limit=payload.preview_limit,
        )
        
        logger.info(
            "unpivot.compute.submission atom_id=%s task_id=%s status=%s has_result=%s result_type=%s",
            atom_id,
            submission.task_id,
            submission.status,
            submission.result is not None,
            type(submission.result).__name__ if submission.result is not None else "None",
        )
        
        # Debug: log the actual result structure
        if submission.result is not None:
            try:
                result_keys = list(submission.result.keys()) if isinstance(submission.result, dict) else "not_a_dict"
                dataframe_len = len(submission.result.get("dataframe", [])) if isinstance(submission.result, dict) else 0
                logger.info(
                    "unpivot.compute.result_structure atom_id=%s result_keys=%s dataframe_len=%d",
                    atom_id,
                    result_keys,
                    dataframe_len,
                )
            except Exception as e:
                logger.exception("unpivot.compute.result_structure_error atom_id=%s error=%s", atom_id, str(e))
        
        # If task failed immediately (eager execution), raise error
        if submission.status == "failure":
            logger.error(
                "unpivot.compute.failed atom_id=%s task_id=%s detail=%s",
                atom_id,
                submission.task_id,
                submission.detail,
            )
            raise HTTPException(
                status_code=400,
                detail=submission.detail or "Unpivot computation failed",
            )
        
        # Check result store for the task result (works for both eager and async)
        from app.core.task_results import task_result_store
        task_info = task_result_store.fetch(submission.task_id)
        
        logger.info(
            "unpivot.compute.task_info atom_id=%s task_info_exists=%s task_info_status=%s",
            atom_id,
            task_info is not None,
            task_info.get("status") if task_info else None,
        )
        
        # If task completed (eager execution or already finished), return result
        if submission.status == "success" and submission.result is not None:
            result = submission.result
            
            # Ensure result is a dict
            if not isinstance(result, dict):
                logger.error(
                    "unpivot.compute.invalid_result_type atom_id=%s result_type=%s",
                    atom_id,
                    type(result).__name__,
                )
                raise HTTPException(
                    status_code=500,
                    detail=f"Invalid result type: {type(result).__name__}",
                )
            
            # Check if result indicates failure
            if result.get("status") == "failure":
                logger.error(
                    "unpivot.compute.task_failed atom_id=%s error=%s",
                    atom_id,
                    result.get("error", "Unknown error"),
                )
                raise HTTPException(
                    status_code=result.get("status_code", 400),
                    detail=result.get("error", "Unpivot computation failed"),
                )
            
            logger.info(
                "unpivot.compute.completed atom_id=%s status=%s row_count=%d dataframe_len=%d time=%.2fs",
                atom_id,
                result.get("status", "success"),
                result.get("row_count", 0),
                len(result.get("dataframe", [])),
                result.get("computation_time", 0.0),
            )
            
            try:
                response = UnpivotComputeResponse(
                    atom_id=result.get("atom_id", atom_id),
                    status=result.get("status", "success"),
                    updated_at=datetime.fromisoformat(result["updated_at"]) if isinstance(result.get("updated_at"), str) else datetime.now(timezone.utc),
                    row_count=result.get("row_count", 0),
                    dataframe=result.get("dataframe", []),
                    summary=result.get("summary", {}),
                    computation_time=result.get("computation_time", 0.0),
                )
                logger.info("unpivot.compute.returning_response atom_id=%s row_count=%d", atom_id, response.row_count)
                return response
            except Exception as e:
                logger.exception("unpivot.compute.response_creation_failed atom_id=%s", atom_id)
                raise HTTPException(status_code=500, detail=f"Failed to create response: {str(e)}")
        
        # Also check task_result_store (for async tasks that completed quickly)
        if task_info and task_info.get("status") == "success":
            result = task_info.get("result", {})
            if isinstance(result, dict):
                # Check if result indicates failure
                if result.get("status") == "failure":
                    logger.error(
                        "unpivot.compute.task_failed_from_store atom_id=%s error=%s",
                        atom_id,
                        result.get("error", "Unknown error"),
                    )
                    raise HTTPException(
                        status_code=result.get("status_code", 400),
                        detail=result.get("error", "Unpivot computation failed"),
                    )
                
                logger.info(
                    "unpivot.compute.completed_from_store atom_id=%s status=%s row_count=%d dataframe_len=%d",
                    atom_id,
                    result.get("status", "success"),
                    result.get("row_count", 0),
                    len(result.get("dataframe", [])),
                )
                return UnpivotComputeResponse(
                    atom_id=result.get("atom_id", atom_id),
                    status=result.get("status", "success"),
                    updated_at=datetime.fromisoformat(result["updated_at"]) if isinstance(result.get("updated_at"), str) else datetime.now(timezone.utc),
                    row_count=result.get("row_count", 0),
                    dataframe=result.get("dataframe", []),
                    summary=result.get("summary", {}),
                    computation_time=result.get("computation_time", 0.0),
                )
        
        # Task is pending - return task submission info
        logger.warning(
            "unpivot.compute.queued atom_id=%s task_id=%s status=%s result_is_none=%s",
            atom_id,
            submission.task_id,
            submission.status,
            submission.result is None,
        )
        
        # Return pending response
        return UnpivotComputeResponse(
            atom_id=atom_id,
            status="pending",
            updated_at=datetime.now(timezone.utc),
            row_count=0,
            dataframe=[],
            summary={},
            computation_time=0.0,
        )
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        logger.exception(
            "unpivot.compute.UNHANDLED_ERROR atom_id=%s error=%s",
            atom_id,
            str(e),
        )
        raise HTTPException(
            status_code=500,
            detail=f"Unpivot computation failed with unexpected error: {str(e)}",
        )


@router.get("/{atom_id}/result", response_model=UnpivotResultResponse)
async def get_unpivot_result_endpoint(atom_id: str) -> UnpivotResultResponse:
    """Get stored unpivot result.
    
    Returns the last computed result without recomputing.
    """
    logger.info("unpivot.result atom_id=%s", atom_id)
    response = await get_unpivot_result(atom_id)
    logger.info("unpivot.result.completed atom_id=%s rows=%d", atom_id, response.row_count)
    return response


# ============================================================================
# D. Validation and Schema
# ============================================================================

@router.post("/validate", response_model=UnpivotValidateResponse)
async def validate_unpivot_configuration_endpoint(
    payload: UnpivotValidateRequest,
) -> UnpivotValidateResponse:
    """Validate unpivot configuration.
    
    Checks:
    - Column existence
    - No overlap between id_vars & value_vars
    - Dataset width, shapes, uniqueness, etc.
    """
    logger.info(
        "unpivot.validate dataset=%s id_vars=%s value_vars=%s",
        payload.dataset_path,
        payload.id_vars,
        payload.value_vars,
    )
    response = await validate_unpivot_configuration(payload)
    logger.info("unpivot.validate.completed valid=%s errors=%d", response.valid, len(response.errors))
    return response


@router.post("/dataset-schema", response_model=DatasetSchemaResponse)
async def get_dataset_schema_endpoint(payload: DatasetSchemaRequest) -> DatasetSchemaResponse:
    """Get dataset schema.
    
    Returns:
    - Column names
    - Data types
    - Null statistics
    - Valid id_vars candidates
    - Valid value_vars candidates
    """
    logger.info("unpivot.dataset-schema dataset=%s", payload.dataset_path)
    response = await get_dataset_schema(payload)
    logger.info(
        "unpivot.dataset-schema.completed columns=%d rows=%d",
        len(response.columns),
        response.row_count,
    )
    return response


# ============================================================================
# E. Save & Auto Mechanisms
# ============================================================================

@router.post("/{atom_id}/save", response_model=UnpivotSaveResponse)
async def save_unpivot_result_endpoint(
    atom_id: str,
    payload: UnpivotSaveRequest,
) -> UnpivotSaveResponse:
    """Save unpivot output to MinIO via Celery.
    
    Saves the computed result to MinIO in the specified format (parquet, arrow, csv).
    If payload.filename is provided, creates a new file (save_as).
    If payload is None or filename is not provided, overwrites existing saved file (save).
    """
    logger.info("unpivot.save atom_id=%s format=%s", atom_id, payload.format)
    
    # Submit task to Celery
    submission = submit_save_task(
        atom_id=atom_id,
        format=payload.format,
        filename=payload.filename,
    )
    
    # If task failed immediately (eager execution), raise error
    if submission.status == "failure":
        logger.error(
            "unpivot.save.failed atom_id=%s task_id=%s detail=%s",
            atom_id,
            submission.task_id,
            submission.detail,
        )
        raise HTTPException(
            status_code=400,
            detail=submission.detail or "Unpivot save failed",
        )
    
    # If task completed immediately (eager execution), return result
    if submission.status == "success" and submission.result:
        result = submission.result
        logger.info("unpivot.save.completed atom_id=%s path=%s", atom_id, result.get("minio_path"))
        return UnpivotSaveResponse(
            atom_id=result.get("atom_id", atom_id),
            minio_path=result.get("minio_path", ""),
            updated_at=datetime.fromisoformat(result["updated_at"]) if isinstance(result.get("updated_at"), str) else datetime.now(timezone.utc),
            row_count=result.get("row_count", 0),
        )
    
    # Task is pending - return task submission info
    logger.info("unpivot.save.queued atom_id=%s task_id=%s", atom_id, submission.task_id)
    
    # For pending tasks, we need to check the result store
    from app.core.task_results import task_result_store
    
    # Try to get initial status
    task_info = task_result_store.fetch(submission.task_id)
    if task_info and task_info.get("status") == "success":
        result = task_info.get("result", {})
        return UnpivotSaveResponse(
            atom_id=result.get("atom_id", atom_id),
            minio_path=result.get("minio_path", ""),
            updated_at=datetime.fromisoformat(result["updated_at"]) if isinstance(result.get("updated_at"), str) else datetime.now(timezone.utc),
            row_count=result.get("row_count", 0),
        )
    
    # Return pending response (though save should typically complete quickly)
    raise HTTPException(
        status_code=202,
        detail=f"Save task queued. Task ID: {submission.task_id}. Please poll for results.",
    )


@router.post("/{atom_id}/dataset-updated", response_model=UnpivotComputeResponse)
async def handle_dataset_updated_endpoint(
    atom_id: str,
    payload: UnpivotDatasetUpdatedRequest,
) -> UnpivotComputeResponse:
    """Auto-refresh when dataset changes via Celery.
    
    Triggered when dataset file in the workflow is updated.
    Auto-computes with current config.
    """
    logger.info("unpivot.dataset-updated atom_id=%s", atom_id)
    
    # Update metadata if dataset path changed (synchronously, it's fast)
    # We need to do this before submitting the task so the task uses the new path
    if payload.dataset_path:
        # Import here to avoid circular dependency
        from .unpivot_service import _load_metadata, _store_metadata
        metadata = _load_metadata(atom_id)
        if metadata:
            metadata["dataset_path"] = payload.dataset_path
            metadata["updated_at"] = datetime.now(timezone.utc).isoformat()
            _store_metadata(atom_id, metadata)
    
    # Submit compute task to Celery (force recompute)
    submission = submit_compute_task(
        atom_id=atom_id,
        force_recompute=True,
        preview_limit=None,
    )
    
    # If task failed immediately (eager execution), raise error
    if submission.status == "failure":
        logger.error(
            "unpivot.dataset-updated.failed atom_id=%s task_id=%s detail=%s",
            atom_id,
            submission.task_id,
            submission.detail,
        )
        raise HTTPException(
            status_code=400,
            detail=submission.detail or "Unpivot computation failed",
        )
    
    # If task completed immediately (eager execution), return result
    if submission.status == "success" and submission.result:
        result = submission.result
        logger.info("unpivot.dataset-updated.completed atom_id=%s rows=%d", atom_id, result.get("row_count", 0))
        return UnpivotComputeResponse(
            atom_id=result.get("atom_id", atom_id),
            status=result.get("status", "success"),
            updated_at=datetime.fromisoformat(result["updated_at"]) if isinstance(result.get("updated_at"), str) else datetime.now(timezone.utc),
            row_count=result.get("row_count", 0),
            dataframe=result.get("dataframe", []),
            summary=result.get("summary", {}),
            computation_time=result.get("computation_time", 0.0),
        )
    
    # Task is pending - return task submission info
    logger.info("unpivot.dataset-updated.queued atom_id=%s task_id=%s", atom_id, submission.task_id)
    
    # For pending tasks, check the result store
    from app.core.task_results import task_result_store
    
    # Try to get initial status
    task_info = task_result_store.fetch(submission.task_id)
    if task_info and task_info.get("status") == "success":
        result = task_info.get("result", {})
        return UnpivotComputeResponse(
            atom_id=result.get("atom_id", atom_id),
            status=result.get("status", "success"),
            updated_at=datetime.fromisoformat(result["updated_at"]) if isinstance(result.get("updated_at"), str) else datetime.now(timezone.utc),
            row_count=result.get("row_count", 0),
            dataframe=result.get("dataframe", []),
            summary=result.get("summary", {}),
            computation_time=result.get("computation_time", 0.0),
        )
    
    # Return pending response
    return UnpivotComputeResponse(
        atom_id=atom_id,
        status="pending",
        updated_at=datetime.now(timezone.utc),
        row_count=0,
        dataframe=[],
        summary={},
        computation_time=0.0,
    )


@router.post("/{atom_id}/autosave", response_model=UnpivotAutosaveResponse)
async def autosave_atom_state_endpoint(atom_id: str) -> UnpivotAutosaveResponse:
    """Auto-save atom state snapshot.
    
    Creates a snapshot of the current atom state for recovery.
    """
    logger.info("unpivot.autosave atom_id=%s", atom_id)
    response = await autosave_atom_state(atom_id)
    logger.info("unpivot.autosave.completed atom_id=%s", atom_id)
    return response


# ============================================================================
# F. Cache Endpoints
# ============================================================================

@router.get("/{atom_id}/cache", response_model=UnpivotCacheResponse)
async def get_cached_result_endpoint(atom_id: str) -> UnpivotCacheResponse:
    """Load cached unpivot result.
    
    Returns the cached result if available, without recomputing.
    """
    logger.info("unpivot.cache atom_id=%s", atom_id)
    response = await get_cached_result(atom_id)
    logger.info("unpivot.cache.completed atom_id=%s rows=%d", atom_id, response.row_count)
    return response

