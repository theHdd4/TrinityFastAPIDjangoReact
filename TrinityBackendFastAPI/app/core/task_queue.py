from __future__ import annotations

import asyncio
import os
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional
from uuid import uuid4

from celery import Celery

from app.celery_app import celery_app
from app.core.importing import import_callable
from app.core.task_results import TaskResultStore, task_result_store


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "on"}


@dataclass
class TaskSubmission:
    task_id: str
    status: str
    result: Any | None = None
    metadata: Dict[str, Any] | None = None
    detail: str | None = None

    def as_dict(self, *, embed_result: bool = True) -> Dict[str, Any]:
        if embed_result and isinstance(self.result, dict):
            payload = dict(self.result)
            payload.setdefault("task_id", self.task_id)
            payload.setdefault("task_status", self.status)
            if self.detail and "detail" not in payload:
                payload["detail"] = self.detail
            return payload
        response: Dict[str, Any] = {"task_id": self.task_id, "task_status": self.status}
        if embed_result and self.result is not None:
            response["result"] = self.result
        if self.detail is not None:
            response["detail"] = self.detail
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
        import logging
        logger = logging.getLogger(__name__)
        callable_obj = import_callable(dotted_path)
        logger.info("TASK_QUEUE: Callable imported successfully, executing...")
        result = callable_obj(*args, **kwargs)
        logger.info("TASK_QUEUE: Callable executed, result type: %s", type(result).__name__)
        if asyncio.iscoroutine(result):
            logger.info("TASK_QUEUE: Result is coroutine, running with asyncio.run()")
            return asyncio.run(result)
        logger.info("TASK_QUEUE: Callable execution completed successfully")
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
            import logging
            logger = logging.getLogger(__name__)
            logger.info("TASK_QUEUE: always_eager=True, executing callable synchronously: %s", dotted_path)
            try:
                result = self._execute_callable(dotted_path, args_list, kwargs_dict)
                logger.info("TASK_QUEUE: Callable executed successfully, marking success for task_id=%s", task_id)
                self.result_store.mark_success(task_id, result)
                return TaskSubmission(
                    task_id=task_id,
                    status="success",
                    result=result,
                    metadata=task_metadata,
                )
            except Exception as exc:  # pragma: no cover - relies on runtime behaviour
                import logging
                logger = logging.getLogger(__name__)
                logger.error("TASK_QUEUE: Callable execution failed: %s", str(exc), exc_info=True)
                self.result_store.mark_failure(task_id, str(exc))
                return TaskSubmission(
                    task_id=task_id,
                    status="failure",
                    result=None,
                    metadata=task_metadata,
                    detail=str(exc),
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
