import json
from typing import Dict

from app.core.redis import get_sync_redis

NAMESPACE = "masterconfig"
TTL = 3600


redis_client = get_sync_redis()

def _ns(client_id: str, app_id: str, project_id: str) -> str:
    return f"{client_id}:{app_id}:{project_id}"


def _config_key(client_id: str, app_id: str, project_id: str, file_key: str) -> str:
    ns = _ns(client_id, app_id, project_id)
    return f"{NAMESPACE}:{ns}:{file_key}"


def cache_master_config(client_id: str, app_id: str, project_id: str, file_key: str, config: Dict):
    """Cache validation configuration details in Redis."""
    key = _config_key(client_id, app_id, project_id, file_key)
    data = {
        "master_file": file_key,
        "config": config,
        "type": "Validation",
    }
    redis_client.setex(key, TTL, json.dumps(data, default=str))


def get_master_config(client_id: str, app_id: str, project_id: str, file_key: str) -> Dict | None:
    key = _config_key(client_id, app_id, project_id, file_key)
    val = redis_client.get(key)
    if val:
        try:
            return json.loads(val)
        except Exception:
            return None
    return None
