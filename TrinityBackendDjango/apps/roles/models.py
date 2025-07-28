from django.db import models
from django.contrib.auth.models import Group, Permission
from django.conf import settings


class RoleDefinition(models.Model):
    """
    Convenience model mapping a human-friendly role to a Django Group
    and a set of default permissions.
    """
    name = models.CharField(max_length=100, unique=True)
    group = models.OneToOneField(
        Group,
        on_delete=models.CASCADE,
        related_name="role_definition",
        help_text="Underlying Django group for this role"
    )
    permissions = models.ManyToManyField(
        Permission,
        blank=True,
        help_text="Default permissions assigned to this role"
    )
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class UserRole(models.Model):
    """Assign a role to a user for a specific client/app/project."""

    ROLE_ADMIN = "admin"
    ROLE_EDITOR = "editor"
    ROLE_VIEWER = "viewer"

    ROLE_CHOICES = [
        (ROLE_ADMIN, "Admin"),
        (ROLE_EDITOR, "Editor"),
        (ROLE_VIEWER, "Viewer"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="role_assignments",
    )
    client_id = models.UUIDField()
    app_id = models.UUIDField()
    project_id = models.UUIDField()
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("user", "client_id", "app_id", "project_id")
        verbose_name = "User Role"
        verbose_name_plural = "User Roles"

    def __str__(self) -> str:
        return f"{self.user.username} - {self.role}"
