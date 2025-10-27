# config.py - Molecule API Configuration
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache
from typing import Optional
import os

from app.core.mongo import build_host_mongo_uri

DEFAULT_MONGO_URI = build_host_mongo_uri()

class Settings(BaseSettings):
    """Molecule API Settings - MongoDB Focused"""
    
    # =============================================================================
    # APPLICATION SETTINGS
    # =============================================================================
    app_name: str = "Molecule API"
    app_version: str = "1.0.0"
    environment: str = "development"
    debug: bool = True
    
    # =============================================================================
    # API SETTINGS
    # =============================================================================
    api_host: str = "0.0.0.0"
    api_port: int = 8002
    api_reload: bool = True
    
    # =============================================================================
    # MONGODB SETTINGS
    # =============================================================================
    mongo_uri: str = (
        os.getenv("MOLECULE_MONGO_URI")
        or os.getenv("MONGO_URI")
        or DEFAULT_MONGO_URI
    )
    
    # Main database for molecule data
    molecule_database: str = "trinity_db"
    
    # Collections
    molecules_config_collection: str = "molecules_config"
    
    # =============================================================================
    # MOLECULE SETTINGS
    # =============================================================================
    max_molecules_per_user: int = 100
    enable_molecule_caching: bool = True
    cache_ttl_seconds: int = 3600  # 1 hour
    
    # =============================================================================
    # CORS SETTINGS
    # =============================================================================
    cors_origins: list[str] = ["*"]
    cors_methods: list[str] = ["*"]
    cors_headers: list[str] = ["*"]
    cors_credentials: bool = True
    
    # =============================================================================
    # LOGGING SETTINGS
    # =============================================================================
    log_level: str = "INFO"
    log_format: str = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    enable_request_logging: bool = True
    
    model_config = SettingsConfigDict(
        env_prefix="MOLECULE_",
        case_sensitive=False,
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()

# Global settings instance
settings = get_settings()

# =============================================================================
# DATABASE CONNECTION HELPER
# =============================================================================
def get_mongo_client():
    """Get MongoDB client instance"""
    from pymongo import MongoClient
    return MongoClient(settings.mongo_uri)

def get_molecule_db():
    """Get molecule database instance"""
    client = get_mongo_client()
    return client[settings.molecule_database]
