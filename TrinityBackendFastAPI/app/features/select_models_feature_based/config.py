# app/config.py

from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Optional
import os

class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Database Configuration
    mongo_details: str = os.getenv("MONGO_URI", "mongodb://mongo:27017/trinity")
    database_name: str = os.getenv("MONGO_DB_NAME", "trinity")
    collection_name: str = os.getenv("MONGO_COLLECTION_NAME", "scopes")
    
    # MinIO Configuration
    minio_url: str = os.getenv("MINIO_ENDPOINT", "minio:9000")
    minio_access_key: str = os.getenv("MINIO_ACCESS_KEY", "admin_dev")
    minio_secret_key: str = os.getenv("MINIO_SECRET_KEY", "pass_dev")
    minio_bucket_name: str = os.getenv("MINIO_BUCKET", "trinity")
    minio_source_bucket_name: str = os.getenv("MINIO_SOURCE_BUCKET", "dataformodel")  # Add this line - new bucket for source data
    minio_secure: bool = os.getenv("MINIO_USE_SSL", "false").lower() == "true"
    
    # Application Configuration
    app_name: str = "Scope Selection API"
    app_version: str = "1.0.0"
    debug: bool = os.getenv("DEBUG", "false").lower() == "true"
    host: str = os.getenv("HOST", "127.0.0.1")
    port: int = int(os.getenv("PORT", "8012"))
    
    # API Configuration
    api_prefix: str = "/api/v1"
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False
        extra = "ignore"  # Allow extra environment variables to be ignored

@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()

# Global settings instance
settings = get_settings()
