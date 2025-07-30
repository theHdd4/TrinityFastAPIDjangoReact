from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, UserProfile


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
