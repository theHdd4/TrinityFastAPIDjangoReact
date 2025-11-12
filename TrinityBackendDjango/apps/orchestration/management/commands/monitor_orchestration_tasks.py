from __future__ import annotations

from typing import Iterable

from celery import states
from django.core.management.base import BaseCommand
from django.utils import timezone
from django_tenants.utils import schema_context

from apps.orchestration.models import TaskRun
from apps.tenants.models import Tenant
from config.celery import celery_app


class Command(BaseCommand):
    help = "Inspect pending/running TaskRuns and reconcile Celery state."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--tenant",
            dest="tenant",
            type=str,
            help="Restrict monitoring to a specific tenant schema.",
        )
        parser.add_argument(
            "--limit",
            dest="limit",
            type=int,
            default=50,
            help="Maximum number of TaskRuns to display per tenant.",
        )
        parser.add_argument(
            "--update",
            action="store_true",
            dest="update",
            help="Persist TaskRun status based on Celery AsyncResult state.",
        )

    def handle(self, *args, **options):
        tenant_filter: str | None = options["tenant"]
        limit: int = options["limit"]
        should_update: bool = options["update"]

        for tenant in self._tenant_queryset(tenant_filter):
            with schema_context(tenant.schema_name):
                self._inspect_tenant(tenant.schema_name, limit, should_update)

    def _tenant_queryset(self, tenant_filter: str | None) -> Iterable[Tenant]:
        queryset = Tenant.objects.exclude(schema_name="public")
        if tenant_filter:
            queryset = queryset.filter(schema_name=tenant_filter)
        return queryset

    def _inspect_tenant(self, schema_name: str, limit: int, should_update: bool) -> None:
        queryset = TaskRun.objects.filter(
            status__in=[TaskRun.STATUS_PENDING, TaskRun.STATUS_RUNNING]
        ).order_by("created_at")[:limit]

        if not queryset:
            self.stdout.write(f"[{schema_name}] No pending or running TaskRuns found.")
            return

        for task_run in queryset:
            async_state = "untracked"
            result_payload = None

            if task_run.celery_task_id:
                async_result = celery_app.AsyncResult(task_run.celery_task_id)
                async_state = async_result.state

                if should_update:
                    self._synchronize_state(task_run, async_result)
                    task_run.refresh_from_db()

                if async_state == states.SUCCESS:
                    try:
                        result_payload = async_result.get(propagate=False)
                    except Exception:  # pragma: no cover - Celery backend optional
                        result_payload = None

            self.stdout.write(
                f"[{schema_name}] TaskRun {task_run.id} status={task_run.status} "
                f"queue={task_run.execution_profile} celery={async_state}"
            )

            if result_payload:
                self.stdout.write(f"    ↳ Last payload keys: {list(result_payload.keys())}")

    def _synchronize_state(self, task_run: TaskRun, async_result) -> None:
        state = async_result.state

        if state == states.FAILURE and task_run.status != TaskRun.STATUS_FAILURE:
            TaskRun.objects.filter(id=task_run.id).update(
                status=TaskRun.STATUS_FAILURE,
                error=str(async_result.info),
                updated_at=timezone.now(),
            )
        elif state == states.SUCCESS and task_run.status != TaskRun.STATUS_SUCCESS:
            result = async_result.result
            fields = {
                "status": TaskRun.STATUS_SUCCESS,
                "updated_at": timezone.now(),
            }
            if isinstance(result, dict) and "output" in result:
                fields["output"] = result["output"]
            TaskRun.objects.filter(id=task_run.id).update(**fields)
