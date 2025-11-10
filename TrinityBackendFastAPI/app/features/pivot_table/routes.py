from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from .schemas import (
    PivotComputeRequest,
    PivotComputeResponse,
    PivotRefreshResponse,
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


router = APIRouter(prefix="/pivot", tags=["Pivot Table"])


@router.post("/{config_id}/compute", response_model=PivotComputeResponse)
async def compute_pivot_endpoint(config_id: str, payload: PivotComputeRequest) -> PivotComputeResponse:
    """Generate a pivot table for the supplied configuration."""

    return await compute_pivot(config_id, payload)


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

    return await refresh_pivot(config_id)


@router.post("/{config_id}/save", response_model=PivotSaveResponse)
async def save_pivot_endpoint(config_id: str) -> PivotSaveResponse:
    """Persist the latest pivot data to project storage in MinIO."""

    return await save_pivot(config_id)


@router.get("/{config_id}/status", response_model=PivotStatusResponse)
async def pivot_status_endpoint(config_id: str) -> PivotStatusResponse:
    """Return cached compute status for the pivot table."""

    return get_pivot_status(config_id)


