from __future__ import annotations

import os
from .connection import (
    asyncpg,
    POSTGRES_HOST,
    POSTGRES_USER,
    POSTGRES_PASSWORD,
    POSTGRES_DB,
)

_CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS registry_environment (
    client_name TEXT,
    client_id TEXT,
    app_name TEXT,
    app_id TEXT,
    project_name TEXT,
    project_id TEXT,
    user_id TEXT,
    identifiers JSONB,
    measures JSONB,
    dimensions JSONB,
    updated_at TIMESTAMP,
    PRIMARY KEY (client_name, app_name, project_name)
)
"""

async def _connect(schema: str | None = None):
    if asyncpg is None:
        return None
    try:
        settings = None
        if schema:
            settings = {"search_path": schema}
        return await asyncpg.connect(
            host=POSTGRES_HOST,
            user=POSTGRES_USER,
            password=POSTGRES_PASSWORD,
            database=POSTGRES_DB,
            server_settings=settings,
        )
    except Exception:
        return None


async def _ensure_table(conn) -> None:
    if conn is None:
        return
    try:
        await conn.execute(_CREATE_TABLE_SQL)
    except Exception:
        pass


async def init_environment_registry(schema: str | None = None) -> None:
    """Ensure the registry_environment table exists."""
    conn = await _connect(schema)
    if conn is None:
        return
    try:
        await _ensure_table(conn)
    finally:
        await conn.close()

async def fetch_environment_names(schema: str) -> tuple[str, str, str] | None:
    """Return the latest client/app/project names for a tenant schema."""
    conn = await _connect(schema)
    if conn is None:
        return None
    try:
        await _ensure_table(conn)
        row = await conn.fetchrow(
            "SELECT client_name, app_name, project_name"
            " FROM registry_environment"
            " ORDER BY updated_at DESC LIMIT 1"
        )
        if row:
            return row["client_name"], row["app_name"], row["project_name"]
    finally:
        await conn.close()
    return None

async def upsert_environment(
    client_name: str,
    app_name: str,
    project_name: str,
    identifiers: list[str] | None = None,
    measures: list[str] | None = None,
    dimensions: dict | None = None,
    *,
    client_id: str = "",
    app_id: str = "",
    project_id: str = "",
    user_id: str = "",
    schema: str | None = None,
) -> None:
    """Insert or update an environment record in Postgres."""
    conn = await _connect(schema or client_name)
    if conn is None:
        return
    identifiers = identifiers or []
    measures = measures or []
    dimensions = dimensions or {}
    try:
        await _ensure_table(conn)
        await conn.execute(
            """
            INSERT INTO registry_environment
                (client_name, client_id, app_name, app_id, project_name, project_id, user_id, identifiers, measures, dimensions, updated_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
            ON CONFLICT (client_name, app_name, project_name) DO UPDATE
              SET client_id=EXCLUDED.client_id,
                  app_id=EXCLUDED.app_id,
                  project_id=EXCLUDED.project_id,
                  user_id=EXCLUDED.user_id,
                  identifiers=EXCLUDED.identifiers,
                  measures=EXCLUDED.measures,
                  dimensions=EXCLUDED.dimensions,
                  updated_at=EXCLUDED.updated_at
            """,
            client_name,
            client_id,
            app_name,
            app_id,
            project_name,
            project_id,
            user_id,
            (__import__("DataStorageRetrieval.db", fromlist=["db"]).asyncpg).Json(identifiers),
            (__import__("DataStorageRetrieval.db", fromlist=["db"]).asyncpg).Json(measures),
            (__import__("DataStorageRetrieval.db", fromlist=["db"]).asyncpg).Json(dimensions),
        )
    finally:
        await conn.close()

async def fetch_environment(
    client_name: str,
    app_name: str,
    project_name: str,
    *,
    schema: str | None = None,
) -> dict | None:
    """Retrieve identifiers, measures and dimensions for a project."""
    conn = await _connect(schema or client_name)
    if conn is None:
        return None
    try:
        await _ensure_table(conn)
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


async def delete_environment(
    client_name: str,
    app_name: str,
    project_name: str,
    *,
    schema: str | None = None,
) -> None:
    """Remove an environment record."""
    conn = await _connect(schema or client_name)
    if conn is None:
        return
    try:
        await _ensure_table(conn)
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
    new_project_id: str = "",
    *,
    schema: str | None = None,
) -> None:
    """Rename a project entry."""
    conn = await _connect(schema or client_name)
    if conn is None:
        return
    try:
        await _ensure_table(conn)
        await conn.execute(
            """
            UPDATE registry_environment
            SET project_name=$4,
                project_id=$5,
                updated_at=NOW()
            WHERE client_name=$1 AND app_name=$2 AND project_name=$3
            """,
            client_name,
            app_name,
            old_project_name,
            new_project_name,
            new_project_id,
        )
    finally:
        await conn.close()
