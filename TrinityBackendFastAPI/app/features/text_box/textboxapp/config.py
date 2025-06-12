# from pydantic_settings import BaseSettings
# from pydantic import Field

# class Settings(BaseSettings):
#     mongo_uri: str = Field(..., alias="MONGO_URI")
#     mongo_db: str = Field(..., alias="MONGO_DB")

#     class Config:
#         env_file = ".env"
#         env_file_encoding = "utf-8"
#         validate_by_name = True

# settings = Settings()
