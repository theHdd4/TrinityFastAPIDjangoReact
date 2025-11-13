from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional
import logging

from fastapi import APIRouter, Depends, HTTPException

from app.core.observability import timing_dependency_factory
from app.core.task_queue import celery_task_client, format_task_response

from .schemas import (
    PivotComputeRequest,
    PivotComputeResponse,
    PivotRefreshResponse,
    PivotSaveRequest,
    PivotSaveResponse,
    PivotStatusResponse,
)
from .service import (
    compute_pivot_task,
    get_pivot_data,
    get_pivot_status,
    refresh_pivot_task,
    save_pivot_task,
)


logger = logging.getLogger(__name__)

timing_dependency = timing_dependency_factory("app.features.pivot_table")

router = APIRouter(
    prefix="/pivot",
    tags=["Pivot Table"],
    dependencies=[Depends(timing_dependency)],
)


@router.post("/{config_id}/compute")
async def compute_pivot_endpoint(
    config_id: str, payload: PivotComputeRequest
) -> Dict[str, Any]:
    """Generate a pivot table for the supplied configuration."""

    logger.info("pivot.compute config_id=%s rows=%s", config_id, len(payload.rows or []))
    submission = celery_task_client.submit_callable(
        name="pivot_table.compute",
        dotted_path="app.features.pivot_table.service.compute_pivot_task",
        kwargs={
            "config_id": config_id,
            "payload_data": payload.dict(),
        },
        metadata={
            "feature": "pivot_table",
            "operation": "compute",
            "config_id": config_id,
        },
    )
    if submission.status == "failure":  # pragma: no cover - defensive
        raise HTTPException(status_code=400, detail="Failed to compute pivot")
    return format_task_response(submission, embed_result=True)


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


@router.post("/{config_id}/refresh")
async def refresh_pivot_endpoint(config_id: str) -> Dict[str, Any]:
    """Force recomputation of a pivot table using the last cached configuration."""

    logger.info("pivot.refresh config_id=%s", config_id)
    submission = celery_task_client.submit_callable(
        name="pivot_table.refresh",
        dotted_path="app.features.pivot_table.service.refresh_pivot_task",
        kwargs={"config_id": config_id},
        metadata={
            "feature": "pivot_table",
            "operation": "refresh",
            "config_id": config_id,
        },
    )
    if submission.status == "failure":  # pragma: no cover - defensive
        raise HTTPException(status_code=400, detail="Failed to refresh pivot")
    return format_task_response(submission, embed_result=True)


@router.post("/{config_id}/save", response_model=PivotSaveResponse)
async def save_pivot_endpoint(config_id: str, payload: Optional[PivotSaveRequest] = None) -> PivotSaveResponse:
    """Persist the latest pivot data to project storage in MinIO.
    
    If payload.filename is provided, creates a new file (save_as).
    If payload is None or filename is not provided, overwrites existing saved file (save).
    """

    logger.info("pivot.save config_id=%s", config_id)
    response = await save_pivot(config_id, payload)
    logger.info("pivot.save.completed config_id=%s status=%s", config_id, response.status)
    return response


@router.get("/{config_id}/status", response_model=PivotStatusResponse)
async def pivot_status_endpoint(config_id: str) -> PivotStatusResponse:
    """Return cached compute status for the pivot table."""

    status = get_pivot_status(config_id)
    logger.info(
        "pivot.status config_id=%s status=%s", config_id, status.status
    )
    return status


