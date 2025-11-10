"""Redis helpers for the Explore atom.

This module simply re-exports the shared Redis client so Explore specific
components do not construct bespoke connections.
"""
from __future__ import annotations

from typing import Optional

from redis.exceptions import RedisError

from app.core.redis import get_redis_settings
from app.features.cache_utils import get_feature_cache

_settings = get_redis_settings()

REDIS_HOST = _settings.host
REDIS_PORT = _settings.port
REDIS_DB = _settings.db
REDIS_URL: Optional[str] = _settings.url


def _display_endpoint() -> str:
    if REDIS_URL:
        return REDIS_URL
    return f"{REDIS_HOST}:{REDIS_PORT}/{REDIS_DB}"


def get_redis_client():
    """Return the shared Redis client, ensuring the connection is healthy."""
    try:
        client = get_feature_cache()
        client.ping()
        return client
    except RedisError as exc:
        print(f"Redis connection failed: {exc}")
        return None


def test_redis_connection():
    """Test Redis connection using the shared client."""
    client = get_redis_client()
    if not client:
        return {"status": "error", "message": "Failed to get Redis client"}
    try:
        client.set("test_key", "test_value")
        value = client.get("test_key")
        client.delete("test_key")
        payload = value.decode() if isinstance(value, bytes) else value
        return {
            "status": "success",
            "message": f"Connected to Redis at {_display_endpoint()}",
            "test_result": payload,
        }
    except Exception as exc:  # noqa: BLE001 - surface connection issues to the caller
        return {"status": "error", "message": f"Redis test failed: {exc}"}
