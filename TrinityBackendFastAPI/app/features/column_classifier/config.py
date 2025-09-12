# config.py - Data Classification API Configuration (FIXED)
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache
from typing import Optional

class Settings(BaseSettings):
    """Data Classification API Settings - MongoDB Focused"""
    
    # =============================================================================
    # APPLICATION SETTINGS
    # =============================================================================
    app_name: str = "Data Classification API"
    app_version: str = "1.0.0"
    environment: str = "development"
    debug: bool = True
    
    # =============================================================================
    # API SETTINGS
    # =============================================================================
    api_host: str = "0.0.0.0"
    api_port: int = 8001
    api_reload: bool = True
    
    # =============================================================================
    # MONGODB SETTINGS
    # =============================================================================
    mongo_uri: str = "mongodb://admin_dev:pass_dev@10.2.1.65:9005/?authSource=admin"
    
    # Main database for classification data
    classification_database: str = "validator_atoms_db"  # ✅ FIXED: Added missing 'd'
    
    # ✅ COLLECTIONS ARE CORRECT
    validator_atoms_collection: str = "validator_atoms"
    column_classifications_collection: str = "column_classifications"
    business_dimensions_collection: str = "business_dimensions_with_assignments"
    classifier_configs_collection: str = "column_classifier_configs"
    # Database used for classifier config documents
    classifier_configs_database: str = "trinity_db"
    
    # =============================================================================
    # CLASSIFICATION SETTINGS
    # =============================================================================
    confidence_threshold: float = 0.75
    max_categories: int = 10
    enable_preprocessing: bool = True
    enable_caching: bool = True
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
        env_prefix="CLASSIFY_",
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

def get_classification_db():
    """Get classification database instance"""
    client = get_mongo_client()
    return client[settings.classification_database]
