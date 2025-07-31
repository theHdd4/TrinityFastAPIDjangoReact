import os

try:
    import asyncpg  # type: ignore
except ModuleNotFoundError:  # pragma: no cover - optional dependency
    asyncpg = None

POSTGRES_HOST = os.getenv("POSTGRES_HOST", "postgres")
POSTGRES_DB = os.getenv("POSTGRES_DB", "trinity_db")
POSTGRES_USER = os.getenv("POSTGRES_USER", "trinity_user")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "trinity_pass")
POSTGRES_PORT = os.getenv("POSTGRES_PORT", "5432")


def get_tenant_schema(name: str | None = None) -> str | None:
    """Return the current tenant schema from environment variables or ``name``.

    The helper ensures the returned value ends with ``_schema`` only once,
    performing a case-insensitive check so callers may pass values such as
    ``"Demo_Schema"`` without getting ``"Demo_Schema_schema"`` in return.
    """

    tenant = name or os.getenv("TENANT_NAME") or os.getenv("CLIENT_NAME")
    schema = os.getenv("TENANT_SCHEMA")
    if schema:
        return schema
    if tenant:
        if tenant.lower().endswith("_schema"):
            return tenant
        return f"{tenant}_schema"
    return None
