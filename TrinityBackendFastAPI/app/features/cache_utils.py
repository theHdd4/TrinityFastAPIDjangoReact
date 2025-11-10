"""Helpers that enforce consistent cache semantics for feature atoms."""
from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Dict, Iterable, Optional, Tuple

from app.core.cache_events import emit_cache_invalidation
from app.core.redis import get_sync_redis

logger = logging.getLogger("app.features.cache")

ARROW_NAMESPACE = "arrow"
ENV_NAMESPACE = "env"
SESSION_NAMESPACE = "session"
CLUSTER_NAMESPACE = "cluster"

ARROW_TTL = 1800
ENV_TTL = 3600
SESSION_TTL = 3600
CLUSTER_TTL = 7200

_NAMESPACE_TTLS: Dict[str, int] = {
    ARROW_NAMESPACE: ARROW_TTL,
    ENV_NAMESPACE: ENV_TTL,
    SESSION_NAMESPACE: SESSION_TTL,
    CLUSTER_NAMESPACE: CLUSTER_TTL,
}


@dataclass
class _KeyInfo:
    namespace: Optional[str]
    canonical_key: str
    identifiers: Dict[str, Any]


def _maybe_decode(value: Any) -> str:
    if isinstance(value, bytes):
        try:
            return value.decode("utf-8")
        except Exception:
            return value.decode("latin1", errors="ignore")
    return str(value)


def _parse_client_app_project(parts: Iterable[str]) -> Tuple[str, str, str] | None:
    seq = list(parts)
    if len(seq) >= 3 and all(seq[:3]):
        return seq[0], seq[1], seq[2]
    return None


def _normalise_key(raw_key: Any) -> _KeyInfo:
    key_str = raw_key if isinstance(raw_key, str) else _maybe_decode(raw_key)
    identifiers: Dict[str, Any] = {"redis_key": key_str}
    namespace: Optional[str] = None
    canonical = key_str

    if key_str.startswith("env:"):
        namespace = ENV_NAMESPACE
        canonical = key_str
        remainder = key_str.split(":", 1)[1] if ":" in key_str else ""
        ids = remainder.split(":")
        if len(ids) >= 3:
            identifiers.update(
                client_id=ids[0],
                app_id=ids[1],
                project_id=ids[2],
            )
    elif key_str.startswith("session:"):
        namespace = SESSION_NAMESPACE
        remainder = key_str.split(":", 1)[1] if ":" in key_str else ""
        ids = remainder.split(":")
        if len(ids) >= 3:
            identifiers.update(
                client_id=ids[0],
                app_id=ids[1],
                project_id=ids[2],
            )
    elif key_str.startswith("projstate:"):
        namespace = SESSION_NAMESPACE
        suffix = key_str.split(":", 1)[1] if ":" in key_str else key_str
        canonical = f"session:{suffix}"
        identifiers["redis_key"] = canonical
        ids = suffix.split(":")
        if len(ids) >= 3:
            identifiers.update(
                client_id=ids[0],
                app_id=ids[1],
                project_id=ids[2],
            )
    else:
        last_segment = key_str.rsplit("/", 1)[-1]
        if key_str.startswith("arrow:"):
            namespace = ARROW_NAMESPACE
            canonical = key_str
            raw_path = key_str[len("arrow:") :]
            identifiers["redis_key"] = canonical
            identifiers["object_path"] = raw_path
            parsed = _parse_client_app_project(raw_path.split("/"))
            if parsed:
                identifiers.update(
                    client_id=parsed[0],
                    app_id=parsed[1],
                    project_id=parsed[2],
                )
        elif last_segment.endswith(".arrow"):
            namespace = ARROW_NAMESPACE
            canonical = f"arrow:{key_str}" if not key_str.startswith("arrow:") else key_str
            identifiers["redis_key"] = canonical
            identifiers["object_path"] = key_str if not key_str.startswith("arrow:") else key_str[len("arrow:") :]
            parsed = _parse_client_app_project(key_str.split("/"))
            if parsed:
                identifiers.update(
                    client_id=parsed[0],
                    app_id=parsed[1],
                    project_id=parsed[2],
                )
        elif key_str.startswith("cluster:"):
            namespace = CLUSTER_NAMESPACE
            canonical = key_str
        elif "/cluster/" in key_str:
            namespace = CLUSTER_NAMESPACE
            canonical = f"cluster:{key_str}"
            identifiers["redis_key"] = canonical

    return _KeyInfo(namespace=namespace, canonical_key=canonical, identifiers=identifiers)


def _default_ttl(namespace: Optional[str], provided: Optional[int]) -> Optional[int]:
    if namespace is None:
        return provided
    ttl = _NAMESPACE_TTLS.get(namespace)
    if ttl is None:
        return provided
    return ttl


def _compute_version(value: Any) -> Optional[str]:
    if value is None:
        return None
    try:
        if isinstance(value, bytes):
            payload = value
        elif isinstance(value, str):
            payload = value.encode("utf-8")
        else:
            payload = _maybe_decode(value).encode("utf-8")
        return hashlib.sha256(payload).hexdigest()
    except Exception:
        return None


class FeatureCacheClient:
    """Proxy around Redis that enforces cache taxonomy semantics."""

    def __init__(self, redis, *, decode_responses: bool = False):
        self._redis = redis
        self._decode_responses = decode_responses

    def _log(self, message: str, *args: Any) -> None:
        logger.debug(message, *args)

    def _emit(self, namespace: Optional[str], identifiers: Dict[str, Any], *, action: str, ttl: Optional[int], version: Optional[str]) -> None:
        if namespace is None:
            return
        metadata = {"source": "fastapi:features"}
        emit_cache_invalidation(
            namespace,
            identifiers,
            action=action,
            ttl=ttl,
            version=version,
            metadata=metadata,
        )

    def setex(self, name: Any, time: int, value: Any) -> Any:
        info = _normalise_key(name)
        ttl = _default_ttl(info.namespace, time)
        version = _compute_version(value) if info.namespace in {ARROW_NAMESPACE, ENV_NAMESPACE, SESSION_NAMESPACE} else None
        if info.canonical_key != name:
            self._redis.delete(name)
        result = self._redis.setex(info.canonical_key, ttl if ttl is not None else time, value)
        self._emit(info.namespace, info.identifiers, action="write", ttl=ttl, version=version)
        return result

    def set(self, name: Any, value: Any, ex: Optional[int] = None, px: Optional[int] = None, nx: bool = False, xx: bool = False, keepttl: bool = False) -> Any:
        info = _normalise_key(name)
        ttl = _default_ttl(info.namespace, ex)
        version = _compute_version(value) if info.namespace in {ARROW_NAMESPACE, ENV_NAMESPACE, SESSION_NAMESPACE} else None
        if ttl is not None and ex is None and px is None and not keepttl:
            ex = ttl
        if info.canonical_key != name:
            self._redis.delete(name)
        result = self._redis.set(info.canonical_key, value, ex=ex, px=px, nx=nx, xx=xx, keepttl=keepttl)
        if result:
            self._emit(info.namespace, info.identifiers, action="write", ttl=ex or ttl, version=version)
        return result

    def get(self, name: Any) -> Any:
        info = _normalise_key(name)
        value = self._redis.get(info.canonical_key)
        if value is None and info.canonical_key != name:
            value = self._redis.get(name)
        return value

    def delete(self, *names: Any) -> int:
        removed = 0
        for raw in names:
            info = _normalise_key(raw)
            removed += self._redis.delete(info.canonical_key)
            if info.canonical_key != raw:
                removed += self._redis.delete(raw)
            self._emit(info.namespace, info.identifiers, action="delete", ttl=0, version=None)
        return removed

    def __getattr__(self, item: str) -> Any:
        return getattr(self._redis, item)


@lru_cache(maxsize=4)
def get_feature_cache(*, decode_responses: bool = False) -> FeatureCacheClient:
    redis = get_sync_redis(decode_responses=decode_responses)
    return FeatureCacheClient(redis, decode_responses=decode_responses)


__all__ = [
    "get_feature_cache",
    "FeatureCacheClient",
    "ARROW_NAMESPACE",
    "ENV_NAMESPACE",
    "SESSION_NAMESPACE",
    "CLUSTER_NAMESPACE",
    "ARROW_TTL",
    "ENV_TTL",
    "SESSION_TTL",
    "CLUSTER_TTL",
]
