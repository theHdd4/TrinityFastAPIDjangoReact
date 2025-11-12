"""Helpers for submitting Celery tasks from FastAPI endpoints.

This module wraps the shared ``celery_app`` instance and provides convenience
functions that automatically record task metadata in Redis so API layers can
immediately expose task identifiers back to the caller.  The helpers mirror the
most common invocation patterns used across the codebase (simple fire-and-
forget jobs) while keeping the calling code concise and predictable.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Iterable, Mapping, MutableMapping, Optional

from celery.app.task import Task
from celery.result import AsyncResult

from app.celery_app import celery_app
from app.core.task_tracking import record_task_enqueued


@dataclass(frozen=True)
class SubmittedTask:
    """Lightweight value object describing a submitted Celery task."""

    id: str
    name: str

    def result_handle(self) -> AsyncResult:
        """Return an ``AsyncResult`` bound to this task."""

        return celery_app.AsyncResult(self.id)


def _maybe_update_headers(
    options: MutableMapping[str, Any],
    headers: Optional[Mapping[str, Any]],
) -> None:
    if not headers:
        return
    existing: MutableMapping[str, Any] = options.setdefault("headers", {})  # type: ignore[assignment]
    existing.update(headers)


def submit_task(
    name: str,
    *,
    args: Optional[Iterable[Any]] = None,
    kwargs: Optional[Mapping[str, Any]] = None,
    queue: Optional[str] = None,
    countdown: Optional[int] = None,
    priority: Optional[int] = None,
    headers: Optional[Mapping[str, Any]] = None,
    meta: Optional[Dict[str, Any]] = None,
) -> SubmittedTask:
    """Submit ``name`` to Celery and persist the queued metadata."""

    task_options: Dict[str, Any] = {}
    if queue:
        task_options["queue"] = queue
    if countdown is not None:
        task_options["countdown"] = countdown
    if priority is not None:
        task_options["priority"] = priority
    _maybe_update_headers(task_options, headers)

    async_result = celery_app.send_task(
        name,
        args=tuple(args or ()),
        kwargs=dict(kwargs or {}),
        **task_options,
    )

    record_task_enqueued(async_result.id, name=name, meta=meta)
    return SubmittedTask(id=async_result.id, name=name)


def submit_bound_task(
    task: Task,
    *,
    args: Optional[Iterable[Any]] = None,
    kwargs: Optional[Mapping[str, Any]] = None,
    meta: Optional[Dict[str, Any]] = None,
) -> SubmittedTask:
    """Submit the provided task instance and persist the queued metadata."""

    async_result = task.apply_async(args=args or (), kwargs=kwargs or {})
    record_task_enqueued(async_result.id, name=task.name, meta=meta)
    return SubmittedTask(id=async_result.id, name=task.name)


__all__ = ["SubmittedTask", "submit_task", "submit_bound_task"]
