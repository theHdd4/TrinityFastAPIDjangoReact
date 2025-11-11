"""Utilities for publishing cache invalidation events.

All cache touching code paths should call :func:`emit_cache_invalidation` after
mutating Redis so other processes can refresh their in-memory views.
"""
from __future__ import annotations

import json
import logging
import os
import time
from typing import Any, Mapping, MutableMapping, Optional

from app.core.redis import get_sync_redis

logger = logging.getLogger("app.core.cache_events")

_CHANNEL = os.getenv("CACHE_INVALIDATION_CHANNEL", "cache:invalidate")
_publisher = None


def _get_publisher():
    global _publisher
    if _publisher is None:
        try:
            _publisher = get_sync_redis(decode_responses=True)
        except Exception:
            logger.exception("Unable to build Redis publisher for cache events")
            raise
    return _publisher


def emit_cache_invalidation(
    namespace: str,
    identifiers: Mapping[str, Any],
    *,
    action: str,
    ttl: Optional[int] = None,
    version: Optional[str] = None,
    metadata: Optional[MutableMapping[str, Any]] = None,
) -> None:
    """Publish a structured cache invalidation event via Redis pub/sub."""
    payload: dict[str, Any] = {
        "namespace": namespace,
        "action": action,
        "identifiers": dict(identifiers),
        "ttl": ttl,
        "version": version,
        "ts": time.time(),
    }
    if metadata:
        payload["metadata"] = dict(metadata)
    message = json.dumps(payload, default=str)
    try:
        publisher = _get_publisher()
        publisher.publish(_CHANNEL, message)
    except Exception:
        logger.exception("Failed to publish cache invalidation: %s", message)


__all__ = ["emit_cache_invalidation"]
