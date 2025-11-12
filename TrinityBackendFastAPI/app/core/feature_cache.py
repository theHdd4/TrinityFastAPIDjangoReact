"""Shared caching abstractions for feature-level Redis usage.

This module introduces :class:`FeatureCacheClient`, a high-level wrapper
that standardises the Redis cache contract for all feature atoms, molecules,
workflows and exhibition components.  The client enforces consistent key
shapes, TTLs and invalidation events so that caches remain coherent across
FastAPI, Django and worker processes.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from enum import Enum
from typing import Any, Callable, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple

from redis import Redis

from app.core.binary_cache import CacheScope, binary_cache
from app.core.redis import get_sync_redis


logger = logging.getLogger("app.core.feature_cache")


class FeatureCacheNamespace(str, Enum):
    """Logical cache namespaces for feature workloads."""

    SESSION_STATE = "session"
    ENVIRONMENT = "environment"
    ARROW_ARTIFACTS = "artifact"
    ATOM = "atom"
    WORKFLOW = "workflow"
    MOLECULE = "molecule"
    EXHIBITION = "exhibition"


@dataclass(frozen=True)
class NamespaceConfig:
    """Runtime configuration for a namespace."""

    ttl: int
    event_channel: str


def _default_namespace_config(base_channel: str) -> Mapping[FeatureCacheNamespace, NamespaceConfig]:
    """Build the default namespace configuration mapping."""

    def _cfg(name: FeatureCacheNamespace, ttl: int) -> NamespaceConfig:
        return NamespaceConfig(ttl=ttl, event_channel=f"{base_channel}:{name.value}")

    # The TTL values below are intentionally conservative so that cached data
    # remains fresh while still providing tangible reuse across requests.
    return {
        FeatureCacheNamespace.SESSION_STATE: _cfg(FeatureCacheNamespace.SESSION_STATE, 900),
        FeatureCacheNamespace.ENVIRONMENT: _cfg(FeatureCacheNamespace.ENVIRONMENT, 900),
        FeatureCacheNamespace.ARROW_ARTIFACTS: _cfg(FeatureCacheNamespace.ARROW_ARTIFACTS, 3600),
        FeatureCacheNamespace.ATOM: _cfg(FeatureCacheNamespace.ATOM, 1800),
        FeatureCacheNamespace.WORKFLOW: _cfg(FeatureCacheNamespace.WORKFLOW, 3600),
        FeatureCacheNamespace.MOLECULE: _cfg(FeatureCacheNamespace.MOLECULE, 3600),
        FeatureCacheNamespace.EXHIBITION: _cfg(FeatureCacheNamespace.EXHIBITION, 900),
    }


def _normalise_key_component(value: Any) -> str:
    text = "" if value is None else str(value)
    text = text.strip()
    if not text:
        return "_"
    # Replace characters that have special meaning in Redis glob patterns.
    return text.replace(":", "_").replace(" ", "_").replace("/", "_")


class FeatureCacheProxy:
    """Namespace aware cache wrapper with TTL enforcement."""

    def __init__(
        self,
        redis_client: Redis,
        namespace: FeatureCacheNamespace,
        feature: str,
        config: NamespaceConfig,
        base_prefix: str,
    ) -> None:
        self._client = redis_client
        self._namespace = namespace
        self._feature = feature
        self._config = config
        self._base_prefix = base_prefix

    @property
    def namespace(self) -> FeatureCacheNamespace:
        return self._namespace

    @property
    def feature(self) -> str:
        return self._feature

    def _qualify(self, parts: Sequence[Any]) -> str:
        safe_parts = [_normalise_key_component(part) for part in parts]
        key_suffix = ":".join(safe_parts)
        return f"{self._base_prefix}:{self._namespace.value}:{self._feature}:{key_suffix}"

    def _emit(self, action: str, qualified_key: str, parts: Sequence[Any]) -> None:
        payload = {
            "action": action,
            "namespace": self._namespace.value,
            "feature": self._feature,
            "key": qualified_key,
            "parts": [str(part) if part is not None else "" for part in parts],
        }
        try:
            self._client.publish(self._config.event_channel, json.dumps(payload))
        except Exception as exc:  # pragma: no cover - defensive logging only
            logger.warning("Failed to publish cache event: %s", exc)

    def _default_parts(self, parts: Optional[Sequence[Any]]) -> Sequence[Any]:
        if parts is None:
            return ("default",)
        return parts

    def _ensure_parts(self, key: Any | Sequence[Any]) -> Sequence[Any]:
        if isinstance(key, (list, tuple)):
            return list(key)
        return (key,)

    def set_bytes(
        self,
        parts: Sequence[Any],
        payload: bytes,
        *,
        ttl: Optional[int] = None,
    ) -> None:
        qualified_key = self._qualify(parts)
        ttl_to_use = ttl or self._config.ttl
        self._client.setex(qualified_key, ttl_to_use, payload)
        self._emit("set", qualified_key, parts)

    def set_json(
        self,
        parts: Sequence[Any],
        payload: Any,
        *,
        ttl: Optional[int] = None,
        json_kwargs: Optional[Dict[str, Any]] = None,
    ) -> None:
        kwargs = {"default": str}
        if json_kwargs:
            kwargs.update(json_kwargs)
        encoded = json.dumps(payload, **kwargs)
        self.set_bytes(parts, encoded.encode("utf-8"), ttl=ttl)

    def get_bytes(self, parts: Sequence[Any]) -> Optional[bytes]:
        qualified_key = self._qualify(parts)
        value = self._client.get(qualified_key)
        if value is not None:
            self._emit("hit", qualified_key, parts)
        return value

    def get_json(self, parts: Sequence[Any]) -> Optional[Any]:
        raw = self.get_bytes(parts)
        if raw is None:
            return None
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            logger.warning(
                "Cache value for feature=%s namespace=%s is not valid JSON", self._feature, self._namespace
            )
            return None

    def delete(self, parts: Sequence[Any] | Any) -> None:
        seq = self._ensure_parts(parts)
        qualified_key = self._qualify(seq)
        self._client.delete(qualified_key)
        self._emit("delete", qualified_key, seq)

    # Legacy-style helpers -------------------------------------------------
    def get(self, key: Any | Sequence[Any]) -> Optional[bytes]:
        return self.get_bytes(self._ensure_parts(key))

    def set(self, key: Any | Sequence[Any], value: bytes | str, *, ttl: Optional[int] = None) -> None:
        payload = value.encode("utf-8") if isinstance(value, str) else value
        self.set_bytes(self._ensure_parts(key), payload, ttl=ttl)

    def setex(self, key: Any | Sequence[Any], ttl: int, value: bytes | str) -> None:
        if ttl and ttl != self._config.ttl:
            logger.debug(
                "Ignoring custom TTL=%s for feature cache (namespace=%s feature=%s); using configured TTL=%s",
                ttl,
                self._namespace,
                self._feature,
                self._config.ttl,
            )
        self.set(key, value, ttl=self._config.ttl)

    def invalidate_all(self) -> int:
        pattern = f"{self._base_prefix}:{self._namespace.value}:{self._feature}:*"
        deleted = 0
        for qualified_key in self._client.scan_iter(match=pattern):
            self._client.delete(qualified_key)
            deleted += 1
        if deleted:
            self._emit("invalidate", pattern, ["*"])
        return deleted


@dataclass(frozen=True)
class CacheRule:
    namespace: FeatureCacheNamespace
    predicate: Callable[[Tuple[Any, ...]], bool]


def _as_tuple(key: Any | Sequence[Any]) -> Tuple[Any, ...]:
    if isinstance(key, tuple):
        return key
    if isinstance(key, list):
        return tuple(key)
    return (key,)


def _artifact_predicate(parts: Tuple[Any, ...]) -> bool:
    endings = (".arrow", ".feather", ".parquet", ".ipc")
    return any(str(part).lower().endswith(endings) for part in parts if part is not None)


def _environment_predicate(parts: Tuple[Any, ...]) -> bool:
    needles = {"env", "environment"}
    return any(any(token in str(part).lower() for token in needles) for part in parts if part is not None)


def _session_predicate(parts: Tuple[Any, ...]) -> bool:
    needles = {"session", "state"}
    return any(any(token in str(part).lower() for token in needles) for part in parts if part is not None)


DEFAULT_CACHE_RULES: Tuple[CacheRule, ...] = (
    CacheRule(namespace=FeatureCacheNamespace.ARROW_ARTIFACTS, predicate=_artifact_predicate),
    CacheRule(namespace=FeatureCacheNamespace.ENVIRONMENT, predicate=_environment_predicate),
    CacheRule(namespace=FeatureCacheNamespace.SESSION_STATE, predicate=_session_predicate),
)


class FeatureCacheRouter:
    """Heuristic router that maps Redis-style calls to namespace-aware proxies."""

    def __init__(
        self,
        client: "FeatureCacheClient",
        feature: str,
        *,
        default_namespace: FeatureCacheNamespace = FeatureCacheNamespace.ATOM,
        rules: Sequence[CacheRule] = DEFAULT_CACHE_RULES,
    ) -> None:
        self._client = client
        self._feature = feature
        self._default_namespace = default_namespace
        self._rules = tuple(rules)
        self._proxy_cache: Dict[FeatureCacheNamespace, FeatureCacheProxy] = {}

    def _resolve_namespace(self, key: Any | Sequence[Any]) -> FeatureCacheNamespace:
        parts = _as_tuple(key)
        for rule in self._rules:
            if rule.predicate(parts):
                return rule.namespace
        return self._default_namespace

    def _proxy_for(self, namespace: FeatureCacheNamespace) -> FeatureCacheProxy:
        if namespace not in self._proxy_cache:
            self._proxy_cache[namespace] = self._client.for_feature(namespace, self._feature)
        return self._proxy_cache[namespace]

    def _proxy(self, key: Any | Sequence[Any]) -> FeatureCacheProxy:
        namespace = self._resolve_namespace(key)
        return self._proxy_for(namespace)

    # Binary cache helpers -----------------------------------------------
    @staticmethod
    def _flatten_key(key: Any | Sequence[Any]) -> Any:
        if isinstance(key, (list, tuple)) and len(key) == 1:
            return key[0]
        return key

    def _should_use_binary_cache(self, key: Any | Sequence[Any], value: Any = None) -> bool:
        flattened = self._flatten_key(key)
        if isinstance(flattened, bytes):
            flattened = flattened.decode("utf-8", "ignore")
        if isinstance(flattened, (list, tuple)):
            flattened = "/".join(str(part) for part in flattened)
        if not isinstance(flattened, str):
            return bool(value and isinstance(value, (bytes, bytearray, memoryview)))
        lowered = flattened.lower()
        binary_endings = (".arrow", ".feather", ".parquet", ".ipc", ".csv", ".json", ".xlsx", ".xls")
        if "/" in flattened or lowered.endswith(binary_endings):
            return True
        if value is not None and isinstance(value, (bytes, bytearray, memoryview)):
            return True
        return False

    def _binary_target(self, key: Any | Sequence[Any]) -> CacheScope | str:
        flattened = self._flatten_key(key)
        if isinstance(flattened, bytes):
            flattened = flattened.decode("utf-8", "ignore")
        if isinstance(flattened, str):
            lowered = flattened.lower()
            binary_endings = (".arrow", ".feather", ".parquet", ".ipc", ".csv", ".json", ".xlsx", ".xls")
            if "/" in flattened or lowered.endswith(binary_endings):
                return flattened
            return CacheScope(client=self._feature, project=self._feature, artifact=flattened)
        return CacheScope(client=self._feature, project=self._feature, artifact=str(flattened))

    @staticmethod
    def _ensure_bytes(value: Any) -> bytes:
        if isinstance(value, bytes):
            return value
        if isinstance(value, bytearray):
            return bytes(value)
        if isinstance(value, memoryview):
            return value.tobytes()
        return str(value).encode("utf-8")

    # Redis-like API -------------------------------------------------------
    def get(self, key: Any | Sequence[Any]) -> Optional[bytes]:
        if self._should_use_binary_cache(key):
            target = self._binary_target(key)
            fetch = binary_cache.get(target)
            return fetch.payload
        return self._proxy(key).get(key)

    def set(
        self,
        key: Any | Sequence[Any],
        value: bytes | str,
        *,
        ttl: Optional[int] = None,
        ex: Optional[int] = None,
        px: Optional[int] = None,
        keepttl: bool = False,
        exat: Optional[int] = None,
        pxat: Optional[int] = None,
        **kwargs: Any,
    ) -> None:
        if keepttl:
            logger.debug("Ignoring keepttl flag for feature cache set; namespace configuration controls TTLs")
        if exat is not None or pxat is not None:
            logger.debug(
                "Ignoring absolute expiry provided to feature cache set (exat=%s pxat=%s); using namespace TTL",
                exat,
                pxat,
            )
        if kwargs:
            logger.debug("Ignoring unsupported Redis SET options: %s", ", ".join(sorted(kwargs)))

        effective_ttl: Optional[int] = ttl
        if ex is not None:
            if effective_ttl is not None and effective_ttl != ex:
                logger.debug(
                    "Conflicting TTL values provided to feature cache set (ttl=%s ex=%s); favouring ex", ttl, ex
                )
            effective_ttl = ex
        if px is not None:
            px_seconds = int(px / 1000) if px >= 0 else 0
            if effective_ttl is not None and effective_ttl != px_seconds:
                logger.debug(
                    "Conflicting TTL values provided to feature cache set (current=%s px=%s); favouring px", 
                    effective_ttl,
                    px,
                )
            effective_ttl = px_seconds

        if self._should_use_binary_cache(key, value):
            target = self._binary_target(key)
            payload = self._ensure_bytes(value)
            binary_cache.set(target, payload, ttl=effective_ttl)
            return

        self._proxy(key).set(key, value, ttl=effective_ttl)

    def setex(self, key: Any | Sequence[Any], ttl: int, value: bytes | str) -> None:
        if self._should_use_binary_cache(key, value):
            target = self._binary_target(key)
            payload = self._ensure_bytes(value)
            binary_cache.set(target, payload, ttl=ttl)
            return
        self._proxy(key).setex(key, ttl, value)

    def delete(self, key: Any | Sequence[Any]) -> None:
        if self._should_use_binary_cache(key):
            target = self._binary_target(key)
            binary_cache.delete(target)
        self._proxy(key).delete(key)

    def invalidate_all(self) -> int:
        deleted = 0
        for proxy in self._proxy_cache.values():
            deleted += proxy.invalidate_all()
        return deleted

    def ping(self) -> bool:
        try:
            return bool(self._client._client.ping())  # type: ignore[attr-defined]
        except Exception:  # noqa: BLE001 - compatibility shim
            return False


class FeatureCacheClient:
    """High-level cache client dedicated to feature workloads."""

    def __init__(
        self,
        *,
        redis_client: Optional[Redis] = None,
        base_prefix: str = "feature-cache",
        namespace_config: Optional[Mapping[FeatureCacheNamespace, NamespaceConfig]] = None,
    ) -> None:
        self._client = redis_client or get_sync_redis()
        self._base_prefix = base_prefix
        self._namespace_config = dict(namespace_config or _default_namespace_config(f"{base_prefix}:events"))

    def _get_config(self, namespace: FeatureCacheNamespace) -> NamespaceConfig:
        try:
            return self._namespace_config[namespace]
        except KeyError as exc:  # pragma: no cover - defensive guard
            raise KeyError(f"No namespace configuration defined for {namespace!r}") from exc

    def for_feature(self, namespace: FeatureCacheNamespace, feature: str) -> FeatureCacheProxy:
        safe_feature = _normalise_key_component(feature)
        return FeatureCacheProxy(
            self._client,
            namespace,
            safe_feature,
            self._get_config(namespace),
            self._base_prefix,
        )

    # Convenience helpers -------------------------------------------------
    def atom(self, feature: str) -> FeatureCacheProxy:
        return self.for_feature(FeatureCacheNamespace.ATOM, feature)

    def molecule(self, feature: str) -> FeatureCacheProxy:
        return self.for_feature(FeatureCacheNamespace.MOLECULE, feature)

    def workflow(self, feature: str) -> FeatureCacheProxy:
        return self.for_feature(FeatureCacheNamespace.WORKFLOW, feature)

    def exhibition(self, feature: str) -> FeatureCacheProxy:
        return self.for_feature(FeatureCacheNamespace.EXHIBITION, feature)

    def session_state(self, feature: str) -> FeatureCacheProxy:
        return self.for_feature(FeatureCacheNamespace.SESSION_STATE, feature)

    def environment(self, feature: str) -> FeatureCacheProxy:
        return self.for_feature(FeatureCacheNamespace.ENVIRONMENT, feature)

    def artifact(self, feature: str) -> FeatureCacheProxy:
        return self.for_feature(FeatureCacheNamespace.ARROW_ARTIFACTS, feature)

    def router(
        self,
        feature: str,
        *,
        default_namespace: FeatureCacheNamespace = FeatureCacheNamespace.ATOM,
        rules: Sequence[CacheRule] = DEFAULT_CACHE_RULES,
    ) -> FeatureCacheRouter:
        return FeatureCacheRouter(self, feature, default_namespace=default_namespace, rules=rules)


feature_cache = FeatureCacheClient()

__all__ = [
    "FeatureCacheClient",
    "FeatureCacheNamespace",
    "FeatureCacheProxy",
    "FeatureCacheRouter",
    "NamespaceConfig",
    "feature_cache",
]

