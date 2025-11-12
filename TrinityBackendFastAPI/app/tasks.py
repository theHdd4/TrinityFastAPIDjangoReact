from __future__ import annotations

import asyncio
from typing import Any, Dict, List, Optional

from celery import states
from celery.signals import task_failure, task_postrun, task_prerun

from app.celery_app import celery_app
from app.core.task_queue import import_callable, task_result_store


@celery_app.task(name="app.tasks.execute_callable", bind=True)
def execute_callable(self, dotted_path: str, call_args: Optional[List[Any]] = None, call_kwargs: Optional[Dict[str, Any]] = None):
    target = import_callable(dotted_path)
    args = call_args or []
    kwargs = call_kwargs or {}
    result = target(*args, **kwargs)
    if asyncio.iscoroutine(result):  # pragma: no cover - depends on runtime usage
        return asyncio.run(result)
    return result


@task_prerun.connect
def _on_task_prerun(*, task_id: str, task, **kwargs):  # pragma: no cover - depends on Celery runtime
    task_result_store.mark_started(task_id)


@task_postrun.connect
def _on_task_postrun(task_id: str, task, args, kwargs, retval, state, **extra):  # pragma: no cover - depends on Celery runtime
    if state == states.SUCCESS:
        task_result_store.mark_success(task_id, retval)
    elif state == states.FAILURE:
        task_result_store.mark_failure(task_id, "Task failed", retval)


@task_failure.connect
def _on_task_failure(task_id: str, exception: BaseException, **kwargs):  # pragma: no cover - depends on Celery runtime
    task_result_store.mark_failure(task_id, str(exception))


__all__ = ["execute_callable"]
