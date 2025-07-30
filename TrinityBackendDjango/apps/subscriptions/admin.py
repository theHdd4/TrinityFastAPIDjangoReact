from django.contrib import admin
from .models import Company, SubscriptionPlan


@admin.register(Company)
class CompanyAdmin(admin.ModelAdmin):
    list_display = ("tenant", "updated_at")
    search_fields = ("tenant__schema_name",)


@admin.register(SubscriptionPlan)
class SubscriptionPlanAdmin(admin.ModelAdmin):
    list_display = ("plan_name", "company", "seats_allowed", "project_cap", "renewal_date")
    list_filter = ("plan_name", "renewal_date")
    search_fields = ("plan_name", "company__tenant__schema_name")
