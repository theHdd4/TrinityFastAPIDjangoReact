# app/config.py

from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Optional

class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Database Configuration
    mongo_details: str
    database_name: str
    collection_name: str
    
    # MinIO Configuration
    minio_url: str
    minio_access_key: str
    minio_secret_key: str
    minio_bucket_name: str
    # Use model results as the source for evaluation
    minio_source_bucket_name: str = "model_results"
    minio_secure: bool = False
    
    # Application Configuration
    app_name: str = "Evaluate Atom API"
    app_version: str = "1.0.0"
    debug: bool = False
    host: str = "127.0.0.1"
    port: int = 8025
    
    # API Configuration
    api_prefix: str = "/api/v1"
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False

@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()

# Global settings instance
settings = get_settings()
