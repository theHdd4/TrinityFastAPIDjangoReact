from django.contrib import admin
from .models import RoleDefinition, UserRole


@admin.register(RoleDefinition)
class RoleDefinitionAdmin(admin.ModelAdmin):
    list_display = ("name", "group", "updated_at")
    search_fields = ("name", "group__name")
    filter_horizontal = ("permissions",)


@admin.register(UserRole)
class UserRoleAdmin(admin.ModelAdmin):
    list_display = ("user", "role", "client_id", "app_id", "project_id")
    list_filter = ("role",)
    search_fields = ("user__username", "client_id", "app_id", "project_id")
