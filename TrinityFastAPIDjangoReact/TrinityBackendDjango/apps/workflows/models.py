from django.db import models
from django.contrib.auth import get_user_model
from apps.registry.models import Project
from apps.atoms.models import Atom

User = get_user_model()


class Workflow(models.Model):
    """
    Defines a saved workflow (DAG spec + atom order).
    """
    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="workflows"
    )
    name = models.CharField(max_length=150)
    slug = models.SlugField(max_length=150)
    dag_spec = models.JSONField(
        help_text="Serialized DAG spec: nodes, edges, and ordering"
    )
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, related_name="created_workflows"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("project", "slug")
        ordering = ["-updated_at"]

    def __str__(self):
        return f"{self.name} ({self.project.name})"


class WorkflowAtom(models.Model):
    """
    Through‐table linking a Workflow to its ordered Atoms.
    """
    workflow = models.ForeignKey(
        Workflow, on_delete=models.CASCADE, related_name="workflow_atoms"
    )
    atom = models.ForeignKey(
        Atom, on_delete=models.PROTECT, related_name="workflow_atoms"
    )
    order = models.PositiveIntegerField(help_text="Execution order in the DAG")
    config = models.JSONField(
        blank=True, null=True,
        help_text="Override or initial config for this atom instance"
    )

    class Meta:
        unique_together = ("workflow", "order")
        ordering = ["order"]

    def __str__(self):
        return f"{self.workflow.name} → {self.atom.name} [#{self.order}]"


class WorkflowRun(models.Model):
    """
    Tracks each execution of a Workflow.
    """
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("running", "Running"),
        ("success", "Success"),
        ("failure", "Failure"),
    ]

    workflow = models.ForeignKey(
        Workflow, on_delete=models.CASCADE, related_name="runs"
    )
    initiated_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, related_name="workflow_runs"
    )
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default="pending"
    )
    run_context = models.JSONField(
        blank=True, null=True,
        help_text="Runtime context or parameters used for this run"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Run of {self.workflow.name} @ {self.created_at:%Y-%m-%d %H:%M}"
