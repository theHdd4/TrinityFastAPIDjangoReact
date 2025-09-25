from dotenv import load_dotenv
load_dotenv(override=True)  # ✅ This forces override even if env vars exist

from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    MONGO_URI: str
    MONGO_DB: str

    class Config:
        env_file = ".env"

settings = Settings()
print("MONGO_URI:", settings.MONGO_URI)
print("MONGO_DB:", settings.MONGO_DB)