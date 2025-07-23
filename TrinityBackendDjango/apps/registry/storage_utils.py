import os
import io
from minio import Minio
from minio.error import S3Error
from minio.commonconfig import CopySource
from pathlib import Path
import sys
import asyncio
from .models import ArrowDataset, Project
from django.db import connection
from asgiref.sync import async_to_sync

# Ensure FastAPI utilities are importable for DB helpers
FASTAPI_APP = Path(__file__).resolve().parents[3] / "TrinityBackendFastAPI" / "app"
if str(FASTAPI_APP) not in sys.path:
    sys.path.append(str(FASTAPI_APP))
try:
    from DataStorageRetrieval.db import fetch_client_app_project
except Exception:  # pragma: no cover - helper not available
    fetch_client_app_project = None

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minio")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minio123")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "trinity")

_client = Minio(
    MINIO_ENDPOINT,
    access_key=MINIO_ACCESS_KEY,
    secret_key=MINIO_SECRET_KEY,
    secure=False,
)


def ensure_bucket() -> None:
    """Create the bucket if it does not exist."""
    try:
        if not _client.bucket_exists(MINIO_BUCKET):
            _client.make_bucket(MINIO_BUCKET)
    except Exception:
        pass


def ensure_prefix(prefix: str) -> None:
    """Create an empty object to ensure the prefix exists."""
    ensure_bucket()
    key = prefix.rstrip("/") + "/.keep"
    try:
        _client.put_object(MINIO_BUCKET, key, io.BytesIO(b""), length=0)
    except S3Error:
        pass

def project_prefix(user_id: int, project_id: int) -> str:
    """Return storage prefix for the given user and project using the ORM."""
    client = os.getenv("CLIENT_NAME", "default_client")
    app = os.getenv("APP_NAME", "default_app")
    project = os.getenv("PROJECT_NAME", "default_project")

    try:
        proj = (
            Project.objects.select_related("owner", "app")
            .only("slug", "owner__username", "app__slug")
            .get(id=project_id, owner_id=user_id)
        )
        tenant = getattr(connection, "tenant", None)
        if tenant is not None:
            client = getattr(tenant, "name", None) or tenant.schema_name or client
        else:
            client = proj.owner.username or client
        app = proj.app.slug or app
        project = proj.slug or project
    except Exception:
        if fetch_client_app_project is not None:
            try:
                client, app, project = async_to_sync(fetch_client_app_project)(
                    user_id, project_id
                )
            except Exception:
                pass

    return f"{client}/{app}/{project}/"

def rename_prefix(old_prefix: str, new_prefix: str) -> None:
    """Rename all objects under ``old_prefix`` to ``new_prefix``."""
    ensure_prefix(new_prefix)
    for obj in _client.list_objects(MINIO_BUCKET, prefix=old_prefix, recursive=True):
        new_name = new_prefix + obj.object_name[len(old_prefix):]
        _client.copy_object(MINIO_BUCKET, new_name, CopySource(MINIO_BUCKET, obj.object_name))
        try:
            _client.remove_object(MINIO_BUCKET, obj.object_name)
        except S3Error:
            pass
        ArrowDataset.objects.filter(arrow_object=obj.object_name).update(arrow_object=new_name)

def delete_prefix(prefix: str) -> None:
    """Delete all objects under ``prefix`` and remove DB entries."""
    for obj in _client.list_objects(MINIO_BUCKET, prefix=prefix, recursive=True):
        try:
            _client.remove_object(MINIO_BUCKET, obj.object_name)
        except S3Error:
            pass
        ArrowDataset.objects.filter(arrow_object=obj.object_name).delete()
