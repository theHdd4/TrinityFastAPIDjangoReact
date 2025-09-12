import os
from django.db.models.signals import post_save, pre_save, post_delete
from django.db.models import Q
from django.dispatch import receiver
from django.utils.text import slugify
from django.conf import settings
from pymongo import MongoClient
from redis_store.redis_client import redis_client
from .models import Project, RegistryEnvironment
from common.minio_utils import create_prefix, rename_project_folder
from apps.accounts.models import UserEnvironmentVariable
from redis_store.env_cache import invalidate_env, set_current_env

TRINITY_DB_NAME = "trinity_db"


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
        tenant = _current_tenant_name()
        app_slug = instance.app.slug
        print(f"🗄️ Renaming project in Postgres: {old.name} -> {instance.name}")

        # Ensure the registry entry is updated even if no user-specific
        # environment variables exist for this project. The Saved DataFrames
        # panel reads from this table when resolving MinIO prefixes. Match the
        # existing row either by the previous name or the stored ``PROJECT_ID``
        # inside the JSON field so we can safely update renames even if the
        # name changed elsewhere previously.
        reg_obj = (
            RegistryEnvironment.objects.filter(
                Q(client_name=tenant, app_name=app_slug, project_name=old.name)
                | Q(envvars__PROJECT_ID=old_pid)
            ).first()
        )
        if reg_obj:
            env = reg_obj.envvars or {}
            env.update(
                {
                    "CLIENT_NAME": tenant,
                    "APP_NAME": app_slug,
                    "PROJECT_NAME": instance.name,
                    "PROJECT_ID": new_pid,
                }
            )
            reg_obj.project_name = instance.name
            reg_obj.envvars = env
            reg_obj.save(update_fields=["project_name", "envvars"])
            print(
                f"🗃️ RegistryEnvironment updated for {tenant}/{app_slug} -> {instance.name}"
            )
        else:
            reg_obj, _ = RegistryEnvironment.objects.update_or_create(
                client_name=tenant,
                app_name=app_slug,
                project_name=instance.name,
                defaults={
                    "envvars": {
                        "CLIENT_NAME": tenant,
                        "APP_NAME": app_slug,
                        "PROJECT_NAME": instance.name,
                        "PROJECT_ID": new_pid,
                    },
                    "identifiers": [],
                    "measures": [],
                    "dimensions": {},
                },
            )

        # Remove any lingering rows that still reference the old project name
        # or ID to avoid stale lookups returning outdated names.
        RegistryEnvironment.objects.filter(
            client_name=tenant,
            app_name=app_slug,
        ).filter(
            Q(project_name=old.name) | Q(envvars__PROJECT_ID=old_pid)
        ).exclude(pk=reg_obj.pk).delete()

        # Projects may be stored with different ``project_id`` formats across
        # user environment variable rows (e.g. "name_1" or just "1"). When a
        # project is renamed we need to update *all* variants so lookups by
        # numeric ID resolve to the new name. Include entries matching the old
        # composed ID, any plain numeric ID, or anything that ends with the
        # project PK.
        qs = UserEnvironmentVariable.objects.filter(
            Q(project_id=old_pid)
            | Q(project_id=str(instance.pk))
            | Q(project_id__endswith=f"_{instance.pk}")
        )
        cache_entries = list(
            qs.values(
                "user_id",
                "client_id",
                "app_id",
                "client_name",
                "app_name",
                "project_name",
                "project_id",
            ).distinct()
        )
        qs.update(project_name=instance.name, project_id=new_pid)
        qs.filter(key="PROJECT_NAME").update(value=instance.name)
        qs.filter(key="PROJECT_ID").update(value=new_pid)
        for entry in cache_entries:
            # Invalidate using the precise project_id stored on the record so
            # cache keys with just the numeric ID are also removed.
            invalidate_env(
                str(entry["user_id"]),
                entry["client_id"],
                entry["app_id"],
                entry["project_id"],
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
            try:
                mc = MongoClient(
                    getattr(settings, "MONGO_URI", "mongodb://mongo:27017/trinity_db"),
                    serverSelectionTimeoutMS=5000,
                )
                db = mc[TRINITY_DB_NAME]
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
    qs = UserEnvironmentVariable.objects.filter(
        Q(project_id=pid)
        | Q(project_id=str(instance.pk))
        | Q(project_id__endswith=f"_{instance.pk}")
    )
    cache_entries = list(
        qs.values(
            "user_id",
            "client_id",
            "app_id",
            "client_name",
            "app_name",
            "project_name",
            "project_id",
        ).distinct()
    )
    qs.delete()
    for entry in cache_entries:
        invalidate_env(
            str(entry["user_id"]),
            entry["client_id"],
            entry["app_id"],
            entry["project_id"],
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
                getattr(settings, "MONGO_URI", "mongodb://mongo:27017/trinity_db"),
                serverSelectionTimeoutMS=5000,
            )
            db = mc[TRINITY_DB_NAME]
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
