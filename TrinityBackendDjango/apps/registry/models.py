from django.db import models
from django.contrib.auth import get_user_model
from simple_history.models import HistoricalRecords

User = get_user_model()


class App(models.Model):
    """
    Represents a base application template that projects derive from.
    """
    name = models.CharField(max_length=150, unique=True)
    slug = models.SlugField(max_length=150, unique=True)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    history = HistoricalRecords()

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


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
