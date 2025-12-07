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

    def get_tenants(self):
        """Returns queryset of tenants for this user."""
        from apps.tenants.models import Tenant
        return Tenant.objects.filter(user_mappings__user=self).distinct()

    def get_primary_tenant(self):
        """Returns the primary tenant (is_primary=True) for this user, or None."""
        try:
            user_tenant = self.tenant_mappings.filter(is_primary=True).first()
            return user_tenant.tenant if user_tenant else None
        except Exception:
            return None

    def belongs_to_tenant(self, tenant):
        """Check if user belongs to a specific tenant."""
        return self.tenant_mappings.filter(tenant=tenant).exists()


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
        # Scope variables to each user to avoid cross-user collisions
        unique_together = (
            "user",
            "client_id",
            "app_id",
            "project_id",
            "key",
        )

    def __str__(self):
        return f"{self.user.username}: {self.key}"


class UserTenant(models.Model):
    """
    Mapping table to establish explicit many-to-many relationships between users and tenants.
    This replaces unreliable tenant determination methods (environment variables, Redis cache, etc.)
    with a queryable database relationship.
    """
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="tenant_mappings"
    )
    tenant = models.ForeignKey(
        "tenants.Tenant",
        on_delete=models.CASCADE,
        related_name="user_mappings"
    )
    is_primary = models.BooleanField(
        default=False,
        help_text="Marks the primary tenant for this user"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "accounts_usertenant"
        unique_together = ("user", "tenant")
        indexes = [
            models.Index(fields=["user", "tenant"]),
            models.Index(fields=["user", "is_primary"]),
        ]
        verbose_name = "User Tenant Mapping"
        verbose_name_plural = "User Tenant Mappings"

    def __str__(self):
        primary_label = " (Primary)" if self.is_primary else ""
        return f"{self.user.username} → {self.tenant.name}{primary_label}"