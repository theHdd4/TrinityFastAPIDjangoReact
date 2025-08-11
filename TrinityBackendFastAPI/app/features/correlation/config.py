from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # MongoDB
    mongo_details: str = "mongodb://localhost:9005"
    # MinIO
    minio_url: str = "localhost:9003"
    minio_access_key: str
    minio_secret_key: str
    minio_secure: bool = False
    # FastAPI
    app_name: str = "Correlation Atom API"
    app_version: str = "1.0.0"
    debug: bool = False
    host: str = "0.0.0.0"
    port: int = 8020

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)

settings = Settings()
