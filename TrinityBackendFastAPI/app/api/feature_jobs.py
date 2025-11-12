"""API endpoints for dispatching feature atoms to Celery workers."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.core.celery_client import submit_feature_task


class FeatureJobRequest(BaseModel):
    callable: str = Field(..., description="Fully qualified callable path inside app.features")
    args: list[Any] = Field(default_factory=list)
    kwargs: dict[str, Any] = Field(default_factory=dict)
    meta: dict[str, Any] = Field(default_factory=dict)
    queue: str | None = Field(default=None, description="Optional Celery queue override")
    countdown: int | None = Field(default=None, ge=0, description="Optional countdown in seconds")
    priority: int | None = Field(default=None, ge=0, description="Optional Celery priority")


class FeatureJobResponse(BaseModel):
    task_id: str
    task_name: str
    status_url: str


router = APIRouter(prefix="/feature-jobs", tags=["feature-jobs"])


@router.post("/", response_model=FeatureJobResponse, status_code=status.HTTP_202_ACCEPTED)
async def enqueue_feature_job(request: FeatureJobRequest) -> FeatureJobResponse:
    try:
        submission = submit_feature_task(
            callable_path=request.callable,
            args=request.args,
            kwargs=request.kwargs,
            meta=request.meta,
            queue=request.queue,
            countdown=request.countdown,
            priority=request.priority,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return FeatureJobResponse(
        task_id=submission.id,
        task_name=submission.name,
        status_url=f"/tasks/{submission.id}",
    )


__all__ = ["router"]
