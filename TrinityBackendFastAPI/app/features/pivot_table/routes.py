from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional
import logging
import os

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.observability import timing_dependency_factory
from app.features.pipeline.service import record_atom_execution
from app.features.project_state.routes import get_atom_list_configuration

from .schemas import (
    PivotComputeRequest,
    PivotComputeResponse,
    PivotRefreshResponse,
    PivotSaveRequest,
    PivotSaveResponse,
    PivotStatusResponse,
)
from .service import (
    compute_pivot,
    get_pivot_data,
    get_pivot_status,
    refresh_pivot,
    save_pivot,
)


logger = logging.getLogger(__name__)

timing_dependency = timing_dependency_factory("app.features.pivot_table")

router = APIRouter(
    prefix="/pivot",
    tags=["Pivot Table"],
    dependencies=[Depends(timing_dependency)],
)


@router.post("/{config_id}/compute", response_model=PivotComputeResponse)
async def compute_pivot_endpoint(
    config_id: str,
    payload: PivotComputeRequest,
    client_name: Optional[str] = Query(None),
    app_name: Optional[str] = Query(None),
    project_name: Optional[str] = Query(None),
    card_id: Optional[str] = Query(None),
    canvas_position: Optional[int] = Query(0),
) -> PivotComputeResponse:
    """Generate a pivot table for the supplied configuration."""

    execution_started_at = datetime.utcnow()
    
    logger.info("pivot.compute config_id=%s rows=%s sorting=%s", config_id, len(payload.rows or []), payload.sorting)
    
    # Build API call record
    api_calls = [{
        "endpoint": f"/pivot/{config_id}/compute",
        "method": "POST",
        "params": payload.dict(),
        "timestamp": execution_started_at.isoformat()
    }]
    
    # Build configuration
    configuration = {
        "data_source": payload.data_source,
        "rows": payload.rows,
        "columns": payload.columns,
        "values": [v.dict() for v in payload.values] if payload.values else [],
        "filters": [f.dict() for f in payload.filters] if payload.filters else [],
        "sorting": payload.sorting,
        "dropna": payload.dropna,
        "fill_value": payload.fill_value,
        "limit": payload.limit,
        "grand_totals": payload.grand_totals,
    }
    
    response = await compute_pivot(config_id, payload)
    
    execution_completed_at = datetime.utcnow()
    execution_status = "success" if response.status == "success" else "failed"
    execution_error = None if response.status == "success" else "Pivot computation failed"
    
    logger.info(
        "pivot.compute.completed config_id=%s status=%s rows=%s",
        config_id,
        response.status,
        response.rows,
    )
    
    # Record atom execution for pipeline tracking
    try:
        # Get client/app/project from query params or environment
        final_client_name = client_name or os.getenv("CLIENT_NAME", "")
        final_app_name = app_name or os.getenv("APP_NAME", "")
        final_project_name = project_name or os.getenv("PROJECT_NAME", "")
        user_id = os.getenv("USER_ID", "unknown")
        
        # Get card_id and canvas_position from atom_list_configuration if not provided
        final_card_id = card_id
        final_canvas_position = canvas_position or 0
        
        if not final_card_id and final_client_name and final_app_name and final_project_name:
            try:
                atom_config_response = await get_atom_list_configuration(
                    client_name=final_client_name,
                    app_name=final_app_name,
                    project_name=final_project_name,
                    mode="laboratory"
                )
                
                if atom_config_response.get("status") == "success":
                    cards = atom_config_response.get("cards", [])
                    for card in cards:
                        atoms = card.get("atoms", [])
                        for atom in atoms:
                            if atom.get("id") == config_id:
                                final_card_id = card.get("id")
                                final_canvas_position = card.get("canvas_position", 0)
                                break
                        if final_card_id:
                            break
            except Exception as e:
                logger.warning(f"Failed to get atom configuration: {e}")
        
        # Build output files (pivot doesn't produce files, but we track the saved path if available)
        output_files = []
        
        if final_client_name and final_app_name and final_project_name:
            await record_atom_execution(
                client_name=final_client_name,
                app_name=final_app_name,
                project_name=final_project_name,
                atom_instance_id=config_id,
                card_id=final_card_id or "",
                atom_type="pivot-table",
                atom_title="Pivot Table",
                input_files=[payload.data_source],
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
        logger.warning(f"Failed to record pivot atom execution for pipeline: {e}")
    
    return response


@router.get("/{config_id}/data", response_model=PivotComputeResponse)
async def get_pivot_data_endpoint(config_id: str) -> PivotComputeResponse:
    cached = get_pivot_data(config_id)
    updated_at_raw = cached.get("updated_at")
    try:
        updated_at = (
            datetime.fromisoformat(updated_at_raw)
            if isinstance(updated_at_raw, str)
            else datetime.now(timezone.utc)
        )
    except ValueError:
        updated_at = datetime.now(timezone.utc)

    try:
        status = cached.get("status", "success")
        rows = int(cached.get("rows", len(cached.get("data", []))))
    except Exception as exc:  # pragma: no cover - defensive
        raise HTTPException(status_code=500, detail=f"Malformed cached data: {exc}")

    logger.info(
        "pivot.cache_hit config_id=%s status=%s rows=%s",
        config_id,
        status,
        rows,
    )

    return PivotComputeResponse(
        config_id=cached.get("config_id", config_id),
        status=status,
        updated_at=updated_at,
        rows=rows,
        data=cached.get("data", []),
        hierarchy=cached.get("hierarchy", []),
        column_hierarchy=cached.get("column_hierarchy", []),
    )


@router.post("/{config_id}/refresh", response_model=PivotRefreshResponse)
async def refresh_pivot_endpoint(config_id: str) -> PivotRefreshResponse:
    """Force recomputation of a pivot table using the last cached configuration."""

    logger.info("pivot.refresh config_id=%s", config_id)
    response = await refresh_pivot(config_id)
    logger.info("pivot.refresh.completed config_id=%s status=%s", config_id, response.status)
    return response


@router.post("/{config_id}/save", response_model=PivotSaveResponse)
async def save_pivot_endpoint(
    config_id: str,
    payload: Optional[PivotSaveRequest] = None,
    client_name: Optional[str] = Query(None),
    app_name: Optional[str] = Query(None),
    project_name: Optional[str] = Query(None),
    card_id: Optional[str] = Query(None),
    canvas_position: Optional[int] = Query(0),
) -> PivotSaveResponse:
    """Persist the latest pivot data to project storage in MinIO.
    
    If payload.filename is provided, creates a new file (save_as).
    If payload is None or filename is not provided, overwrites existing saved file (save).
    """

    execution_started_at = datetime.utcnow()
    
    logger.info("pivot.save config_id=%s", config_id)
    
    # Build API call record
    api_calls = [{
        "endpoint": f"/pivot/{config_id}/save",
        "method": "POST",
        "params": payload.dict() if payload else {},
        "timestamp": execution_started_at.isoformat()
    }]
    
    response = await save_pivot(config_id, payload)
    
    execution_completed_at = datetime.utcnow()
    execution_status = "success" if response.status == "success" else "failed"
    execution_error = None if response.status == "success" else "Pivot save failed"
    
    logger.info("pivot.save.completed config_id=%s status=%s", config_id, response.status)
    
    # Record atom execution for pipeline tracking
    try:
        # Get client/app/project from query params or environment
        final_client_name = client_name or os.getenv("CLIENT_NAME", "")
        final_app_name = app_name or os.getenv("APP_NAME", "")
        final_project_name = project_name or os.getenv("PROJECT_NAME", "")
        user_id = os.getenv("USER_ID", "unknown")
        
        # Get card_id and canvas_position from atom_list_configuration if not provided
        final_card_id = card_id
        final_canvas_position = canvas_position or 0
        
        if not final_card_id and final_client_name and final_app_name and final_project_name:
            try:
                atom_config_response = await get_atom_list_configuration(
                    client_name=final_client_name,
                    app_name=final_app_name,
                    project_name=final_project_name,
                    mode="laboratory"
                )
                
                if atom_config_response.get("status") == "success":
                    cards = atom_config_response.get("cards", [])
                    for card in cards:
                        atoms = card.get("atoms", [])
                        for atom in atoms:
                            if atom.get("id") == config_id:
                                final_card_id = card.get("id")
                                final_canvas_position = card.get("canvas_position", 0)
                                break
                        if final_card_id:
                            break
            except Exception as e:
                logger.warning(f"Failed to get atom configuration: {e}")
        
        # Build output files
        output_files = []
        if response.object_name:
            output_files.append({
                "file_key": response.object_name,
                "file_path": response.object_name,
                "flight_path": response.object_name,
                "save_as_name": response.object_name.split("/")[-1],
                "is_default_name": payload is None or not payload.filename,
                "columns": [],
                "dtypes": {},
                "row_count": response.rows
            })
        
        # Get configuration from cached config
        from .service import _load_config
        cached_config = _load_config(config_id) or {}
        configuration = {
            "data_source": cached_config.get("data_source", ""),
            "rows": cached_config.get("rows", []),
            "columns": cached_config.get("columns", []),
            "values": cached_config.get("values", []),
            "filters": cached_config.get("filters", []),
            "sorting": cached_config.get("sorting", {}),
            "dropna": cached_config.get("dropna", True),
            "fill_value": cached_config.get("fill_value"),
            "limit": cached_config.get("limit"),
            "grand_totals": cached_config.get("grand_totals", "off"),
        }
        
        if final_client_name and final_app_name and final_project_name:
            await record_atom_execution(
                client_name=final_client_name,
                app_name=final_app_name,
                project_name=final_project_name,
                atom_instance_id=config_id,
                card_id=final_card_id or "",
                atom_type="pivot-table",
                atom_title="Pivot Table - Save",
                input_files=[cached_config.get("data_source", "")],
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
        logger.warning(f"Failed to record pivot save execution for pipeline: {e}")
    
    return response


@router.get("/{config_id}/status", response_model=PivotStatusResponse)
async def pivot_status_endpoint(config_id: str) -> PivotStatusResponse:
    """Return cached compute status for the pivot table."""

    status = get_pivot_status(config_id)
    logger.info(
        "pivot.status config_id=%s status=%s", config_id, status.status
    )
    return status