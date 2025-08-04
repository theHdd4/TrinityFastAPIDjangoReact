import os
from django.db.models.signals import post_save, pre_save, post_delete
from django.dispatch import receiver
from django.utils.text import slugify
from django.conf import settings
from pymongo import MongoClient
from redis_store.redis_client import redis_client
from .models import Project, RegistryEnvironment
from common.minio_utils import create_prefix, rename_project_folder
from apps.accounts.models import UserEnvironmentVariable
from redis_store.env_cache import invalidate_env, set_current_env


def _current_tenant_name() -> str:
    """Return the shared client folder for all MinIO prefixes."""

    return os.getenv("CLIENT_NAME", "default_client").replace(" ", "_")


@receiver(post_save, sender=Project)
def create_project_folder(sender, instance, created, **kwargs):
    if created:
        tenant = os.getenv("CLIENT_NAME", _current_tenant_name())
        app_slug = instance.app.slug
        project_name = instance.name
        prefix = f"{tenant}/{app_slug}/{project_name}"
        create_prefix(prefix)
        envvars = {
            "CLIENT_NAME": tenant,
            "APP_NAME": app_slug,
            "PROJECT_NAME": project_name,
            "PROJECT_ID": f"{project_name}_{instance.pk}",
        }
        RegistryEnvironment.objects.update_or_create(
            client_name=tenant,
            app_name=app_slug,
            project_name=project_name,
            defaults={
                "envvars": envvars,
                "identifiers": [],
                "measures": [],
                "dimensions": {},
            },
        )


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
        print(f"🗄️ Renaming project in Postgres: {old.name} -> {instance.name}")
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
            set_current_env(
                str(entry["user_id"]),
                client_id=entry["client_id"],
                app_id=entry["app_id"],
                project_id=new_pid,
                client_name=entry["client_name"],
                app_name=entry["app_name"],
                project_name=instance.name,
            )
            print(
                f"♻️ Redis env updated for user {entry['user_id']} to {instance.name}"
            )
            reg_obj = RegistryEnvironment.objects.filter(
                client_name=entry["client_name"],
                app_name=entry["app_name"],
                project_name=entry["project_name"],
            ).first()
            if reg_obj:
                reg_obj.project_name = instance.name
                env = reg_obj.envvars or {}
                env.update(
                    {
                        "CLIENT_NAME": entry["client_name"],
                        "APP_NAME": entry["app_name"],
                        "PROJECT_NAME": instance.name,
                        "PROJECT_ID": new_pid,
                    }
                )
                reg_obj.envvars = env
                reg_obj.save(update_fields=["project_name", "envvars"])
                print(
                    f"🗃️ RegistryEnvironment updated for {entry['client_name']}/{entry['app_name']} -> {instance.name}"
                )
            else:
                RegistryEnvironment.objects.update_or_create(
                    client_name=entry["client_name"],
                    app_name=entry["app_name"],
                    project_name=instance.name,
                    defaults={
                        "envvars": {
                            "CLIENT_NAME": entry["client_name"],
                            "APP_NAME": entry["app_name"],
                            "PROJECT_NAME": instance.name,
                            "PROJECT_ID": new_pid,
                        }
                    },
                )
            try:
                mc = MongoClient(
                    getattr(settings, "MONGO_URI", "mongodb://mongo:27017/trinity"),
                    serverSelectionTimeoutMS=5000,
                )
                db = mc.get_default_database()
                result = db.session_state.update_many(
                    {
                        "state.client_name": entry["client_name"],
                        "state.app_name": entry["app_name"],
                        "state.project_name": entry["project_name"],
                    },
                    {"$set": {"state.project_name": instance.name}},
                )
                print(
                    f"🍃 MongoDB session_state updated {result.modified_count} docs for {entry['project_name']} -> {instance.name}"
                )
            except Exception:
                pass
            try:
                redis_client.delete(
                    f"{entry['client_name']}/{entry['app_name']}/{entry['project_name']}"
                )
                print(
                    f"🧹 Cleared Redis session cache {entry['client_name']}/{entry['app_name']}/{entry['project_name']}"
                )
            except Exception:
                pass
        tenant = _current_tenant_name()
        app_slug = instance.app.slug
        rename_project_folder(tenant, app_slug, old.name, instance.name, old.slug)
        new_slug_base = slugify(instance.name)
        slug_val = new_slug_base
        counter = 1
        while (
            Project.objects.filter(owner=instance.owner, slug=slug_val)
            .exclude(pk=instance.pk)
            .exists()
        ):
            slug_val = f"{new_slug_base}-{counter}"
            counter += 1
        if old.slug != slug_val:
            print(f"🔖 Project slug updated: {old.slug} -> {slug_val}")
        instance.slug = slug_val


@receiver(post_delete, sender=Project)
def cleanup_on_delete(sender, instance, **kwargs):
    """Remove cached environment and session state for deleted projects."""
    pid = f"{instance.name}_{instance.pk}"
    qs = UserEnvironmentVariable.objects.filter(project_id=pid)
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
    qs.delete()
    for entry in cache_entries:
        invalidate_env(
            str(entry["user_id"]),
            entry["client_id"],
            entry["app_id"],
            pid,
            client_name=entry["client_name"],
            app_name=entry["app_name"],
            project_name=entry["project_name"],
        )
        RegistryEnvironment.objects.filter(
            client_name=entry["client_name"],
            app_name=entry["app_name"],
            project_name=entry["project_name"],
        ).delete()
        try:
            mc = MongoClient(
                getattr(settings, "MONGO_URI", "mongodb://mongo:27017/trinity"),
                serverSelectionTimeoutMS=5000,
            )
            db = mc.get_default_database()
            db.session_state.delete_many(
                {
                    "state.client_name": entry["client_name"],
                    "state.app_name": entry["app_name"],
                    "state.project_name": entry["project_name"],
                }
            )
        except Exception:
            pass
        try:
            redis_client.delete(
                f"{entry['client_name']}/{entry['app_name']}/{entry['project_name']}"
            )
        except Exception:
            pass
