import os
from pathlib import Path
from .connection import POSTGRES_HOST, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB
from .client_project import fetch_client_app_project


async def _schema_from_project(project_id: int) -> str | None:
    """Return tenant schema for a project if resolvable."""
    try:
        client, _, _ = await fetch_client_app_project(None, project_id)
        if client:
            return client.lower()
    except Exception:
        pass
    return None


def _schema_from_object(arrow_object: str) -> str | None:
    """Infer tenant schema from an Arrow object's prefix."""
    try:
        parts = arrow_object.split("/", 1)
        if len(parts) > 1:
            return parts[0].lower()
    except Exception:
        pass
    return None

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
        schema = await _schema_from_project(project_id)
        if schema:
            try:
                await conn.execute(f'SET search_path TO "{schema}", public')
            except Exception:
                pass
        await conn.execute(
            """
            INSERT INTO registry_arrowdataset (
                project_id, atom_id, file_key, arrow_object, flight_path, original_csv, descriptor, created_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
            ON CONFLICT (original_csv) DO UPDATE
              SET file_key    = EXCLUDED.file_key,
                  arrow_object = EXCLUDED.arrow_object,
                  flight_path  = EXCLUDED.flight_path,
                  descriptor   = EXCLUDED.descriptor
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
        schema = _schema_from_object(old_object)
        if schema:
            try:
                await conn.execute(f'SET search_path TO "{schema}", public')
            except Exception:
                pass
        await conn.execute(
            "UPDATE registry_arrowdataset SET arrow_object=$1 WHERE arrow_object=$2",
            new_object,
            old_object,
        )
    finally:
        await conn.close()


async def delete_arrow_dataset(arrow_object: str) -> None:
    """Remove a dataset entry when a file is deleted."""
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
        schema = _schema_from_object(arrow_object)
        if schema:
            try:
                await conn.execute(f'SET search_path TO "{schema}", public')
            except Exception:
                pass
        await conn.execute(
            "DELETE FROM registry_arrowdataset WHERE arrow_object=$1",
            arrow_object,
        )
    finally:
        await conn.close()


async def arrow_dataset_exists(project_id: int, atom_id: str, filename: str) -> bool:
    """Return True if a dataset entry already exists and is present in MinIO and Flight."""
    exists = False
    arrow_object: str | None = None
    flight_path: str | None = None

    if __import__("DataStorageRetrieval.db", fromlist=["db"]).asyncpg is not None:
        try:
            conn = await (__import__("DataStorageRetrieval.db", fromlist=["db"]).asyncpg).connect(
                host=POSTGRES_HOST,
                user=POSTGRES_USER,
                password=POSTGRES_PASSWORD,
                database=POSTGRES_DB,
            )
        except Exception:
            conn = None
        if conn is not None:
            try:
                schema = await _schema_from_project(project_id)
                if schema:
                    try:
                        await conn.execute(f'SET search_path TO "{schema}", public')
                    except Exception:
                        pass
                row = await conn.fetchrow(
                    "SELECT arrow_object, flight_path FROM registry_arrowdataset WHERE project_id=$1 AND atom_id=$2 AND original_csv=$3",
                    project_id,
                    atom_id,
                    filename,
                )
                if row:
                    exists = True
                    arrow_object = row["arrow_object"]
                    flight_path = row["flight_path"]
            finally:
                await conn.close()

    if not exists:
        try:
            from DataStorageRetrieval.flight_registry import get_latest_ticket_for_basename

            path, arrow_name = get_latest_ticket_for_basename(filename)
            if path:
                exists = True
                flight_path = path
                arrow_object = arrow_name
        except Exception:
            pass

    # If we found a matching record ensure the referenced resources still exist
    if exists and not (arrow_object and flight_path):
        exists = False

    if exists and arrow_object:
        try:
            from minio import Minio
            from minio.error import S3Error

            bucket = os.getenv("MINIO_BUCKET", "trinity")
            client = Minio(
                os.getenv("MINIO_ENDPOINT", "minio:9000"),
                access_key=os.getenv("MINIO_ACCESS_KEY", "minio"),
                secret_key=os.getenv("MINIO_SECRET_KEY", "minio123"),
                secure=False,
            )
            client.stat_object(bucket, arrow_object)
        except S3Error as exc:
            if getattr(exc, "code", "") in {"NoSuchKey", "NoSuchBucket"}:
                exists = False
                try:
                    await __import__("DataStorageRetrieval.db", fromlist=["db"]).delete_arrow_dataset(arrow_object)
                finally:
                    try:
                        from DataStorageRetrieval.flight_registry import remove_arrow_object

                        remove_arrow_object(arrow_object)
                    except Exception:
                        pass
            else:  # pragma: no cover - unexpected error
                exists = False
        except Exception:  # pragma: no cover - any other error
            exists = False

    if exists and flight_path:
        try:
            from DataStorageRetrieval.arrow_client import flight_table_exists

            if not flight_table_exists(flight_path):
                exists = False
                if arrow_object:
                    try:
                        await __import__("DataStorageRetrieval.db", fromlist=["db"]).delete_arrow_dataset(arrow_object)
                    finally:
                        try:
                            from DataStorageRetrieval.flight_registry import remove_arrow_object

                            remove_arrow_object(arrow_object)
                        except Exception:
                            pass
        except Exception:  # pragma: no cover - any other error
            exists = False

    return exists


async def get_dataset_info(arrow_object: str):
    """Return dataset info for a stored Arrow object if available."""
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
        schema = _schema_from_object(arrow_object)
        if schema:
            try:
                await conn.execute(f'SET search_path TO "{schema}", public')
            except Exception:
                pass
        row = await conn.fetchrow(
            "SELECT file_key, flight_path, original_csv FROM registry_arrowdataset WHERE arrow_object=$1",
            arrow_object,
        )
        if not row:
            row = await conn.fetchrow(
                "SELECT file_key, flight_path, original_csv FROM registry_arrowdataset WHERE arrow_object=$1",
                Path(arrow_object).name,
            )
        if row:
            return row["file_key"], row["flight_path"], row["original_csv"]
    finally:
        await conn.close()
    return None


