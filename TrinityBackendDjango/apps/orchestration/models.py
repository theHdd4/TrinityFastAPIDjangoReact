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
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("running", "Running"),
        ("success", "Success"),
        ("failure", "Failure"),
    ]

    workflow_run = models.ForeignKey(
        WorkflowRun, on_delete=models.CASCADE, related_name="task_runs"
    )
    atom_slug    = models.CharField(max_length=150)
    engine       = models.ForeignKey(
        EngineRegistry, on_delete=models.SET_NULL, null=True, blank=True
    )
    status       = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    input        = models.JSONField()
    output       = models.JSONField(blank=True, null=True)
    error        = models.TextField(blank=True)
    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.atom_slug} [{self.status}]"
