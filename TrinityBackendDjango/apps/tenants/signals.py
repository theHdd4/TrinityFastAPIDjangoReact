import os
from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import Tenant
from common.minio_utils import create_prefix
from django.db import connection


def _client_folder(instance: Tenant) -> str:
    """Return the shared client folder name for new tenants."""
    env_name = os.getenv("CLIENT_NAME")
    if env_name:
        return env_name.replace(" ", "_")

    schema = connection.schema_name
    with connection.cursor() as cur:
        cur.execute("SET search_path TO public")
        try:
            name = Tenant.objects.get(pk=instance.pk).name
        finally:
            cur.execute(f"SET search_path TO {schema}")
    return name.replace(" ", "_")


@receiver(post_save, sender=Tenant)
def create_tenant_folder(sender, instance, created, **kwargs):
    if created:
        create_prefix(_client_folder(instance))
