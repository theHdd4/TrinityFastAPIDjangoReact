from __future__ import annotations

import hashlib
import io
import json
from datetime import datetime
from typing import Dict, Optional, Tuple

from app.core.cache_events import emit_cache_invalidation
from app.core.feature_cache import feature_cache
from .DataStorageRetrieval.db import fetch_project_state, upsert_project_state
from .DataStorageRetrieval.minio_utils import MINIO_BUCKET, get_client

TTL = 3600
NAMESPACE = "projstate"
VERSION_SUFFIX = ":version"


state_cache = feature_cache.session_state("project_state")
version_cache = feature_cache.session_state("project_state_version")


def _cache_parts(client_id: str, app_id: str, project_id: str) -> Tuple[str, str, str]:
    return client_id, app_id, project_id


def _redis_key(client_id: str, app_id: str, project_id: str) -> str:
    return f"{NAMESPACE}:{client_id}:{app_id}:{project_id}"


def _redis_version_key(client_id: str, app_id: str, project_id: str) -> str:
    return f"{_redis_key(client_id, app_id, project_id)}{VERSION_SUFFIX}"


def _state_version(state: Dict) -> str:
    payload = json.dumps(state, sort_keys=True, default=str)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _snapshot_prefix(client_id: str, app_id: str, project_id: str) -> str:
    return f"{client_id}/{app_id}/{project_id}/snapshots/"


def _save_snapshot(client_id: str, app_id: str, project_id: str, state: Dict) -> None:
    client = get_client()
    prefix = _snapshot_prefix(client_id, app_id, project_id)
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    object_name = f"{prefix}{ts}.json"
    data = json.dumps(state, default=str).encode()
    client.put_object(MINIO_BUCKET, object_name, io.BytesIO(data), len(data), content_type="application/json")


def _load_latest_snapshot(client_id: str, app_id: str, project_id: str) -> Optional[Dict]:
    client = get_client()
    prefix = _snapshot_prefix(client_id, app_id, project_id)
    objects = list(client.list_objects(MINIO_BUCKET, prefix=prefix))
    if not objects:
        return None
    latest = max(objects, key=lambda o: o.last_modified)
    response = client.get_object(MINIO_BUCKET, latest.object_name)
    data = response.read()
    try:
        return json.loads(data)
    except Exception:
        return None


async def save_state(client_id: str, app_id: str, project_id: str, state: Dict) -> None:
    key = _redis_key(client_id, app_id, project_id)
    version = _state_version(state)
    parts = _cache_parts(client_id, app_id, project_id)
    state_cache.set_json(parts, state, ttl=TTL)
    version_cache.set(parts, version, ttl=TTL)
    await upsert_project_state(client_id, app_id, project_id, state)
    _save_snapshot(client_id, app_id, project_id, state)
    emit_cache_invalidation(
        "session",
        {
            "client_id": client_id,
            "app_id": app_id,
            "project_id": project_id,
            "redis_key": key,
        },
        action="write",
        ttl=TTL,
        version=version,
        metadata={"source": "fastapi"},
    )


async def load_state(client_id: str, app_id: str, project_id: str) -> Optional[Dict]:
    parts = _cache_parts(client_id, app_id, project_id)
    cached = state_cache.get_json(parts)
    if cached is not None:
        return cached
    db_state = await fetch_project_state(project_id)
    if db_state is not None:
        state_cache.set_json(parts, db_state, ttl=TTL)
        version_cache.set(parts, _state_version(db_state), ttl=TTL)
        return db_state
    snapshot = _load_latest_snapshot(client_id, app_id, project_id)
    if snapshot is not None:
        state_cache.set_json(parts, snapshot, ttl=TTL)
        version_cache.set(parts, _state_version(snapshot), ttl=TTL)
    return snapshot


async def delete_state(client_id: str, app_id: str, project_id: str) -> None:
    key = _redis_key(client_id, app_id, project_id)
    parts = _cache_parts(client_id, app_id, project_id)
    state_cache.delete(parts)
    version_cache.delete(parts)
    emit_cache_invalidation(
        "session",
        {
            "client_id": client_id,
            "app_id": app_id,
            "project_id": project_id,
            "redis_key": key,
        },
        action="delete",
        ttl=0,
        metadata={"source": "fastapi"},
    )
