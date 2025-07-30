# from pydantic_settings import BaseSettings, SettingsConfigDict
# from pydantic import Field


# from dotenv import load_dotenv
# load_dotenv()

# class Settings(BaseSettings):
#     mongo_uri: str = Field(..., alias="MONGO_URI")
#     mongo_db: str = Field(..., alias="MONGO_DB")

#     model_config = SettingsConfigDict(
#         env_file=".env",
#         env_file_encoding="utf-8",
#         validate_default=True,
#     )

# settings = Settings()

# print("MONGO_URI:", settings.mongo_uri)
# print("MONGO_DB:", settings.mongo_db)

# from pydantic_settings import BaseSettings

# class Settings(BaseSettings):
#     MONGO_URI: str
#     MONGO_DB: str

#     class Config:
#         env_file = ".env"

# settings = Settings()
