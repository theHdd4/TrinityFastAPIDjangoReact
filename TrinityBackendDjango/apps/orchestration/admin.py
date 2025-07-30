from django.contrib import admin
from .models import EngineRegistry, TaskRun


@admin.register(EngineRegistry)
class EngineRegistryAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "base_url",
        "is_active",
        "last_heartbeat",
        "updated_at",
    )
    list_filter = ("is_active",)
    search_fields = ("name", "base_url")


@admin.register(TaskRun)
class TaskRunAdmin(admin.ModelAdmin):
    list_display = (
        "workflow_run",
        "atom_slug",
        "engine",
        "status",
        "created_at",
    )
    list_filter = ("status", "engine")
    search_fields = ("atom_slug", "workflow_run__id")
