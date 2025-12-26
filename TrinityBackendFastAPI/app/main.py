import logging
import os
import socket
import traceback
from typing import Iterable, List, Optional

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.router import api_router, text_router
from DataStorageRetrieval.arrow_client import load_env_from_redis


def _iter_host_variants(hosts: Iterable[str], ports: Iterable[str]) -> Iterable[str]:
    """Yield HTTP/HTTPS origin variants for the provided hosts."""

    for host in hosts:
        host = host.strip()
        if not host:
            continue

        yielded = set()
        for port in ports:
            origin = f"http://{host}:{port}"
            if origin not in yielded:
                yielded.add(origin)
                yield origin

        https_origin = f"https://{host}"
        if https_origin not in yielded:
            yielded.add(https_origin)
            yield https_origin


def _detect_runtime_hosts() -> List[str]:
    """Best-effort detection of container/network IPs for CORS rules."""

    hosts: List[str] = []

    try:
        hostname = socket.gethostname()
        _, _, host_ips = socket.gethostbyname_ex(hostname)
        for ip in host_ips:
            if ip and ip not in hosts:
                hosts.append(ip)
    except OSError:
        # ``socket.gethostbyname_ex`` can fail in minimal container setups.
        pass

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            # Connecting without sending packets allows us to inspect the
            # outbound interface IP address used for default routing.
            sock.connect(("8.8.8.8", 80))
            ip = sock.getsockname()[0]
            if ip and ip not in hosts:
                hosts.append(ip)
    except OSError:
        # Fall back gracefully when network access is unavailable.
        pass

    return hosts


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
        "http://10.2.1.210:8080",
        "http://10.113.238.220:8080",
        "http://10.2.4.48:8080",
        "http://127.0.0.1:8080",
        "http://10.2.1.207:8080",
        "http://172.22.64.1:8080",
        "http://192.168.31.63:8080",
        "https://trinity.quantmatrixai.com",
        "https://trinity-dev.quantmatrixai.com",
        "http://localhost:8080",
    ]

    ports = [frontend_port, "8080", "8081"]

    if host_ip:
        defaults.extend(_iter_host_variants([host_ip], ports))

    defaults.extend(_iter_host_variants(_detect_runtime_hosts(), ports))

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


def _load_cors_origin_regex(origins: List[str]) -> Optional[str]:
    """Return a regex that keeps :8080/:8081 origins CORS friendly when required."""

    configured = os.getenv("FASTAPI_CORS_ORIGIN_REGEX")
    if configured:
        configured = configured.strip()
        if configured:
            return configured

    # Allow opting-out by explicitly disabling the helper via the environment.
    opt_out = os.getenv("FASTAPI_ALLOW_PORT_808X", "true").strip().lower()
    if opt_out in {"0", "false", "no"}:
        return None

    # When credentials are allowed FastAPI requires explicit origins.  The regex
    # keeps browsers on :8080/:8081 working even when the exact host/IP changes
    # (for example when docker-compose injects a different HOST_IP).
    if origins == ["*"]:
        return None

    return r"https?://[^/]+:(8080|8081)$"


app = FastAPI()

allowed_origins = _load_cors_origins()
allowed_origin_regex = _load_cors_origin_regex(allowed_origins)

logger = logging.getLogger("uvicorn.error")
logger.info("Configured FastAPI CORS allow_origins=%s", allowed_origins)
if allowed_origin_regex:
    logger.info("Configured FastAPI CORS allow_origin_regex=%s", allowed_origin_regex)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_origin_regex=allowed_origin_regex,
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Global exception handler that logs unhandled exceptions and returns 
    CORS-friendly error responses with proper headers.
    """
    error_logger = logging.getLogger("uvicorn.error")
    error_logger.error(
        "Unhandled exception on %s %s: %s\n%s",
        request.method,
        request.url.path,
        str(exc),
        traceback.format_exc(),
    )
    
    # Get origin from request headers for CORS
    origin = request.headers.get("origin", "")
    
    response = JSONResponse(
        status_code=500,
        content={
            "detail": f"Internal server error: {str(exc)}",
            "path": str(request.url.path),
        },
    )
    
    # Add CORS headers to error response
    if origin:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
    
    return response


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
