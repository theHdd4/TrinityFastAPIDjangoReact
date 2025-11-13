"""Redis based environment variable store with namespacing."""

import os
import json
import hashlib
from typing import Dict, Optional

from django.db import transaction
from django.utils import timezone

from apps.accounts.models import UserEnvironmentVariable
from django.apps import apps

from .redis_client import redis_client
from .cache_events import publish_cache_invalidation

ENV_NAMESPACE = "env"
SET_NAMESPACE = "envkeys"
ENV_VERSION_NAMESPACE = "envver"
TTL = 3600  # 1 hour TTL for cache entries


def _ns(
    user_id: str,
    client_id: str,
    app_id: str,
    project_id: str,
    client_name: str = "",
    app_name: str = "",
    project_name: str = "",
) -> str:
    """Return namespace string for the environment.

    The key is composed purely from the identifiers so caches are
    shared across users for the same client/app/project.
    """
    return f"{client_id}:{app_id}:{project_id}"


def _env_key(
    user_id: str,
    client_id: str,
    app_id: str,
    project_id: str,
    key: str,
    client_name: str = "",
    app_name: str = "",
    project_name: str = "",
) -> str:
    ns = _ns(user_id, client_id, app_id, project_id, client_name, app_name, project_name)
    return f"{ENV_NAMESPACE}:{ns}:{key}"


def _set_key(
    user_id: str,
    client_id: str,
    app_id: str,
    project_id: str,
    client_name: str = "",
    app_name: str = "",
    project_name: str = "",
) -> str:
    ns = _ns(user_id, client_id, app_id, project_id, client_name, app_name, project_name)
    return f"{SET_NAMESPACE}:{ns}"


def _version_key(
    user_id: str,
    client_id: str,
    app_id: str,
    project_id: str,
    client_name: str = "",
    app_name: str = "",
    project_name: str = "",
) -> str:
    ns = _ns(user_id, client_id, app_id, project_id, client_name, app_name, project_name)
    return f"{ENV_VERSION_NAMESPACE}:{ns}"


def _compute_env_version(
    env: Dict[str, str], client_name: str, app_name: str, project_name: str
) -> str:
    canonical = {
        "client": client_name,
        "app": app_name,
        "project": project_name,
        "env": env,
    }
    data = json.dumps(canonical, sort_keys=True, default=str)
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


def _cached_env(
    user_id: str,
    client_id: str,
    app_id: str,
    project_id: str,
    client_name: str = "",
    app_name: str = "",
    project_name: str = "",
) -> Dict[str, str]:
    set_key = _set_key(user_id, client_id, app_id, project_id, client_name, app_name, project_name)
    keys = list(redis_client.smembers(set_key))
    if not keys:
        return {}
    values = redis_client.mget(keys)
    result: Dict[str, str] = {}
    for key, value in zip(keys, values):
        if value is None:
            continue
        short_key = key.split(":")[-1]
        result[short_key] = value
    return result


def _fetch_from_db(
    user_id: str,
    client_id: str,
    app_id: str,
    project_id: str,
    client_name: str = "",
    app_name: str = "",
    project_name: str = "",
) -> Dict[str, str]:
    qs = UserEnvironmentVariable.objects.filter(user_id=user_id)
    if client_id or app_id or project_id:
        qs = qs.filter(client_id=client_id, app_id=app_id, project_id=project_id)
    elif client_name and project_name:
        qs = qs.filter(client_name=client_name, project_name=project_name)
        if app_name:
            qs = qs.filter(app_name=app_name)
    else:
        return {}
    env = {o.key: o.value for o in qs}
    if env:
        return env
    if client_name and project_name:
        try:
            model = apps.get_model("registry", "RegistryEnvironment")
            obj = model.objects.filter(
                client_name=client_name,
                app_name=app_name,
                project_name=project_name,
            ).first()
            if obj and isinstance(obj.envvars, dict):
                env = obj.envvars.copy()
                env.setdefault("CLIENT_NAME", client_name)
                env.setdefault("APP_NAME", app_name)
                env.setdefault("PROJECT_NAME", project_name)
                return env
        except Exception:
            pass
    if env and "_env_version" not in env:
        version_client = client_name or env.get("CLIENT_NAME", "")
        version_app = app_name or env.get("APP_NAME", "")
        version_project = project_name or env.get("PROJECT_NAME", "")
        env["_env_version"] = _compute_env_version(env, version_client, version_app, version_project)
    return env


def get_env_vars(
    client_id: str = "",
    app_id: str = "",
    project_id: str = "",
    *,
    user_id: str | None = None,
    client_name: str = "",
    app_name: str = "",
    project_name: str = "",
    use_cache: bool = True,
) -> Dict[str, str]:
    """Read environment variables using read-through cache pattern."""
    if user_id is None:
        user_id = os.getenv("USER_ID", "")
    set_key = _set_key(user_id, client_id, app_id, project_id, client_name, app_name, project_name)
    if use_cache:
        keys = list(redis_client.smembers(set_key))
        if keys:
            values = redis_client.mget(keys)
            if all(v is not None for v in values):
                result = {}
                for k, v in zip(keys, values):
                    short_key = k.split(":")[-1]
                    result[short_key] = v
                version_raw = redis_client.get(
                    _version_key(user_id, client_id, app_id, project_id, client_name, app_name, project_name)
                )
                if isinstance(version_raw, bytes):
                    version = version_raw.decode("utf-8")
                else:
                    version = version_raw
                if version:
                    result["_env_version"] = version
                return result

    # Fallback to DB
    env = _fetch_from_db(user_id, client_id, app_id, project_id, client_name, app_name, project_name)
    if env and use_cache:
        pipe = redis_client.pipeline()
        for k, v in env.items():
            full_key = _env_key(user_id, client_id, app_id, project_id, k, client_name, app_name, project_name)
            pipe.set(full_key, v, ex=TTL)
            pipe.sadd(set_key, full_key)
        version_client = client_name or env.get("CLIENT_NAME", "")
        version_app = app_name or env.get("APP_NAME", "")
        version_project = project_name or env.get("PROJECT_NAME", "")
        env.setdefault("CLIENT_NAME", version_client)
        env.setdefault("APP_NAME", version_app)
        env.setdefault("PROJECT_NAME", version_project)
        version = _compute_env_version(env, version_client, version_app, version_project)
        version_key = _version_key(user_id, client_id, app_id, project_id, client_name, app_name, project_name)
        pipe.set(version_key, version, ex=TTL)
        pipe.expire(set_key, TTL)
        pipe.execute()
        env["_env_version"] = version
        publish_cache_invalidation(
            "env",
            {
                "client_id": client_id,
                "app_id": app_id,
                "project_id": project_id,
                "client_name": env.get("CLIENT_NAME", version_client),
                "app_name": env.get("APP_NAME", version_app),
                "project_name": env.get("PROJECT_NAME", version_project),
            },
            action="write",
            ttl=TTL,
            version=version,
        )
    return env


def set_env_var(
    user,
    client_id: str,
    app_id: str,
    project_id: str,
    key: str,
    value: str,
    *,
    client_name: str = "",
    app_name: str = "",
    project_name: str = "",
) -> UserEnvironmentVariable:
    """Write-through cache update for environment variables."""
    user_id = str(getattr(user, "id", user))
    with transaction.atomic():
        obj, _ = UserEnvironmentVariable.objects.update_or_create(
            user=user,
            client_id=client_id,
            app_id=app_id,
            project_id=project_id,
            key=key,
            defaults={
                "value": value,
                "client_name": client_name,
                "app_name": app_name,
                "project_name": project_name,
                "last_used": timezone.now(),
            },
        )

    full_key = _env_key(user_id, client_id, app_id, project_id, key, client_name, app_name, project_name)
    set_key = _set_key(user_id, client_id, app_id, project_id, client_name, app_name, project_name)
    redis_client.set(full_key, value, ex=TTL)
    redis_client.sadd(set_key, full_key)
    redis_client.expire(set_key, TTL)
    cached_env = _cached_env(
        user_id,
        client_id,
        app_id,
        project_id,
        client_name,
        app_name,
        project_name,
    )
    version_client = client_name or cached_env.get("CLIENT_NAME", "")
    version_app = app_name or cached_env.get("APP_NAME", "")
    version_project = project_name or cached_env.get("PROJECT_NAME", "")
    if version_client:
        cached_env.setdefault("CLIENT_NAME", version_client)
    if version_app:
        cached_env.setdefault("APP_NAME", version_app)
    if version_project:
        cached_env.setdefault("PROJECT_NAME", version_project)
    if cached_env:
        version = _compute_env_version(cached_env, version_client, version_app, version_project)
        redis_client.setex(
            _version_key(user_id, client_id, app_id, project_id, client_name, app_name, project_name),
            TTL,
            version,
        )
    else:
        version = None
    try:
        model = apps.get_model("registry", "RegistryEnvironment")
        if client_name and project_name:
            reg_obj, _ = model.objects.get_or_create(
                client_name=client_name,
                app_name=app_name,
                project_name=project_name,
            )
            if key == "identifiers":
                reg_obj.identifiers = json.loads(value) if value else []
            elif key == "measures":
                reg_obj.measures = json.loads(value) if value else []
            elif key == "dimensions":
                reg_obj.dimensions = json.loads(value) if value else {}
            else:
                env = reg_obj.envvars or {}
                env[key] = value
                reg_obj.envvars = env
            reg_obj.save()
    except Exception:
        pass
    publish_cache_invalidation(
        "env",
        {
            "client_id": client_id,
            "app_id": app_id,
            "project_id": project_id,
            "client_name": client_name or cached_env.get("CLIENT_NAME", ""),
            "app_name": app_name or cached_env.get("APP_NAME", ""),
            "project_name": project_name or cached_env.get("PROJECT_NAME", ""),
        },
        action="write",
        ttl=TTL,
        version=version,
    )
    return obj


def delete_env_var(
    user_id: str,
    client_id: str,
    app_id: str,
    project_id: str,
    key: str,
    *,
    client_name: str = "",
    app_name: str = "",
    project_name: str = "",
) -> None:
    """Delete an environment variable from DB and cache."""
    UserEnvironmentVariable.objects.filter(
        user_id=user_id,
        client_id=client_id,
        app_id=app_id,
        project_id=project_id,
        key=key,
    ).delete()
    full_key = _env_key(user_id, client_id, app_id, project_id, key, client_name, app_name, project_name)
    set_key = _set_key(user_id, client_id, app_id, project_id, client_name, app_name, project_name)
    redis_client.delete(full_key)
    redis_client.srem(set_key, full_key)
    remaining = _cached_env(user_id, client_id, app_id, project_id, client_name, app_name, project_name)
    version_client = client_name or remaining.get("CLIENT_NAME", "")
    version_app = app_name or remaining.get("APP_NAME", "")
    version_project = project_name or remaining.get("PROJECT_NAME", "")
    if remaining:
        version = _compute_env_version(remaining, version_client, version_app, version_project)
        redis_client.setex(
            _version_key(user_id, client_id, app_id, project_id, client_name, app_name, project_name),
            TTL,
            version,
        )
    else:
        version = None
        redis_client.delete(
            _version_key(user_id, client_id, app_id, project_id, client_name, app_name, project_name)
        )
    publish_cache_invalidation(
        "env",
        {
            "client_id": client_id,
            "app_id": app_id,
            "project_id": project_id,
            "client_name": client_name or remaining.get("CLIENT_NAME", ""),
            "app_name": app_name or remaining.get("APP_NAME", ""),
            "project_name": project_name or remaining.get("PROJECT_NAME", ""),
            "key": key,
        },
        action="delete",
        ttl=0,
        version=version,
    )


def invalidate_env(
    user_id: str,
    client_id: str,
    app_id: str,
    project_id: str,
    *,
    client_name: str = "",
    app_name: str = "",
    project_name: str = "",
) -> None:
    """Remove all cached keys for given namespace."""
    set_key = _set_key(user_id, client_id, app_id, project_id, client_name, app_name, project_name)
    keys = list(redis_client.smembers(set_key))
    if keys:
        redis_client.delete(*keys)
    redis_client.delete(set_key)
    redis_client.delete(
        _version_key(user_id, client_id, app_id, project_id, client_name, app_name, project_name)
    )
    publish_cache_invalidation(
        "env",
        {
            "client_id": client_id,
            "app_id": app_id,
            "project_id": project_id,
            "client_name": client_name,
            "app_name": app_name,
            "project_name": project_name,
        },
        action="delete",
        ttl=0,
        version=None,
    )


CURRENT_ENV_PREFIX = "currentenv"


def set_current_env(
    user_id: str,
    *,
    client_id: str = "",
    app_id: str = "",
    project_id: str = "",
    client_name: str = "",
    app_name: str = "",
    project_name: str = "",
) -> None:
    """Persist the latest environment selection for a user."""
    key = f"{CURRENT_ENV_PREFIX}:{user_id}"
    redis_client.hset(
        key,
        mapping={
            "client_id": client_id,
            "app_id": app_id,
            "project_id": project_id,
            "client_name": client_name,
            "app_name": app_name,
            "project_name": project_name,
        },
    )


def get_current_env(user_id: str) -> Dict[str, str]:
    """Return the last stored environment selection for a user."""
    key = f"{CURRENT_ENV_PREFIX}:{user_id}"
    return redis_client.hgetall(key)
