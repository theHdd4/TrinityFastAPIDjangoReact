from django.db import models
from django.utils.translation import gettext_lazy as _
from apps.tenants.models import Tenant


class SiteConfig(models.Model):
    """
    Global key–value JSON configuration.
    """
    key = models.CharField(max_length=100, unique=True)
    value = models.JSONField(help_text=_("Arbitrary JSON blob for feature flags, branding, etc."))
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["key"]

    def __str__(self):
        return self.key


class TenantConfig(models.Model):
    """
    Per-tenant key–value JSON configuration.
    """
    tenant = models.ForeignKey(
        Tenant, on_delete=models.CASCADE, related_name="configs"
    )
    key = models.CharField(max_length=100)
    value = models.JSONField(help_text=_("JSON blob scoped to this tenant"))
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("tenant", "key")
        ordering = ["tenant", "key"]

    def __str__(self):
        return f"{self.tenant.schema_name}: {self.key}"
