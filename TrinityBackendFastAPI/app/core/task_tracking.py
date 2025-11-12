"""Task metadata management backed by the feature cache infrastructure."""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional

from app.core.feature_cache import FeatureCacheNamespace, feature_cache
from app.core.redis import get_sync_redis

_TASK_CACHE = feature_cache.router(
    "celery_tasks",
    default_namespace=FeatureCacheNamespace.TASK,
)


@dataclass
class TaskMetadata:
    """Representation of the state persisted for an asynchronous job."""

    task_id: str
    name: str
    status: str
    created_at: str
    updated_at: str
    meta: Dict[str, Any] = field(default_factory=dict)
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    webhooks: List[str] = field(default_factory=list)

    def to_payload(self) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "task_id": self.task_id,
            "name": self.name,
            "status": self.status,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "meta": self.meta,
            "webhooks": self.webhooks,
        }
        if self.result is not None:
            payload["result"] = self.result
        if self.error is not None:
            payload["error"] = self.error
        return payload

    @classmethod
    def from_payload(cls, payload: Dict[str, Any]) -> "TaskMetadata":
        return cls(
            task_id=payload["task_id"],
            name=payload.get("name", ""),
            status=payload.get("status", "PENDING"),
            created_at=payload.get("created_at", _now()),
            updated_at=payload.get("updated_at", _now()),
            meta=payload.get("meta", {}) or {},
            result=payload.get("result"),
            error=payload.get("error"),
            webhooks=payload.get("webhooks", []) or [],
        )


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _key(task_id: str) -> Iterable[str]:
    return (task_id,)


def _load(task_id: str) -> Optional[TaskMetadata]:
    payload = _TASK_CACHE.get_json(_key(task_id))
    if not payload:
        return None
    return TaskMetadata.from_payload(payload)


def _persist(metadata: TaskMetadata) -> None:
    metadata.updated_at = _now()
    _TASK_CACHE.set_json(_key(metadata.task_id), metadata.to_payload())


def record_task_enqueued(task_id: str, *, name: str, meta: Optional[Dict[str, Any]] = None) -> None:
    created = _now()
    payload = TaskMetadata(
        task_id=task_id,
        name=name,
        status="PENDING",
        created_at=created,
        updated_at=created,
        meta=meta or {},
    )
    _persist(payload)


def record_task_started(task_id: str) -> None:
    metadata = _load(task_id)
    if not metadata:
        metadata = TaskMetadata(
            task_id=task_id,
            name="unknown",
            status="STARTED",
            created_at=_now(),
            updated_at=_now(),
        )
    metadata.status = "STARTED"
    _persist(metadata)


def record_task_progress(task_id: str, *, message: str, progress: Optional[Dict[str, Any]] = None) -> None:
    metadata = _load(task_id)
    if not metadata:
        return
    metadata.meta.setdefault("progress", [])
    metadata.meta["progress"].append({
        "timestamp": _now(),
        "message": message,
        **(progress or {}),
    })
    metadata.status = "STARTED"
    _persist(metadata)


def record_task_success(task_id: str, result: Optional[Dict[str, Any]] = None) -> None:
    metadata = _load(task_id)
    if not metadata:
        metadata = TaskMetadata(
            task_id=task_id,
            name="unknown",
            status="SUCCESS",
            created_at=_now(),
            updated_at=_now(),
        )
    metadata.status = "SUCCESS"
    if result is not None:
        metadata.result = result
    _persist(metadata)


def record_task_failure(task_id: str, *, error: str) -> None:
    metadata = _load(task_id)
    if not metadata:
        metadata = TaskMetadata(
            task_id=task_id,
            name="unknown",
            status="FAILURE",
            created_at=_now(),
            updated_at=_now(),
        )
    metadata.status = "FAILURE"
    metadata.error = error
    _persist(metadata)


def register_webhook(task_id: str, url: str) -> None:
    metadata = _load(task_id)
    if not metadata:
        metadata = TaskMetadata(
            task_id=task_id,
            name="unknown",
            status="PENDING",
            created_at=_now(),
            updated_at=_now(),
        )
    if url not in metadata.webhooks:
        metadata.webhooks.append(url)
    _persist(metadata)


def get_task_metadata(task_id: str) -> Optional[Dict[str, Any]]:
    metadata = _load(task_id)
    if not metadata:
        return None
    return metadata.to_payload()


def list_cached_tasks(prefix: str) -> List[Dict[str, Any]]:
    redis_client = get_sync_redis()
    pattern = f"feature-cache:task:celery_tasks:{prefix}*"
    tasks: List[Dict[str, Any]] = []
    for key in redis_client.scan_iter(match=pattern):
        raw = redis_client.get(key)
        if not raw:
            continue
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            continue
        tasks.append(payload)
    return tasks


__all__ = [
    "TaskMetadata",
    "record_task_enqueued",
    "record_task_started",
    "record_task_progress",
    "record_task_success",
    "record_task_failure",
    "register_webhook",
    "get_task_metadata",
    "list_cached_tasks",
]
