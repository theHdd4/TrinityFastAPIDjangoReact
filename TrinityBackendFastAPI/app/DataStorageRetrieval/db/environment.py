import os
from .connection import POSTGRES_HOST, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB

async def upsert_environment(
    client_name: str,
    app_name: str,
    project_name: str,
    identifiers: list[str] | None = None,
    measures: list[str] | None = None,
    dimensions: dict | None = None,
) -> None:
    """Insert or update an environment record in Postgres."""
    if __import__("DataStorageRetrieval.db", fromlist=["db"]).asyncpg is None:
        return
    identifiers = identifiers or []
    measures = measures or []
    dimensions = dimensions or {}
    try:
        conn = await (__import__("DataStorageRetrieval.db", fromlist=["db"]).asyncpg).connect(
            host=POSTGRES_HOST,
            user=POSTGRES_USER,
            password=POSTGRES_PASSWORD,
            database=POSTGRES_DB,
        )
    except Exception:
        return
    try:
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS registry_environment (
                client_name TEXT,
                app_name TEXT,
                project_name TEXT,
                identifiers JSONB,
                measures JSONB,
                dimensions JSONB,
                updated_at TIMESTAMP,
                PRIMARY KEY (client_name, app_name, project_name)
            )
            """,
        )
        await conn.execute(
            """
            INSERT INTO registry_environment
                (client_name, app_name, project_name, identifiers, measures, dimensions, updated_at)
            VALUES ($1,$2,$3,$4,$5,$6,NOW())
            ON CONFLICT (client_name, app_name, project_name) DO UPDATE
              SET identifiers=EXCLUDED.identifiers,
                  measures=EXCLUDED.measures,
                  dimensions=EXCLUDED.dimensions,
                  updated_at=EXCLUDED.updated_at
            """,
            client_name,
            app_name,
            project_name,
            (__import__("DataStorageRetrieval.db", fromlist=["db"]).asyncpg).Json(identifiers),
            (__import__("DataStorageRetrieval.db", fromlist=["db"]).asyncpg).Json(measures),
            (__import__("DataStorageRetrieval.db", fromlist=["db"]).asyncpg).Json(dimensions),
        )
    finally:
        await conn.close()

async def fetch_environment(client_name: str, app_name: str, project_name: str) -> dict | None:
    """Retrieve identifiers, measures and dimensions for a project."""
    if __import__("DataStorageRetrieval.db", fromlist=["db"]).asyncpg is None:
        return None
    try:
        conn = await (__import__("DataStorageRetrieval.db", fromlist=["db"]).asyncpg).connect(
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
            SELECT identifiers, measures, dimensions
            FROM registry_environment
            WHERE client_name=$1 AND app_name=$2 AND project_name=$3
            """,
            client_name,
            app_name,
            project_name,
        )
        if row:
            return {
                "identifiers": row["identifiers"] or [],
                "measures": row["measures"] or [],
                "dimensions": row["dimensions"] or {},
            }
    finally:
        await conn.close()
    return None


async def delete_environment(client_name: str, app_name: str, project_name: str) -> None:
    """Remove an environment record."""
    if __import__("DataStorageRetrieval.db", fromlist=["db"]).asyncpg is None:
        return
    try:
        conn = await (__import__("DataStorageRetrieval.db", fromlist=["db"]).asyncpg).connect(
            host=POSTGRES_HOST,
            user=POSTGRES_USER,
            password=POSTGRES_PASSWORD,
            database=POSTGRES_DB,
        )
    except Exception:
        return
    try:
        await conn.execute(
            "DELETE FROM registry_environment WHERE client_name=$1 AND app_name=$2 AND project_name=$3",
            client_name,
            app_name,
            project_name,
        )
    finally:
        await conn.close()


async def rename_environment(
    client_name: str,
    app_name: str,
    old_project_name: str,
    new_project_name: str,
) -> None:
    """Rename a project entry."""
    if __import__("DataStorageRetrieval.db", fromlist=["db"]).asyncpg is None:
        return
    try:
        conn = await (__import__("DataStorageRetrieval.db", fromlist=["db"]).asyncpg).connect(
            host=POSTGRES_HOST,
            user=POSTGRES_USER,
            password=POSTGRES_PASSWORD,
            database=POSTGRES_DB,
        )
    except Exception:
        return
    try:
        await conn.execute(
            """
            UPDATE registry_environment
            SET project_name=$4, updated_at=NOW()
            WHERE client_name=$1 AND app_name=$2 AND project_name=$3
            """,
            client_name,
            app_name,
            old_project_name,
            new_project_name,
        )
    finally:
        await conn.close()
