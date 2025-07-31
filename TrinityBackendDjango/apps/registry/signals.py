import os
from django.db.models.signals import post_save, pre_save, post_delete
from django.dispatch import receiver
from django.db import connection
from .models import Project
from common.minio_utils import create_prefix, rename_prefix, rename_project_folder
from apps.tenants.models import Tenant
from apps.accounts.models import UserEnvironmentVariable
from redis_store.env_cache import invalidate_env
from asgiref.sync import async_to_sync
try:
    from DataStorageRetrieval.db.environment import (
        upsert_environment,
        delete_environment,
        rename_environment,
    )
except ModuleNotFoundError:  # pragma: no cover - FastAPI package missing
    upsert_environment = None
    delete_environment = None
    rename_environment = None


def _current_tenant_name() -> str:
    """Return the shared client folder for all MinIO prefixes."""

    return os.getenv("CLIENT_NAME", "default_client").replace(" ", "_")


@receiver(post_save, sender=Project)
def create_project_folder(sender, instance, created, **kwargs):
    if created:
        tenant = _current_tenant_name()
        app_slug = instance.app.slug
        project_slug = instance.slug
        prefix = f"{tenant}/{app_slug}/{project_slug}"
        create_prefix(prefix)
        if upsert_environment is not None:
            try:
                async_to_sync(upsert_environment)(
                    tenant,
                    app_slug,
                    instance.name,
                    client_id=os.environ.get("CLIENT_ID", ""),
                    app_id=os.environ.get("APP_ID", ""),
                    project_id=f"{instance.name}_{instance.pk}",
                    user_id=str(instance.owner_id),
                )
            except Exception:
                pass


@receiver(pre_save, sender=Project)
def rename_project_folder_signal(sender, instance, **kwargs):
    if not instance.pk:
        return
    try:
        old = Project.objects.get(pk=instance.pk)
    except Project.DoesNotExist:
        return
    if old.slug != instance.slug:
        tenant = _current_tenant_name()
        app_slug = instance.app.slug
        # perform the folder rename in MinIO and log the update
        print(
            f"🚚 Project slug changed: renaming MinIO folder {old.slug} -> {instance.slug}"
        )
        rename_project_folder(tenant, app_slug, old.slug, instance.slug)


@receiver(pre_save, sender=Project)
def update_env_vars_on_rename(sender, instance, **kwargs):
    if not instance.pk:
        return
    try:
        old = Project.objects.get(pk=instance.pk)
    except Project.DoesNotExist:
        return
    if old.name != instance.name:
        old_pid = f"{old.name}_{old.pk}"
        new_pid = f"{instance.name}_{instance.pk}"
        qs = UserEnvironmentVariable.objects.filter(project_id=old_pid)
        cache_entries = list(
            qs.values(
                "user_id",
                "client_id",
                "app_id",
                "client_name",
                "app_name",
                "project_name",
            ).distinct()
        )
        qs.update(project_name=instance.name, project_id=new_pid)
        qs.filter(key="PROJECT_NAME").update(value=instance.name)
        qs.filter(key="PROJECT_ID").update(value=new_pid)
        for entry in cache_entries:
            invalidate_env(
                str(entry["user_id"]),
                entry["client_id"],
                entry["app_id"],
                old_pid,
                client_name=entry["client_name"],
                app_name=entry["app_name"],
                project_name=entry["project_name"],
            )
        tenant = _current_tenant_name()
        app_slug = instance.app.slug
        old_slug = old.name.replace(" ", "_")
        new_slug = instance.name.replace(" ", "_")
        print(
            f"🚚 Project renamed: renaming MinIO folder {old_slug} -> {new_slug}"
        )
        rename_project_folder(tenant, app_slug, old_slug, new_slug)
        if rename_environment is not None:
            try:
                async_to_sync(rename_environment)(
                    tenant,
                    app_slug,
                    old.name,
                    instance.name,
                    new_project_id=f"{instance.name}_{instance.pk}",
                )
            except Exception:
                pass


@receiver(post_delete, sender=Project)
def cleanup_environment_entry(sender, instance, **kwargs):
    tenant = _current_tenant_name()
    app_slug = instance.app.slug
    if delete_environment is not None:
        try:
            async_to_sync(delete_environment)(tenant, app_slug, instance.name)
        except Exception:
            pass
