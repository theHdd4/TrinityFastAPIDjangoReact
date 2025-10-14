from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()


class Workflow(models.Model):
    """
    Stores workflow data in the public schema.
    Tracks which app, project, molecules, and atoms are used in each workflow.
    """
    # Project reference (stored as ID since Project is in tenant schema)
    project_id = models.IntegerField(
        help_text="ID of the project this workflow belongs to"
    )
    project_name = models.CharField(
        max_length=255,
        help_text="Name of the project (denormalized for easy access)"
    )
    
    # Workflow metadata
    name = models.CharField(
        max_length=255,
        help_text="Name of the workflow (e.g., 'Data Analysis - Q4 Report')"
    )
    slug = models.SlugField(
        max_length=255,
        help_text="URL-friendly version of the name"
    )
    description = models.TextField(
        blank=True,
        default="",
        help_text="Optional description of what this workflow does"
    )
    
    # Application context
    app_name = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Name of the app using this workflow"
    )
    
    # Workflow structure data
    molecules_used = models.JSONField(
        default=list,
        blank=True,
        help_text="List of molecule IDs/names used in this workflow"
    )
    atoms_in_molecules = models.JSONField(
        default=dict,
        blank=True,
        help_text="Mapping of molecules to their atoms: {molecule_id: [atom1, atom2, ...]}"
    )
    dag_spec = models.JSONField(
        default=dict,
        blank=True,
        help_text="Complete DAG specification with nodes, edges, positions, and metadata"
    )
    
    # Ownership and audit
    user = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="workflows",
        help_text="User who created this workflow"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    # Execution metadata
    is_active = models.BooleanField(
        default=True,
        help_text="Whether this workflow is currently active/published"
    )
    version = models.IntegerField(
        default=1,
        help_text="Version number of this workflow"
    )
    execution_count = models.IntegerField(
        default=0,
        help_text="Number of times this workflow has been executed"
    )
    last_executed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Last time this workflow was executed"
    )

    class Meta:
        ordering = ["-updated_at"]
        indexes = [
            models.Index(fields=["project_id"]),
            models.Index(fields=["user"]),
            models.Index(fields=["slug"]),
            models.Index(fields=["-created_at"]),
        ]

    def __str__(self):
        return f"{self.name} (v{self.version})"
    
    def increment_execution_count(self):
        """Increment the execution counter and update last executed time"""
        from django.utils import timezone
        self.execution_count += 1
        self.last_executed_at = timezone.now()
        self.save(update_fields=["execution_count", "last_executed_at"])
    
    def create_run(self):
        """Create a new WorkflowRun for this workflow"""
        return WorkflowRun.objects.create(workflow=self, status="pending")


class WorkflowRun(models.Model):
    """
    Tracks individual workflow runs/executions for analytics and debugging.
    Compatible with apps.orchestration.models.TaskRun.
    """
    workflow = models.ForeignKey(
        Workflow,
        on_delete=models.CASCADE,
        related_name="runs"
    )
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(
        max_length=50,
        choices=[
            ("pending", "Pending"),
            ("running", "Running"),
            ("completed", "Completed"),
            ("success", "Success"),  # Added for compatibility
            ("failed", "Failed"),
            ("failure", "Failure"),  # Added for compatibility
            ("cancelled", "Cancelled"),
        ],
        default="pending"
    )
    error_message = models.TextField(
        blank=True,
        default="",
        help_text="Error message if execution failed"
    )
    result_data = models.JSONField(
        default=dict,
        blank=True,
        help_text="Execution results and output data"
    )
    
    class Meta:
        ordering = ["-started_at"]
        indexes = [
            models.Index(fields=["workflow", "-started_at"]),
            models.Index(fields=["status"]),
        ]
    
    def __str__(self):
        return f"Run of {self.workflow.name} at {self.started_at}"


# Alias for backwards compatibility
WorkflowExecution = WorkflowRun

