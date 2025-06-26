import os
import asyncpg

POSTGRES_HOST = os.getenv("POSTGRES_HOST", "postgres")
POSTGRES_DB = os.getenv("POSTGRES_DB", "trinity_db")
POSTGRES_USER = os.getenv("POSTGRES_USER", "trinity_user")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "trinity_pass")

async def fetch_client_app_project(user_id: int, project_id: int):
    """Fetch client, app and project names from Postgres."""
    conn = await asyncpg.connect(
        host=POSTGRES_HOST,
        user=POSTGRES_USER,
        password=POSTGRES_PASSWORD,
        database=POSTGRES_DB,
    )
    try:
        client_name = await conn.fetchval(
            """
            SELECT t.name
            FROM tenants_tenant t
            JOIN subscriptions_company c ON c.tenant_id = t.id
            JOIN accounts_user u ON u.id = $1
            LIMIT 1
            """,
            user_id,
        )
        if not client_name:
            client_name = "default_client"

        app_name = await conn.fetchval(
            """
            SELECT a.name
            FROM registry_app a
            JOIN registry_project p ON p.app_id = a.id
            WHERE p.id = $1
            LIMIT 1
            """,
            project_id,
        )

        project_name = await conn.fetchval(
            "SELECT name FROM registry_project WHERE id = $1",
            project_id,
        )

        return client_name, app_name or "default_app", project_name or "default_project"
    finally:
        await conn.close()
