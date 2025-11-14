from __future__ import annotations

from typing import Iterable, List

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from django_tenants.utils import schema_context

from apps.orchestration.models import TaskRun
from apps.orchestration.tasks import enqueue_task_run, enqueue_workflow_run
from apps.tenants.models import Tenant
from apps.workflows.models import WorkflowRun


class Command(BaseCommand):
    help = "Replay TaskRun records by re-enqueuing them on Celery."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "task_ids",
            nargs="*",
            type=int,
            help="Specific TaskRun primary keys to replay.",
        )
        parser.add_argument(
            "--workflow-run",
            dest="workflow_run",
            type=int,
            help="Replay all TaskRuns associated with a WorkflowRun id.",
        )
        parser.add_argument(
            "--tenant",
            dest="tenant",
            type=str,
            help="Limit the replay to a specific tenant schema.",
        )
        parser.add_argument(
            "--countdown",
            dest="countdown",
            type=int,
            default=0,
            help="Optional Celery countdown (seconds) before execution.",
        )

    def handle(self, *args, **options):
        task_ids: List[int] = options["task_ids"]
        workflow_run_id: int | None = options["workflow_run"]
        tenant_filter: str | None = options["tenant"]
        countdown: int = options["countdown"]

        if not task_ids and not workflow_run_id:
            raise CommandError("Provide TaskRun ids or --workflow-run to replay.")

        tenants = self._tenant_queryset(tenant_filter)
        if not tenants:
            raise CommandError("No tenant schemas matched the supplied filters.")

        for tenant in tenants:
            with schema_context(tenant.schema_name):
                if workflow_run_id:
                    self._replay_workflow(workflow_run_id, tenant.schema_name)
                if task_ids:
                    self._replay_task_runs(task_ids, tenant.schema_name, countdown)

    def _tenant_queryset(self, tenant_filter: str | None) -> Iterable[Tenant]:
        queryset = Tenant.objects.exclude(schema_name="public")
        if tenant_filter:
            queryset = queryset.filter(schema_name=tenant_filter)
        return queryset

    def _replay_workflow(self, workflow_run_id: int, schema_name: str) -> None:
        try:
            workflow_run = WorkflowRun.objects.get(id=workflow_run_id)
        except WorkflowRun.DoesNotExist:
            self.stdout.write(
                self.style.WARNING(
                    f"[{schema_name}] WorkflowRun {workflow_run_id} not found."
                )
            )
            return

        workflow_run.status = "pending"
        workflow_run.updated_at = timezone.now()
        workflow_run.save(update_fields=["status", "updated_at"])

        enqueue_workflow_run(workflow_run, schema_name=schema_name)
        self.stdout.write(
            self.style.SUCCESS(
                f"[{schema_name}] Re-queued workflow run {workflow_run_id}"
            )
        )

    def _replay_task_runs(
        self, task_ids: Iterable[int], schema_name: str, countdown: int
    ) -> None:
        for task_id in task_ids:
            try:
                task_run = TaskRun.objects.get(id=task_id)
            except TaskRun.DoesNotExist:
                self.stdout.write(
                    self.style.WARNING(f"[{schema_name}] TaskRun {task_id} not found.")
                )
                continue

            TaskRun.objects.filter(id=task_run.id).update(
                status=TaskRun.STATUS_PENDING,
                error="",
                output=None,
                tenant_schema=schema_name,
                updated_at=timezone.now(),
            )

            enqueue_task_run(task_run, schema_name=schema_name, countdown=countdown or None)
            self.stdout.write(
                self.style.SUCCESS(
                    f"[{schema_name}] Re-queued TaskRun {task_run.id} on {task_run.execution_profile} queue"
                )
            )
