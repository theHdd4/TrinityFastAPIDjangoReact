from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import Tenant
from common.minio_utils import create_prefix

@receiver(post_save, sender=Tenant)
def create_tenant_folder(sender, instance, created, **kwargs):
    if created:
        create_prefix(instance.name.replace(" ", "_"))
