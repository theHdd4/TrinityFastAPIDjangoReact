from django.contrib import admin
from .models import Workflow, WorkflowRun


@admin.register(Workflow)
class WorkflowAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "project_name",
        "app_name",
        "version",
        "execution_count",
        "is_active",
        "user",
        "updated_at",
    )
    list_filter = ("is_active", "app_name", "created_at", "updated_at")
    search_fields = ("name", "project_name", "app_name", "user__username")
    readonly_fields = ("created_at", "updated_at", "execution_count", "last_executed_at")
    
    fieldsets = (
        ("Basic Information", {
            "fields": ("name", "slug", "description", "version", "is_active")
        }),
        ("Project & App Context", {
            "fields": ("project_id", "project_name", "app_name")
        }),
        ("Workflow Structure", {
            "fields": ("molecules_used", "atoms_in_molecules", "dag_spec"),
            "classes": ("collapse",)
        }),
        ("Execution Stats", {
            "fields": ("execution_count", "last_executed_at")
        }),
        ("Audit Information", {
            "fields": ("user", "created_at", "updated_at")
        }),
    )


@admin.register(WorkflowRun)
class WorkflowRunAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "workflow",
        "status",
        "started_at",
        "completed_at",
    )
    list_filter = ("status", "started_at", "completed_at")
    search_fields = ("workflow__name", "error_message")
    readonly_fields = ("started_at", "completed_at")
    
    fieldsets = (
        ("Run Info", {
            "fields": ("workflow", "status", "started_at", "completed_at")
        }),
        ("Results & Errors", {
            "fields": ("result_data", "error_message"),
            "classes": ("collapse",)
        }),
    )

