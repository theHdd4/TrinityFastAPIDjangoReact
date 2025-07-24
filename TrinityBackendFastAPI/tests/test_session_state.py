import asyncio, json, types, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "app"))
import app.session_state as ss

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
