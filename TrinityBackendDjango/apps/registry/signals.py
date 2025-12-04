import os
import re
from datetime import UTC, datetime
from django.db.models.signals import post_save, pre_save, post_delete
from django.db.models import Q
from django.dispatch import receiver
from django.utils.text import slugify
from django.conf import settings
from pymongo import MongoClient
from pymongo.errors import PyMongoError
from redis_store.redis_client import redis_client
from .models import Project, RegistryEnvironment
from common.minio_utils import create_prefix, rename_project_folder, remove_prefix
from apps.accounts.models import UserEnvironmentVariable
from redis_store.env_cache import invalidate_env, set_current_env
from urllib.parse import quote

TRINITY_DB_NAME = "trinity_db"
EXHIBITION_COLLECTIONS = {"exhibition_catalogue", "exhibition_list_configuration"}


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
        _rename_project_documents_in_mongo(
            tenant,
            app_slug,
            old.name,
            instance.name,
            old_pid,
            new_pid,
        )
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

    tenant_env = os.getenv("CLIENT_NAME", "default_client")
    tenant_candidates = {
        tenant_env,
        tenant_env.replace(" ", "_"),
    }
    app_slug = instance.app.slug if instance.app else ""
    
    # Delete chat history and sessions from MinIO for all tenant candidates
    for client_slug in tenant_candidates:
        # Delete chat history stored in trinity_ai_memory prefix
        memory_prefix = f"trinity_ai_memory/{client_slug}/{app_slug}/{instance.name}"
        remove_prefix(f"{memory_prefix}/chats")
        remove_prefix(f"{memory_prefix}/sessions")
        
        # Also try with slug in case it was stored that way
        if instance.slug and instance.slug != instance.name:
            memory_prefix_slug = f"trinity_ai_memory/{client_slug}/{app_slug}/{instance.slug}"
            remove_prefix(f"{memory_prefix_slug}/chats")
            remove_prefix(f"{memory_prefix_slug}/sessions")
        
        # Remove project data files
        remove_prefix(f"{client_slug}/{app_slug}/{instance.name}")
        remove_prefix(f"{client_slug}/{app_slug}/{instance.slug}")
def _mongo_auth_kwargs() -> dict:
    """Return authentication kwargs for :class:`MongoClient` if provided."""

    username = os.getenv("MONGO_USERNAME") or os.getenv("MONGO_USER")
    password = os.getenv("MONGO_PASSWORD")
    auth_db = os.getenv("MONGO_AUTH_DB", "admin")
    if username and password:
        return {"username": username, "password": password, "authSource": auth_db}
    return {}


def _replace_project_tokens(
    value,
    *,
    client_name: str,
    app_name: str,
    old_project: str,
    new_project: str,
    old_pid: str,
    new_pid: str,
    old_prefix: str,
    new_prefix: str,
):
    """Recursively replace project specific identifiers within ``value``."""

    if isinstance(value, dict):
        return {
            key: _replace_project_tokens(
                val,
                client_name=client_name,
                app_name=app_name,
                old_project=old_project,
                new_project=new_project,
                old_pid=old_pid,
                new_pid=new_pid,
                old_prefix=old_prefix,
                new_prefix=new_prefix,
            )
            for key, val in value.items()
        }
    if isinstance(value, list):
        return [
            _replace_project_tokens(
                item,
                client_name=client_name,
                app_name=app_name,
                old_project=old_project,
                new_project=new_project,
                old_pid=old_pid,
                new_pid=new_pid,
                old_prefix=old_prefix,
                new_prefix=new_prefix,
            )
            for item in value
        ]
    if isinstance(value, str):
        env_prefix = f"env:{client_name}:{app_name}:"
        if value == old_project:
            return new_project
        if value == old_pid:
            return new_pid
        if value.startswith(old_prefix):
            return f"{new_prefix}{value[len(old_prefix):]}"
        if value.startswith(env_prefix) and value.endswith(f":{old_project}"):
            return f"{env_prefix}{new_project}"
        if value.startswith("project:") and old_pid in value:
            return value.replace(old_pid, new_pid, 1)
    return value


def _rename_project_documents_in_mongo(
    client_name: str,
    app_name: str,
    old_project: str,
    new_project: str,
    old_pid: str,
    new_pid: str,
):
    """Rename MongoDB documents that key off the project path."""

    mongo_uri = getattr(settings, "MONGO_URI", "mongodb://mongo:27017/trinity_db")
    try:
        mc = MongoClient(
            mongo_uri,
            serverSelectionTimeoutMS=5000,
            **_mongo_auth_kwargs(),
        )
    except Exception as exc:  # pragma: no cover - network failure logging only
        print(f"⚠️ Unable to connect to MongoDB for project rename: {exc}")
        return

    try:  # pragma: no cover - best effort connectivity check
        mc.admin.command("ping")
    except Exception:
        pass

    old_prefix = f"{client_name}/{app_name}/{old_project}"
    new_prefix = f"{client_name}/{app_name}/{new_project}"
    regex = f"^{re.escape(old_prefix)}([:/].*)?$"
    redis_cleanup_keys: set[str] = {
        f"env:{client_name}:{app_name}:{old_project}",
        f"project:{old_pid}:dimensions",
    }

    db_candidates = {
        TRINITY_DB_NAME,
        os.getenv("MONGO_DB", TRINITY_DB_NAME),
    }
    try:
        db_candidates.update(mc.list_database_names())
    except PyMongoError:  # pragma: no cover - permissions dependent
        pass

    modified_total = 0
    try:
        for db_name in sorted({name for name in db_candidates if name}):
            try:
                database = mc[db_name]
                collections = database.list_collection_names()
            except PyMongoError as exc:  # pragma: no cover - permissions dependent
                print(f"⚠️ Unable to inspect Mongo database {db_name}: {exc}")
                continue

            for coll_name in collections:
                collection = database[coll_name]
                try:
                    matched_docs = list(collection.find({"_id": {"$regex": regex}}))
                except PyMongoError as exc:  # pragma: no cover - permissions dependent
                    print(
                        f"⚠️ Unable to scan {db_name}.{coll_name} for project rename: {exc}"
                    )
                    continue

                moved = 0
                for doc in matched_docs:
                    old_id = doc.get("_id")
                    if not isinstance(old_id, str) or not old_id.startswith(old_prefix):
                        continue
                    suffix = old_id[len(old_prefix) :]
                    new_id = f"{new_prefix}{suffix}"

                    body = {
                        key: value
                        for key, value in doc.items()
                        if key != "_id"
                    }
                    body = _replace_project_tokens(
                        body,
                        client_name=client_name,
                        app_name=app_name,
                        old_project=old_project,
                        new_project=new_project,
                        old_pid=old_pid,
                        new_pid=new_pid,
                        old_prefix=old_prefix,
                        new_prefix=new_prefix,
                    )
                    if body.get("project_name") == old_project:
                        body["project_name"] = new_project
                    if "env" in body and isinstance(body["env"], dict):
                        env_map = body["env"]
                        if env_map.get("PROJECT_NAME") == old_project:
                            env_map["PROJECT_NAME"] = new_project
                        if env_map.get("PROJECT_ID") == old_pid:
                            env_map["PROJECT_ID"] = new_pid
                    body["updated_at"] = datetime.now(UTC)
                    body["_id"] = new_id

                    collection.replace_one({"_id": new_id}, body, upsert=True)
                    if new_id != old_id:
                        collection.delete_one({"_id": old_id})
                    moved += 1

                    if coll_name == "column_classifier_config":
                        base_key = f"{old_prefix}/column_classifier_config"
                        redis_cleanup_keys.add(base_key)
                        file_name = doc.get("file_name")
                        if file_name:
                            safe_file = quote(file_name, safe="")
                            redis_cleanup_keys.add(f"{base_key}:{safe_file}")

                if moved:
                    modified_total += moved
                    print(
                        f"🍃 Mongo rename updated {moved} docs in {db_name}.{coll_name}"
                    )

                if coll_name in EXHIBITION_COLLECTIONS:
                    try:
                        exhibition_docs = list(
                            collection.find(
                                {
                                    "client_name": client_name,
                                    "app_name": app_name,
                                    "project_name": old_project,
                                }
                            )
                        )
                    except PyMongoError as exc:  # pragma: no cover - permissions dependent
                        print(
                            f"⚠️ Unable to scan {db_name}.{coll_name} for exhibition rename: {exc}"
                        )
                        continue

                    refreshed = 0
                    for doc in exhibition_docs:
                        doc_id = doc.get("_id")
                        body = {
                            key: value
                            for key, value in doc.items()
                            if key != "_id"
                        }
                        body = _replace_project_tokens(
                            body,
                            client_name=client_name,
                            app_name=app_name,
                            old_project=old_project,
                            new_project=new_project,
                            old_pid=old_pid,
                            new_pid=new_pid,
                            old_prefix=old_prefix,
                            new_prefix=new_prefix,
                        )
                        if body.get("project_name") == old_project:
                            body["project_name"] = new_project
                        project_identifier = body.get("project_id")
                        if isinstance(project_identifier, str) and project_identifier == old_pid:
                            body["project_id"] = new_pid
                        if "env" in body and isinstance(body["env"], dict):
                            env_map = body["env"]
                            if env_map.get("PROJECT_NAME") == old_project:
                                env_map["PROJECT_NAME"] = new_project
                            if env_map.get("PROJECT_ID") == old_pid:
                                env_map["PROJECT_ID"] = new_pid
                        body["updated_at"] = datetime.now(UTC)

                        replacement = dict(body)
                        if doc_id is not None:
                            replacement["_id"] = doc_id
                            collection.replace_one({"_id": doc_id}, replacement, upsert=True)
                        else:
                            collection.replace_one(
                                {
                                    "client_name": client_name,
                                    "app_name": app_name,
                                    "project_name": old_project,
                                },
                                replacement,
                                upsert=True,
                            )
                        refreshed += 1

                    if refreshed:
                        modified_total += refreshed
                        print(
                            f"🍃 Mongo rename refreshed {refreshed} docs in {db_name}.{coll_name}"
                        )
    finally:
        mc.close()

    if redis_cleanup_keys:
        for key in redis_cleanup_keys:
            try:
                redis_client.delete(key)
            except Exception:  # pragma: no cover - Redis best effort cleanup
                pass

    if modified_total:
        print(
            f"✅ Project rename propagated to Mongo for {modified_total} documents:"
            f" {old_prefix} -> {new_prefix}"
        )

