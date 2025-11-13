import asyncio, json, types, importlib.util, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Create stub modules so session_state can resolve its package imports without
# pulling in the full FastAPI application on import.
sys.modules.setdefault("app", types.ModuleType("app"))
sys.modules["app"].__path__ = []
sys.modules.setdefault("app.features", types.ModuleType("app.features"))
sys.modules.setdefault(
    "app.features.feature_overview", types.ModuleType("app.features.feature_overview")
)
sys.modules.setdefault(
    "app.DataStorageRetrieval", types.ModuleType("app.DataStorageRetrieval")
)
sys.modules.setdefault("app.core", types.ModuleType("app.core"))
redis_module = types.ModuleType("app.core.redis")
redis_module.get_sync_redis = lambda *a, **k: types.SimpleNamespace()
sys.modules["app.core.redis"] = redis_module
fo_deps_stub = types.ModuleType("app.features.feature_overview.deps")
fo_deps_stub.redis_client = None
sys.modules["app.features.feature_overview.deps"] = fo_deps_stub

cache_events_stub = types.ModuleType("app.core.cache_events")
cache_events_stub.calls = []


def _emit_cache_invalidation(namespace, identifiers, **payload):
    cache_events_stub.calls.append(
        {
            "namespace": namespace,
            "identifiers": dict(identifiers),
            **payload,
        }
    )


cache_events_stub.emit_cache_invalidation = _emit_cache_invalidation
sys.modules["app.core.cache_events"] = cache_events_stub

db_stub = types.ModuleType("app.DataStorageRetrieval.db")
db_stub.upsert_project_state = lambda *a, **k: None
db_stub.fetch_project_state = lambda *a, **k: None

async def _fetch_client_app_project(*args, **kwargs):
    return ("c", "a", "p")


db_stub.fetch_client_app_project = _fetch_client_app_project
db_stub.record_arrow_dataset = lambda *a, **k: None
db_stub.rename_arrow_dataset = lambda *a, **k: None
db_stub.delete_arrow_dataset = lambda *a, **k: None
db_stub.arrow_dataset_exists = lambda *a, **k: False
db_stub.get_dataset_info = lambda *a, **k: None
sys.modules["app.DataStorageRetrieval.db"] = db_stub

minio_stub = types.ModuleType("app.DataStorageRetrieval.minio_utils")
minio_stub.get_client = lambda: None
minio_stub.MINIO_BUCKET = "bucket"
minio_stub.ensure_minio_bucket = lambda *a, **k: None
minio_stub.save_arrow_table = lambda *a, **k: {"object_name": "obj"}
minio_stub.upload_to_minio = lambda *a, **k: {"object_name": "obj"}
minio_stub.get_arrow_dir = lambda: "dir"
minio_stub.ARROW_DIR = "dir"
sys.modules["app.DataStorageRetrieval.minio_utils"] = minio_stub

spec = importlib.util.spec_from_file_location(
    "app.session_state", ROOT / "app" / "session_state.py"
)
ss = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = ss
spec.loader.exec_module(ss)

class DummyRedis:
    def __init__(self):
        self.store = {}
    def get(self, k):
        return self.store.get(k)
    def setex(self, k, t, v):
        self.store[k] = v
    def delete(self, *keys):
        removed = 0
        for key in keys:
            if key in self.store:
                del self.store[key]
                removed += 1
        return removed

class DummyMinio:
    def __init__(self):
        self.objects = {}
    def put_object(self, bucket, name, data, length, content_type=None):
        self.objects[name] = data.read()
    def list_objects(self, bucket, prefix=""):
        return [types.SimpleNamespace(object_name=n, last_modified=i)
                for i, n in enumerate(self.objects) if n.startswith(prefix)]
    def get_object(self, bucket, name):
        return types.SimpleNamespace(read=lambda: self.objects[name])

async def dummy_upsert(c,a,p,state):
    dummy_upsert.store[p] = state

dummy_upsert.store = {}

async def dummy_fetch(p):
    return dummy_upsert.store.get(p)


def test_save_and_load(monkeypatch):
    redis = DummyRedis()
    minio = DummyMinio()
    monkeypatch.setattr(ss, "redis_client", redis)
    monkeypatch.setattr(ss, "get_client", lambda: minio)
    monkeypatch.setattr(ss, "MINIO_BUCKET", "bucket")
    monkeypatch.setattr(ss, "upsert_project_state", dummy_upsert)
    monkeypatch.setattr(ss, "fetch_project_state", dummy_fetch)
    cache_events_stub.calls.clear()

    asyncio.run(ss.save_state("c","a","p", {"x":1}))
    assert json.loads(redis.store[ss._redis_key("c","a","p")]) == {"x":1}
    version_key = ss._redis_version_key("c","a","p")
    assert version_key in redis.store
    assert cache_events_stub.calls and cache_events_stub.calls[0]["namespace"] == "session"
    assert cache_events_stub.calls[0]["action"] == "write"
    assert cache_events_stub.calls[0]["version"] == redis.store[version_key]

    redis.store.clear()
    state = asyncio.run(ss.load_state("c","a","p"))
    assert state == {"x":1}

    redis.store.clear(); dummy_upsert.store.clear()
    state2 = asyncio.run(ss.load_state("c","a","p"))
    assert state2 == {"x":1}
    assert len(cache_events_stub.calls) == 1


def test_concurrent_writes_emit_invalidation(monkeypatch):
    redis = DummyRedis()
    minio = DummyMinio()
    monkeypatch.setattr(ss, "redis_client", redis)
    monkeypatch.setattr(ss, "get_client", lambda: minio)
    monkeypatch.setattr(ss, "MINIO_BUCKET", "bucket")
    monkeypatch.setattr(ss, "upsert_project_state", dummy_upsert)
    monkeypatch.setattr(ss, "fetch_project_state", dummy_fetch)
    cache_events_stub.calls.clear()

    async def writer(payload):
        await ss.save_state("c", "a", "p", payload)

    async def run_writes():
        await asyncio.gather(writer({"idx": 1}), writer({"idx": 2}))

    asyncio.run(run_writes())

    assert len(cache_events_stub.calls) == 2
    assert all(call["action"] == "write" for call in cache_events_stub.calls)
    version_key = ss._redis_version_key("c", "a", "p")
    assert version_key in redis.store
    assert cache_events_stub.calls[-1]["version"] == redis.store[version_key]

    cache_events_stub.calls.clear()
    asyncio.run(ss.delete_state("c", "a", "p"))
    assert cache_events_stub.calls and cache_events_stub.calls[-1]["action"] == "delete"
    assert ss._redis_key("c", "a", "p") not in redis.store
