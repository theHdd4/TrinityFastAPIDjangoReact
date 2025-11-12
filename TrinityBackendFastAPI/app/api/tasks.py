"""Task polling and webhook registration endpoints."""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import AnyHttpUrl, BaseModel, Field

from app.celery_app import celery_app
from app.core.celery_client import submit_task
from app.core.task_tracking import get_task_metadata, register_webhook

router = APIRouter(prefix="/tasks", tags=["tasks"])


class TaskStatusResponse(BaseModel):
    task_id: str
    status: str
    celery_state: str
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    meta: Dict[str, Any] = Field(default_factory=dict)


class WebhookRequest(BaseModel):
    url: AnyHttpUrl


class WarmEnvironmentRequest(BaseModel):
    client_id: str
    app_id: str
    project_id: str
    client_name: str | None = None
    app_name: str | None = None
    project_name: str | None = None


@router.get("/{task_id}", response_model=TaskStatusResponse)
async def fetch_task_status(task_id: str) -> TaskStatusResponse:
    metadata = get_task_metadata(task_id)
    async_result = celery_app.AsyncResult(task_id)
    if metadata is None and async_result.state == "PENDING":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    payload: Dict[str, Any] = metadata or {"task_id": task_id, "status": async_result.state, "meta": {}}
    payload.update(
        {
            "task_id": task_id,
            "status": payload.get("status", async_result.state),
            "celery_state": async_result.state,
        }
    )
    if payload.get("result") is None and async_result.ready() and async_result.successful():
        try:
            payload["result"] = async_result.result
        except Exception:  # pragma: no cover - Celery backend misconfiguration
            pass
    if payload.get("error") is None and async_result.failed():
        try:
            payload["error"] = str(async_result.result)
        except Exception:
            payload["error"] = "Task failed"
    payload.setdefault("meta", {})
    return TaskStatusResponse(**payload)


@router.post("/{task_id}/webhook", status_code=status.HTTP_204_NO_CONTENT)
async def register_task_webhook(task_id: str, request: WebhookRequest) -> None:
    register_webhook(task_id, str(request.url))


@router.post("/warm-environment", status_code=status.HTTP_202_ACCEPTED)
async def enqueue_warm_environment(request: WarmEnvironmentRequest) -> Dict[str, Any]:
    submission = submit_task(
        "cache.warm_environment",
        kwargs={
            "client_id": request.client_id,
            "app_id": request.app_id,
            "project_id": request.project_id,
            "client_name": request.client_name or "",
            "app_name": request.app_name or "",
            "project_name": request.project_name or "",
        },
        meta={
            "client_id": request.client_id,
            "app_id": request.app_id,
            "project_id": request.project_id,
        },
    )
    return {
        "task_id": submission.id,
        "task_name": submission.name,
        "status_url": f"/tasks/{submission.id}",
    }


__all__ = ["router"]
