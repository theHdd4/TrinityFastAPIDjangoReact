import os
import io
from pathlib import Path
import pandas as pd
import pyarrow as pa
import pyarrow.ipc as ipc
from minio import Minio
from minio.error import S3Error

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT")
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
    """Return the shared MinIO client instance."""
    return _client


def ensure_minio_bucket() -> bool:
    """Ensure the configured bucket exists."""
    try:
        if not _client.bucket_exists(MINIO_BUCKET):
            _client.make_bucket(MINIO_BUCKET)
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


def save_arrow_table(df: pd.DataFrame, path: Path) -> None:
    """Save a DataFrame to a local Arrow file."""
    table = pa.Table.from_pandas(df)
    path.parent.mkdir(parents=True, exist_ok=True)
    with pa.OSFile(str(path), "wb") as sink:
        with ipc.new_file(sink, table.schema) as writer:
            writer.write_table(table)


def upload_to_minio(file_content_bytes: bytes, filename: str, object_prefix: str) -> dict:
    """Upload bytes to MinIO using the object prefix."""
    try:
        timestamp = pd.Timestamp.now().strftime("%Y%m%d_%H%M%S")
        object_name = f"{object_prefix}{timestamp}_{filename}"
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
