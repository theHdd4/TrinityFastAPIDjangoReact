from __future__ import annotations

import logging

from celery import chain
from celery.result import AsyncResult
from django.db import connection
from django.utils import timezone
from django_tenants.utils import schema_context

from config.celery import celery_app
from config.celery_settings import CPU_QUEUE, IO_QUEUE
from .models import TaskRun
from .services import EngineExecutionError, OrchestratorService

logger = logging.getLogger(__name__)

CPU_QUEUE_NAME = CPU_QUEUE
IO_QUEUE_NAME = IO_QUEUE


def _queue_for_profile(execution_profile: str) -> str:
    if execution_profile == TaskRun.EXECUTION_PROFILE_CPU:
        return CPU_QUEUE_NAME
    return IO_QUEUE_NAME


def enqueue_task_run(
    task_run: TaskRun,
    *,
    schema_name: str | None = None,
    countdown: int | None = None,
) -> AsyncResult:
    """Queue a single ``TaskRun`` for asynchronous execution."""

    schema = schema_name or task_run.tenant_schema or connection.schema_name
    queue_name = _queue_for_profile(task_run.execution_profile)

    execute_signature = execute_task.si(task_run.id, schema).set(queue=queue_name)
    finalize_signature = persist_task_result.s().set(queue=IO_QUEUE_NAME)

    async_result = chain(execute_signature, finalize_signature).apply_async(countdown=countdown)

    with schema_context(schema):
        TaskRun.objects.filter(id=task_run.id).update(
            tenant_schema=schema,
            celery_task_id=async_result.id,
            execution_profile=task_run.execution_profile,
            updated_at=timezone.now(),
        )

    task_run.tenant_schema = schema
    task_run.celery_task_id = async_result.id
    return async_result


def enqueue_workflow_run(
    workflow_run,
    *,
    schema_name: str | None = None,
) -> AsyncResult | None:
    """Queue all ``TaskRun`` instances for ``workflow_run`` sequentially."""

    from apps.workflows.models import WorkflowRun  # local import to avoid circular

    if not isinstance(workflow_run, WorkflowRun):
        raise TypeError("workflow_run must be a WorkflowRun instance")

    task_runs = list(workflow_run.task_runs.order_by("created_at"))
    if not task_runs:
        return None

    schema = schema_name or task_runs[0].tenant_schema or connection.schema_name

    segments = []
    for task_run in task_runs:
        queue_name = _queue_for_profile(task_run.execution_profile)
        segments.append(execute_task.si(task_run.id, schema).set(queue=queue_name))
        segments.append(persist_task_result.s().set(queue=IO_QUEUE_NAME))

    async_result = chain(*segments).apply_async()

    with schema_context(schema):
        workflow_run.status = "running"
        workflow_run.save(update_fields=["status", "updated_at"])

    return async_result


@celery_app.task(bind=True, max_retries=3)
def execute_task(self, task_run_id: int, schema_name: str) -> dict:
    """Invoke the external engine for the given ``TaskRun``."""

    countdown = min(60, (2 ** self.request.retries) * 5) if self.request.retries else None

    with schema_context(schema_name):
        task_run = TaskRun.objects.select_related("workflow_run").get(id=task_run_id)
        TaskRun.objects.filter(id=task_run_id).update(
            status=TaskRun.STATUS_RUNNING,
            celery_task_id=self.request.id,
            tenant_schema=schema_name,
            updated_at=timezone.now(),
        )

        workflow_run = task_run.workflow_run
        if workflow_run.status == "pending":
            workflow_run.status = "running"
            workflow_run.save(update_fields=["status", "updated_at"])

    try:
        execution = OrchestratorService.run_task(task_run)
    except EngineExecutionError as exc:
        if self.request.retries < self.max_retries:
            logger.warning(
                "Retrying TaskRun %s in %s seconds (%s/%s attempts)",
                task_run_id,
                countdown or 0,
                self.request.retries + 1,
                self.max_retries,
            )
            raise self.retry(exc=exc, countdown=countdown)

        logger.error("TaskRun %s failed after retries: %s", task_run_id, exc)
        engine_id = exc.engine.id if getattr(exc, "engine", None) else None
        return {
            "task_run_id": task_run_id,
            "schema_name": schema_name,
            "status": TaskRun.STATUS_FAILURE,
            "error": str(exc),
            "output": None,
            "engine_id": engine_id,
        }
    except Exception as exc:  # pragma: no cover - defensive logging
        logger.exception("Unexpected error executing TaskRun %s", task_run_id)
        return {
            "task_run_id": task_run_id,
            "schema_name": schema_name,
            "status": TaskRun.STATUS_FAILURE,
            "error": str(exc),
            "output": None,
            "engine_id": None,
        }

    return {
        "task_run_id": task_run_id,
        "schema_name": schema_name,
        "status": TaskRun.STATUS_SUCCESS,
        "error": "",
        "output": execution.payload,
        "engine_id": execution.engine.id,
    }


@celery_app.task(bind=True)
def persist_task_result(self, result: dict) -> dict:
    """Persist engine results and advance workflow state."""

    schema_name = result["schema_name"]
    with schema_context(schema_name):
        task_run = TaskRun.objects.select_related("workflow_run").get(id=result["task_run_id"])

        fields = {
            "status": result["status"],
            "error": result.get("error", "") or "",
            "updated_at": timezone.now(),
        }
        if "output" in result:
            fields["output"] = result["output"]
        if result.get("engine_id"):
            fields["engine_id"] = result["engine_id"]

        TaskRun.objects.filter(id=task_run.id).update(**fields)

        workflow_run = task_run.workflow_run
        if result["status"] == TaskRun.STATUS_FAILURE:
            if workflow_run.status != "failure":
                workflow_run.status = "failure"
                workflow_run.updated_at = timezone.now()
                workflow_run.save(update_fields=["status", "updated_at"])
        elif result["status"] == TaskRun.STATUS_SUCCESS:
            remaining = workflow_run.task_runs.exclude(
                status__in=[TaskRun.STATUS_SUCCESS, TaskRun.STATUS_FAILURE]
            ).exists()
            if not remaining:
                workflow_run.status = "success"
                workflow_run.updated_at = timezone.now()
                workflow_run.save(update_fields=["status", "updated_at"])

    return result


__all__ = [
    "enqueue_task_run",
    "enqueue_workflow_run",
    "execute_task",
    "persist_task_result",
]

