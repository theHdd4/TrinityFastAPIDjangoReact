from django.db import models
from django_tenants.models import TenantMixin, DomainMixin


class Tenant(TenantMixin):
    """Tenant model stored in the public schema."""

    name = models.CharField(max_length=255, unique=True)
    created_on = models.DateField(auto_now_add=True)

    auto_create_schema = True

    def __str__(self):
        return self.name

class Domain(DomainMixin):
    """Domain model for mapping hostnames to tenants."""

    def __str__(self):
        return self.domain