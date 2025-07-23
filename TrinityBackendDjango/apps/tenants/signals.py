import os
from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import Tenant
from common.minio_utils import create_prefix

# Use a single client-level folder rather than one per user/tenant
CLIENT_NAME = os.getenv("CLIENT_NAME", "default_client").replace(" ", "_")

@receiver(post_save, sender=Tenant)
def create_tenant_folder(sender, instance, created, **kwargs):
    if created:
        # Always create a single client folder instead of one per tenant/user
        create_prefix(CLIENT_NAME)
