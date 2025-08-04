import os
import sys
import pathlib
import pytest
pd = pytest.importorskip("pandas")
import pyarrow.flight as flight
import threading
import json

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "app"))
import importlib.util
import types
if "minio" not in sys.modules:
    minio_mod = types.ModuleType("minio")
    class Minio:
        def __init__(self, *a, **k):
            pass

        def get_object(self, *a, **k):
            class Resp:
                def read(self):
                    return b""

            return Resp()

    minio_mod.Minio = Minio
    error_mod = types.ModuleType("minio.error")
    class S3Error(Exception):
        pass

    error_mod.S3Error = S3Error
    common_mod = types.ModuleType("minio.commonconfig")
    class CopySource:
        def __init__(self, bucket, name):
            self.bucket_name = bucket
            self.object_name = name

    common_mod.CopySource = CopySource
    sys.modules["minio"] = minio_mod
    sys.modules["minio.error"] = error_mod
    sys.modules["minio.commonconfig"] = common_mod
if "pymongo" not in sys.modules:
    pymod = types.ModuleType("pymongo")
    class MongoClient:
        def __init__(self, *a, **k):
            self.admin = self

        def command(self, *a, **k):
            pass

        def __getitem__(self, name):
            return {}

    pymod.MongoClient = MongoClient
    sys.modules["pymongo"] = pymod
if "redis" not in sys.modules:
    redis_mod = types.ModuleType("redis")
    class Redis:
        def __init__(self, *a, **k):
            pass

        def get(self, k):
            return None

        def set(self, k, v):
            pass

        def delete(self, k):
            pass

    redis_mod.Redis = Redis
    sys.modules["redis"] = redis_mod
if "motor.motor_asyncio" not in sys.modules:
    motor_mod = types.ModuleType("motor.motor_asyncio")
    class AsyncIOMotorClient:
        def __init__(self, *a, **k):
            pass

        def __getitem__(self, name):
            return {}
    class AsyncIOMotorCollection:
        pass

    motor_mod.AsyncIOMotorClient = AsyncIOMotorClient
    motor_mod.AsyncIOMotorCollection = AsyncIOMotorCollection
    sys.modules["motor.motor_asyncio"] = motor_mod
from app.flight_server import ArrowFlightServer
arrow_client = importlib.import_module("app.DataStorageRetrieval.arrow_client")
flight_registry = importlib.import_module("app.DataStorageRetrieval.flight_registry")


def load_routes():
    pkg_base = ROOT / "app"
    packages = [
        "app",
        "app.features",
        "app.features.data_upload_validate",
        "app.features.data_upload_validate.app",
    ]
    for pkg in packages:
        if pkg not in sys.modules:
            mod = types.ModuleType(pkg)
            subpath = pkg.split(".")[1:]
            mod.__path__ = [str(pkg_base / "/".join(subpath))]
            sys.modules[pkg] = mod
    spec = importlib.util.spec_from_file_location(
        "app.features.data_upload_validate.app.routes",
        pkg_base / "features/data_upload_validate/app/routes.py",
    )
    routes = importlib.util.module_from_spec(spec)
    sys.modules["app.features.data_upload_validate.app.routes"] = routes
    if "pymongo" not in sys.modules:
        pymod = types.ModuleType("pymongo")
        class MongoClient:
            def __init__(self, *a, **k):
                self.admin = self
            def command(self, *a, **k):
                pass
            def __getitem__(self, name):
                return {}
        pymod.MongoClient = MongoClient
        sys.modules["pymongo"] = pymod
    if "motor.motor_asyncio" not in sys.modules:
        motor_mod = types.ModuleType("motor.motor_asyncio")
        class AsyncIOMotorClient:
            def __init__(self, *a, **k):
                pass

            def __getitem__(self, name):
                return {}

        class AsyncIOMotorCollection:
            pass

        motor_mod.AsyncIOMotorClient = AsyncIOMotorClient
        motor_mod.AsyncIOMotorCollection = AsyncIOMotorCollection
        sys.modules["motor.motor_asyncio"] = motor_mod
    if "redis" not in sys.modules:
        redis_mod = types.ModuleType("redis")
        class Redis:
            def __init__(self, *a, **k):
                pass
            def get(self, k):
                return None
            def set(self, k, v):
                pass
            def delete(self, k):
                pass
        redis_mod.Redis = Redis
        sys.modules["redis"] = redis_mod
    if "minio" not in sys.modules:
        minio_mod = types.ModuleType("minio")
        class Minio:
            def __init__(self, *a, **k):
                pass

            def get_object(self, *a, **k):
                class Resp:
                    def read(self):
                        return b""

                return Resp()

        minio_mod.Minio = Minio
        error_mod = types.ModuleType("minio.error")
        class S3Error(Exception):
            pass

        error_mod.S3Error = S3Error
        sys.modules["minio"] = minio_mod
        sys.modules["minio.error"] = error_mod
    spec.loader.exec_module(routes)  # type: ignore
    return routes


def test_flight_round_trip():
    server = ArrowFlightServer(host="0.0.0.0", port=0)
    thread = threading.Thread(target=server.serve, daemon=True)
    thread.start()
    import time
    time.sleep(0.2)

    os.environ["FLIGHT_HOST"] = "localhost"
    os.environ["FLIGHT_PORT"] = str(server.port)
    import importlib
    importlib.reload(arrow_client)

    df = pd.DataFrame({"a": [1, 2], "b": [3, 4]})
    arrow_client.upload_dataframe(df, "test/table")
    result = arrow_client.download_dataframe("test/table")

    server.shutdown()
    thread.join()

    pd.testing.assert_frame_equal(df, result)


def test_flight_registry():
    flight_registry.set_ticket("sales", "file.arrow", "path/to/table", "file.csv")
    path, arrow = flight_registry.get_ticket_by_key("sales")
    assert path == "path/to/table"
    assert arrow == "file.arrow"
    assert flight_registry.get_flight_path_for_csv("file.arrow") == "path/to/table"
    path2, arrow2 = flight_registry.get_latest_ticket_for_basename("file.csv")
    assert path2 == "path/to/table"
    assert arrow2 == "file.arrow"
    arrow_obj = flight_registry.get_arrow_for_flight_path("path/to/table")
    if arrow_obj is not None:
        assert arrow_obj == "file.arrow"


def test_registry_persistence(tmp_path, monkeypatch):
    reg_file = tmp_path / "registry.json"
    monkeypatch.setenv("FLIGHT_REGISTRY_FILE", str(reg_file))
    import importlib
    reg = importlib.reload(flight_registry)
    import app.DataStorageRetrieval.flight_registry as core_reg
    importlib.reload(core_reg)
    reg.set_ticket("sales", "file.arrow", "path/to/table", "file.csv")
    assert json.load(open(reg_file, "r"))[
        "latest_by_key"]["sales"] == "path/to/table"
    reg2 = importlib.reload(flight_registry)
    assert reg2.get_ticket_by_key("sales")[0] == "path/to/table"


def test_rename_arrow_object(tmp_path, monkeypatch):
    reg_file = tmp_path / "registry.json"
    monkeypatch.setenv("FLIGHT_REGISTRY_FILE", str(reg_file))
    import importlib
    reg = importlib.reload(flight_registry)
    import app.DataStorageRetrieval.flight_registry as core_reg
    importlib.reload(core_reg)
    reg.set_ticket("s", "old.arrow", "tbl", "orig.csv")
    reg.rename_arrow_object("old.arrow", "new.arrow")
    assert reg.get_flight_path_for_csv("new.arrow") == "tbl"
    assert reg.get_flight_path_for_csv("old.arrow") is None


def test_rename_dataframe_route(monkeypatch):
    routes = load_routes()

    class DummyMinio:
        def __init__(self):
            self.store = {"pref/old.arrow": b"data"}

        def copy_object(self, bucket, new_obj, source):
            self.store[new_obj] = self.store[source.object_name]

        def remove_object(self, bucket, obj):
            self.store.pop(obj, None)

    class DummyRedis:
        def __init__(self):
            self.cache = {}

        def get(self, k):
            return self.cache.get(k)

        def setex(self, k, t, v):
            self.cache[k] = v

        def delete(self, k):
            self.cache.pop(k, None)

    async def dummy_db(old, new):
        dummy_db.called = (old, new)

    monkeypatch.setattr(routes, "minio_client", DummyMinio())
    monkeypatch.setattr(routes, "redis_client", DummyRedis())
    monkeypatch.setattr(routes, "MINIO_BUCKET", "bucket")
    async def dummy_prefix():
        return "pref/"
    monkeypatch.setattr(routes, "get_object_prefix", dummy_prefix)
    monkeypatch.setattr(routes, "rename_arrow_dataset", dummy_db)
    monkeypatch.setattr(routes, "rename_arrow_object", lambda o, n: None)

    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    app = FastAPI()
    app.include_router(routes.router)

    client = TestClient(app)

    resp = client.post(
        "/rename_dataframe",
        data={"object_name": "pref/old.arrow", "new_filename": "new.arrow"},
    )

    assert resp.status_code == 200
    assert resp.json()["new_name"] == "pref/new.arrow"
    assert dummy_db.called == ("pref/old.arrow", "pref/new.arrow")


def test_delete_dataframe_route(monkeypatch):
    routes = load_routes()

    class DummyMinio:
        def __init__(self):
            self.store = {"pref/data.arrow": b"data"}

        def remove_object(self, bucket, obj):
            self.store.pop(obj, None)

    class DummyRedis:
        def __init__(self):
            self.cache = {}

        def delete(self, k):
            self.cache.pop(k, None)

    async def dummy_db_delete(obj):
        dummy_db_delete.called = obj

    monkeypatch.setattr(routes, "minio_client", DummyMinio())
    monkeypatch.setattr(routes, "redis_client", DummyRedis())
    monkeypatch.setattr(routes, "MINIO_BUCKET", "bucket")
    async def dummy_prefix():
        return "pref/"
    monkeypatch.setattr(routes, "get_object_prefix", dummy_prefix)
    monkeypatch.setattr(routes, "delete_arrow_dataset", dummy_db_delete)
    monkeypatch.setattr(routes, "remove_arrow_object", lambda o: None)

    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    app = FastAPI()
    app.include_router(routes.router)

    client = TestClient(app)

    resp = client.delete("/delete_dataframe", params={"object_name": "pref/data.arrow"})

    assert resp.status_code == 200
    assert resp.json()["deleted"] == "pref/data.arrow"
    assert dummy_db_delete.called == "pref/data.arrow"


def test_save_dataframe_skip_existing(monkeypatch):
    routes = load_routes()

    class DummyMinio:
        def __init__(self):
            self.put_called = False

        def put_object(self, *a, **k):
            self.put_called = True
            return types.SimpleNamespace(etag="1")

    class DummyRedis:
        def set(self, *a, **k):
            pass

        def setex(self, *a, **k):
            pass

    async def dummy_exists(p, a, k):
        return True

    monkeypatch.setattr(routes, "minio_client", DummyMinio())
    monkeypatch.setattr(routes, "redis_client", DummyRedis())
    monkeypatch.setattr(routes, "MINIO_BUCKET", "bucket")
    async def dummy_prefix():
        return "pref/"
    monkeypatch.setattr(routes, "get_object_prefix", dummy_prefix)
    monkeypatch.setattr(routes, "arrow_dataset_exists", dummy_exists)
    monkeypatch.setattr(routes, "record_arrow_dataset", lambda *a, **k: None)
    monkeypatch.setattr(routes, "upload_dataframe", lambda df, path: None)
    monkeypatch.setattr(routes, "set_ticket", lambda *a, **k: None)

    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    app = FastAPI()
    app.include_router(routes.router)
    client = TestClient(app)

    resp = client.post(
        "/save_dataframes",
        data={
            "validator_atom_id": "vid",
            "file_keys": json.dumps(["k"]),
            "overwrite": "false",
        },
        files={"files": ("f.csv", b"a,b\n1,2", "text/csv")},
    )

    assert resp.status_code == 200
    assert resp.json()["minio_uploads"][0]["already_saved"] is True


def test_list_saved_dataframes_env(monkeypatch):
    routes = load_routes()

    # Environment variables already contain the renamed values while Redis
    # still has the old names cached for the same IDs.
    os.environ.update(
        {
            "CLIENT_ID": "1",
            "APP_ID": "2",
            "PROJECT_ID": "3",
            "CLIENT_NAME": "client",
            "APP_NAME": "app",
            "PROJECT_NAME": "proj",
        }
    )

    class DummyRedis:
        def __init__(self, mapping):
            self.mapping = mapping

        def get(self, key):
            return self.mapping.get(key)

        def set(self, key, value):
            self.mapping[key] = value

    # Redis still holds the old names; ``get_object_prefix`` should ignore
    # these stale values, consult ``get_env_vars`` with the correct new names
    # and then refresh the cache.
    redis_mapping = {
        "env:1:2:3:CLIENT_NAME": b"old_client",
        "env:1:2:3:APP_NAME": b"old_app",
        "env:1:2:3:PROJECT_NAME": b"old_project",
    }
    monkeypatch.setattr(routes, "redis_client", DummyRedis(redis_mapping))

    async def fake_get_env_vars(client_id, app_id, project_id, *, client_name, app_name, project_name, **k):
        # Simulate a DB lookup that simply echoes back the provided names.
        return {
            "CLIENT_NAME": client_name,
            "APP_NAME": app_name,
            "PROJECT_NAME": project_name,
        }

    monkeypatch.setattr(routes, "get_env_vars", fake_get_env_vars)

    class DummyMinio:
        def list_objects(self, bucket, prefix="", recursive=False):
            # Yield objects that live under the resolved prefix
            objects = [
                types.SimpleNamespace(object_name=f"{prefix}a.arrow"),
                types.SimpleNamespace(object_name=f"{prefix}b.arrow"),
            ]
            for obj in objects:
                yield obj

        def stat_object(self, bucket, name):
            return types.SimpleNamespace(last_modified=0)

    monkeypatch.setattr(routes, "minio_client", DummyMinio())
    monkeypatch.setattr(routes, "MINIO_BUCKET", "bucket")

    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    app = FastAPI()
    app.include_router(routes.router)
    client = TestClient(app)

    resp = client.get("/list_saved_dataframes")

    assert resp.status_code == 200
    data = resp.json()
    assert data["bucket"] == "bucket"
    assert data["prefix"] == "client/app/proj/"
    assert len(data["files"]) == 2
    for f in data["files"]:
        assert "arrow_name" in f
    assert data["environment"]["CLIENT_NAME"] == "client"
    assert data["environment"]["APP_NAME"] == "app"
    assert data["environment"]["PROJECT_NAME"] == "proj"
    assert redis_mapping["env:1:2:3:CLIENT_NAME"] == "client"
    assert redis_mapping["env:1:2:3:APP_NAME"] == "app"
    assert redis_mapping["env:1:2:3:PROJECT_NAME"] == "proj"

