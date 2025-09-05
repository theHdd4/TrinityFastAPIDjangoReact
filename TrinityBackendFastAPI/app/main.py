# from fastapi import FastAPI
# from app.api.router import api_router

# app = FastAPI()

# app.include_router(api_router)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.router import api_router, text_router
import os
from DataStorageRetrieval.arrow_client import load_env_from_redis

app = FastAPI()

origins = os.getenv("FASTAPI_CORS_ORIGINS")
if origins:
    allowed_origins = [o.strip() for o in origins.split(",") if o.strip()]
    cors_params = {"allow_origins": allowed_origins}
else:
    # No origins configured – allow all origins via regex so credentials work.
    cors_params = {"allow_origin_regex": ".*"}

# Allow requests from configured frontend hosts or fall back to all origins.
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    **cors_params,
)

app.include_router(api_router, prefix="/api")

# Include the text router under /api/text
app.include_router(text_router, prefix="/api/t")


@app.on_event("startup")
async def log_env():
    # Load environment variables from Redis so CLIENT_NAME/APP_NAME/PROJECT_NAME
    # are available when the service starts.
    load_env_from_redis()
    from DataStorageRetrieval.arrow_client import get_minio_prefix
    prefix = get_minio_prefix()
    print(
        "🚀 env CLIENT_NAME=%s APP_NAME=%s PROJECT_NAME=%s PREFIX=%s"
        % (
            os.getenv("CLIENT_NAME"),
            os.getenv("APP_NAME"),
            os.getenv("PROJECT_NAME"),
            prefix,
        )
    )
