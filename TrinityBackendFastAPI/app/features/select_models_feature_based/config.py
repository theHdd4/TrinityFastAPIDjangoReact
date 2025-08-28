# app/config.py

from functools import lru_cache
from typing import Optional
import os

from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Database Configuration
    mongo_details: Optional[str] = None
    database_name: Optional[str] = None
    collection_name: Optional[str] = None

    # MinIO Configuration
    minio_url: Optional[str] = None
    minio_access_key: Optional[str] = None
    minio_secret_key: Optional[str] = None
    minio_bucket_name: Optional[str] = None
    minio_source_bucket_name: str = "dataformodel"  # Add this line - new bucket for source data
    minio_secure: bool = False
    
    # Application Configuration
    app_name: str = "Scope Selection API"
    app_version: str = "1.0.0"
    debug: bool = os.getenv("DEBUG", "false").lower() == "true"
    host: str = os.getenv("HOST", "127.0.0.1")
    port: int = int(os.getenv("PORT", "8012"))
    
    # API Configuration
    api_prefix: str = "/api/v1"

    # Pydantic v2 settings configuration
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()

# Global settings instance
settings = get_settings()
