from django.apps import AppConfig


class RegistryConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.registry"
    verbose_name = "App / Session / Project Registry"

    def ready(self):
        # Register signal handlers for project folder management
        from . import signals  # noqa: F401
        try:
            from asgiref.sync import async_to_sync
            from django_tenants.utils import get_tenant_model
            from DataStorageRetrieval.db.environment import init_environment_registry

            async_to_sync(init_environment_registry)("public")
            Tenant = get_tenant_model()
            for tenant in Tenant.objects.all():
                async_to_sync(init_environment_registry)(tenant.schema_name)
        except Exception:
            pass
