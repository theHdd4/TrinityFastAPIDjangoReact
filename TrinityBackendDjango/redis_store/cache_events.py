"""Helpers for broadcasting cache invalidation events from the Django stack."""
from __future__ import annotations

import json
import logging
import os
import time
from typing import Any, Mapping, MutableMapping, Optional

from .redis_client import redis_client

logger = logging.getLogger("redis_store.cache_events")

_CHANNEL = os.getenv("CACHE_INVALIDATION_CHANNEL", "cache:invalidate")


def publish_cache_invalidation(
    namespace: str,
    identifiers: Mapping[str, Any],
    *,
    action: str,
    ttl: Optional[int] = None,
    version: Optional[str] = None,
    metadata: Optional[MutableMapping[str, Any]] = None,
) -> None:
    """Publish a cache invalidation notification via Redis pub/sub."""
    payload: dict[str, Any] = {
        "namespace": namespace,
        "action": action,
        "identifiers": dict(identifiers),
        "ttl": ttl,
        "version": version,
        "ts": time.time(),
        "metadata": dict(metadata) if metadata else {"source": "django"},
    }
    if not payload["metadata"]:
        payload.pop("metadata")
    message = json.dumps(payload, default=str)
    try:
        redis_client.publish(_CHANNEL, message)
    except Exception:
        logger.exception("Unable to publish cache invalidation: %s", message)


__all__ = ["publish_cache_invalidation"]
