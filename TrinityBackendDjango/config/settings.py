"""
settings.py
============

Complete Django settings file for your Trinity project – updated to allow
**all origins** during development so your React/Vite front-end (or anything
else) can reach the API without CORS errors.

⚠️  SECURITY WARNING
--------------------
`CORS_ALLOW_ALL_ORIGINS = True` + `CORS_ALLOW_CREDENTIALS = True`
makes every browser on the internet able to send authenticated
requests to your API if the user is already logged in.

**Use this only for local/dev.**  
For staging or production switch back to an explicit whitelist
(`CORS_ALLOWED_ORIGINS = [...]`).
"""

import os
import socket
from pathlib import Path

from dotenv import load_dotenv
from corsheaders.defaults import default_headers, default_methods

# ------------------------------------------------------------------
# Load .env variables
# ------------------------------------------------------------------
load_dotenv()


def _split_csv(value: str | None) -> list[str]:
    """Return cleaned entries from a comma separated string."""

    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def _discover_local_ips() -> list[str]:
    """Attempt to collect non-loopback IPv4 addresses for the current host."""

    addresses: list[str] = []
    hostname = socket.gethostname()
    name_candidates = {hostname, socket.getfqdn(), os.getenv("HOSTNAME", "")}

    for name in name_candidates:
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
        _, _, host_ips = socket.gethostbyname_ex(hostname)
        addresses.extend(host_ips)
    except socket.gaierror:
        pass

    for target in ("8.8.8.8", "1.1.1.1"):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
                sock.connect((target, 80))
                addresses.append(sock.getsockname()[0])
        except OSError:
            continue

    seen: set[str] = set()
    unique: list[str] = []
    for ip in addresses:
        if not ip or ip.startswith("127."):
            continue
        if ip not in seen:
            seen.add(ip)
            unique.append(ip)
    return unique


def _expand_origins(hosts: list[str], ports: list[str]) -> list[str]:
    """Expand hostnames/IPs into http/https origins for multiple ports."""

    origins: list[str] = []
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

# ------------------------------------------------------------------
# Base directory
# ------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent.parent

# ------------------------------------------------------------------
# Security
# ------------------------------------------------------------------
_discovered_ips = _discover_local_ips()
_fallback_host_ip = _discovered_ips[0] if _discovered_ips else "127.0.0.1"

HOST_IP = os.getenv("HOST_IP", _fallback_host_ip)
FRONTEND_PORT = os.getenv("FRONTEND_PORT", "8080")
FRONTEND_URL = os.getenv("FRONTEND_URL", f"http://{HOST_IP}:{FRONTEND_PORT}")
SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-production")
DEBUG = os.getenv("DEBUG", "False") == "True"
# Allow requests from the provided comma separated list of hosts. Use "*" to
# allow any host when running behind a proxy or tunnel like Cloudflare.
ALLOWED_HOSTS = os.getenv("ALLOWED_HOSTS", "*").split(",")

# Explicitly trust these origins for CSRF-protected requests such as the login
# form. When deploying behind Cloudflare or another proxy, add your external
# domain (e.g. "https://example.com") here so browser POSTs are accepted.
_frontend_origin = f"http://{HOST_IP}:{FRONTEND_PORT}"
_default_csrf = os.getenv(
    "CSRF_DEFAULT",
    f"{_frontend_origin},https://trinity.quantmatrixai.com,https://trinity-dev.quantmatrixai.com",
)
_trusted = os.getenv("CSRF_TRUSTED_ORIGINS", _default_csrf)
CSRF_TRUSTED_ORIGINS = [o.strip() for o in _trusted.split(",") if o.strip()]
ADDITIONAL_DOMAINS = os.getenv("ADDITIONAL_DOMAINS", HOST_IP)

# ------------------------------------------------------------------
# CORS configuration
# ------------------------------------------------------------------
_historic_hosts = [
    "10.19.4.220",
    "10.2.4.48",
    "10.2.1.207",
    "172.22.64.1",
    "10.2.3.55",
]
_frontend_ports = list(dict.fromkeys([FRONTEND_PORT, "8080", "8081"]))
_host_entries = [
    "localhost",
    "127.0.0.1",
    HOST_IP,
    *_historic_hosts,
    *_split_csv(os.getenv("ADDITIONAL_DOMAINS")),
    *_discovered_ips,
]

_default_cors_list = _expand_origins(
    _host_entries,
    _frontend_ports,
)
_default_cors_list.extend(
    [
        "https://trinity.quantmatrixai.com",
        "https://trinity-dev.quantmatrixai.com",
    ]
)
_default_cors = [origin for origin in dict.fromkeys(_default_cors_list) if origin]

_cors_env = os.getenv("CORS_ALLOWED_ORIGINS")

if _cors_env and _cors_env.strip() not in {"", "*"}:
    CORS_ALLOWED_ORIGINS = _split_csv(_cors_env)
    CORS_ALLOW_ALL_ORIGINS = False
else:
    CORS_ALLOWED_ORIGINS = _default_cors
    CORS_ALLOW_ALL_ORIGINS = True

CORS_ALLOW_CREDENTIALS = True            # echo origin when cookies/auth supplied
CORS_ALLOW_HEADERS = list(default_headers) + [
    "authorization",
    "content-type",
    # add any custom front-end headers here
]

CORS_ALLOW_METHODS = list(default_methods)

CORS_PREFLIGHT_MAX_AGE = 86400            # 24h cache for pre-flight

# Debug CORS configuration
print(f"🔧 CORS Configuration:")
print(f"   HOST_IP: {HOST_IP}")
print(f"   FRONTEND_PORT: {FRONTEND_PORT}")
print(f"   _frontend_origin: {_frontend_origin}")
print(f"   CORS_ALLOWED_ORIGINS: {CORS_ALLOWED_ORIGINS}")
print(f"   CORS_ALLOW_CREDENTIALS: {CORS_ALLOW_CREDENTIALS}")
print(f"   CORS_ALLOW_HEADERS: {CORS_ALLOW_HEADERS}")
print(f"   CORS_ALLOW_METHODS: {CORS_ALLOW_METHODS}")

# ------------------------------------------------------------------
# django-tenants configuration
# ------------------------------------------------------------------
SHARED_APPS = [
    "django_tenants",

    # tenant model lives in public schema
    "apps.tenants",
    "apps.accounts",                    # custom user (public)
    "apps.signups",                     # landing page signups (public)

    # Django contrib (shared)
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "django.contrib.sessions",
    "django.contrib.admin",
    "django.contrib.messages",
    "django.contrib.staticfiles",

    # third-party shared
    "corsheaders",
    "rest_framework",
    "guardian",
    "simple_history",
]

TENANT_APPS = [
    "apps.atoms",                 # Add this line
    "apps.registry",
    "apps.subscriptions",
    "apps.workflows",
    "apps.atom_configs",
    "apps.config_store",
    "apps.permissions",
    "apps.orchestration",
    "apps.roles",
    "apps.audit",
    "apps.session_state",
]

INSTALLED_APPS = SHARED_APPS + [
    app for app in TENANT_APPS if app not in SHARED_APPS
]

# ------------------------------------------------------------------
# Tenant + domain models
# ------------------------------------------------------------------
TENANT_MODEL = "tenants.Tenant"
TENANT_DOMAIN_MODEL = "tenants.Domain"
PUBLIC_SCHEMA_NAME = "public"

# ------------------------------------------------------------------
# Custom user
# ------------------------------------------------------------------
AUTH_USER_MODEL = "accounts.User"

# ------------------------------------------------------------------
# Database routers (required by django-tenants)
# ------------------------------------------------------------------
DATABASE_ROUTERS = ("django_tenants.routers.TenantSyncRouter",)

# ------------------------------------------------------------------
# Middleware
# ------------------------------------------------------------------
MIDDLEWARE = [
    "django_tenants.middleware.TenantMiddleware",      # must be first
    "corsheaders.middleware.CorsMiddleware",           # CORS needs to run early
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

# ------------------------------------------------------------------
# URL configuration
# ------------------------------------------------------------------
ROOT_URLCONF = "config.urls"
PUBLIC_SCHEMA_URLCONF = "config.urls"

# ------------------------------------------------------------------
# Templates
# ------------------------------------------------------------------
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# ------------------------------------------------------------------
# WSGI & ASGI
# ------------------------------------------------------------------
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

# ------------------------------------------------------------------
# Databases
# ------------------------------------------------------------------
DATABASES = {
    "default": {
        "ENGINE": "django_tenants.postgresql_backend",
        "NAME": os.getenv("POSTGRES_DB", "trinity_db"),
        "USER": os.getenv("POSTGRES_USER", "trinity_user"),
        "PASSWORD": os.getenv("POSTGRES_PASSWORD", "trinity_pass"),
        "HOST": os.getenv("POSTGRES_HOST", "postgres"),
        "PORT": os.getenv("POSTGRES_PORT", "5432"),
    }
}

# ------------------------------------------------------------------
# MongoDB (analytics, documents, etc.)
# ------------------------------------------------------------------
MONGO_URI = os.getenv("MONGO_URI", "mongodb://mongo:27017/trinity")

# ------------------------------------------------------------------
# Redis (cache & Celery)
# ------------------------------------------------------------------
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

# ------------------------------------------------------------------
# Authentication & permissions
# ------------------------------------------------------------------
AUTHENTICATION_BACKENDS = (
    "django.contrib.auth.backends.ModelBackend",
    "guardian.backends.ObjectPermissionBackend",
)
ANONYMOUS_USER_NAME = None

# ------------------------------------------------------------------
# Django REST Framework
# ------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework.authentication.SessionAuthentication",
        "rest_framework.authentication.BasicAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
}

# ------------------------------------------------------------------
# Static & media files
# ------------------------------------------------------------------
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"


# ------------------------------------------------------------------
# Celery
# ------------------------------------------------------------------
CELERY_BROKER_URL = REDIS_URL
CELERY_RESULT_BACKEND = REDIS_URL
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"

# ------------------------------------------------------------------
# django-simple-history
# ------------------------------------------------------------------
SIMPLE_HISTORY_HISTORY_ID_USE_UUID = True

# ------------------------------------------------------------------
# Misc
# ------------------------------------------------------------------
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Disable COOP header for local HTTP access to the admin
SECURE_CROSS_ORIGIN_OPENER_POLICY = None