import os
from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import Tenant
from common.minio_utils import create_prefix


def _client_folder() -> str:
    """Return the shared client folder name for new tenants."""

    return os.getenv("CLIENT_NAME", "default_client").replace(" ", "_")


@receiver(post_save, sender=Tenant)
def create_tenant_folder(sender, instance, created, **kwargs):
    if created:
        create_prefix(_client_folder())
