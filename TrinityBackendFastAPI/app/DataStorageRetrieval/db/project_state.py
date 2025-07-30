import json
from .connection import POSTGRES_HOST, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB

async def upsert_project_state(
    client_id: str, app_id: str, project_id: str, state: dict
) -> None:
    """Persist project state JSON in Postgres."""
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
            CREATE TABLE IF NOT EXISTS registry_projectstate (
                project_id TEXT PRIMARY KEY,
                client_id TEXT,
                app_id TEXT,
                state JSONB,
                updated_at TIMESTAMP
            )
            """,
        )
        await conn.execute(
            """
            INSERT INTO registry_projectstate
                (project_id, client_id, app_id, state, updated_at)
            VALUES ($1,$2,$3,$4,NOW())
            ON CONFLICT (project_id) DO UPDATE
              SET client_id=EXCLUDED.client_id,
                  app_id=EXCLUDED.app_id,
                  state=EXCLUDED.state,
                  updated_at=EXCLUDED.updated_at
            """,
            project_id,
            client_id,
            app_id,
            (__import__("DataStorageRetrieval.db", fromlist=["db"]).asyncpg).Json(state),
        )
    finally:
        await conn.close()


async def fetch_project_state(project_id: str) -> dict | None:
    """Load stored project state JSON from Postgres if available."""
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
            "SELECT state FROM registry_projectstate WHERE project_id=$1",
            project_id,
        )
        if row:
            state = row["state"]
            if isinstance(state, str):
                try:
                    return json.loads(state)
                except Exception:
                    return None
            return state
    finally:
        await conn.close()
    return None

