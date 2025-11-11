from __future__ import annotations

from typing import Iterable, Sequence

from django.conf import settings
from django.core.management.base import BaseCommand
from django_tenants.utils import get_tenant_model, schema_context

from apps.orchestration.models import TaskRun
from apps.orchestration.tasks import enqueue_task_run


class Command(BaseCommand):
    help = "Replay TaskRun records by re-enqueueing them on Celery queues."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--tenant",
            dest="tenants",
            action="append",
            help="Schema name(s) to target. Defaults to all tenant schemas.",
        )
        parser.add_argument(
            "--task-run-id",
            dest="task_run_ids",
            type=int,
            action="append",
            help="Specific TaskRun id(s) to requeue.",
        )
        parser.add_argument(
            "--status",
            choices=[choice for choice, _ in TaskRun.STATUS_CHOICES],
            default=TaskRun.STATUS_FAILURE,
            help="Status filter when selecting TaskRuns (defaults to 'failure').",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=0,
            help="Optional maximum number of TaskRuns to enqueue per tenant.",
        )
        parser.add_argument(
            "--countdown",
            type=int,
            default=0,
            help="Delay (seconds) before the Celery pipeline starts processing.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview the TaskRuns that would be enqueued without executing.",
        )

    def handle(self, *args, **options) -> None:
        tenant_model = get_tenant_model()
        public_schema = getattr(settings, "PUBLIC_SCHEMA_NAME", "public")

        tenants: Iterable = tenant_model.objects.exclude(schema_name=public_schema)
        if options.get("tenants"):
            tenants = tenants.filter(schema_name__in=options["tenants"])

        task_run_ids: Sequence[int] | None = options.get("task_run_ids")
        status: str = options.get("status")
        limit: int = options.get("limit")
        countdown: int = options.get("countdown")
        dry_run: bool = options.get("dry_run")

        total_enqueued = 0

        for tenant in tenants:
            with schema_context(tenant.schema_name):
                queryset = TaskRun.objects.all().order_by("created_at")

                if task_run_ids:
                    queryset = queryset.filter(id__in=task_run_ids)
                elif status:
                    queryset = queryset.filter(status=status)

                if not queryset.exists():
                    continue

                if limit:
                    queryset = queryset[:limit]

                self.stdout.write(
                    self.style.NOTICE(
                        f"Tenant {tenant.schema_name}: preparing {queryset.count()} task(s)."
                    )
                )

                for task_run in queryset:
                    msg_prefix = f"Tenant {tenant.schema_name} → TaskRun {task_run.id}"
                    if dry_run:
                        self.stdout.write(f"[DRY-RUN] {msg_prefix} would be enqueued")
                        continue

                    TaskRun.objects.filter(id=task_run.id).update(
                        status=TaskRun.STATUS_PENDING,
                        error="",
                        output=None,
                        retries=0,
                    )

                    result = enqueue_task_run(
                        task_run.id,
                        tenant_schema=tenant.schema_name,
                        countdown=countdown or None,
                    )
                    total_enqueued += 1
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"{msg_prefix} re-queued as Celery task {result.id}"
                        )
                    )

        if dry_run:
            self.stdout.write(self.style.WARNING("Dry-run complete; no tasks enqueued."))
        else:
            self.stdout.write(
                self.style.SUCCESS(f"Finished enqueueing {total_enqueued} TaskRun(s).")
            )
