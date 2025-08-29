import os
import pandas as pd
import io
from minio import Minio
import redis
from io import BytesIO
from app.DataStorageRetrieval.arrow_client import download_dataframe

# MinIO config
# Default to the development MinIO service if not explicitly configured
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "admin_dev")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "pass_dev")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "trinity")
MINIO_SECURE = os.getenv("MINIO_SECURE", "false").lower() == "true"

USER_ID = int(os.getenv("USER_ID", "0"))
PROJECT_ID = int(os.getenv("PROJECT_ID", "0"))
CLIENT_NAME = os.getenv("CLIENT_NAME", "default_client")
APP_NAME = os.getenv("APP_NAME", "default_app")
PROJECT_NAME = os.getenv("PROJECT_NAME", "default_project")

# Redis config
REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=False)

OBJECT_PREFIX = f"{CLIENT_NAME}/{APP_NAME}/{PROJECT_NAME}/"

minio_client = Minio(
    MINIO_ENDPOINT,
    access_key=MINIO_ACCESS_KEY,
    secret_key=MINIO_SECRET_KEY,
    secure=MINIO_SECURE
)

def resolve_file_path(file_key: str) -> str:
    """
    Robustly resolve file path using the same system as data_upload_validate.
    Always gets the current dynamic path for consistency.
    """
    if not file_key:
        return ""
    
    try:
        # Import the dynamic path function from data_upload_validate
        from ..data_upload_validate.app.routes import get_object_prefix
        import asyncio
        
        # Get the current dynamic path (this is what data_upload_validate uses)
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            current_prefix = loop.run_until_complete(get_object_prefix())
        finally:
            loop.close()
        
        # If it's already a full path, check if it matches current prefix
        if "/" in file_key:
            if file_key.startswith(current_prefix):
                return file_key  # Already has correct prefix
            else:
                # Extract filename and use current prefix
                filename = file_key.split("/")[-1]
                return f"{current_prefix}{filename}"
        
        # If it's just a filename, add the current prefix
        return f"{current_prefix}{file_key}"
        
    except Exception as e:
        print(f"⚠️ Failed to get dynamic path, using fallback: {e}")
        # Fallback to static prefix if dynamic path fails
        if "/" in file_key:
            if file_key.startswith(OBJECT_PREFIX):
                return file_key
            else:
                filename = file_key.split("/")[-1]
                return f"{OBJECT_PREFIX}{filename}"
        return f"{OBJECT_PREFIX}{file_key}"

def get_minio_df(bucket: str, file_key: str) -> pd.DataFrame:
    """
    Try to load a dataframe using Arrow Flight first, then fallback to MinIO.
    Now handles both filenames and full paths robustly.
    """
    # Resolve the file path robustly
    resolved_path = resolve_file_path(file_key)
    filename_only = file_key.split("/")[-1] if "/" in file_key else file_key
    
    # Try Arrow Flight first
    try:
        # For Arrow Flight, we need just the filename without extension
        flight_path = filename_only.replace('.arrow', '').replace('.csv', '').replace('.xlsx', '')
        df = download_dataframe(flight_path)
        print(f"✅ Loaded {filename_only} from Arrow Flight")
        return df
    except Exception as e:
        print(f"⚠️ Arrow Flight download failed for {filename_only}: {e}, falling back to MinIO.")
        
        # Fallback to MinIO using the resolved path
        try:
            response = minio_client.get_object(bucket, resolved_path)
            content = response.read()
            
            if filename_only.endswith(".csv"):
                df = pd.read_csv(BytesIO(content))
            elif filename_only.endswith(".xlsx"):
                df = pd.read_excel(BytesIO(content))
            elif filename_only.endswith(".arrow"):
                import pyarrow as pa
                import pyarrow.ipc as ipc
                reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
                df = reader.read_all().to_pandas()
            else:
                raise ValueError("Unsupported file type")
            
            print(f"✅ Loaded {filename_only} from MinIO fallback using path: {resolved_path}")
            return df
            
        except Exception as minio_error:
            print(f"❌ MinIO fallback also failed for {filename_only}: {minio_error}")
            print(f"   Tried path: {resolved_path}")
            raise minio_error

def get_minio_content_with_flight_fallback(bucket: str, object_name: str) -> bytes:
    """
    Try to get content using Arrow Flight first, then fallback to MinIO.
    Now handles both filenames and full paths robustly.
    Returns the content as bytes for further processing.
    """
    # Resolve the file path robustly
    resolved_path = resolve_file_path(object_name)
    filename_only = object_name.split("/")[-1] if "/" in object_name else object_name
    
    # Try Arrow Flight first
    try:
        # For Arrow Flight, we need just the filename without extension
        flight_path = filename_only.replace('.arrow', '').replace('.csv', '').replace('.xlsx', '')
        df = download_dataframe(flight_path)
        print(f"✅ Loaded {filename_only} from Arrow Flight")
        # Convert DataFrame to Arrow format and return as bytes
        import pyarrow as pa
        import pyarrow.ipc as ipc
        arrow_buffer = pa.BufferOutputStream()
        table = pa.Table.from_pandas(df)
        with ipc.new_file(arrow_buffer, table.schema) as writer:
            writer.write_table(table)
        return arrow_buffer.getvalue().to_pybytes()
    except Exception as e:
        print(f"⚠️ Arrow Flight download failed for {filename_only}: {e}, falling back to MinIO.")
        
        # Fallback to MinIO using the resolved path
        try:
            response = minio_client.get_object(bucket, resolved_path)
            content = response.read()
            print(f"✅ Loaded {filename_only} from MinIO fallback using path: {resolved_path}")
            return content
        except Exception as minio_error:
            print(f"❌ MinIO fallback also failed for {filename_only}: {minio_error}")
            print(f"   Tried path: {resolved_path}")
            raise minio_error

__all__ = [
    'minio_client',
    'get_minio_df',
    'get_minio_content_with_flight_fallback',
    'resolve_file_path',
    'OBJECT_PREFIX',
    'MINIO_BUCKET',
    'redis_client',
]

