from __future__ import annotations

from typing import Iterable, Sequence

from celery.result import AsyncResult
from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone
from django_tenants.utils import get_tenant_model, schema_context

from config.celery import celery_app
from apps.orchestration.models import TaskRun


class Command(BaseCommand):
    help = "Inspect Celery execution state for TaskRun records and optionally resync statuses."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--tenant",
            dest="tenants",
            action="append",
            help="Schema name(s) to inspect. Defaults to all tenant schemas.",
        )
        parser.add_argument(
            "--status",
            default="pending,running",
            help="Comma-separated TaskRun statuses to inspect (default: pending,running).",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=50,
            help="Limit the number of TaskRun rows inspected per tenant.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview the status changes without writing to the database.",
        )
        parser.add_argument(
            "--resync",
            action="store_true",
            help="Persist TaskRun status updates derived from Celery state.",
        )
        parser.add_argument(
            "--show-active",
            action="store_true",
            help="Print Celery active/reserved worker summaries before scanning runs.",
        )

    def handle(self, *args, **options) -> None:
        if options.get("show_active"):
            self._print_worker_snapshot()

        tenant_model = get_tenant_model()
        public_schema = getattr(settings, "PUBLIC_SCHEMA_NAME", "public")
        tenants: Iterable = tenant_model.objects.exclude(schema_name=public_schema)
        if options.get("tenants"):
            tenants = tenants.filter(schema_name__in=options["tenants"])

        statuses: Sequence[str] = [
            status.strip()
            for status in options.get("status", "").split(",")
            if status.strip()
        ] or [TaskRun.STATUS_PENDING]
        limit: int = options.get("limit")
        dry_run: bool = options.get("dry_run")
        resync: bool = options.get("resync")

        for tenant in tenants:
            with schema_context(tenant.schema_name):
                queryset = (
                    TaskRun.objects.exclude(celery_task_id="")
                    .filter(status__in=statuses)
                    .order_by("-updated_at")
                )

                if not queryset.exists():
                    continue

                if limit:
                    queryset = queryset[:limit]

                runs = list(queryset)
                if not runs:
                    continue

                self.stdout.write(
                    self.style.NOTICE(
                        f"Tenant {tenant.schema_name}: inspecting {len(runs)} TaskRun(s)."
                    )
                )

                for task_run in runs:
                    result = AsyncResult(task_run.celery_task_id, app=celery_app)
                    state = result.state
                    info = str(result.info) if result.info else ""
                    message = (
                        f"Tenant {tenant.schema_name} → TaskRun {task_run.id}: "
                        f"celery_state={state} current_status={task_run.status}"
                    )

                    if resync:
                        new_status = None
                        update_kwargs = {}

                        if state == "SUCCESS" and task_run.status != TaskRun.STATUS_SUCCESS:
                            new_status = TaskRun.STATUS_SUCCESS
                        elif state in {"FAILURE", "REVOKED"} and task_run.status != TaskRun.STATUS_FAILURE:
                            new_status = TaskRun.STATUS_FAILURE
                            update_kwargs["error"] = info
                        elif state == "RETRY" and task_run.status != TaskRun.STATUS_RUNNING:
                            new_status = TaskRun.STATUS_RUNNING
                            update_kwargs["retries"] = task_run.retries + 1

                        if new_status:
                            update_kwargs["status"] = new_status
                            update_kwargs["updated_at"] = timezone.now()
                            update_kwargs.setdefault("error", info if new_status == TaskRun.STATUS_FAILURE else "")
                            if not dry_run:
                                TaskRun.objects.filter(id=task_run.id).update(**update_kwargs)
                            message += f" → resynced to {new_status}"

                    if info and state in {"FAILURE", "REVOKED"}:
                        message += f" (error: {info})"

                    self.stdout.write(message)

    def _print_worker_snapshot(self) -> None:
        inspect = celery_app.control.inspect()
        active = inspect.active() or {}
        reserved = inspect.reserved() or {}

        self.stdout.write(self.style.NOTICE("Celery worker snapshot:"))
        for worker, tasks in active.items():
            self.stdout.write(f" • {worker}: {len(tasks)} active task(s)")
        for worker, tasks in reserved.items():
            self.stdout.write(f" • {worker}: {len(tasks)} reserved task(s)")
