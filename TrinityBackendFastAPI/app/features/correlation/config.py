from dotenv import load_dotenv
load_dotenv(override=True)

from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    MONGO_URI: str
    MONGO_DB: Optional[str] = None
    
    # MinIO settings
    minio_url: str = "localhost:9003"
    minio_access_key: str = "minio"
    minio_secret_key: str = "minio123"
    minio_secure: bool = False

    class Config:
        env_file = ".env"
        extra = "ignore"  # Ignore extra environment variables
        
    @property
    def database_name(self) -> str:
        """Extract database name from MONGO_URI if MONGO_DB is not set"""
        if self.MONGO_DB:
            return self.MONGO_DB
            
        # Extract from URI like "mongodb://user:pass@host:port/dbname?options"
        try:
            from urllib.parse import urlparse
            parsed = urlparse(self.MONGO_URI)
            if parsed.path and len(parsed.path) > 1:
                db_name = parsed.path[1:].split('?')[0]  # Remove leading '/' and query params
                if db_name:
                    return db_name
        except Exception:
            pass
            
        # Fallback default
        return "trinity_dev"

settings = Settings()
print("MONGO_URI:", settings.MONGO_URI)
print("Database name:", settings.database_name)