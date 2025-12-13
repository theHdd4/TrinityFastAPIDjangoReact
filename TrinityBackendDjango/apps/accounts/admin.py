from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, UserProfile, UserTenant


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    fieldsets = (
        *BaseUserAdmin.fieldsets,
        (
            "Security & Preferences",
            {
                "fields": (
                    "mfa_enabled",
                    "preferences",
                )
            },
        ),
    )
    list_display = (
        "username",
        "email",
        "first_name",
        "last_name",
        "is_active",
        "mfa_enabled",
    )
    list_filter = BaseUserAdmin.list_filter + ("mfa_enabled",)


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "bio")
    search_fields = ("user__username",)


@admin.register(UserTenant)
class UserTenantAdmin(admin.ModelAdmin):
    list_display = ("user", "tenant", "is_primary", "created_at")
    list_filter = ("is_primary", "tenant", "created_at")
    search_fields = ("user__username", "tenant__name", "tenant__schema_name")
    readonly_fields = ("created_at", "updated_at")
    raw_id_fields = ("user", "tenant")
    
    fieldsets = (
        (None, {
            "fields": ("user", "tenant", "is_primary")
        }),
        ("Timestamps", {
            "fields": ("created_at", "updated_at"),
            "classes": ("collapse",)
        }),
    )
