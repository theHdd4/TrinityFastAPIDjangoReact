import os
import re
import socket
from typing import Iterable, List, Optional, Sequence

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router, text_router
from DataStorageRetrieval.arrow_client import load_env_from_redis


def _split_hosts(raw_hosts: str) -> List[str]:
    """Split an environment variable style string into individual host entries."""

    if not raw_hosts:
        return []

    parts = re.split(r"[\s,]+", raw_hosts)
    return [part.strip() for part in parts if part.strip()]


def _iter_host_variants(hosts: Sequence[str], ports: Sequence[str]) -> Iterable[str]:
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

    defaults = []

    ports = [frontend_port, "8080", "8081"]

    docker_http_hosts = [
        "10.19.4.220",
        "10.2.4.48",
        "10.2.1.207",
        "10.2.3.55",
        "127.0.0.1",
        "172.22.64.1",
        "172.17.48.1",
        "localhost",
    ]

    defaults.extend(_iter_host_variants(docker_http_hosts, ports))

    defaults.extend(
        [
            "https://trinity.quantmatrixai.com",
            "https://trinity-dev.quantmatrixai.com",
        ]
    )

    host_ip_values = _split_hosts(host_ip)
    if host_ip_values:
        defaults.extend(_iter_host_variants(host_ip_values, ports))

    defaults.extend(_iter_host_variants(_detect_runtime_hosts(), ports))

    extra_hosts = _split_hosts(os.getenv("FASTAPI_ADDITIONAL_CORS_HOSTS", ""))
    if extra_hosts:
        defaults.extend(_iter_host_variants(extra_hosts, ports))

    # Preserve order while removing duplicates and empty entries.
    return [origin for origin in dict.fromkeys(defaults) if origin]


def _merge_unique_origins(*origin_lists: Iterable[str]) -> List[str]:
    """Return a list of unique origins preserving the first-seen order."""

    seen = set()
    merged: List[str] = []
    for origins in origin_lists:
        for origin in origins:
            if not origin or origin in seen:
                continue
            seen.add(origin)
            merged.append(origin)
    return merged


def _load_cors_origins() -> List[str]:
    """Return configured origins merged with calculated defaults."""

    configured = os.getenv("FASTAPI_CORS_ORIGINS")
    defaults = _default_cors_origins()
    if configured:
        configured = configured.strip()
        if configured == "*":
            return ["*"]
        configured_hosts = _split_hosts(configured)
        return _merge_unique_origins(configured_hosts, defaults)
    return defaults


def _default_cors_origin_regex() -> str:
    """Allow requests from any direct IPv4 address with optional port."""

    return r"https?://(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?$"


def _load_cors_origin_regex() -> Optional[str]:
    """Return the configured CORS origin regex or the IPv4 fallback."""

    configured = os.getenv("FASTAPI_CORS_ORIGIN_REGEX", "").strip()
    if configured:
        return configured
    return _default_cors_origin_regex()


app = FastAPI()

allowed_origins = _load_cors_origins()
origin_regex = None if allowed_origins == ["*"] else _load_cors_origin_regex()

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=origin_regex,
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
