from django.db import models
from apps.tenants.models import Tenant


class Company(models.Model):
    """
    Company metadata linked to a tenant.
    """
    tenant = models.OneToOneField(
        Tenant, on_delete=models.CASCADE, related_name="company"
    )
    metadata = models.JSONField(
        blank=True,
        null=True,
        help_text="Additional metadata for the company (billing, contact, etc.)"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Company: {self.tenant.schema_name}"


class SubscriptionPlan(models.Model):
    """
    Subscription limits and renewal info for a company.
    """
    company = models.ForeignKey(
        Company, on_delete=models.CASCADE, related_name="subscriptions"
    )
    plan_name = models.CharField(max_length=100)
    seats_allowed = models.PositiveIntegerField(
        help_text="Number of user seats allowed"
    )
    project_cap = models.PositiveIntegerField(
        help_text="Maximum number of projects allowed"
    )
    renewal_date = models.DateField(
        help_text="Next renewal date for this subscription"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["renewal_date"]

    def __str__(self):
        return f"{self.plan_name} for {self.company.tenant.schema_name}"
