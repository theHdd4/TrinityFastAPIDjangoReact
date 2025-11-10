from __future__ import annotations

import asyncio
import importlib.util
import json
import os
import sys
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

sys.modules.setdefault("app", types.ModuleType("app"))
sys.modules["app"].__path__ = []
sys.modules.setdefault("app.core", types.ModuleType("app.core"))
sys.modules.setdefault("app.DataStorageRetrieval", types.ModuleType("app.DataStorageRetrieval"))
sys.modules["app.DataStorageRetrieval"].__path__ = []
flight_stub = types.ModuleType("app.DataStorageRetrieval.flight_registry")
flight_stub.get_arrow_for_flight_path = lambda *a, **k: None
sys.modules["app.DataStorageRetrieval.flight_registry"] = flight_stub


class DummyRedis:
    def __init__(self):
        self.store: dict[str, str] = {}
        self.hash_store: dict[str, dict[str, str]] = {}

    def get(self, key: str):
        return self.store.get(key)

    def setex(self, key: str, ttl: int, value):
        self.store[key] = value

    def set(self, key: str, value):
        self.store[key] = value

    def hgetall(self, key: str):
        return self.hash_store.get(key, {})

    def hset(self, key: str, field: str, value: str):
        self.hash_store.setdefault(key, {})[field] = value

    def delete(self, *keys: str):
        for key in keys:
            self.store.pop(key, None)


DUMMY_REDIS = DummyRedis()


redis_stub = types.ModuleType("app.core.redis")
redis_stub_calls = {"decode": []}


def _get_sync_redis(*, decode_responses: bool = False):
    redis_stub_calls["decode"].append(decode_responses)
    return DUMMY_REDIS


redis_stub.get_sync_redis = _get_sync_redis
sys.modules["app.core.redis"] = redis_stub

# Reuse the cache event stub installed by the session_state tests if present.
cache_events_stub = sys.modules.get("app.core.cache_events")
if cache_events_stub is None:
    cache_events_stub = types.ModuleType("app.core.cache_events")
    cache_events_stub.calls = []

    def _emit(namespace, identifiers, **payload):
        cache_events_stub.calls.append(
            {
                "namespace": namespace,
                "identifiers": dict(identifiers),
                **payload,
            }
        )

    cache_events_stub.emit_cache_invalidation = _emit
    sys.modules["app.core.cache_events"] = cache_events_stub
else:
    cache_events_stub.calls.clear()

# Ensure DataStorageRetrieval.db provides async fetch helper expected by utils.
db_stub = sys.modules.get("app.DataStorageRetrieval.db")
if db_stub is None:
    db_stub = types.ModuleType("app.DataStorageRetrieval.db")
    sys.modules["app.DataStorageRetrieval.db"] = db_stub


async def _fetch_client_app_project(*args, **kwargs):
    return ("ACME", "Studio", "Alpha")


db_stub.fetch_client_app_project = _fetch_client_app_project

def _load_module(name: str, path: Path):
    if name in sys.modules:
        del sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


env_utils = _load_module("app.core.utils", ROOT / "app" / "core" / "utils.py")
arrow_client = _load_module(
    "app.DataStorageRetrieval.arrow_client",
    ROOT / "app" / "DataStorageRetrieval" / "arrow_client.py",
)

ENV_SOURCE = {
    "CLIENT_NAME": "ACME",
    "APP_NAME": "Studio",
    "PROJECT_NAME": "Alpha",
    "identifiers": ["id1"],
}


async def _fake_query_env_vars(*args, **kwargs):
    return dict(ENV_SOURCE)


env_utils._query_env_vars = _fake_query_env_vars
env_utils._query_env_vars_by_names = _fake_query_env_vars
env_utils._query_registry_env = _fake_query_env_vars


def test_env_version_refresh(monkeypatch):
    DUMMY_REDIS.store.clear()
    cache_events_stub.calls.clear()
    env_utils._ENV_CACHE.clear()

    async def initial_fetch():
        return await env_utils.get_env_vars(
            "cid",
            "aid",
            "pid",
            client_name="ACME",
            app_name="Studio",
            project_name="Alpha",
        )

    env = asyncio.run(initial_fetch())
    env_key = env_utils._redis_env_key("ACME", "Studio", "Alpha")
    stored = json.loads(DUMMY_REDIS.store[env_key])
    initial_version = stored["_env_version"]
    assert env["_env_version"] == initial_version
    assert cache_events_stub.calls and cache_events_stub.calls[0]["namespace"] == "env"

    # Arrow client sees the same version and updates ENV_VERSION_HASH
    os.environ.update({"CLIENT_NAME": "ACME", "APP_NAME": "Studio", "PROJECT_NAME": "Alpha"})
    arrow_env = arrow_client.load_env_from_redis()
    assert arrow_env.get("_env_version") == initial_version
    assert os.environ["ENV_VERSION_HASH"] == initial_version

    # Simulate schema update while two workers fetch concurrently
    ENV_SOURCE["identifiers"] = ["id1", "id2"]

    async def concurrent_fetches():
        return await asyncio.gather(
            env_utils.get_env_vars(
                "cid",
                "aid",
                "pid",
                client_name="ACME",
                app_name="Studio",
                project_name="Alpha",
                use_cache=False,
            ),
            env_utils.get_env_vars(
                "cid",
                "aid",
                "pid",
                client_name="ACME",
                app_name="Studio",
                project_name="Alpha",
            ),
        )

    results = asyncio.run(concurrent_fetches())
    updated = json.loads(DUMMY_REDIS.store[env_key])
    new_version = updated["_env_version"]
    assert new_version != initial_version
    assert results[0]["_env_version"] == new_version
    assert cache_events_stub.calls[-1]["version"] == new_version

    final_env = asyncio.run(
        env_utils.get_env_vars(
            "cid",
            "aid",
            "pid",
            client_name="ACME",
            app_name="Studio",
            project_name="Alpha",
        )
    )
    assert final_env["_env_version"] == new_version

    arrow_env_updated = arrow_client.load_env_from_redis()
    assert arrow_env_updated.get("_env_version") == new_version
    assert os.environ["ENV_VERSION_HASH"] == new_version
