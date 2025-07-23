import os
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from .models import Project
from common.minio_utils import create_prefix, rename_prefix

# Folder names should live under a shared client directory
CLIENT_NAME = os.getenv("CLIENT_NAME", "default_client").replace(" ", "_")


def _current_tenant_name() -> str:
    """Return the shared client folder name used for all projects."""
    # Historically this looked up the current tenant from the DB and used its
    # name for the MinIO prefix. The new behavior stores everything under a
    # single client directory so we simply return the configured CLIENT_NAME.
    return CLIENT_NAME


@receiver(post_save, sender=Project)
def create_project_folder(sender, instance, created, **kwargs):
    if created:
        tenant = _current_tenant_name()
        app_slug = instance.app.slug
        project_slug = instance.slug
        prefix = f"{tenant}/{app_slug}/{project_slug}"
        create_prefix(prefix)


@receiver(pre_save, sender=Project)
def rename_project_folder(sender, instance, **kwargs):
    if not instance.pk:
        return
    try:
        old = Project.objects.get(pk=instance.pk)
    except Project.DoesNotExist:
        return
    if old.slug != instance.slug:
        tenant = _current_tenant_name()
        app_slug = instance.app.slug
        old_prefix = f"{tenant}/{app_slug}/{old.slug}"
        new_prefix = f"{tenant}/{app_slug}/{instance.slug}"
        rename_prefix(old_prefix, new_prefix)
