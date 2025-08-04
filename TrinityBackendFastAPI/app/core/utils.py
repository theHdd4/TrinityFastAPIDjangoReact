"""Utilities for FastAPI that read environment variables from Django or Postgres."""

from pathlib import Path
import sys
import os
from typing import Dict, Tuple
import json
from app.features.feature_overview.deps import redis_client

ENV_TTL = 3600
ENV_NAMESPACE = "env"

def _redis_env_key(client: str, app: str, project: str) -> str:
    return f"{ENV_NAMESPACE}:{client}:{app}:{project}"

try:
    DJANGO_ROOT = Path(__file__).resolve().parents[3] / "TrinityBackendDjango"
    sys.path.append(str(DJANGO_ROOT))
    from apps.accounts.utils import get_env_vars as django_get_env_vars  # type: ignore
except Exception:  # pragma: no cover - Django not available
    django_get_env_vars = None

try:
    import asyncpg  # type: ignore
except ModuleNotFoundError:  # pragma: no cover
    asyncpg = None

POSTGRES_HOST = os.getenv("POSTGRES_HOST", "postgres")
POSTGRES_DB = os.getenv("POSTGRES_DB", "trinity_db")
POSTGRES_USER = os.getenv("POSTGRES_USER", "trinity_user")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "trinity_pass")

_ENV_CACHE: Dict[Tuple[str, str, str, str, str], Dict[str, str]] = {}


async def _query_env_vars(client_id: str, app_id: str, project_id: str) -> Dict[str, str] | None:
    """Fetch environment variables from Postgres."""
    if asyncpg is None:
        return None
    try:
        conn = await asyncpg.connect(
            host=POSTGRES_HOST,
            user=POSTGRES_USER,
            password=POSTGRES_PASSWORD,
            database=POSTGRES_DB,
        )
    except Exception:
        return None
    try:
        rows = await conn.fetch(
            """
            SELECT key, value FROM accounts_userenvironmentvariable
            WHERE client_id = $1 AND app_id = $2 AND project_id = $3
            """,
            client_id,
            app_id,
            project_id,
        )
        return {r["key"]: r["value"] for r in rows}
    finally:
        await conn.close()


async def _query_env_vars_by_names(client_name: str, app_name: str, project_name: str) -> Dict[str, str] | None:
    if asyncpg is None:
        return None
    try:
        conn = await asyncpg.connect(
            host=POSTGRES_HOST,
            user=POSTGRES_USER,
            password=POSTGRES_PASSWORD,
            database=POSTGRES_DB,
        )
    except Exception:
        return None
    try:
        rows = await conn.fetch(
            """
            SELECT key, value FROM accounts_userenvironmentvariable
            WHERE client_name = $1 AND project_name = $3
              AND ($2 = '' OR app_name = $2)
            """,
            client_name,
            app_name,
            project_name,
        )
        return {r["key"]: r["value"] for r in rows}
    finally:
        await conn.close()


async def get_env_vars(
    client_id: str = "",
    app_id: str = "",
    project_id: str = "",
    *,
    client_name: str = "",
    app_name: str = "",
    project_name: str = "",
    use_cache: bool = True,
) -> Dict[str, str]:
    """Return environment variables for a client/app/project combo."""
    if django_get_env_vars is not None:
        try:
            env = await django_get_env_vars(
                client_id,
                app_id,
                project_id,
                client_name=client_name,
                app_name=app_name,
                project_name=project_name,
                use_cache=use_cache,
            )
            print(
                f"🔧 django_get_env_vars({client_id},{app_id},{project_id},{client_name},{app_name},{project_name}) -> {env}"
            )
            return env
        except Exception:  # pragma: no cover - Django misconfigured
            pass

    key = (client_id, app_id, project_id, client_name, app_name, project_name)
    if use_cache and key in _ENV_CACHE:
        env = _ENV_CACHE[key]
        print(f"🔧 cached_env_vars{key} -> {env}")
        return env

    if use_cache and client_name and project_name:
        redis_key = _redis_env_key(client_name, app_name, project_name)
        cached = redis_client.get(redis_key)
        if cached:
            try:
                env = json.loads(cached)
                _ENV_CACHE[key] = env
                print(f"🔧 redis_env_vars{redis_key} -> {env}")
                return env
            except Exception:
                pass

    env = {}
    if client_id or app_id or project_id:
        env = await _query_env_vars(client_id, app_id, project_id)
    # If direct lookup by identifiers fails, the project may have been
    # renamed. ``project_id`` embeds the name as ``<name>_<pk>`` so derive the
    # name from it before falling back to the possibly stale "project_name"
    # parameter.
    if not env and client_name and project_id:
        inferred = project_id.rsplit("_", 1)[0]
        if inferred and inferred != project_name:
            env = await _query_env_vars_by_names(client_name, app_name, inferred)
    if not env and client_name and project_name:
        env = await _query_env_vars_by_names(client_name, app_name, project_name)
    if not env:
        env = {
            "CLIENT_NAME": os.getenv("CLIENT_NAME", "default_client"),
            "APP_NAME": os.getenv("APP_NAME", "default_app"),
            "PROJECT_NAME": os.getenv("PROJECT_NAME", "default_project"),
        }

    if use_cache:
        _ENV_CACHE[key] = env
        if env.get("CLIENT_NAME") and env.get("PROJECT_NAME"):
            redis_key = _redis_env_key(
                env.get("CLIENT_NAME", ""),
                env.get("APP_NAME", ""),
                env.get("PROJECT_NAME", ""),
            )
            redis_client.setex(redis_key, ENV_TTL, json.dumps(env, default=str))

    print(f"🔧 db_env_vars{key} -> {env}")
    return env


__all__ = ["get_env_vars"]
