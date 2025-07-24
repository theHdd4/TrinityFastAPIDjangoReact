import os
from .connection import POSTGRES_HOST, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB

async def fetch_client_app_project(user_id: int | None, project_id: int):
    """Fetch client, app and project names from Postgres.

    The function looks up values stored in ``user_environment_variables`` if
    available. If ``asyncpg`` is not installed it falls back to environment
    variables.
    """
    if __import__("DataStorageRetrieval.db", fromlist=["db"]).asyncpg is None:
        return (
            os.getenv("CLIENT_NAME", "default_client"),
            os.getenv("APP_NAME", "default_app"),
            os.getenv("PROJECT_NAME", "default_project"),
        )

    conn = await (__import__("DataStorageRetrieval.db", fromlist=["db"]).asyncpg).connect(
        host=POSTGRES_HOST,
        user=POSTGRES_USER,
        password=POSTGRES_PASSWORD,
        database=POSTGRES_DB,
    )
    try:
        if user_id:
            row = await conn.fetchrow(
                """
                SELECT client_name, app_name, project_name
                FROM accounts_userenvironmentvariable
                WHERE user_id = $1 AND key = 'PROJECT_NAME'
                  AND project_id LIKE '%' || $2
                ORDER BY updated_at DESC
                LIMIT 1
                """,
                user_id,
                str(project_id),
            )
        else:
            row = await conn.fetchrow(
                """
                SELECT client_name, app_name, project_name
                FROM accounts_userenvironmentvariable
                WHERE key = 'PROJECT_NAME' AND project_id LIKE '%' || $1
                ORDER BY updated_at DESC
                LIMIT 1
                """,
                str(project_id),
            )
        if row:
            return row["client_name"], row["app_name"], row["project_name"]

        row = await conn.fetchrow(
            """
            SELECT client_name, app_name
            FROM accounts_userenvironmentvariable
            WHERE project_id LIKE '%' || $1
            ORDER BY updated_at DESC
            LIMIT 1
            """,
            str(project_id),
        )
        if row:
            client_name = row["client_name"]
            app_name = row["app_name"]
        else:
            if user_id:
                client_name = await conn.fetchval(
                    """
                    SELECT t.name
                    FROM tenants_tenant t
                    JOIN subscriptions_company c ON c.tenant_id = t.id
                    JOIN accounts_user u ON u.id = $1
                    LIMIT 1
                    """,
                    user_id,
                ) or "default_client"
            else:
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

