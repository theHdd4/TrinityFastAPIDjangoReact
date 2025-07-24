"""Redis based environment variable store with namespacing."""

import os
from typing import Dict, Optional

from django.db import transaction
from django.utils import timezone

from apps.accounts.models import UserEnvironmentVariable

from .redis_client import redis_client

ENV_NAMESPACE = "env"
SET_NAMESPACE = "envkeys"
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
    """Return namespace string for the environment."""
    return (
        f"{user_id}:{client_id}:{app_id}:{project_id}:{client_name}:{app_name}:{project_name}"
    )


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

    return {o.key: o.value for o in qs}


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
                return result

    # Fallback to DB
    env = _fetch_from_db(user_id, client_id, app_id, project_id, client_name, app_name, project_name)
    if env and use_cache:
        pipe = redis_client.pipeline()
        for k, v in env.items():
            full_key = _env_key(user_id, client_id, app_id, project_id, k, client_name, app_name, project_name)
            pipe.set(full_key, v, ex=TTL)
            pipe.sadd(set_key, full_key)
        pipe.expire(set_key, TTL)
        pipe.execute()
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
