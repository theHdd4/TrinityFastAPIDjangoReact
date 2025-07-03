import os

try:
    import asyncpg  # type: ignore
except ModuleNotFoundError:  # pragma: no cover - optional dependency
    asyncpg = None

POSTGRES_HOST = os.getenv("POSTGRES_HOST", "postgres")
POSTGRES_DB = os.getenv("POSTGRES_DB", "trinity_db")
POSTGRES_USER = os.getenv("POSTGRES_USER", "trinity_user")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "trinity_pass")

async def fetch_client_app_project(user_id: int, project_id: int):
    """Fetch client, app and project names from Postgres.

    If ``asyncpg`` is not installed the function falls back to the environment
    variables ``CLIENT_NAME``, ``APP_NAME`` and ``PROJECT_NAME`` instead of
    querying the database.
    """
    if asyncpg is None:
        return (
            os.getenv("CLIENT_NAME", "default_client"),
            os.getenv("APP_NAME", "default_app"),
            os.getenv("PROJECT_NAME", "default_project"),
        )

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

async def record_arrow_dataset(
    project_id: int,
    atom_id: str,
    file_key: str,
    arrow_object: str,
    flight_path: str,
    original_csv: str,
    descriptor: str | None = None,
) -> None:
    """Insert a saved dataset entry into Postgres if asyncpg is available."""
    if asyncpg is None:
        return
    try:
        conn = await asyncpg.connect(
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
            INSERT INTO registry_arrowdataset (project_id, atom_id, file_key, arrow_object, flight_path, original_csv, descriptor, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
            """,
            project_id,
            atom_id,
            file_key,
            arrow_object,
            flight_path,
            original_csv,
            descriptor or "",
        )
    finally:
        await conn.close()

async def rename_arrow_dataset(old_object: str, new_object: str) -> None:
    """Update arrow_object for saved datasets when a file is renamed."""
    if old_object == new_object:
        return
    if asyncpg is None:
        return
    try:
        conn = await asyncpg.connect(
            host=POSTGRES_HOST,
            user=POSTGRES_USER,
            password=POSTGRES_PASSWORD,
            database=POSTGRES_DB,
        )
    except Exception:
        return
    try:
        await conn.execute(
            "UPDATE registry_arrowdataset SET arrow_object=$1 WHERE arrow_object=$2",
            new_object,
            old_object,
        )
    finally:
        await conn.close()


async def delete_arrow_dataset(arrow_object: str) -> None:
    """Remove a dataset entry when a file is deleted."""
    if asyncpg is None:
        return
    try:
        conn = await asyncpg.connect(
            host=POSTGRES_HOST,
            user=POSTGRES_USER,
            password=POSTGRES_PASSWORD,
            database=POSTGRES_DB,
        )
    except Exception:
        return
    try:
        await conn.execute(
            "DELETE FROM registry_arrowdataset WHERE arrow_object=$1",
            arrow_object,
        )
    finally:
        await conn.close()

