from django.apps import AppConfig


class TenantsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.tenants"
    verbose_name = "Tenant & Workspace Isolation"
    label = "tenants"

    def ready(self):
        """Import signal handlers."""
        from . import signals  # noqa: F401
