import os
import io
from pathlib import Path
import pandas as pd
import polars as pl
from minio import Minio, MinioAdmin
from minio.error import S3Error
from minio.credentials import StaticProvider

# Default to the development MinIO service if not explicitly configured
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minio")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minio123")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "trinity")
MINIO_BUCKET_QUOTA = int(
    os.getenv("MINIO_BUCKET_QUOTA", str(10 * 1024**3))
)  # default 10GB to handle >500MB uploads

_client = Minio(
    endpoint=MINIO_ENDPOINT,
    access_key=MINIO_ACCESS_KEY,
    secret_key=MINIO_SECRET_KEY,
    secure=False,
)

_admin_client = MinioAdmin(
    endpoint=MINIO_ENDPOINT,
    credentials=StaticProvider(MINIO_ACCESS_KEY, MINIO_SECRET_KEY),
    secure=False,
)


def get_client() -> Minio:
    """Return the shared MinIO client instance."""
    return _client


def ensure_minio_bucket() -> bool:
    """Ensure the configured bucket exists and has sufficient quota."""
    try:
        if not _client.bucket_exists(MINIO_BUCKET):
            _client.make_bucket(MINIO_BUCKET)
        if MINIO_BUCKET_QUOTA > 0:
            try:
                _admin_client.bucket_quota_set(MINIO_BUCKET, MINIO_BUCKET_QUOTA)
            except Exception as e:
                print(f"⚠️ could not set bucket quota: {e}")
        return True
    except Exception:
        return False


ARROW_DIR = Path("arrow_data")
ARROW_DIR.mkdir(exist_ok=True)


def get_arrow_dir() -> Path:
    """Return the arrow directory for the current client/app/project."""
    client = os.getenv("CLIENT_NAME", "default_client")
    app = os.getenv("APP_NAME", "default_app")
    project = os.getenv("PROJECT_NAME", "default_project")
    dir_path = ARROW_DIR / client / app / project
    dir_path.mkdir(parents=True, exist_ok=True)
    print(
        f"📁 arrow dir {dir_path} (client={client} app={app} project={project})"
    )
    return dir_path


def save_arrow_table(df: pd.DataFrame | pl.DataFrame, path: Path) -> None:
    """Save a DataFrame to a local Arrow file using Polars IPC serialization."""
    if isinstance(df, pd.DataFrame):
        df_pl = pl.from_pandas(df)
    else:
        df_pl = df
    path.parent.mkdir(parents=True, exist_ok=True)
    df_pl.write_ipc(path)


def upload_to_minio(file_content_bytes: bytes, filename: str, object_prefix: str) -> dict:
    """Upload bytes to MinIO using the object prefix."""
    try:
        timestamp = pd.Timestamp.now().strftime("%Y%m%d_%H%M%S")
        object_name = f"{object_prefix}{filename}"
        print(f"⬆️ uploading to minio: {object_name}")
        file_content = io.BytesIO(file_content_bytes)
        file_content.seek(0, os.SEEK_END)
        size = file_content.tell()
        file_content.seek(0)
        result = _client.put_object(
            bucket_name=MINIO_BUCKET,
            object_name=object_name,
            data=file_content,
            length=size,
            content_type="application/octet-stream",
        )
        return {
            "status": "success",
            "bucket": MINIO_BUCKET,
            "object_name": object_name,
            "file_url": f"http://{MINIO_ENDPOINT}/{MINIO_BUCKET}/{object_name}",
            "uploaded_at": timestamp,
            "etag": result.etag,
            "server": MINIO_ENDPOINT,
        }
    except S3Error as e:
        return {"status": "error", "error_message": str(e), "error_type": "minio_s3_error"}
    except Exception as e:
        return {"status": "error", "error_message": str(e), "error_type": "general_upload_error"}
