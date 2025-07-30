from django.contrib import admin
from .models import Tenant, Domain


@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ("name", "schema_name", "created_on")
    search_fields = ("name", "schema_name")


@admin.register(Domain)
class DomainAdmin(admin.ModelAdmin):
    list_display = ("domain", "tenant", "is_primary")
    list_filter = ("is_primary",)
    search_fields = ("domain", "tenant__name")
