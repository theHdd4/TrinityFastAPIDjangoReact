import os
import io
from minio import Minio
from minio.error import S3Error
from minio.commonconfig import CopySource

# Default to the development MinIO service if not explicitly configured
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


def get_client() -> Minio:
    """Return the shared MinIO client."""
    return _client


def ensure_bucket() -> bool:
    """Create the configured bucket if missing.

    Returns True if the bucket exists or was created, False if the connection
    failed (e.g. invalid credentials). Any other MinIO errors are re-raised.
    """
    try:
        if not _client.bucket_exists(MINIO_BUCKET):
            _client.make_bucket(MINIO_BUCKET)
        return True
    except S3Error as exc:
        # If credentials are invalid or the server is unreachable just log a
        # warning instead of failing hard. This allows management commands to
        # run without MinIO configured.
        print(f"MinIO connection error: {exc}")
        return False


def create_prefix(prefix: str) -> None:
    """Create an empty folder-like object for the given prefix."""
    if not ensure_bucket():
        return
    if not prefix.endswith("/"):
        prefix += "/"
    try:
        _client.stat_object(MINIO_BUCKET, prefix)
    except S3Error as exc:  # object missing or connection issue
        if getattr(exc, "code", "") == "NoSuchKey":
            try:
                _client.put_object(MINIO_BUCKET, prefix, io.BytesIO(b""), 0)
            except S3Error as exc2:
                print(f"MinIO connection error: {exc2}")
        else:
            print(f"MinIO connection error: {exc}")


def rename_prefix(old_prefix: str, new_prefix: str) -> None:
    """Rename all objects under one prefix to another."""
    if not ensure_bucket():
        return
    if not old_prefix.endswith("/"):
        old_prefix += "/"
    if not new_prefix.endswith("/"):
        new_prefix += "/"
    try:
        objects = list(_client.list_objects(MINIO_BUCKET, prefix=old_prefix, recursive=True))
    except S3Error as exc:
        print(f"MinIO connection error: {exc}")
        return
    if not objects:
        # just create the new prefix and remove old placeholder
        create_prefix(new_prefix)
        try:
            _client.remove_object(MINIO_BUCKET, old_prefix)
        except S3Error:
            pass
        return
    print(f"🔄 Renaming prefix in MinIO: {old_prefix} -> {new_prefix}")
    for obj in objects:
        dest = obj.object_name.replace(old_prefix, new_prefix, 1)
        _client.copy_object(MINIO_BUCKET, dest, CopySource(MINIO_BUCKET, obj.object_name))
        _client.remove_object(MINIO_BUCKET, obj.object_name)
    print(f"✅ Prefix renamed to {new_prefix}")


def rename_project_folder(
    client_slug: str,
    app_slug: str,
    old_project_slug: str,
    new_project_slug: str,
) -> None:
    """Rename a project's folder prefix when the project is renamed."""
    old_prefix = f"{client_slug}/{app_slug}/{old_project_slug}"
    new_prefix = f"{client_slug}/{app_slug}/{new_project_slug}"
    print(
        f"📁 Renaming project folder in MinIO: {old_prefix} -> {new_prefix}"
    )
    rename_prefix(old_prefix, new_prefix)
    print(f"📁 MinIO project folder updated: {new_prefix}")

