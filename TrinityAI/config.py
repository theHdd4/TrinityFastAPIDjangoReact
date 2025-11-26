"""
Centralized configuration for Trinity AI using Pydantic Settings.
Replaces scattered os.getenv calls with a single, type-safe configuration model.
"""

from typing import Optional
from pydantic import BaseSettings, Field


class Settings(BaseSettings):
    """Centralized settings for Trinity AI service."""
    
    # Service Configuration
    HOST_IP: str = Field(default="127.0.0.1", description="Host IP address")
    API_PORT: int = Field(default=8002, description="API port number")
    AI_PORT: int = Field(default=8002, description="AI service port (alias for API_PORT)")
    FASTAPI_PORT: int = Field(default=8001, description="FastAPI backend port")
    
    # LLM Configuration
    OLLAMA_IP: Optional[str] = Field(default=None, description="Ollama IP address")
    OLLAMA_PORT: str = Field(default="11434", description="Ollama port")
    LLM_API_URL: Optional[str] = Field(default=None, description="Full LLM API URL")
    LLM_MODEL_NAME: str = Field(default="deepseek-r1:32b", description="LLM model name")
    LLM_BEARER_TOKEN: str = Field(default="aakash_api_key", description="LLM bearer token")
    
    # MinIO Configuration
    MINIO_ENDPOINT: str = Field(default="minio:9000", description="MinIO endpoint")
    MINIO_ACCESS_KEY: str = Field(default="minio", description="MinIO access key")
    MINIO_SECRET_KEY: str = Field(default="minio123", description="MinIO secret key")
    MINIO_BUCKET: str = Field(default="trinity", description="MinIO bucket name")
    MINIO_PREFIX: str = Field(default="", description="MinIO object prefix")
    MINIO_SECURE: str = Field(default="false", description="MinIO secure connection")
    
    # Database Configuration
    MONGO_URI: Optional[str] = Field(default=None, description="MongoDB connection URI")
    CLASSIFY_MONGO_URI: Optional[str] = Field(default=None, description="MongoDB URI for classifier")
    MONGO_HOST: Optional[str] = Field(default=None, description="MongoDB host")
    MONGO_PORT: str = Field(default="9005", description="MongoDB port")
    MONGO_AUTH_SOURCE: Optional[str] = Field(default=None, description="MongoDB auth source")
    MONGO_AUTH_DB: Optional[str] = Field(default=None, description="MongoDB auth database")
    CONFIG_DB: str = Field(default="trinity_db", description="Configuration database name")
    CONFIG_COLLECTION: str = Field(
        default="column_classifier_config",
        description="Configuration collection name"
    )
    
    # Redis Configuration
    REDIS_URL: Optional[str] = Field(default=None, description="Redis connection URL")
    REDIS_HOST: str = Field(default="redis", description="Redis host")
    REDIS_PORT: int = Field(default=6379, description="Redis port")
    REDIS_DB: int = Field(default=0, description="Redis database number")
    REDIS_USERNAME: Optional[str] = Field(default=None, description="Redis username")
    REDIS_PASSWORD: Optional[str] = Field(default=None, description="Redis password")
    
    # Backend API Configuration
    VALIDATE_API_URL: str = Field(
        default="http://fastapi:8001",
        description="Data upload validate API URL"
    )
    FASTAPI_BASE_URL: str = Field(
        default="http://fastapi:8001",
        description="FastAPI base URL"
    )
    DATAFRAME_OPERATIONS_API_URL: str = Field(
        default="http://fastapi:8001",
        description="DataFrame operations API URL"
    )
    AI_SERVICE_URL: str = Field(
        default="http://trinity-ai:8002",
        description="Trinity AI service URL"
    )
    DJANGO_BASE_URL: str = Field(
        default="http://web:8000",
        description="Django base URL"
    )
    
    # Client/App/Project Context (runtime, not from env)
    CLIENT_NAME: Optional[str] = Field(default=None, description="Client name (runtime)")
    APP_NAME: Optional[str] = Field(default=None, description="App name (runtime)")
    PROJECT_NAME: Optional[str] = Field(default=None, description="Project name (runtime)")
    USER_ID: Optional[str] = Field(default=None, description="User ID (runtime)")
    PROJECT_ID: Optional[str] = Field(default=None, description="Project ID (runtime)")
    
    # Stream AI Configuration
    STREAM_AI_ATOM_RETRY_ATTEMPTS: int = Field(default=3, description="Atom retry attempts")
    STREAM_AI_ATOM_RETRY_DELAY_SECONDS: float = Field(
        default=2.0,
        description="Atom retry delay in seconds"
    )
    
    # Memory Service Configuration
    TRINITY_AI_MEMORY_PREFIX: str = Field(
        default="trinity_ai_memory",
        description="Memory service prefix"
    )
    TRINITY_AI_MEMORY_BUCKET: Optional[str] = Field(
        default=None,
        description="Memory service bucket"
    )
    TRINITY_AI_MEMORY_MAX_MESSAGES: int = Field(
        default=1000,
        description="Maximum messages in memory"
    )
    TRINITY_AI_MEMORY_MAX_BYTES: int = Field(
        default=10 * 1024 * 1024,
        description="Maximum bytes in memory (10MB)"
    )
    
    # Docker/Environment
    RUNNING_IN_DOCKER: Optional[str] = Field(
        default=None,
        description="Running in Docker flag"
    )
    
    class Config:
        env_file = ".env"
        case_sensitive = True
        env_file_encoding = "utf-8"
    
    def get_llm_config(self) -> dict:
        """Get LLM configuration dictionary."""
        ollama_ip = self.OLLAMA_IP or self.HOST_IP
        api_url = self.LLM_API_URL or f"http://{ollama_ip}:{self.OLLAMA_PORT}/api/chat"
        return {
            "api_url": api_url,
            "model_name": self.LLM_MODEL_NAME,
            "bearer_token": self.LLM_BEARER_TOKEN,
        }
    
    def get_minio_config(self, prefix: Optional[str] = None) -> dict:
        """Get MinIO configuration dictionary."""
        return {
            "endpoint": self.MINIO_ENDPOINT,
            "access_key": self.MINIO_ACCESS_KEY,
            "secret_key": self.MINIO_SECRET_KEY,
            "bucket": self.MINIO_BUCKET,
            "prefix": prefix or self.MINIO_PREFIX,
        }


# Global settings instance
settings = Settings()


