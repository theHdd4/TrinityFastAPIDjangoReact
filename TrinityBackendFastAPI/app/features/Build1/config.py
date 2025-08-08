from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    """Application settings for Build Atom API."""
    
    # MongoDB Configuration
    mongo_details: str
    database_name: str = "Builddatabase"
    collection_name: str = "simple"
    
    # MinIO Configuration
    minio_url: str
    minio_access_key: str
    minio_secret_key: str
    minio_bucket_name: str = "createddata"  # For future use
    minio_source_bucket: str = "dataformodel"  # For reading source files
    minio_results_bucket: str = "modelresults"
    minio_secure: bool = False
    
    # Application Configuration
    app_name: str = "Build Atom API"
    app_version: str = "1.0.0"
    debug: bool = False
    host: str = "0.0.0.0"
    port: int = 8011
    
    # API Configuration
    api_prefix: str = "/api/v1"
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False

@lru_cache()
def get_settings() -> Settings:
    return Settings()

settings = get_settings()
