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

    print(
        f"\U0001F50E fetch_client_app_project connecting to Postgres host={POSTGRES_HOST} port={POSTGRES_PORT} db={POSTGRES_DB}"
    )
    conn = await (__import__("DataStorageRetrieval.db", fromlist=["db"]).asyncpg).connect(
        host=POSTGRES_HOST,
        user=POSTGRES_USER,
        password=POSTGRES_PASSWORD,
        database=POSTGRES_DB,
        port=int(POSTGRES_PORT),
    )
    try:
        if user_id:
            query = (
                "SELECT client_name, app_name, project_name "
                "FROM accounts_userenvironmentvariable "
                "WHERE user_id = $1 AND key = 'PROJECT_NAME' "
                "AND project_id LIKE '%' || $2 ORDER BY updated_at DESC LIMIT 1"
            )
            print(
                f"\U0001F4DD {query} (schema=<default>, table=accounts_userenvironmentvariable)"
            )
            row = await conn.fetchrow(query, user_id, str(project_id))
        else:
            query = (
                "SELECT client_name, app_name, project_name "
                "FROM accounts_userenvironmentvariable "
                "WHERE key = 'PROJECT_NAME' AND project_id LIKE '%' || $1 "
                "ORDER BY updated_at DESC LIMIT 1"
            )
            print(
                f"\U0001F4DD {query} (schema=<default>, table=accounts_userenvironmentvariable)"
            )
            row = await conn.fetchrow(query, str(project_id))
        if row:
            return row["client_name"], row["app_name"], row["project_name"]

        query = (
            "SELECT client_name, app_name FROM accounts_userenvironmentvariable "
            "WHERE project_id LIKE '%' || $1 ORDER BY updated_at DESC LIMIT 1"
        )
        print(
            f"\U0001F4DD {query} (schema=<default>, table=accounts_userenvironmentvariable)"
        )
        row = await conn.fetchrow(query, str(project_id))
        if row:
            client_name = row["client_name"]
            app_name = row["app_name"]
        else:
            if user_id:
                query = (
                    "SELECT t.name FROM tenants_tenant t "
                    "JOIN subscriptions_company c ON c.tenant_id = t.id "
                    "JOIN accounts_user u ON u.id = $1 LIMIT 1"
                )
                print(
                    f"\U0001F4DD {query} (schema=<default>, table=tenants_tenant/subscriptions_company/accounts_user)"
                )
                client_name = await conn.fetchval(query, user_id) or "default_client"
            else:
                client_name = "default_client"
            query = (
                "SELECT a.name FROM registry_app a JOIN registry_project p ON p.app_id = a.id WHERE p.id = $1 LIMIT 1"
            )
            print(
                f"\U0001F4DD {query} (schema=<default>, table=registry_app/registry_project)"
            )
            app_name = await conn.fetchval(query, project_id)

        query = "SELECT name FROM registry_project WHERE id = $1"
        print(
            f"\U0001F4DD {query} (schema=<default>, table=registry_project)"
        )
        project_name = await conn.fetchval(query, project_id)

        return client_name, app_name or "default_app", project_name or "default_project"
    finally:
        await conn.close()

