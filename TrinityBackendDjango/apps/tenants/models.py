from django.db import models
from django_tenants.models import TenantMixin, DomainMixin


class Tenant(TenantMixin):
    """Tenant model stored in the public schema."""

    name = models.CharField(max_length=255, unique=True)
    created_on = models.DateField(auto_now_add=True)
    primary_domain = models.CharField(max_length=253, blank=True)
    allowed_apps = models.JSONField(default=list, blank=True)
    seats_allowed = models.PositiveIntegerField(default=0)
    users_in_use = models.PositiveIntegerField(default=0)
    project_cap = models.PositiveIntegerField(default=0)
    projects_allowed = models.JSONField(default=list, blank=True)
    admin_name = models.CharField(max_length=255, blank=True)
    admin_email = models.EmailField(blank=True)

    auto_create_schema = True

    def __str__(self):
        return self.name

class Domain(DomainMixin):
    """Domain model for mapping hostnames to tenants."""

    def __str__(self):
        return self.domain
