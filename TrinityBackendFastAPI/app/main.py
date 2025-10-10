from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.router import api_router, text_router
import os
from typing import List
from DataStorageRetrieval.arrow_client import load_env_from_redis


def _default_cors_origins() -> List[str]:
    """Build the default list of CORS origins.

    Combine the historical explicit hosts with dynamic values derived from the
    container's HOST_IP/FRONTEND_PORT and common localhost URLs. This mirrors the
    broader compatibility that existed on ``codex/fix-cors-error-in-api`` while
    keeping prior ``dev`` behaviour.
    """

    host_ip = os.getenv("HOST_IP", "").strip()
    frontend_port = os.getenv("FRONTEND_PORT", "8080").strip() or "8080"

    defaults = [
        "http://10.2.1.173:8080",
        "http://10.2.4.48:8080",
        "http://127.0.0.1:8080",
        "http://10.2.1.207:8080",
        "http://172.22.64.1:8080",
        "http://10.2.3.55:8080",
        "https://trinity.quantmatrixai.com",
        "https://trinity-dev.quantmatrixai.com",
        "http://localhost:8080",
    ]

    if host_ip:
        defaults.extend(
            [
                f"http://{host_ip}:{frontend_port}",
                f"http://{host_ip}:8080",
                f"http://{host_ip}:8081",
                f"https://{host_ip}",
            ]
        )

    defaults.extend(
        [
            f"http://127.0.0.1:{frontend_port}",
            f"http://localhost:{frontend_port}",
        ]
    )

    # Preserve order while removing duplicates and empty entries.
    return [origin for origin in dict.fromkeys(defaults) if origin]


def _load_cors_origins() -> List[str]:
    """Return configured origins or the calculated default list."""

    configured = os.getenv("FASTAPI_CORS_ORIGINS")
    if configured:
        configured = configured.strip()
        if configured == "*":
            return ["*"]
        return [origin.strip() for origin in configured.split(",") if origin.strip()]
    return _default_cors_origins()


app = FastAPI()

allowed_origins = _load_cors_origins()

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
