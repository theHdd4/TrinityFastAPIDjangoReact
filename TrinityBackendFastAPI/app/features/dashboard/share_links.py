from __future__ import annotations

import asyncio
import os
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from app.DataStorageRetrieval.db import (
    POSTGRES_DB,
    POSTGRES_HOST,
    POSTGRES_PASSWORD,
    POSTGRES_USER,
    asyncpg,
)

try:  # pragma: no cover - psycopg2 is provided by the Django stack at runtime
    import psycopg2
except ModuleNotFoundError:  # pragma: no cover - fallback when psycopg2 is not available
    psycopg2 = None


_DEFAULT_PUBLIC_SCHEMA = "public"
_schema_name_pattern = re.compile(r"^[a-zA-Z0-9_]+$")
_configured_schema = os.getenv("PUBLIC_SCHEMA_NAME", _DEFAULT_PUBLIC_SCHEMA)
if not _schema_name_pattern.match(_configured_schema):
    _configured_schema = _DEFAULT_PUBLIC_SCHEMA


@dataclass
class SharedLinkContext:
    client_name: str
    app_name: str
    project_name: str
    expires_at: Optional[datetime]
    is_active: bool

    @property
    def is_expired(self) -> bool:
        if self.expires_at is None:
            return False
        reference = self.expires_at
        if reference.tzinfo is None:
            reference = reference.replace(tzinfo=timezone.utc)
        return reference < datetime.now(timezone.utc)

    @property
    def is_valid(self) -> bool:
        return self.is_active and not self.is_expired


async def fetch_shared_link_context(token: str) -> Optional[SharedLinkContext]:
    """Look up the dashboard share link context from Postgres."""

    if asyncpg is not None:  # pragma: no branch - asyncpg preferred path
        try:
            conn = await asyncpg.connect(
                host=POSTGRES_HOST,
                user=POSTGRES_USER,
                password=POSTGRES_PASSWORD,
                database=POSTGRES_DB,
            )
        except Exception:  # pragma: no cover - fall back when asyncpg cannot connect
            conn = None
        else:
            try:
                await _set_search_path(conn)
                row = await conn.fetchrow(
                    """
                    SELECT client_name, app_name, project_name, expires_at, is_active
                    FROM dashboard_share_links
                    WHERE token = $1
                    LIMIT 1
                    """,
                    token,
                )
                if row is not None:
                    await conn.execute(
                        """
                        UPDATE dashboard_share_links
                        SET last_accessed_at = NOW()
                        WHERE token = $1
                        """,
                        token,
                    )
            finally:
                await conn.close()

            if row is not None:
                return SharedLinkContext(
                    client_name=row["client_name"],
                    app_name=row["app_name"],
                    project_name=row["project_name"],
                    expires_at=row["expires_at"],
                    is_active=row["is_active"],
                )

    return await _fetch_shared_link_context_sync(token)


async def _fetch_shared_link_context_sync(token: str) -> Optional[SharedLinkContext]:
    """Fallback lookup that uses psycopg2 in a worker thread when asyncpg is unavailable."""

    if psycopg2 is None:  # pragma: no cover - psycopg2 should be present with Django
        return None

    def _query() -> Optional[tuple[str, str, str, Optional[datetime], bool]]:
        conn = psycopg2.connect(
            host=POSTGRES_HOST,
            user=POSTGRES_USER,
            password=POSTGRES_PASSWORD,
            dbname=POSTGRES_DB,
        )
        try:
            with conn.cursor() as cursor:
                _set_search_path_sync(cursor)
                cursor.execute(
                    """
                    SELECT client_name, app_name, project_name, expires_at, is_active
                    FROM dashboard_share_links
                    WHERE token = %s
                    LIMIT 1
                    """,
                    (token,),
                )
                row = cursor.fetchone()
                if row is not None:
                    cursor.execute(
                        """
                        UPDATE dashboard_share_links
                        SET last_accessed_at = NOW()
                        WHERE token = %s
                        """,
                        (token,),
                    )
                    conn.commit()
                return row
        finally:
            conn.close()

    row = await asyncio.to_thread(_query)
    if row is None:
        return None

    client_name, app_name, project_name, expires_at, is_active = row
    return SharedLinkContext(
        client_name=client_name,
        app_name=app_name,
        project_name=project_name,
        expires_at=expires_at,
        is_active=is_active,
    )


async def _set_search_path(conn: "asyncpg.Connection") -> None:  # type: ignore[name-defined]
    if not _configured_schema:
        return
    if _configured_schema == _DEFAULT_PUBLIC_SCHEMA:
        await conn.execute('SET search_path TO public')
        return
    try:
        await conn.execute(f'SET search_path TO "{_configured_schema}", public')
    except Exception:
        await conn.execute('SET search_path TO public')


def _set_search_path_sync(cursor: "psycopg2.extensions.cursor") -> None:  # type: ignore[name-defined]
    if not _configured_schema:
        return
    if _configured_schema == _DEFAULT_PUBLIC_SCHEMA:
        cursor.execute('SET search_path TO public')
        return
    try:
        cursor.execute(f'SET search_path TO "{_configured_schema}", public')
    except Exception:
        cursor.execute('SET search_path TO public')





