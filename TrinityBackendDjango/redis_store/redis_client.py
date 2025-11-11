from __future__ import annotations

import os
import ssl
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Dict, Optional

from redis import Redis
from redis.connection import BlockingConnectionPool, ConnectionPool


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        return default
    try:
        return int(value)
    except ValueError:
        return default


def _env_float(name: str, default: Optional[float]) -> Optional[float]:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        return default
    try:
        return float(value)
    except ValueError:
        return default


def _resolve_cert_reqs(raw: Optional[str], use_tls: bool) -> int:
    if raw is None:
        return ssl.CERT_REQUIRED if use_tls else ssl.CERT_NONE
    mapping = {
        "none": ssl.CERT_NONE,
        "optional": ssl.CERT_OPTIONAL,
        "required": ssl.CERT_REQUIRED,
    }
    return mapping.get(raw.lower(), ssl.CERT_REQUIRED if use_tls else ssl.CERT_NONE)


@dataclass(frozen=True)
class RedisSettings:
    url: Optional[str]
    host: str
    port: int
    username: Optional[str]
    password: Optional[str]
    db: int
    use_tls: bool
    tls_ca_file: Optional[str]
    tls_cert_file: Optional[str]
    tls_key_file: Optional[str]
    tls_cert_reqs: int
    client_name: Optional[str]
    max_connections: int
    pool_timeout: Optional[float]
    socket_timeout: Optional[float]
    socket_connect_timeout: Optional[float]
    health_check_interval: Optional[float]


@lru_cache(maxsize=1)
def get_redis_settings() -> RedisSettings:
    url = os.getenv("REDIS_URL")
    host = os.getenv("REDIS_HOST", "redis")
    port = _env_int("REDIS_PORT", 6379)
    username = os.getenv("REDIS_USERNAME")
    password = os.getenv("REDIS_PASSWORD")
    db = _env_int("REDIS_DB", 0)
    use_tls = _env_bool("REDIS_USE_TLS", url.lower().startswith("rediss://") if url else False)
    tls_ca_file = os.getenv("REDIS_TLS_CA_FILE")
    tls_cert_file = os.getenv("REDIS_TLS_CERT_FILE")
    tls_key_file = os.getenv("REDIS_TLS_KEY_FILE")
    tls_cert_reqs = _resolve_cert_reqs(os.getenv("REDIS_TLS_CERT_REQS"), use_tls)
    client_name = os.getenv("REDIS_CLIENT_NAME")
    max_connections = _env_int("REDIS_POOL_MAX_CONNECTIONS", 50)
    pool_timeout = _env_float("REDIS_POOL_TIMEOUT", None)
    socket_timeout = _env_float("REDIS_SOCKET_TIMEOUT", None)
    socket_connect_timeout = _env_float("REDIS_SOCKET_CONNECT_TIMEOUT", None)
    health_check_interval = _env_float("REDIS_HEALTH_CHECK_INTERVAL", None)
    return RedisSettings(
        url=url,
        host=host,
        port=port,
        username=username,
        password=password,
        db=db,
        use_tls=use_tls,
        tls_ca_file=tls_ca_file,
        tls_cert_file=tls_cert_file,
        tls_key_file=tls_key_file,
        tls_cert_reqs=tls_cert_reqs,
        client_name=client_name,
        max_connections=max_connections,
        pool_timeout=pool_timeout,
        socket_timeout=socket_timeout,
        socket_connect_timeout=socket_connect_timeout,
        health_check_interval=health_check_interval,
    )


def _connection_kwargs(settings: RedisSettings, decode_responses: bool) -> Dict[str, Any]:
    kwargs: Dict[str, Any] = {
        "decode_responses": decode_responses,
    }
    if settings.socket_timeout is not None:
        kwargs["socket_timeout"] = settings.socket_timeout
    if settings.socket_connect_timeout is not None:
        kwargs["socket_connect_timeout"] = settings.socket_connect_timeout
    if settings.health_check_interval is not None:
        kwargs["health_check_interval"] = settings.health_check_interval
    if settings.use_tls:
        kwargs.update(
            ssl=True,
            ssl_cert_reqs=settings.tls_cert_reqs,
        )
        if settings.tls_ca_file:
            kwargs["ssl_ca_certs"] = settings.tls_ca_file
        if settings.tls_cert_file:
            kwargs["ssl_certfile"] = settings.tls_cert_file
        if settings.tls_key_file:
            kwargs["ssl_keyfile"] = settings.tls_key_file
    return kwargs


@lru_cache(maxsize=None)
def get_connection_pool(decode_responses: bool = True) -> ConnectionPool:
    settings = get_redis_settings()
    connection_kwargs = _connection_kwargs(settings, decode_responses)
    pool_kwargs: Dict[str, Any] = {
        "max_connections": settings.max_connections,
        **connection_kwargs,
    }
    pool_class: type[ConnectionPool]
    if settings.pool_timeout is not None:
        pool_class = BlockingConnectionPool
        pool_kwargs["timeout"] = settings.pool_timeout
    else:
        pool_class = ConnectionPool
    if settings.url:
        return pool_class.from_url(settings.url, **pool_kwargs)
    return pool_class(
        host=settings.host,
        port=settings.port,
        username=settings.username,
        password=settings.password,
        db=settings.db,
        **pool_kwargs,
    )


def get_sync_redis(decode_responses: bool = True) -> Redis:
    settings = get_redis_settings()
    client_kwargs: Dict[str, Any] = {}
    if settings.client_name:
        client_kwargs["client_name"] = settings.client_name
    return Redis(connection_pool=get_connection_pool(decode_responses), **client_kwargs)


redis_client = get_sync_redis(decode_responses=True)
redis_settings = get_redis_settings()

__all__ = [
    "redis_client",
    "redis_settings",
    "get_sync_redis",
    "get_connection_pool",
    "get_redis_settings",
]
