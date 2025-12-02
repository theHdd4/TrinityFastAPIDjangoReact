from django.db import models
from django.contrib.auth import get_user_model
from simple_history.models import HistoricalRecords

User = get_user_model()


class App(models.Model):
    """
    Represents a tenant-specific application instance linked to a UseCase from the public schema.
    
    This model lives in the tenant schema and controls which apps from the public 'usecase' 
    table are accessible to this specific tenant/client.
    
    The 'usecase_id' field references the public.usecase table's ID.
    Each tenant can only access apps that have an entry in their tenant's App table.
    """
    usecase_id = models.IntegerField(
        help_text="ID of the app definition in public.usecase table",
        db_index=True,
        null=True,
        blank=True,
        default=None
    )
    name = models.CharField(
        max_length=150, 
        help_text="App name (synced from public.usecase)"
    )
    slug = models.SlugField(
        max_length=150, 
        unique=True,
        help_text="App slug (synced from public.usecase)"
    )
    description = models.TextField(
        blank=True,
        help_text="App description (synced from public.usecase)"
    )
    is_enabled = models.BooleanField(
        default=True,
        help_text="Whether this app is enabled for this tenant"
    )
    custom_config = models.JSONField(
        default=dict,
        blank=True,
        help_text="Tenant-specific customizations for this app (e.g., custom modules, settings)"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    history = HistoricalRecords()

    class Meta:
        ordering = ["name"]
        indexes = [
            models.Index(fields=['usecase_id', 'is_enabled']),
            models.Index(fields=['slug']),
        ]

    def __str__(self):
        return f"{self.name} (UseCase ID: {self.usecase_id})"
    
    @property
    def is_accessible(self):
        """Check if this app is currently accessible by the tenant"""
        return self.is_enabled


class Project(models.Model):
    """
    A user-created project, based on an App template.
    """
    name = models.CharField(max_length=150)
    slug = models.SlugField(max_length=150)
    description = models.TextField(blank=True)
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="projects"
    )
    app = models.ForeignKey(
        App, on_delete=models.PROTECT, related_name="projects"
    )
    state = models.JSONField(
        blank=True,
        null=True,
        help_text="Persisted workflow/laboratory configuration for this project.",
    )
    base_template = models.ForeignKey(
        "Template",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="projects",
        help_text="Template this project was created from, if any.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_deleted = models.BooleanField(default=False)
    history = HistoricalRecords()

    class Meta:
        unique_together = (
            ("slug", "owner"),
            ("owner", "app", "name"),
        )
        ordering = ["-updated_at"]

    def __str__(self):
        return f"{self.name} ({self.owner.username})"


class ProjectModificationHistory(models.Model):
    """
    Tracks all users who have modified a project, with timestamps.
    Allows multiple users to see a project in their "My Projects" tab if they've both modified it.
    """
    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name="modification_history"
    )
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="project_modifications"
    )
    modified_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = "registry_project_modification_history"
        ordering = ["-modified_at"]
        indexes = [
            models.Index(fields=['user', '-modified_at']),
            models.Index(fields=['project', '-modified_at']),
        ]
        unique_together = [('project', 'user')]  # One entry per user per project
    
    def __str__(self):
        return f"{self.user.username} modified {self.project.name} at {self.modified_at}"


class Template(models.Model):
    """A reusable project template stored in the registry."""

    name = models.CharField(max_length=150)
    slug = models.SlugField(max_length=150)
    description = models.TextField(blank=True)
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="templates"
    )
    app = models.ForeignKey(
        App, on_delete=models.PROTECT, related_name="templates"
    )
    state = models.JSONField(blank=True, null=True)
    base_project = models.JSONField(
        help_text="Serialized details of the project this template was created from."
    )
    template_projects = models.JSONField(
        default=list,
        blank=True,
        help_text="Serialized details of projects created from this template.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    history = HistoricalRecords()

    class Meta:
        db_table = "registry_templates"
        ordering = ["-updated_at"]

    def __str__(self):
        return f"Template {self.name} ({self.owner.username})"


class Session(models.Model):
    """
    Tracks an interactive session on a Project (e.g., in Workflow or Lab mode).
    """
    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="sessions"
    )
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="sessions"
    )
    context = models.JSONField(
        blank=True, null=True,
        help_text="Snapshot of session state (e.g., DAG progress, atom states)."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    history = HistoricalRecords()

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Session {self.id} on {self.project.name}"


class LaboratoryAction(models.Model):
    """Snapshot of lab state for undo functionality."""

    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="laboratory_actions"
    )
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="laboratory_actions"
    )
    state = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)
    history = HistoricalRecords()

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Action on {self.project.name} by {self.user.username}"

class ArrowDataset(models.Model):
    """Registry entry for Arrow data saved from the upload atom."""

    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="arrow_datasets"
    )
    atom_id = models.CharField(max_length=150)
    file_key = models.CharField(max_length=150)
    arrow_object = models.CharField(max_length=200)
    flight_path = models.CharField(max_length=200)
    original_csv = models.CharField(max_length=200)
    descriptor = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        unique_together = ("project", "original_csv")

    def __str__(self):
        return f"{self.atom_id}:{self.file_key}"


class RegistryEnvironment(models.Model):
    """Cached environment and schema configuration per project.

    The table stores the resolved client/app/project names alongside any
    additional environment variables or column classification data. It lives
    in each tenant's schema so lookups remain local to the tenant database.
    """

    client_name = models.CharField(max_length=255)
    app_name = models.CharField(max_length=255)
    project_name = models.CharField(max_length=255)
    envvars = models.JSONField(default=dict, blank=True)
    identifiers = models.JSONField(default=list, blank=True)
    measures = models.JSONField(default=list, blank=True)
    dimensions = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "registry_environment"
        unique_together = ("client_name", "app_name", "project_name")

    def __str__(self):
        return f"{self.client_name}/{self.app_name}/{self.project_name}"
