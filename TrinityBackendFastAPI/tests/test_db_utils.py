import types, asyncio, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "app"))
import DataStorageRetrieval.db as db

class DummyS3Error(Exception):
    def __init__(self, code):
        self.code = code

class DummyMinio:
    def __init__(self, *a, **k):
        pass
    def stat_object(self, bucket, obj):
        raise DummyS3Error("NoSuchKey")

class DummyConn:
    async def fetchrow(self, *a):
        return {"arrow_object": "pref/data.arrow", "flight_path": "tbl/path"}
    async def close(self):
        pass

def dummy_remove(obj):
    dummy_remove.called = obj

async def dummy_delete(obj):
    dummy_delete.called = obj

async def dummy_connect(*a, **k):
    return DummyConn()


def test_arrow_dataset_exists_missing_object(monkeypatch):
    monkeypatch.setattr(db, "asyncpg", types.SimpleNamespace(connect=dummy_connect))
    monkeypatch.setattr(db, "delete_arrow_dataset", dummy_delete)
    monkeypatch.setattr("DataStorageRetrieval.flight_registry.remove_arrow_object", dummy_remove)
    minio_mod = types.ModuleType("minio")
    minio_mod.Minio = DummyMinio
    error_mod = types.ModuleType("minio.error")
    error_mod.S3Error = DummyS3Error
    monkeypatch.setitem(sys.modules, "minio", minio_mod)
    monkeypatch.setitem(sys.modules, "minio.error", error_mod)
    monkeypatch.setattr("DataStorageRetrieval.arrow_client.flight_table_exists", lambda p: True)
    monkeypatch.setenv("MINIO_BUCKET", "bucket")
    monkeypatch.setenv("MINIO_ENDPOINT", "minio:9000")
    monkeypatch.setenv("MINIO_ACCESS_KEY", "minio")
    monkeypatch.setenv("MINIO_SECRET_KEY", "minio123")

    result = asyncio.run(db.arrow_dataset_exists(1, "a", "k"))
    assert result is False
    assert dummy_delete.called == "pref/data.arrow"
    assert dummy_remove.called == "pref/data.arrow"


def test_arrow_dataset_exists_missing_flight(monkeypatch):
    class OkMinio:
        def __init__(self, *a, **k):
            pass
        def stat_object(self, bucket, obj):
            return True

    monkeypatch.setattr(db, "asyncpg", types.SimpleNamespace(connect=dummy_connect))
    monkeypatch.setattr(db, "delete_arrow_dataset", dummy_delete)
    monkeypatch.setattr("DataStorageRetrieval.flight_registry.remove_arrow_object", dummy_remove)
    minio_mod = types.ModuleType("minio")
    minio_mod.Minio = OkMinio
    error_mod = types.ModuleType("minio.error")
    error_mod.S3Error = DummyS3Error
    monkeypatch.setitem(sys.modules, "minio", minio_mod)
    monkeypatch.setitem(sys.modules, "minio.error", error_mod)
    monkeypatch.setattr("DataStorageRetrieval.arrow_client.flight_table_exists", lambda p: False)
    monkeypatch.setenv("MINIO_BUCKET", "bucket")
    monkeypatch.setenv("MINIO_ENDPOINT", "minio:9000")
    monkeypatch.setenv("MINIO_ACCESS_KEY", "minio")
    monkeypatch.setenv("MINIO_SECRET_KEY", "minio123")

    result = asyncio.run(db.arrow_dataset_exists(1, "a", "k"))
    assert result is False
    assert dummy_delete.called == "pref/data.arrow"
    assert dummy_remove.called == "pref/data.arrow"


def test_upsert_and_fetch_project_state(monkeypatch):
    stored = {}

    class Conn:
        async def execute(self, q, *p):
            if q.strip().startswith("INSERT"):
                stored[p[0]] = p[3]
        async def fetchrow(self, q, pid):
            if pid in stored:
                return {"state": stored[pid]}
            return None
        async def close(self):
            pass

    async def connect(**kw):
        return Conn()

    monkeypatch.setattr(db, "asyncpg", types.SimpleNamespace(connect=connect, Json=lambda d: d))

    asyncio.run(db.upsert_project_state("c", "a", "pid", {"x": 1}))
    res = asyncio.run(db.fetch_project_state("pid"))
    assert res == {"x": 1}
