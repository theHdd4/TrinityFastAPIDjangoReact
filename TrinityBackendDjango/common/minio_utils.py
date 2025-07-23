import os
import io
from minio import Minio
from minio.error import S3Error
from minio.commonconfig import CopySource

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


def ensure_bucket() -> None:
    """Create the configured bucket if missing."""
    if not _client.bucket_exists(MINIO_BUCKET):
        _client.make_bucket(MINIO_BUCKET)


def create_prefix(prefix: str) -> None:
    """Create an empty folder-like object for the given prefix."""
    ensure_bucket()
    if not prefix.endswith("/"):
        prefix += "/"
    try:
        _client.stat_object(MINIO_BUCKET, prefix)
    except S3Error as exc:  # object missing
        if getattr(exc, "code", "") == "NoSuchKey":
            _client.put_object(MINIO_BUCKET, prefix, io.BytesIO(b""), 0)
        else:
            raise


def rename_prefix(old_prefix: str, new_prefix: str) -> None:
    """Rename all objects under one prefix to another."""
    ensure_bucket()
    if not old_prefix.endswith("/"):
        old_prefix += "/"
    if not new_prefix.endswith("/"):
        new_prefix += "/"
    objects = list(_client.list_objects(MINIO_BUCKET, prefix=old_prefix, recursive=True))
    if not objects:
        # just create the new prefix and remove old placeholder
        create_prefix(new_prefix)
        try:
            _client.remove_object(MINIO_BUCKET, old_prefix)
        except S3Error:
            pass
        return
    for obj in objects:
        dest = obj.object_name.replace(old_prefix, new_prefix, 1)
        _client.copy_object(MINIO_BUCKET, dest, CopySource(MINIO_BUCKET, obj.object_name))
        _client.remove_object(MINIO_BUCKET, obj.object_name)
