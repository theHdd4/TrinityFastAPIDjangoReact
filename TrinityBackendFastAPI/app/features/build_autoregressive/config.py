from pydantic_settings import BaseSettings
from pydantic import Field
from functools import lru_cache

class Settings(BaseSettings):
    """Application settings for Autoregressive Atom API."""
    
    # MongoDB Configuration
    mongo_details: str = Field(..., alias="MONGO_URI")
    database_name: str = "autoregressive_db"
    collection_name: str = "autoreg_results"
    
    # MinIO Configuration
    minio_url: str = Field(..., alias="MINIO_ENDPOINT")
    minio_access_key: str
    minio_secret_key: str
    minio_bucket_name: str = "trinity"  # For future use
    minio_source_bucket: str = "trinity"  # For reading source files
    minio_results_bucket: str = "autoreg_results"
    minio_secure: bool = False
    
    # Application Configuration
    app_name: str = "Autoregressive Atom API"
    app_version: str = "1.0.0"
    debug: bool = False
    host: str = "0.0.0.0"
    port: int = 8012

    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False
        extra = "allow"

@lru_cache()
def get_settings() -> Settings:
    return Settings()

settings = get_settings()

