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
    """Assign a role to a user with allowed apps. Stored in tenant schema."""

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
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    allowed_apps = models.JSONField(
        default=list,
        blank=True,
        help_text="List of app IDs the user is permitted to access",
    )
    is_deleted = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("user",)
        verbose_name = "User Role"
        verbose_name_plural = "User Roles"

    def __str__(self) -> str:
        return f"{self.user.username} - {self.role}"
