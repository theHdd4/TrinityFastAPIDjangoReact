import asyncio, json, types, importlib.util, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Create stub modules so session_state can resolve its package imports without
# pulling in the full FastAPI application on import.
sys.modules.setdefault("app", types.ModuleType("app"))
sys.modules.setdefault("app.features", types.ModuleType("app.features"))
sys.modules.setdefault(
    "app.features.feature_overview", types.ModuleType("app.features.feature_overview")
)
sys.modules.setdefault(
    "app.DataStorageRetrieval", types.ModuleType("app.DataStorageRetrieval")
)
fo_deps_stub = types.ModuleType("app.features.feature_overview.deps")
fo_deps_stub.redis_client = None
sys.modules["app.features.feature_overview.deps"] = fo_deps_stub

db_stub = types.ModuleType("app.DataStorageRetrieval.db")
db_stub.upsert_project_state = lambda *a, **k: None
db_stub.fetch_project_state = lambda *a, **k: None
db_stub.fetch_client_app_project = lambda *a, **k: ("c","a","p")
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

    asyncio.run(ss.save_state("c","a","p", {"x":1}))
    assert json.loads(redis.store[ss._redis_key("c","a","p")]) == {"x":1}

    redis.store.clear()
    state = asyncio.run(ss.load_state("c","a","p"))
    assert state == {"x":1}

    redis.store.clear(); dummy_upsert.store.clear()
    state2 = asyncio.run(ss.load_state("c","a","p"))
    assert state2 == {"x":1}
