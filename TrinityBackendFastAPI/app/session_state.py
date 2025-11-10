import json
import io
from datetime import datetime
from typing import Dict, Optional

from app.core.redis import get_sync_redis
from .DataStorageRetrieval.db import upsert_project_state, fetch_project_state
from .DataStorageRetrieval.minio_utils import get_client, MINIO_BUCKET

TTL = 3600
NAMESPACE = "projstate"


redis_client = get_sync_redis()


def _redis_key(client_id: str, app_id: str, project_id: str) -> str:
    return f"{NAMESPACE}:{client_id}:{app_id}:{project_id}"


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
    redis_client.setex(key, TTL, json.dumps(state, default=str))
    await upsert_project_state(client_id, app_id, project_id, state)
    _save_snapshot(client_id, app_id, project_id, state)


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
        return db_state
    return _load_latest_snapshot(client_id, app_id, project_id)
