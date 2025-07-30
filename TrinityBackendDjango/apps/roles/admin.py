from django.contrib import admin
from .models import RoleDefinition


@admin.register(RoleDefinition)
class RoleDefinitionAdmin(admin.ModelAdmin):
    list_display = ("name", "group", "updated_at")
    search_fields = ("name", "group__name")
    filter_horizontal = ("permissions",)
