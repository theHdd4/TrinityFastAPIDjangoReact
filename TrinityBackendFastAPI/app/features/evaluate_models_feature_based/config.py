# app/config.py

from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Optional

class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Database Configuration
    # Follow common atoms: MONGO_URI is the standard var name
    mongo_details: str = "mongodb://root:rootpass@mongo:27017/trinity_db?authSource=admin"
    database_name: str = "trinity_db"
    collection_name: str = "build-model_featurebased_configs"
    
    # MinIO Configuration (align with MINIO_* envs used elsewhere)
    minio_url: str = "minio:9000"
    minio_access_key: str = "admin_dev"
    minio_secret_key: str = "pass_dev"
    minio_bucket_name: str = "trinity"
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
        extra = "ignore"

@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()

# Global settings instance
settings = get_settings()