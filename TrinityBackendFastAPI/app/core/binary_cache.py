"""High-level helper for storing binary payloads in Redis with compression.

The helper centralises all binary cache operations so that feature atoms reuse
shared configuration, consistent key shapes and metadata tracking.  The helper
expects cache keys to follow the structured pattern
``analytics:{client}:{project}:{artifact}``.
"""
from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass, asdict, field
from hashlib import sha256
from time import perf_counter
from typing import Any, Callable, Dict, Mapping, MutableMapping, Optional, Tuple, Union

from redis import Redis

from app.core.redis import get_sync_redis

try:  # pragma: no cover - optional dependency at runtime
    import lz4.frame as lz4frame
except Exception:  # noqa: BLE001 - import fallback
    lz4frame = None


logger = logging.getLogger("app.core.binary_cache")


def _env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if not value:
        return default
    try:
        return int(value)
    except ValueError:
        logger.warning("Invalid integer for %s: %s", name, value)
        return default


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class CacheScope:
    """Structured namespace for cache entries."""

    client: str
    project: str
    artifact: str

    def key(self, prefix: str) -> str:
        safe_parts = [self._normalise(self.client), self._normalise(self.project), self._normalise(self.artifact)]
        return f"{prefix}:{':'.join(safe_parts)}"

    @staticmethod
    def _normalise(value: str) -> str:
        cleaned = (value or "_").strip()
        if not cleaned:
            cleaned = "_"
        return cleaned.replace(":", "_").replace("/", "_").replace(" ", "_")


@dataclass(frozen=True)
class CacheMetadata:
    key: str
    digest: str
    raw_size: int
    compressed_size: int
    compression: str
    stored_at: float
    cache_hit: bool
    skip_reason: Optional[str] = None
    extras: Dict[str, Any] = field(default_factory=dict)

    def as_json(self) -> str:
        payload = asdict(self)
        if not self.extras:
            payload.pop("extras", None)
        return json.dumps(payload)

    @staticmethod
    def from_mapping(mapping: Mapping[str, Any], *, cache_hit: bool = False) -> "CacheMetadata":
        known_keys = {
            "key",
            "digest",
            "raw_size",
            "compressed_size",
            "compression",
            "stored_at",
            "cache_hit",
            "skip_reason",
        }
        extras = {k: v for k, v in mapping.items() if k not in known_keys}
        return CacheMetadata(
            key=mapping.get("key", ""),
            digest=mapping.get("digest", ""),
            raw_size=int(mapping.get("raw_size", 0)),
            compressed_size=int(mapping.get("compressed_size", 0)),
            compression=mapping.get("compression", "none"),
            stored_at=float(mapping.get("stored_at", 0.0)),
            cache_hit=cache_hit,
            skip_reason=mapping.get("skip_reason"),
            extras=extras,
        )


@dataclass(frozen=True)
class CacheFetch:
    payload: Optional[bytes]
    metadata: Optional[CacheMetadata]

    @property
    def hit(self) -> bool:
        return bool(self.payload)


Target = Union[str, CacheScope]
Loader = Callable[[], Union[bytes, Tuple[bytes, Mapping[str, Any]]]]


class BinaryCache:
    """Shared helper that manages binary Redis caching with compression."""

    def __init__(
        self,
        *,
        redis_client: Optional[Redis] = None,
        namespace: str = "analytics",
        ttl_seconds: int = _env_int("BINARY_CACHE_TTL", 3600),
        compression_threshold: int = _env_int("BINARY_CACHE_COMPRESSION_THRESHOLD", 262_144),
        max_cache_bytes: int = _env_int("BINARY_CACHE_MAX_BYTES", 25_000_000),
        enable_compression: bool = _env_bool("BINARY_CACHE_ENABLE_COMPRESSION", True),
    ) -> None:
        self._client = redis_client or get_sync_redis()
        self._namespace = namespace
        self._ttl = ttl_seconds
        self._compression_threshold = compression_threshold
        self._max_cache_bytes = max_cache_bytes
        self._enable_compression = enable_compression and lz4frame is not None
        self._compression_backend = "lz4" if self._enable_compression else "none"

    # ------------------------------------------------------------------
    # Key helpers
    def _scope_from_target(self, target: Target) -> CacheScope:
        if isinstance(target, CacheScope):
            return target
        return self._from_object_name(target)

    def _meta_key(self, key: str) -> str:
        return f"{key}:meta"

    # Structured parsing -------------------------------------------------
    def _from_object_name(self, object_name: str) -> CacheScope:
        parts = [part for part in str(object_name).split("/") if part]
        if not parts:
            return CacheScope(client="unknown", project="unknown", artifact="artifact")
        client = parts[0]
        project = parts[2] if len(parts) > 2 else (parts[1] if len(parts) > 1 else "unknown")
        artifact = "/".join(parts[3:]) if len(parts) > 3 else parts[-1]
        if not artifact:
            artifact = parts[-1]
        return CacheScope(client=client, project=project, artifact=artifact)

    def build_key(self, target: Target) -> Tuple[str, CacheScope]:
        scope = self._scope_from_target(target)
        return scope.key(self._namespace), scope

    # ------------------------------------------------------------------
    def _load_metadata(self, key: str) -> Optional[CacheMetadata]:
        raw = self._client.get(self._meta_key(key))
        if not raw:
            return None
        try:
            mapping = json.loads(raw)
        except Exception as exc:  # pragma: no cover - defensive logging
            logger.warning("Failed to decode cache metadata for %s: %s", key, exc)
            return None
        return CacheMetadata.from_mapping(mapping)

    def _store_metadata(self, meta: CacheMetadata) -> None:
        self._client.setex(self._meta_key(meta.key), self._ttl, meta.as_json())

    # ------------------------------------------------------------------
    def delete(self, target: Target) -> int:
        key, _scope = self.build_key(target)
        deleted = self._client.delete(key)
        deleted += self._client.delete(self._meta_key(key))
        logger.debug("Deleted cache key=%s (count=%s)", key, deleted)
        return deleted

    # ------------------------------------------------------------------
    def get(self, target: Target) -> CacheFetch:
        key, scope = self.build_key(target)
        meta = self._load_metadata(key)
        if meta and meta.skip_reason:
            logger.debug(
                "Skipping cache read for key=%s scope=%s reason=%s", key, scope, meta.skip_reason
            )
            return CacheFetch(payload=None, metadata=CacheMetadata.from_mapping(asdict(meta), cache_hit=False))
        start = perf_counter()
        value = self._client.get(key)
        duration = perf_counter() - start
        if value is None:
            if meta:
                logger.info(
                    "binary_cache.miss key=%s client=%s project=%s artifact=%s duration_ms=%.2f",
                    key,
                    scope.client,
                    scope.project,
                    scope.artifact,
                    duration * 1000,
                )
            return CacheFetch(payload=None, metadata=meta)
        payload = self._decode(value, meta)
        metadata = CacheMetadata(
            key=key,
            digest=meta.digest if meta else sha256(payload).hexdigest(),
            raw_size=meta.raw_size if meta else len(payload),
            compressed_size=len(value),
            compression=meta.compression if meta else "none",
            stored_at=meta.stored_at if meta else time.time(),
            cache_hit=True,
            skip_reason=meta.skip_reason if meta else None,
        )
        logger.info(
            "binary_cache.hit key=%s client=%s project=%s artifact=%s duration_ms=%.2f raw_size=%s compression=%s",
            key,
            scope.client,
            scope.project,
            scope.artifact,
            duration * 1000,
            metadata.raw_size,
            metadata.compression,
        )
        return CacheFetch(payload=payload, metadata=metadata)

    # ------------------------------------------------------------------
    def set(self, target: Target, payload: bytes, *, ttl: Optional[int] = None) -> CacheMetadata:
        key, scope = self.build_key(target)
        raw_size = len(payload)
        digest = sha256(payload).hexdigest()
        ttl_to_use = ttl or self._ttl

        if self._max_cache_bytes and raw_size > self._max_cache_bytes:
            meta = CacheMetadata(
                key=key,
                digest=digest,
                raw_size=raw_size,
                compressed_size=raw_size,
                compression="none",
                stored_at=time.time(),
                cache_hit=False,
                skip_reason="size_exceeded",
            )
            self._store_metadata(meta)
            logger.info(
                "binary_cache.skip key=%s client=%s project=%s artifact=%s reason=size_exceeded raw_size=%s limit=%s",
                key,
                scope.client,
                scope.project,
                scope.artifact,
                raw_size,
                self._max_cache_bytes,
            )
            return meta

        existing = self._load_metadata(key)
        if existing and existing.digest == digest and not existing.skip_reason:
            self._client.expire(key, ttl_to_use)
            self._client.expire(self._meta_key(key), ttl_to_use)
            logger.info(
                "binary_cache.duplicate key=%s client=%s project=%s artifact=%s raw_size=%s",
                key,
                scope.client,
                scope.project,
                scope.artifact,
                raw_size,
            )
            return CacheMetadata.from_mapping(asdict(existing), cache_hit=False)

        store_payload = payload
        compression = "none"
        compressed_size = raw_size
        if self._enable_compression and raw_size >= self._compression_threshold:
            try:
                store_payload = lz4frame.compress(payload)  # type: ignore[arg-type]
                compression = self._compression_backend
                compressed_size = len(store_payload)
            except Exception as exc:  # pragma: no cover - defensive guard
                logger.warning("Failed to compress payload for %s: %s", key, exc)
                store_payload = payload
                compression = "none"
                compressed_size = raw_size

        start = perf_counter()
        self._client.setex(key, ttl_to_use, store_payload)
        duration = perf_counter() - start

        meta = CacheMetadata(
            key=key,
            digest=digest,
            raw_size=raw_size,
            compressed_size=compressed_size,
            compression=compression,
            stored_at=time.time(),
            cache_hit=False,
        )
        self._store_metadata(meta)
        logger.info(
            "binary_cache.store key=%s client=%s project=%s artifact=%s raw_size=%s compressed_size=%s compression=%s duration_ms=%.2f",
            key,
            scope.client,
            scope.project,
            scope.artifact,
            raw_size,
            compressed_size,
            compression,
            duration * 1000,
        )
        return meta

    # ------------------------------------------------------------------
    def get_or_set(self, target: Target, loader: Loader, *, ttl: Optional[int] = None) -> CacheFetch:
        fetched = self.get(target)
        if fetched.payload is not None:
            return fetched
        payload, extra_meta = self._load_payload(loader)
        meta = self.set(target, payload, ttl=ttl)
        if extra_meta:
            merged_meta: Dict[str, Any] = asdict(meta)
            merged_meta.update(extra_meta)
            meta = CacheMetadata.from_mapping(merged_meta, cache_hit=False)
        return CacheFetch(payload=payload, metadata=meta)

    # ------------------------------------------------------------------
    def _decode(self, value: bytes, meta: Optional[CacheMetadata]) -> bytes:
        if not meta or meta.compression == "none":
            return value
        if meta.compression == "lz4" and lz4frame is not None:
            try:
                return lz4frame.decompress(value)
            except Exception as exc:  # pragma: no cover - defensive logging
                logger.warning("Failed to decompress payload for %s: %s", meta.key, exc)
                return value
        return value

    def _load_payload(self, loader: Loader) -> Tuple[bytes, MutableMapping[str, Any]]:
        start = perf_counter()
        result = loader()
        duration = perf_counter() - start
        extra_meta: MutableMapping[str, Any] = {"loader_ms": round(duration * 1000, 2)}
        if isinstance(result, tuple):
            payload, meta = result
            extra_meta.update(meta)
            return payload, extra_meta
        return result, extra_meta


binary_cache = BinaryCache()

__all__ = [
    "BinaryCache",
    "CacheFetch",
    "CacheMetadata",
    "CacheScope",
    "binary_cache",
]
