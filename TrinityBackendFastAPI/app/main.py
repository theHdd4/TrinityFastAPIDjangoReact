from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.router import api_router, text_router
import os
from DataStorageRetrieval.arrow_client import load_env_from_redis

app = FastAPI()

# Determine allowed origins from environment or defaults. Include the local host
# IP and both Cloudflare tunnel domains so uploads work from local addresses and
# public tunnels.
host_ip = os.getenv("HOST_IP", "127.0.0.1")
frontend_port = os.getenv("FRONTEND_PORT", "8080")
default_origins = [
    f"http://{host_ip}:{frontend_port}",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "https://trinity.quantmatrixai.com",
    "https://trinity-dev.quantmatrixai.com",
]
origins_env = os.getenv("FASTAPI_CORS_ORIGINS")
if origins_env:
    if origins_env.strip() == "*":
        allowed_origins = ["*"]
    else:
        allowed_origins = [o.strip() for o in origins_env.split(",") if o.strip()]
else:
    allowed_origins = default_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")
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
