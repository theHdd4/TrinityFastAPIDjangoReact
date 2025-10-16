import os
import socket
from typing import Iterable, List, Sequence, Tuple

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router, text_router
from DataStorageRetrieval.arrow_client import load_env_from_redis


def _split_csv(value: str | None) -> List[str]:
    """Split a comma-separated environment variable into clean entries."""

    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def _discover_local_ips() -> List[str]:
    """Return best-effort list of non-loopback IPv4 addresses for this host."""

    addresses: List[str] = []
    candidates: List[str] = []

    hostname = socket.gethostname()
    candidates.extend({hostname, socket.getfqdn(), os.getenv("HOSTNAME", "")})

    for name in candidates:
        if not name:
            continue
        try:
            infos = socket.getaddrinfo(name, None, proto=socket.IPPROTO_TCP)
        except socket.gaierror:
            continue
        for info in infos:
            ip = info[4][0]
            if ip and "." in ip:
                addresses.append(ip)

    try:
        _, _, ip_list = socket.gethostbyname_ex(hostname)
        addresses.extend(ip_list)
    except socket.gaierror:
        pass

    for target in ("8.8.8.8", "1.1.1.1"):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
                sock.connect((target, 80))
                addresses.append(sock.getsockname()[0])
        except OSError:
            continue

    seen = set()
    unique: List[str] = []
    for ip in addresses:
        if not ip or ip.startswith("127."):
            continue
        if ip not in seen:
            seen.add(ip)
            unique.append(ip)
    return unique


def _expand_hosts(hosts: Iterable[str], ports: Sequence[str]) -> List[str]:
    """Expand host values into full origins for http/https with provided ports."""

    origins: List[str] = []
    seen: set[str] = set()
    for host in hosts:
        host = host.strip()
        if not host:
            continue
        if host.startswith("http://") or host.startswith("https://"):
            if host not in seen:
                seen.add(host)
                origins.append(host)
            continue
        for port in ports:
            origin = f"http://{host}:{port}"
            if origin not in seen:
                seen.add(origin)
                origins.append(origin)
        https_origin = f"https://{host}"
        if https_origin not in seen:
            seen.add(https_origin)
            origins.append(https_origin)
    return origins


def _default_cors_origins() -> List[str]:
    """Build the default list of CORS origins with dynamic host discovery."""

    host_ip = os.getenv("HOST_IP", "").strip()
    frontend_port = os.getenv("FRONTEND_PORT", "8080").strip() or "8080"

    historic_hosts = [
        "10.19.4.220",
        "10.2.4.48",
        "10.2.1.207",
        "172.22.64.1",
        "10.2.3.55",
    ]

    local_hosts = [
        "localhost",
        "127.0.0.1",
        host_ip,
        *historic_hosts,
        *_split_csv(os.getenv("ADDITIONAL_DOMAINS")),
        *_discover_local_ips(),
    ]

    ports = list(dict.fromkeys([frontend_port, "8080", "8081"]))

    defaults = [
        "https://trinity.quantmatrixai.com",
        "https://trinity-dev.quantmatrixai.com",
    ]

    defaults.extend(_expand_hosts(local_hosts, ports))

    # Preserve order while removing duplicates and empty entries.
    return [origin for origin in dict.fromkeys(defaults) if origin]


def _load_cors_settings() -> Tuple[List[str], bool]:
    """Return (origins, allow_all) based on environment or defaults."""

    configured = os.getenv("FASTAPI_CORS_ORIGINS")
    if configured:
        configured = configured.strip()
        if configured == "*":
            return ([], True)
        origins = [origin.strip() for origin in configured.split(",") if origin.strip()]
        return (origins, False)

    return (_default_cors_origins(), True)


app = FastAPI()

allowed_origins, allow_all = _load_cors_settings()

cors_kwargs = {
    "allow_credentials": True,
    "allow_methods": ["*"],
    "allow_headers": ["*"],
}

if allow_all:
    cors_kwargs["allow_origin_regex"] = ".*"
else:
    cors_kwargs["allow_origins"] = allowed_origins

app.add_middleware(CORSMiddleware, **cors_kwargs)

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
