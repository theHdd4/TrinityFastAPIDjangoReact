import os
from typing import Dict, Tuple

try:
    import asyncpg  # type: ignore
except ModuleNotFoundError:  # pragma: no cover
    asyncpg = None

POSTGRES_HOST = os.getenv("POSTGRES_HOST", "postgres")
POSTGRES_DB = os.getenv("POSTGRES_DB", "trinity_db")
POSTGRES_USER = os.getenv("POSTGRES_USER", "trinity_user")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "trinity_pass")

_ENV_CACHE: Dict[Tuple[str, str, str], Dict[str, str]] = {}

async def _query_env_vars(client_id: str, app_id: str, project_id: str) -> Dict[str, str] | None:
    """Fetch environment variables for the given IDs from Postgres."""
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

async def get_env_vars(client_id: str, app_id: str, project_id: str, use_cache: bool = True) -> Dict[str, str]:
    """Return environment variables for a client/app/project combo.

    Falls back to ``os.environ`` if the database lookup fails.
    """
    key = (client_id, app_id, project_id)
    if use_cache and key in _ENV_CACHE:
        return _ENV_CACHE[key]

    env = await _query_env_vars(client_id, app_id, project_id)
    if not env:
        env = {
            "CLIENT_NAME": os.getenv("CLIENT_NAME", "default_client"),
            "APP_NAME": os.getenv("APP_NAME", "default_app"),
            "PROJECT_NAME": os.getenv("PROJECT_NAME", "default_project"),
        }
    if use_cache:
        _ENV_CACHE[key] = env
    return env
