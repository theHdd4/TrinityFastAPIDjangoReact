from django.contrib import admin
from .models import Workflow, WorkflowAtom, WorkflowRun


@admin.register(Workflow)
class WorkflowAdmin(admin.ModelAdmin):
    list_display = ("name", "project", "created_by", "updated_at")
    list_filter = ("project",)
    search_fields = ("name", "slug", "project__name")
    prepopulated_fields = {"slug": ("name",)}


@admin.register(WorkflowAtom)
class WorkflowAtomAdmin(admin.ModelAdmin):
    list_display = ("workflow", "atom", "order")
    list_filter = ("workflow",)
    search_fields = ("workflow__name", "atom__name")


@admin.register(WorkflowRun)
class WorkflowRunAdmin(admin.ModelAdmin):
    list_display = ("workflow", "initiated_by", "status", "created_at")
    list_filter = ("status",)
    search_fields = ("workflow__name",)
