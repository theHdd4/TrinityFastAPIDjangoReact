from django.db import models
from django.contrib.auth.models import Group, Permission


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
