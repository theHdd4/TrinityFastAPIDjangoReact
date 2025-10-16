import os
import socket
from typing import Iterable, List
from urllib.parse import urlparse

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
        "http://10.19.4.220:8080",
        "http://10.2.4.48:8080",
        "http://127.0.0.1:8080",
        "http://10.2.1.207:8080",
        "http://172.22.64.1:8080",
        "http://10.2.3.55:8080",
        "https://trinity.quantmatrixai.com",
        "https://trinity-dev.quantmatrixai.com",
        "http://localhost:8080",
    ]

    ports = [frontend_port, "8080", "8081"]

    if host_ip:
        parsed_host = ""

        if "://" in host_ip:
            parsed = urlparse(host_ip)
            if parsed.scheme and parsed.netloc:
                defaults.append(f"{parsed.scheme}://{parsed.netloc}")
            parsed_host = parsed.hostname or ""
        else:
            # Support HOST_IP values that may already include an explicit port.
            if ":" in host_ip:
                host, _, explicit_port = host_ip.rpartition(":")
                host = host.strip()
                explicit_port = explicit_port.strip()
                if host and explicit_port:
                    defaults.append(f"http://{host}:{explicit_port}")
                    defaults.append(f"https://{host}:{explicit_port}")
                    parsed_host = host
            else:
                parsed_host = host_ip

        if parsed_host:
            defaults.extend(_iter_host_variants([parsed_host], ports))

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
