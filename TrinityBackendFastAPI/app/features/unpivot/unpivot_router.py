from __future__ import annotations

import logging
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException

from app.core.observability import timing_dependency_factory

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
    """Compute unpivot transformation.
    
    Executes the unpivot operation with the current configuration.
    Returns the unpivoted dataframe, row count, summary, and computation time.
    """
    logger.info("unpivot.compute atom_id=%s force_recompute=%s", atom_id, payload.force_recompute)
    response = await compute_unpivot(atom_id, payload)
    logger.info(
        "unpivot.compute.completed atom_id=%s status=%s rows=%d time=%.2fs",
        atom_id,
        response.status,
        response.row_count,
        response.computation_time,
    )
    return response


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
    """Save unpivot output to MinIO.
    
    Saves the computed result to MinIO in the specified format (parquet, arrow, csv).
    If payload.filename is provided, creates a new file (save_as).
    If payload is None or filename is not provided, overwrites existing saved file (save).
    """
    logger.info("unpivot.save atom_id=%s format=%s", atom_id, payload.format)
    response = await save_unpivot_result(atom_id, payload)
    logger.info("unpivot.save.completed atom_id=%s path=%s", atom_id, response.minio_path)
    return response


@router.post("/{atom_id}/dataset-updated", response_model=UnpivotComputeResponse)
async def handle_dataset_updated_endpoint(
    atom_id: str,
    payload: UnpivotDatasetUpdatedRequest,
) -> UnpivotComputeResponse:
    """Auto-refresh when dataset changes.
    
    Triggered when dataset file in the workflow is updated.
    Auto-computes with current config.
    """
    logger.info("unpivot.dataset-updated atom_id=%s", atom_id)
    response = await handle_dataset_updated(atom_id, payload)
    logger.info("unpivot.dataset-updated.completed atom_id=%s rows=%d", atom_id, response.row_count)
    return response


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

