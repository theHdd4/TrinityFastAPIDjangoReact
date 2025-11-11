"""Celery tasks orchestrating TaskRun execution."""
from __future__ import annotations

from contextlib import nullcontext
from dataclasses import dataclass
from typing import Any, Dict, Iterable

from celery import chain
from celery.utils.log import get_task_logger
from django.utils import timezone
from django_tenants.utils import schema_context

from apps.accounts.tenant_utils import get_user_tenant_schema
from config.celery import celery_app
from .models import TaskRun
from .services import OrchestratorService

logger = get_task_logger(__name__)

CPU_QUEUE = "orchestration.cpu"
IO_QUEUE = "orchestration.io"


@dataclass(frozen=True)
class TaskContext:
    """Serializable execution context propagated between subtasks."""

    task_run_id: int
    tenant_schema: str
    queue: str
    engine_id: int | None = None
    status: str | None = None
    output: Any | None = None
    error: str = ""
    retries: int = 0

    def asdict(self) -> Dict[str, Any]:
        return {
            "task_run_id": self.task_run_id,
            "tenant_schema": self.tenant_schema,
            "queue": self.queue,
            "engine_id": self.engine_id,
            "status": self.status,
            "output": self.output,
            "error": self.error,
            "retries": self.retries,
        }


def _determine_execution_queue(task_run: TaskRun) -> str:
    input_payload = task_run.input or {}
    profile = input_payload.get("execution_profile")
    cpu_hint = input_payload.get("cpu_bound")

    if isinstance(profile, str) and "cpu" in profile.lower():
        return CPU_QUEUE
    if isinstance(profile, dict):
        if profile.get("type", "").lower() == "cpu" or profile.get("cpu_bound"):
            return CPU_QUEUE
    if isinstance(cpu_hint, bool) and cpu_hint:
        return CPU_QUEUE
    return IO_QUEUE


def _derive_tenant_schema(task_run: TaskRun) -> str:
    input_payload = task_run.input or {}
    explicit_schema = input_payload.get("tenant_schema") or task_run.tenant_schema
    if explicit_schema:
        return explicit_schema

    workflow_run = getattr(task_run, "workflow_run", None)
    if workflow_run and workflow_run.initiated_by_id:
        try:
            schema_name = get_user_tenant_schema(workflow_run.initiated_by)
        except Exception:  # pragma: no cover - defensive guard
            schema_name = None
        if schema_name:
            return schema_name
    return "public"


def _follow_up_task_ids(task_run: TaskRun) -> Iterable[int]:
    input_payload = task_run.input or {}
    followups = input_payload.get("next_task_run_ids") or []
    return [int(identifier) for identifier in followups if str(identifier).isdigit()]


def enqueue_task_run(
    task_run_id: int,
    *,
    countdown: int | None = None,
    tenant_schema: str | None = None,
) -> Any:
    """Push a ``TaskRun`` through the Celery pipeline."""

    context_manager = (
        schema_context(tenant_schema) if tenant_schema else nullcontext()
    )

    with context_manager:
        task_run = TaskRun.objects.select_related("workflow_run__initiated_by").get(
            id=task_run_id
        )
        resolved_schema = tenant_schema or _derive_tenant_schema(task_run)
        queue = _determine_execution_queue(task_run)

        context = TaskContext(
            task_run_id=task_run.id,
            tenant_schema=resolved_schema,
            queue=queue,
        ).asdict()

        signature = chain(
            prepare_task_run.s(context).set(queue=queue),
            dispatch_task_run.s().set(queue=queue),
            finalize_task_run.s().set(queue=queue),
        )

        result = signature.apply_async(queue=queue, countdown=countdown)

        TaskRun.objects.filter(id=task_run.id).update(
            tenant_schema=resolved_schema,
            celery_task_id=result.id,
            retries=0,
            updated_at=timezone.now(),
        )

    logger.info(
        "Enqueued TaskRun %s on %s queue as Celery task %s", task_run_id, queue, result.id
    )

    return result


@celery_app.task(
    bind=True,
    name="apps.orchestration.prepare_task_run",
    autoretry_for=(RuntimeError,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 3},
)
def prepare_task_run(self, context: Dict[str, Any]) -> Dict[str, Any]:
    """Resolve tenant scope and compute engine before dispatch."""

    task_run_id = context["task_run_id"]
    tenant_schema = context["tenant_schema"]

    logger.debug("Preparing TaskRun %s in schema %s", task_run_id, tenant_schema)

    with schema_context(tenant_schema):
        try:
            task_run = TaskRun.objects.select_related("workflow_run").get(id=task_run_id)
        except TaskRun.DoesNotExist as exc:
            logger.error("TaskRun %s disappeared before preparation", task_run_id)
            context.update({
                "status": TaskRun.STATUS_FAILURE,
                "error": f"TaskRun {task_run_id} no longer exists",
            })
            return context

        engine = OrchestratorService.select_engine()
        now = timezone.now()
        TaskRun.objects.filter(id=task_run.id).update(
            engine_id=engine.id,
            status=TaskRun.STATUS_RUNNING,
            tenant_schema=tenant_schema,
            retries=self.request.retries,
            updated_at=now,
        )

    context.update({
        "engine_id": engine.id,
        "status": TaskRun.STATUS_RUNNING,
        "error": "",
        "prepared_at": timezone.now().isoformat(),
    })

    return context


@celery_app.task(
    bind=True,
    name="apps.orchestration.dispatch_task_run",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 3, "countdown": 15},
)
def dispatch_task_run(self, context: Dict[str, Any]) -> Dict[str, Any]:
    """Invoke the orchestration engine and capture the result."""

    task_run_id = context["task_run_id"]
    tenant_schema = context["tenant_schema"]

    with schema_context(tenant_schema):
        try:
            task_run = TaskRun.objects.select_related("engine").get(id=task_run_id)
        except TaskRun.DoesNotExist:
            logger.error("TaskRun %s vanished during dispatch", task_run_id)
            context.update({
                "status": TaskRun.STATUS_FAILURE,
                "error": f"TaskRun {task_run_id} missing during dispatch",
            })
            return context

        engine = task_run.engine
        result = OrchestratorService.run_task(task_run, engine=engine, persist=False)

    context.update({
        "status": result["status"],
        "output": result.get("output"),
        "error": result.get("error", ""),
        "engine_id": result.get("engine_id"),
        "retries": self.request.retries,
        "dispatched_at": result.get("dispatched_at"),
    })

    return context


@celery_app.task(name="apps.orchestration.finalize_task_run")
def finalize_task_run(context: Dict[str, Any]) -> Dict[str, Any]:
    """Persist execution results and optionally schedule follow-up runs."""

    task_run_id = context["task_run_id"]
    tenant_schema = context.get("tenant_schema", "public")
    status = context.get("status", TaskRun.STATUS_FAILURE)
    error = context.get("error", "")
    output = context.get("output")
    retries = context.get("retries", 0)

    logger.debug(
        "Finalizing TaskRun %s with status %s in schema %s", task_run_id, status, tenant_schema
    )

    followup_ids: Iterable[int] = []
    with schema_context(tenant_schema):
        try:
            task_run = TaskRun.objects.select_related("workflow_run").get(id=task_run_id)
        except TaskRun.DoesNotExist:
            logger.warning("TaskRun %s missing during finalization", task_run_id)
            return context

        followup_ids = list(_follow_up_task_ids(task_run))
        TaskRun.objects.filter(id=task_run.id).update(
            status=status,
            error=error,
            output=output,
            retries=retries,
            tenant_schema=tenant_schema,
            updated_at=timezone.now(),
        )

    if status == TaskRun.STATUS_SUCCESS and followup_ids:
        for next_task_id in followup_ids:
            logger.info(
                "Scheduling follow-up TaskRun %s after %s", next_task_id, task_run_id
            )
            enqueue_task_run(next_task_id, tenant_schema=tenant_schema)

    return context


@celery_app.task(name="apps.orchestration.execute_task")
def execute_task(task_run_id: int) -> Any:
    """Legacy entry point that simply enqueues the execution pipeline."""

    return enqueue_task_run(task_run_id)
