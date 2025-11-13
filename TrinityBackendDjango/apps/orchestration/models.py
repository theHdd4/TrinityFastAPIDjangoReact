from django.db import models
from apps.workflows.models import WorkflowRun

class EngineRegistry(models.Model):
    name           = models.CharField(max_length=100, unique=True)
    base_url       = models.URLField(help_text="e.g. http://fastapi:8001")
    schema_endpoint= models.CharField(max_length=255, default="/schema")
    run_endpoint   = models.CharField(max_length=255, default="/run")
    is_active      = models.BooleanField(default=True)
    last_heartbeat = models.DateTimeField(null=True, blank=True)
    metadata       = models.JSONField(blank=True, null=True)
    created_at     = models.DateTimeField(auto_now_add=True)
    updated_at     = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class TaskRun(models.Model):
    STATUS_PENDING = "pending"
    STATUS_RUNNING = "running"
    STATUS_SUCCESS = "success"
    STATUS_FAILURE = "failure"

    EXECUTION_PROFILE_CPU = "cpu"
    EXECUTION_PROFILE_IO = "io"

    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_RUNNING, "Running"),
        (STATUS_SUCCESS, "Success"),
        (STATUS_FAILURE, "Failure"),
    ]

    EXECUTION_PROFILE_CHOICES = [
        (EXECUTION_PROFILE_IO, "I/O bound"),
        (EXECUTION_PROFILE_CPU, "CPU bound"),
    ]

    workflow_run = models.ForeignKey(
        WorkflowRun, on_delete=models.CASCADE, related_name="task_runs"
    )
    atom_slug    = models.CharField(max_length=150)
    engine       = models.ForeignKey(
        EngineRegistry, on_delete=models.SET_NULL, null=True, blank=True
    )
    status       = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    input        = models.JSONField()
    output       = models.JSONField(blank=True, null=True)
    error        = models.TextField(blank=True)
    tenant_schema = models.CharField(
        max_length=63,
        blank=True,
        help_text="Tenant schema that submitted this task run",
    )
    execution_profile = models.CharField(
        max_length=10,
        choices=EXECUTION_PROFILE_CHOICES,
        default=EXECUTION_PROFILE_IO,
        help_text="Scheduling hint for Celery routing",
    )
    celery_task_id = models.CharField(
        max_length=255,
        blank=True,
        help_text="Last Celery task id that processed this TaskRun",
    )
    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.atom_slug} [{self.status}]"
