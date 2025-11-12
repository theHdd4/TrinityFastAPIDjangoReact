"""Centralised Redis client configuration.

This module exposes helper functions to build pooled Redis clients using the
same environment-driven configuration across sync and async code paths.
"""
from __future__ import annotations

import json
import logging
import os
import ssl
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any, Dict, Iterable, Optional, Union

from redis import Redis
from redis.asyncio import Redis as AsyncRedis
from redis.asyncio.connection import (
    BlockingConnectionPool as AsyncBlockingConnectionPool,
    ConnectionPool as AsyncConnectionPool,
)
from redis.connection import (
    BlockingConnectionPool as SyncBlockingConnectionPool,
    ConnectionPool as SyncConnectionPool,
)


logger = logging.getLogger("app.core.redis")
activity_logger = logging.getLogger("redis.activity")
if not activity_logger.handlers:
    handler = logging.StreamHandler()
    handler.setLevel(logging.INFO)
    activity_logger.addHandler(handler)
activity_logger.setLevel(logging.INFO)
activity_logger.propagate = False


def _service_name() -> str:
    return os.getenv("REDIS_LOG_SERVICE", "fastapi-backend")


def _stringify_key(value: Union[str, bytes, None]) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, bytes):
        try:
            return value.decode("utf-8")
        except UnicodeDecodeError:
            return value.hex()
    return str(value)


def _log_cache_event(
    *,
    event: str,
    command: str,
    keys: Iterable[Union[str, bytes, None]],
    hits: int,
    misses: int,
    namespace: Optional[str] = None,
) -> None:
    materialised_keys = []
    for candidate in keys:
        rendered = _stringify_key(candidate)
        if rendered is not None:
            materialised_keys.append(rendered)
    if not materialised_keys:
        return
    payload = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event": event,
        "command": command,
        "keys": materialised_keys,
        "hits": hits,
        "misses": misses,
        "service": _service_name(),
    }
    if namespace:
        payload["namespace"] = namespace
    activity_logger.info("redis_cache_event %s", json.dumps(payload, sort_keys=True))


def _derive_namespace(key: Union[str, bytes, None]) -> Optional[str]:
    rendered = _stringify_key(key)
    if not rendered or ":" not in rendered:
        return None
    return rendered.split(":", 1)[0]


class LoggingRedis(Redis):
    def get(self, name, *args, **kwargs):  # type: ignore[override]
        value = super().get(name, *args, **kwargs)
        namespace = _derive_namespace(name)
        hits = 1 if value is not None else 0
        _log_cache_event(
            event="cache_hit" if hits else "cache_miss",
            command="GET",
            keys=[name],
            hits=hits,
            misses=0 if hits else 1,
            namespace=namespace,
        )
        return value

    def mget(self, keys, *args, **kwargs):  # type: ignore[override]
        values = super().mget(keys, *args, **kwargs)
        if isinstance(keys, (list, tuple, set)):
            materialised_keys = list(keys)
        else:
            materialised_keys = [keys]
        hits = sum(1 for value in values if value is not None)
        misses = len(materialised_keys) - hits
        namespace = _derive_namespace(materialised_keys[0]) if materialised_keys else None
        _log_cache_event(
            event="bulk_cache_hit" if hits else "bulk_cache_miss",
            command="MGET",
            keys=materialised_keys,
            hits=hits,
            misses=misses,
            namespace=namespace,
        )
        return values

    def hgetall(self, name):  # type: ignore[override]
        value = super().hgetall(name)
        namespace = _derive_namespace(name)
        hits = 1 if value else 0
        _log_cache_event(
            event="hash_cache_hit" if hits else "hash_cache_miss",
            command="HGETALL",
            keys=[name],
            hits=hits,
            misses=0 if hits else 1,
            namespace=namespace,
        )
        return value


class LoggingAsyncRedis(AsyncRedis):
    async def get(self, name, *args, **kwargs):  # type: ignore[override]
        value = await super().get(name, *args, **kwargs)
        namespace = _derive_namespace(name)
        hits = 1 if value is not None else 0
        _log_cache_event(
            event="cache_hit" if hits else "cache_miss",
            command="GET",
            keys=[name],
            hits=hits,
            misses=0 if hits else 1,
            namespace=namespace,
        )
        return value

    async def mget(self, keys, *args, **kwargs):  # type: ignore[override]
        values = await super().mget(keys, *args, **kwargs)
        if isinstance(keys, (list, tuple, set)):
            materialised_keys = list(keys)
        else:
            materialised_keys = [keys]
        hits = sum(1 for value in values if value is not None)
        misses = len(materialised_keys) - hits
        namespace = _derive_namespace(materialised_keys[0]) if materialised_keys else None
        _log_cache_event(
            event="bulk_cache_hit" if hits else "bulk_cache_miss",
            command="MGET",
            keys=materialised_keys,
            hits=hits,
            misses=misses,
            namespace=namespace,
        )
        return values

    async def hgetall(self, name):  # type: ignore[override]
        value = await super().hgetall(name)
        namespace = _derive_namespace(name)
        hits = 1 if value else 0
        _log_cache_event(
            event="hash_cache_hit" if hits else "hash_cache_miss",
            command="HGETALL",
            keys=[name],
            hits=hits,
            misses=0 if hits else 1,
            namespace=namespace,
        )
        return value


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


def _shared_connection_kwargs(settings: RedisSettings, decode_responses: bool) -> Dict[str, Any]:
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
def get_sync_pool(decode_responses: bool = False) -> SyncConnectionPool:
    settings = get_redis_settings()
    connection_kwargs = _shared_connection_kwargs(settings, decode_responses)
    pool_kwargs: Dict[str, Any] = {
        "max_connections": settings.max_connections,
        **connection_kwargs,
    }
    pool_class: type[SyncConnectionPool]
    if settings.pool_timeout is not None:
        pool_class = SyncBlockingConnectionPool
        pool_kwargs["timeout"] = settings.pool_timeout
    else:
        pool_class = SyncConnectionPool
    if settings.url:
        return pool_class.from_url(
            settings.url,
            **pool_kwargs,
        )
    return pool_class(
        host=settings.host,
        port=settings.port,
        username=settings.username,
        password=settings.password,
        db=settings.db,
        **pool_kwargs,
    )


@lru_cache(maxsize=None)
def get_async_pool(decode_responses: bool = False) -> AsyncConnectionPool:
    settings = get_redis_settings()
    connection_kwargs = _shared_connection_kwargs(settings, decode_responses)
    pool_kwargs: Dict[str, Any] = {
        "max_connections": settings.max_connections,
        **connection_kwargs,
    }
    pool_class: type[AsyncConnectionPool]
    if settings.pool_timeout is not None:
        pool_class = AsyncBlockingConnectionPool
        pool_kwargs["timeout"] = settings.pool_timeout
    else:
        pool_class = AsyncConnectionPool
    if settings.url:
        return pool_class.from_url(
            settings.url,
            **pool_kwargs,
        )
    return pool_class(
        host=settings.host,
        port=settings.port,
        username=settings.username,
        password=settings.password,
        db=settings.db,
        **pool_kwargs,
    )


def get_sync_redis(decode_responses: bool = False) -> Redis:
    settings = get_redis_settings()
    client_kwargs: Dict[str, Any] = {}
    if settings.client_name:
        client_kwargs["client_name"] = settings.client_name
    return LoggingRedis(
        connection_pool=get_sync_pool(decode_responses),
        **client_kwargs,
    )


def get_async_redis(decode_responses: bool = False) -> AsyncRedis:
    settings = get_redis_settings()
    client_kwargs: Dict[str, Any] = {}
    if settings.client_name:
        client_kwargs["client_name"] = settings.client_name
    return LoggingAsyncRedis(
        connection_pool=get_async_pool(decode_responses),
        **client_kwargs,
    )


redis_sync_client = get_sync_redis()
redis_async_client = get_async_redis()

if os.getenv("ENVIRONMENT", os.getenv("APP_ENV", "production")).lower() == "development":
    dev_settings = get_redis_settings()
    endpoint = dev_settings.url or f"{dev_settings.host}:{dev_settings.port}/{dev_settings.db}"
    logger.info(
        "Shared Redis configured for %s (client: %s)",
        endpoint,
        dev_settings.client_name or "-",
    )

__all__ = [
    "get_async_pool",
    "get_async_redis",
    "get_redis_settings",
    "get_sync_pool",
    "get_sync_redis",
    "redis_async_client",
    "redis_sync_client",
]
