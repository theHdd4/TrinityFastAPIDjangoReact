from django.apps import AppConfig


class RegistryConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.registry"
    verbose_name = "App / Session / Project Registry"

    def ready(self):
        """Register signal handlers."""
        from . import signals  # noqa: F401
