from django.apps import AppConfig


class ConfigStoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.config_store"
    verbose_name = "Global & Tenant Config Store"
