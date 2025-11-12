"""Generic Celery tasks for executing feature-specific callables.

This module provides a single entry point that allows any feature atom living
under ``app.features`` to offload expensive or long running work to Celery.
The task accepts a fully qualified dotted-path pointing at the callable to
execute plus optional positional and keyword arguments.  Results are encoded
using FastAPI's ``jsonable_encoder`` to ensure they are serialisable when
persisted by Celery or returned through the task-status endpoints.

The indirection keeps the individual feature packages light – they only need
to know the dotted-path of the function they want to run – while still giving
us a single place to add logging, observability hooks, and error tracking for
every asynchronous job.
"""
from __future__ import annotations

import asyncio
import importlib
import inspect
from typing import Any, Iterable, Mapping, MutableMapping

from fastapi.encoders import jsonable_encoder
from fastapi import HTTPException
from starlette.responses import Response

from app.celery_app import celery_app
from app.core.task_tracking import (
    record_task_failure,
    record_task_progress,
    record_task_started,
    record_task_success,
)


def _load_callable(path: str):
    """Return the callable addressed by ``path``.

    ``path`` must be of the form ``"app.features.<feature>.<module>.<name>"``.
    ``ValueError`` is raised when the path does not point to a valid attribute
    so callers receive immediate feedback in task metadata.
    """

    if not path.startswith("app.features."):
        raise ValueError(
            "Callable path must begin with 'app.features.' – received"
            f" '{path}'"
        )
    try:
        module_path, attr_name = path.rsplit(".", 1)
    except ValueError as exc:  # pragma: no cover - defensive guard
        raise ValueError(f"Invalid callable path '{path}'") from exc
    module = importlib.import_module(module_path)
    try:
        target = getattr(module, attr_name)
    except AttributeError as exc:
        raise ValueError(f"Callable '{attr_name}' not found in '{module_path}'") from exc
    if not callable(target):
        raise ValueError(f"Target '{path}' is not callable")
    return target


def _serialise_result(result: Any) -> Any:
    """Convert Celery task results to JSON-friendly data structures."""

    if isinstance(result, Response):
        body = result.body
        if isinstance(body, bytes):
            try:
                body = body.decode(result.charset or "utf-8")
            except Exception:  # pragma: no cover - best effort decode
                pass
        return {
            "status_code": result.status_code,
            "headers": dict(result.headers),
            "media_type": result.media_type,
            "body": body,
        }
    return jsonable_encoder(result)


def _normalise_sequence(values: Iterable[Any] | None) -> tuple[Any, ...]:
    if not values:
        return ()
    if isinstance(values, tuple):
        return values
    return tuple(values)


def _normalise_mapping(values: Mapping[str, Any] | None) -> MutableMapping[str, Any]:
    return dict(values or {})


@celery_app.task(name="features.execute_callable", bind=True)
def execute_callable(
    self,
    callable_path: str,
    *,
    args: Iterable[Any] | None = None,
    kwargs: Mapping[str, Any] | None = None,
) -> Any:
    """Execute ``callable_path`` inside a Celery worker.

    Any exceptions raised by the target callable are allowed to bubble up after
    recording the failure in the task tracker so callers can inspect the
    resulting error in the task status endpoint.
    """

    record_task_started(self.request.id)
    record_task_progress(
        self.request.id,
        message="Dispatching feature callable",
        progress={"callable": callable_path},
    )

    try:
        target = _load_callable(callable_path)
        call_args = _normalise_sequence(args)
        call_kwargs = _normalise_mapping(kwargs)
        result = target(*call_args, **call_kwargs)
        if inspect.isawaitable(result):
            result = asyncio.run(result)  # type: ignore[arg-type]
    except HTTPException as exc:
        # Preserve HTTPException details for API consumers by recording the
        # error but re-raising so Celery stores the underlying exception.
        record_task_failure(
            self.request.id,
            error=exc.detail if isinstance(exc.detail, str) else str(exc.detail),
        )
        raise
    except Exception as exc:  # pragma: no cover - defensive logging
        record_task_failure(self.request.id, error=str(exc))
        raise

    payload = _serialise_result(result)
    record_task_success(
        self.request.id,
        result={"callable": callable_path, "result": payload},
    )
    return payload


__all__ = ["execute_callable"]
