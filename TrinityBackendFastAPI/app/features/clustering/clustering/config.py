from pydantic_settings import BaseSettings, SettingsConfigDict
import os

class Settings(BaseSettings):
    # MongoDB - using the same connection as main app
    mongo_details: str = os.getenv("MONGO_URI", "mongodb://root:rootpass@mongo:27017/trinity_prod?authSource=admin")
    
    # MinIO - using the same connection as main app
    minio_url: str = os.getenv("MINIO_ENDPOINT", "minio:9000")
    minio_access_key: str = os.getenv("MINIO_ACCESS_KEY", "minio")
    minio_secret_key: str = os.getenv("MINIO_SECRET_KEY", "minio123")
    minio_secure: bool = False
    minio_bucket: str = os.getenv("MINIO_BUCKET", "trinity")  # Default bucket name (standardized)
    minio_region: str = os.getenv("MINIO_REGION", "us-east-1")
    
    # FastAPI - clustering runs inside main FastAPI app (no separate port needed)
    app_name: str = "Trinity Clustering API"
    app_version: str = "1.0.0"
    debug: bool = False
    # Note: No separate port needed - clustering runs inside main FastAPI app

    # Allow unrelated environment variables in the shared .env so pydantic
    # does not raise "Extra inputs are not permitted" during import.
    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False,
        extra="ignore",
    )

settings = Settings()
