from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from app.core.redis import get_sync_redis


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _json_default(value: Any) -> str:
    if isinstance(value, (datetime,)):
        return value.isoformat()
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="ignore")
    return str(value)


class TaskResultStore:
    """Simple Redis-backed metadata store for Celery task state."""

    def __init__(
        self,
        *,
        redis_client=None,
        namespace: str = "task_meta",
        ttl_seconds: int | None = None,
    ) -> None:
        self.redis = redis_client or get_sync_redis()
        self.namespace = namespace
        ttl_env = os.getenv("TASK_RESULT_TTL", "86400")
        try:
            ttl_default = int(ttl_env)
        except ValueError:
            ttl_default = 86400
        self.ttl_seconds = ttl_seconds if ttl_seconds is not None else ttl_default

    def _key(self, task_id: str) -> str:
        return f"{self.namespace}:{task_id}"

    def _serialise(self, payload: Dict[str, Any]) -> str:
        return json.dumps(payload, default=_json_default)

    def _deserialise(self, data: bytes | str | None) -> Dict[str, Any] | None:
        if data is None:
            return None
        if isinstance(data, bytes):
            data = data.decode("utf-8")
        try:
            return json.loads(data)
        except Exception:
            return None

    def create(self, task_id: str, name: str, metadata: Optional[Dict[str, Any]] = None) -> None:
        payload: Dict[str, Any] = {
            "task_id": task_id,
            "name": name,
            "status": "pending",
            "created_at": _utcnow().isoformat(),
            "updated_at": _utcnow().isoformat(),
        }
        if metadata:
            payload["metadata"] = metadata
        self.redis.setex(self._key(task_id), self.ttl_seconds, self._serialise(payload))

    def fetch(self, task_id: str) -> Optional[Dict[str, Any]]:
        raw = self.redis.get(self._key(task_id))
        if raw is None:
            return None
        return self._deserialise(raw)

    def _store(self, task_id: str, payload: Dict[str, Any]) -> None:
        payload["updated_at"] = _utcnow().isoformat()
        self.redis.setex(self._key(task_id), self.ttl_seconds, self._serialise(payload))

    def update(self, task_id: str, **changes: Any) -> Optional[Dict[str, Any]]:
        payload = self.fetch(task_id) or {"task_id": task_id, "status": "pending"}
        metadata_update = changes.pop("metadata", None)
        if metadata_update:
            existing = payload.get("metadata") or {}
            if isinstance(existing, dict):
                existing.update(metadata_update)
                payload["metadata"] = existing
            else:
                payload["metadata"] = metadata_update
        payload.update(changes)
        self._store(task_id, payload)
        return payload

    def mark_started(self, task_id: str) -> Optional[Dict[str, Any]]:
        return self.update(task_id, status="running", started_at=_utcnow().isoformat())

    def mark_success(self, task_id: str, result: Any = None) -> Optional[Dict[str, Any]]:
        data: Dict[str, Any] = {
            "status": "success",
            "finished_at": _utcnow().isoformat(),
        }
        if result is not None:
            data["result"] = result
        return self.update(task_id, **data)

    def mark_failure(self, task_id: str, error: str, result: Any = None) -> Optional[Dict[str, Any]]:
        data: Dict[str, Any] = {
            "status": "failure",
            "finished_at": _utcnow().isoformat(),
            "error": error,
        }
        if result is not None:
            data["result"] = result
        return self.update(task_id, **data)


task_result_store = TaskResultStore()

__all__ = ["TaskResultStore", "task_result_store"]
