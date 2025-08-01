# apps/accounts/models.py

from django.db import models
from django.contrib.auth.models import AbstractUser, Group, Permission
from django.utils.translation import gettext_lazy as _

class User(AbstractUser):
    """
    Extends Django's AbstractUser to add:
      - mfa_enabled flag
      - preferences JSON field
      - overridden groups and user_permissions fields (to avoid reverse accessor clashes)
    """

    # Override the built-in `groups` M2M so that reverse accessor is unique
    groups = models.ManyToManyField(
        Group,
        verbose_name=_("groups"),
        blank=True,
        help_text=_(
            "The groups this user belongs to. "
            "A user will get all permissions granted to each of their groups."
        ),
        related_name="accounts_user_set",       # changed from "user_set"
        related_query_name="accounts_user",
    )

    # Override the built-in `user_permissions` M2M so that reverse accessor is unique
    user_permissions = models.ManyToManyField(
        Permission,
        verbose_name=_("user permissions"),
        blank=True,
        help_text=_("Specific permissions for this user."),
        related_name="accounts_user_permissions_set",  # new reverse name
        related_query_name="accounts_user_permissions",
    )

    # Your custom fields
    mfa_enabled = models.BooleanField(default=False)
    preferences = models.JSONField(blank=True, null=True)

    def __str__(self):
        return self.username


class UserProfile(models.Model):
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="profile"
    )  # Creates the `user_id` FK to accounts_user(id), and is UNIQUE by default
    bio = models.TextField(blank=True)
    avatar_url = models.CharField(max_length=512, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Profile for {self.user.username}"

class UserEnvironmentVariable(models.Model):
    """Per-user environment variable scoped to client, app and project."""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="env_vars")
    client_id = models.CharField(max_length=255)
    client_name = models.CharField(max_length=255, blank=True)
    app_id = models.CharField(max_length=255, blank=True)
    app_name = models.CharField(max_length=255, blank=True)
    project_id = models.CharField(max_length=255, blank=True)
    project_name = models.CharField(max_length=255, blank=True)
    key = models.CharField(max_length=255)
    value = models.TextField()
    value_type = models.CharField(max_length=50, default="string")
    is_encrypted = models.BooleanField(default=False)
    last_used = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("client_id", "app_id", "project_id", "key")

    def __str__(self):
        return f"{self.user.username}: {self.key}"
