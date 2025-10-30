from __future__ import annotations

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
    """Look up the exhibition share link context from Postgres."""

    if asyncpg is None:  # pragma: no cover - asyncpg optional dependency
        return None

    conn = await asyncpg.connect(
        host=POSTGRES_HOST,
        user=POSTGRES_USER,
        password=POSTGRES_PASSWORD,
        database=POSTGRES_DB,
    )
    try:
        row = await conn.fetchrow(
            """
            SELECT client_name, app_name, project_name, expires_at, is_active
            FROM exhibition_share_links
            WHERE token = $1
            LIMIT 1
            """,
            token,
        )
    finally:
        await conn.close()

    if row is None:
        return None

    context = SharedLinkContext(
        client_name=row["client_name"],
        app_name=row["app_name"],
        project_name=row["project_name"],
        expires_at=row["expires_at"],
        is_active=row["is_active"],
    )
    return context
