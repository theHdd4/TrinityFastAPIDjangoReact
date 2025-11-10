import hashlib
import json
import io
from datetime import datetime
from typing import Dict, Optional

from app.core.redis import get_sync_redis
from .DataStorageRetrieval.db import upsert_project_state, fetch_project_state
from .DataStorageRetrieval.minio_utils import get_client, MINIO_BUCKET
from app.core.cache_events import emit_cache_invalidation

TTL = 3600
NAMESPACE = "projstate"
VERSION_SUFFIX = ":version"


redis_client = get_sync_redis()


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
    version_key = _redis_version_key(client_id, app_id, project_id)
    version = _state_version(state)
    redis_client.setex(key, TTL, json.dumps(state, default=str))
    redis_client.setex(version_key, TTL, version)
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
    key = _redis_key(client_id, app_id, project_id)
    cached = redis_client.get(key)
    if cached:
        try:
            return json.loads(cached)
        except Exception:
            pass
    db_state = await fetch_project_state(project_id)
    if db_state is not None:
        redis_client.setex(key, TTL, json.dumps(db_state, default=str))
        redis_client.setex(_redis_version_key(client_id, app_id, project_id), TTL, _state_version(db_state))
        return db_state
    return _load_latest_snapshot(client_id, app_id, project_id)


async def delete_state(client_id: str, app_id: str, project_id: str) -> None:
    key = _redis_key(client_id, app_id, project_id)
    redis_client.delete(key)
    redis_client.delete(_redis_version_key(client_id, app_id, project_id))
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
