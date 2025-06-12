from django.contrib import admin
from .models import SiteConfig, TenantConfig


@admin.register(SiteConfig)
class SiteConfigAdmin(admin.ModelAdmin):
    list_display = ("key", "updated_at")
    search_fields = ("key",)


@admin.register(TenantConfig)
class TenantConfigAdmin(admin.ModelAdmin):
    list_display = ("tenant", "key", "updated_at")
    list_filter = ("tenant",)
    search_fields = ("tenant__schema_name", "key")
