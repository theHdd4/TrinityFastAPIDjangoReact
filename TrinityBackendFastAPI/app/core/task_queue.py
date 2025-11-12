from __future__ import annotations

import asyncio
import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from importlib import import_module
from typing import Any, Dict, Iterable, List, Optional
from uuid import uuid4

from celery import Celery

from app.celery_app import celery_app
from app.core.redis import get_sync_redis


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "on"}


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


def import_callable(dotted_path: str):
    module_path, _, attribute = dotted_path.rpartition(".")
    if not module_path:
        raise ImportError(f"Invalid callable path: {dotted_path}")
    module = import_module(module_path)
    try:
        return getattr(module, attribute)
    except AttributeError as exc:  # pragma: no cover - defensive
        raise ImportError(f"Callable '{attribute}' not found in '{module_path}'") from exc


@dataclass
class TaskSubmission:
    task_id: str
    status: str
    result: Any | None = None
    metadata: Dict[str, Any] | None = None

    def as_dict(self, *, embed_result: bool = True) -> Dict[str, Any]:
        if embed_result and isinstance(self.result, dict):
            payload = dict(self.result)
            payload.setdefault("task_id", self.task_id)
            payload.setdefault("task_status", self.status)
            return payload
        response: Dict[str, Any] = {"task_id": self.task_id, "task_status": self.status}
        if embed_result and self.result is not None:
            response["result"] = self.result
        return response


class CeleryTaskClient:
    """Helper that submits callables to Celery with optional eager execution."""

    def __init__(
        self,
        *,
        celery: Celery,
        result_store: TaskResultStore,
        always_eager: Optional[bool] = None,
    ) -> None:
        self.celery = celery
        self.result_store = result_store
        self.always_eager = (
            _env_bool("CELERY_TASKS_ALWAYS_EAGER", True)
            if always_eager is None
            else always_eager
        )

    def _execute_callable(self, dotted_path: str, args: List[Any], kwargs: Dict[str, Any]) -> Any:
        callable_obj = import_callable(dotted_path)
        result = callable_obj(*args, **kwargs)
        if asyncio.iscoroutine(result):
            return asyncio.run(result)
        return result

    def submit_callable(
        self,
        *,
        name: str,
        dotted_path: str,
        args: Optional[Iterable[Any]] = None,
        kwargs: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None,
        queue: Optional[str] = None,
    ) -> TaskSubmission:
        args_list = list(args or [])
        kwargs_dict = dict(kwargs or {})
        task_id = uuid4().hex
        task_metadata = dict(metadata or {})
        task_metadata.setdefault("callable", dotted_path)
        self.result_store.create(task_id, name, task_metadata)

        if self.always_eager:
            try:
                result = self._execute_callable(dotted_path, args_list, kwargs_dict)
                self.result_store.mark_success(task_id, result)
                return TaskSubmission(
                    task_id=task_id,
                    status="success",
                    result=result,
                    metadata=task_metadata,
                )
            except Exception as exc:  # pragma: no cover - relies on runtime behaviour
                self.result_store.mark_failure(task_id, str(exc))
                return TaskSubmission(
                    task_id=task_id,
                    status="failure",
                    result=None,
                    metadata=task_metadata,
                )

        options: Dict[str, Any] = {"task_id": task_id}
        if queue:
            options["queue"] = queue
        self.celery.send_task(
            "app.tasks.execute_callable",
            args=[dotted_path],
            kwargs={"call_args": args_list, "call_kwargs": kwargs_dict},
            **options,
        )
        return TaskSubmission(task_id=task_id, status="pending", metadata=task_metadata)


task_result_store = TaskResultStore()
celery_task_client = CeleryTaskClient(celery=celery_app, result_store=task_result_store)


def format_task_response(submission: TaskSubmission, *, embed_result: bool = True) -> Dict[str, Any]:
    return submission.as_dict(embed_result=embed_result)


__all__ = [
    "TaskResultStore",
    "CeleryTaskClient",
    "TaskSubmission",
    "task_result_store",
    "celery_task_client",
    "format_task_response",
    "import_callable",
]
