from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.task_queue import task_result_store

router = APIRouter()


class TaskWebhookPayload(BaseModel):
    status: str
    result: Optional[Any] = None
    error: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


@router.get("/{task_id}")
async def get_task(task_id: str):
    payload = task_result_store.fetch(task_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return payload


@router.post("/{task_id}/webhook")
async def update_task(task_id: str, body: TaskWebhookPayload):
    status = body.status.lower()
    if status in {"success", "completed"}:
        task_result_store.mark_success(task_id, body.result)
    elif status in {"failure", "failed", "error"}:
        task_result_store.mark_failure(task_id, body.error or "Task failed", body.result)
    elif status in {"running", "in_progress"}:
        task_result_store.mark_started(task_id)
        if body.result is not None:
            task_result_store.update(task_id, result=body.result)
    else:
        task_result_store.update(task_id, status=status, result=body.result, error=body.error)
    if body.metadata:
        task_result_store.update(task_id, metadata=body.metadata)
    return {"task_id": task_id, "status": status}


@router.get("/{task_id}/result")
async def get_task_result(task_id: str):
    payload = task_result_store.fetch(task_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return {
        "task_id": task_id,
        "status": payload.get("status"),
        "result": payload.get("result"),
        "error": payload.get("error"),
    }


__all__ = ["router"]
