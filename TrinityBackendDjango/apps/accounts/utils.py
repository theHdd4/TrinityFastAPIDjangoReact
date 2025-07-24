import os
import time
from django.utils import timezone
from django.core.cache import cache
from asgiref.sync import sync_to_async
from .models import UserEnvironmentVariable
from redis_store.env_cache import (
    set_env_var as cache_set_env_var,
    get_env_vars as cache_get_env_vars,
    set_current_env,
    get_current_env,
)


def load_env_vars(user) -> dict:
    """Load saved environment variables for the current context from Redis."""
    user_id = str(getattr(user, "id", user))
    current = get_current_env(user_id)
    envs = cache_get_env_vars(
        current.get("client_id", os.getenv("CLIENT_ID", "")),
        current.get("app_id", os.getenv("APP_ID", "")),
        current.get("project_id", os.getenv("PROJECT_ID", "")),
        user_id=user_id,
        client_name=current.get("client_name", os.getenv("CLIENT_NAME", "")),
        app_name=current.get("app_name", os.getenv("APP_NAME", "")),
        project_name=current.get("project_name", os.getenv("PROJECT_NAME", "")),
    )
    combined = {**current, **envs}
    for k, v in combined.items():
        env_key = k.upper()
        os.environ[env_key] = v
    return envs


def save_env_var(user, key, value) -> None:
    """Create or update an environment variable record for the user."""
    client_name = os.environ.get("CLIENT_NAME", "")
    app_name = os.environ.get("APP_NAME", "")
    project_name = os.environ.get("PROJECT_NAME", "")

    client_id = os.environ.get("CLIENT_ID")
    if not client_id and client_name:
        client_id = f"{client_name}_{int(time.time())}"
        os.environ["CLIENT_ID"] = client_id
    app_id = os.environ.get("APP_ID")
    if not app_id and app_name:
        app_id = f"{app_name}_{int(time.time())}"
        os.environ["APP_ID"] = app_id
    project_id = os.environ.get("PROJECT_ID")
    if not project_id and project_name:
        project_id = f"{project_name}_{int(time.time())}"
        os.environ["PROJECT_ID"] = project_id

    UserEnvironmentVariable.objects.update_or_create(
        user=user,
        client_id=client_id or "",
        app_id=app_id or "",
        project_id=project_id or "",
        key=key,
        defaults={
            "value": value,
            "client_name": client_name,
            "app_name": app_name,
            "project_name": project_name,
            "last_used": timezone.now(),
        },
    )
    # Write-through to Redis
    cache_set_env_var(
        user,
        client_id or "",
        app_id or "",
        project_id or "",
        key,
        value,
        client_name=client_name,
        app_name=app_name,
        project_name=project_name,
    )
    set_current_env(
        str(getattr(user, "id", user)),
        client_id=client_id or "",
        app_id=app_id or "",
        project_id=project_id or "",
        client_name=client_name,
        app_name=app_name,
        project_name=project_name,
    )

def get_env_dict(user):
    """Return environment variables for the current client/app/project from Redis."""
    user_id = str(getattr(user, "id", user))
    current = get_current_env(user_id)
    return cache_get_env_vars(
        current.get("client_id", os.getenv("CLIENT_ID", "")),
        current.get("app_id", os.getenv("APP_ID", "")),
        current.get("project_id", os.getenv("PROJECT_ID", "")),
        user_id=user_id,
        client_name=current.get("client_name", os.getenv("CLIENT_NAME", "")),
        app_name=current.get("app_name", os.getenv("APP_NAME", "")),
        project_name=current.get("project_name", os.getenv("PROJECT_NAME", "")),
    )


@sync_to_async
def _query_env_vars(client_id: str, app_id: str, project_id: str):
    qs = UserEnvironmentVariable.objects.filter(
        client_id=client_id, app_id=app_id, project_id=project_id
    )
    return {e.key: e.value for e in qs}


@sync_to_async
def _query_env_vars_by_names(client_name: str, app_name: str, project_name: str):
    qs = UserEnvironmentVariable.objects.filter(
        client_name=client_name, project_name=project_name
    )
    if app_name:
        qs = qs.filter(app_name=app_name)
    return {e.key: e.value for e in qs}


async def get_env_vars(
    client_id: str = "",
    app_id: str = "",
    project_id: str = "",
    *,
    user_id: str | None = None,
    client_name: str = "",
    app_name: str = "",
    project_name: str = "",
    use_cache: bool = True,
) -> dict:
    """Fetch environment variables using Redis-backed cache."""
    if user_id is None:
        user_id = os.getenv("USER_ID", "")
    if not any([client_id, app_id, project_id, client_name, app_name, project_name]):
        current = get_current_env(user_id)
        client_id = current.get("client_id", client_id)
        app_id = current.get("app_id", app_id)
        project_id = current.get("project_id", project_id)
        client_name = current.get("client_name", client_name)
        app_name = current.get("app_name", app_name)
        project_name = current.get("project_name", project_name)
    env = await sync_to_async(cache_get_env_vars)(
        client_id,
        app_id,
        project_id,
        user_id=user_id,
        client_name=client_name,
        app_name=app_name,
        project_name=project_name,
        use_cache=use_cache,
    )
    if not env:
        env = {
            "CLIENT_NAME": os.getenv("CLIENT_NAME", "default_client"),
            "APP_NAME": os.getenv("APP_NAME", "default_app"),
            "PROJECT_NAME": os.getenv("PROJECT_NAME", "default_project"),
        }
    return env
