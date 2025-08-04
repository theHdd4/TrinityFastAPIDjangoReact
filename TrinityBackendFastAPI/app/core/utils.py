"""Utilities for FastAPI that read environment variables from Django or Postgres."""

from pathlib import Path
import sys
import os
from typing import Dict, Tuple, Any
import json
from app.features.feature_overview.deps import redis_client
from app.DataStorageRetrieval.db import fetch_client_app_project

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

_ENV_CACHE: Dict[Tuple[str, str, str, str, str], Dict[str, Any]] = {}


def _parse_numeric_id(value: str | int | None) -> int:
    try:
        return int(str(value).split("_")[-1])
    except Exception:
        return 0


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


async def _query_registry_env(
    client_name: str, app_name: str, project_name: str
) -> Dict[str, Any] | None:
    """Fetch environment data from registry_environment table."""
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
        row = await conn.fetchrow(
            """
            SELECT envvars, identifiers, measures, dimensions
            FROM registry_environment
            WHERE client_name = $1 AND app_name = $2 AND project_name = $3
            """,
            client_name,
            app_name,
            project_name,
        )
        if row:
            env = dict(row["envvars"] or {})
            env.update(
                {
                    "CLIENT_NAME": client_name,
                    "APP_NAME": app_name,
                    "PROJECT_NAME": project_name,
                }
            )
            if row.get("identifiers") is not None:
                env["identifiers"] = row["identifiers"]
            if row.get("measures") is not None:
                env["measures"] = row["measures"]
            if row.get("dimensions") is not None:
                env["dimensions"] = row["dimensions"]
            return env
        return None
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
    return_source: bool = False,
) -> Dict[str, Any] | tuple[Dict[str, Any], str]:
    """Return environment variables for a client/app/project combo.

    Parameters
    ----------
    return_source:
        When ``True`` the function returns a tuple of ``(env, source)`` where
        ``source`` indicates where the variables were loaded from
        (e.g. ``"redis"`` or ``"postgres"``).  The default behaviour of
        returning just the ``env`` dictionary is preserved for existing callers.
    """
    source = "unknown"
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
            source = "django"
            print(
                f"🔧 django_get_env_vars({client_id},{app_id},{project_id},{client_name},{app_name},{project_name}) -> {env}"
            )
            return (env, source) if return_source else env
        except Exception:  # pragma: no cover - Django misconfigured
            pass

    key = (client_id, app_id, project_id, client_name, app_name, project_name)
    if use_cache and key in _ENV_CACHE:
        env = _ENV_CACHE[key]
        source = "cache"
        print(f"🔧 cached_env_vars{key} -> {env}")
        return (env, source) if return_source else env

    if use_cache and client_name and project_name:
        redis_key = _redis_env_key(client_name, app_name, project_name)
        cached = redis_client.get(redis_key)
        if cached:
            try:
                env = json.loads(cached)
                _ENV_CACHE[key] = env
                source = "redis"
                print(f"🔧 redis_env_vars{redis_key} -> {env}")
                return (env, source) if return_source else env
            except Exception:
                pass

    env = {}
    if client_id or app_id or project_id:
        env = await _query_env_vars(client_id, app_id, project_id)
        source = "postgres"
    if not env and client_name and project_name:
        env = await _query_env_vars_by_names(client_name, app_name, project_name)
        source = "postgres" if env else source
    if not env and client_name and project_name:
        env = await _query_registry_env(client_name, app_name, project_name)
        source = "postgres" if env else source
    if not env:
        numeric_pid = _parse_numeric_id(project_id)
        if numeric_pid:
            try:
                client_db, app_db, project_db = await fetch_client_app_project(
                    None, numeric_pid
                )
                env = {
                    "CLIENT_NAME": client_db,
                    "APP_NAME": app_db,
                    "PROJECT_NAME": project_db,
                }
                source = "postgres"
            except Exception:
                env = {
                    "CLIENT_NAME": os.getenv("CLIENT_NAME", "default_client"),
                    "APP_NAME": os.getenv("APP_NAME", "default_app"),
                    "PROJECT_NAME": os.getenv("PROJECT_NAME", "default_project"),
                }
                source = "defaults"
        else:
            env = {
                "CLIENT_NAME": os.getenv("CLIENT_NAME", "default_client"),
                "APP_NAME": os.getenv("APP_NAME", "default_app"),
                "PROJECT_NAME": os.getenv("PROJECT_NAME", "default_project"),
            }
            source = "defaults"

    if use_cache:
        _ENV_CACHE[key] = env
        if env.get("CLIENT_NAME") and env.get("PROJECT_NAME"):
            redis_key = _redis_env_key(
                env.get("CLIENT_NAME", ""),
                env.get("APP_NAME", ""),
                env.get("PROJECT_NAME", ""),
            )
            redis_client.setex(redis_key, ENV_TTL, json.dumps(env, default=str))

    print(f"🔧 db_env_vars{key} -> {env} (source={source})")
    return (env, source) if return_source else env


__all__ = ["get_env_vars"]
