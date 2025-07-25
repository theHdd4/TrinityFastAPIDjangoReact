# config.py - Updated with your actual infrastructure
from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Optional
import os

class Settings(BaseSettings):
    """
    Application settings loaded from environment variables.
    Supports multiple environments (dev, staging, production).
    """
    
    # =============================================================================
    # APPLICATION SETTINGS
    # =============================================================================
    app_name: str = "Scope Selector Atom API"
    app_version: str = "2.0.0"
    environment: str = "development"
    debug: bool = False
    
    # =============================================================================
    # MONGODB SETTINGS
    # =============================================================================
    mongo_uri: str = "mongodb://admin_dev:pass_dev@localhost:9005/?authSource=admin"
    mongo_source_database: str = "validator_atoms_db"
    mongo_scope_database: str = "Scope_selection"
    mongo_column_classifications_collection: str = "column_classifications"
    mongo_scopes_collection: str = "Scopes"
    mongo_processing_jobs_collection: str = "processing_jobs"
    
    # =============================================================================
    # MINIO SETTINGS (Updated with your actual config)
    # =============================================================================
    minio_endpoint: str = "localhost:9003"
    minio_access_key: str = "admin_dev"
    minio_secret_key: str = "pass_dev"
    minio_bucket: str = "dataformodel"  # Updated to match your screenshot
    minio_use_ssl: bool = False
    
    # MinIO bucket structure
    minio_raw_data_prefix: str = "raw-data"
    minio_filtered_data_prefix: str = "filtered-data"
    minio_processed_data_prefix: str = "processed-data"
    
    # =============================================================================
    # REDIS SETTINGS (Updated with your actual config)
    # =============================================================================
    redis_host: str = "10.2.1.65"
    redis_port: int = 9002  # Updated to your specific port
    redis_db: int = 0
    redis_password: Optional[str] = None
    redis_decode_responses: bool = True
    redis_max_connections: int = 20
    
    # Redis cache settings
    redis_default_ttl: int = 3600  # 1 hour in seconds
    redis_stats_ttl: int = 1800    # 30 minutes for stats
    redis_results_ttl: int = 7200  # 2 hours for results
    
    # =============================================================================
    # API SETTINGS
    # =============================================================================
    api_host: str = "0.0.0.0"
    api_port: int = 8003
    api_reload: bool = True
    
    # CORS settings
    cors_origins: list[str] = ["*"]  # Restrict in production
    cors_methods: list[str] = ["*"]
    cors_headers: list[str] = ["*"]
    cors_credentials: bool = True
    
    class Config:
        env_prefix = "SCOPE_"
        case_sensitive = False
        env_file = ".env"
        env_file_encoding = "utf-8"
    
    @property
    def redis_url(self) -> str:
        """Construct Redis URL from components"""
        if self.redis_password:
            return f"redis://:{self.redis_password}@{self.redis_host}:{self.redis_port}/{self.redis_db}"
        return f"redis://{self.redis_host}:{self.redis_port}/{self.redis_db}"
    
    @property
    def minio_secure_url(self) -> str:
        """Get MinIO URL with protocol"""
        protocol = "https" if self.minio_use_ssl else "http"
        return f"{protocol}://{self.minio_endpoint}"
    
    def get_minio_bucket_path(self, prefix: str, *args) -> str:
        """Construct MinIO object path"""
        path_parts = [prefix] + list(args)
        return "/".join(path_parts)

@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()

# Global settings instance
settings = get_settings()
