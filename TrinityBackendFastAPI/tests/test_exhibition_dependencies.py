from __future__ import annotations

import importlib.util
import pathlib
import sys
import types

import asyncio
import pytest


def _load_exhibition_module(module_filename: str, module_name: str):
    path = (
        pathlib.Path(__file__).resolve().parents[1]
        / "app"
        / "features"
        / "exhibition"
        / module_filename
    )

    for name in [
        module_name,
        "motor",
        "motor.motor_asyncio",
        "minio",
        "minio.error",
        "minio.credentials",
        "app",
        "app.core",
        "app.core.mongo",
    ]:
        sys.modules.pop(name, None)

    repo_root = pathlib.Path(__file__).resolve().parents[2]
    if str(repo_root) not in sys.path:
        sys.path.insert(0, str(repo_root))

    app_pkg = sys.modules.get("app") or types.ModuleType("app")
    if not hasattr(app_pkg, "__path__"):
        app_pkg.__path__ = []  # type: ignore[attr-defined]
    features_pkg = sys.modules.get("app.features") or types.ModuleType("app.features")
    if not hasattr(features_pkg, "__path__"):
        features_pkg.__path__ = []  # type: ignore[attr-defined]
    exhibition_pkg = sys.modules.get("app.features.exhibition") or types.ModuleType("app.features.exhibition")
    if not hasattr(exhibition_pkg, "__path__"):
        exhibition_pkg.__path__ = []  # type: ignore[attr-defined]
    core_pkg = sys.modules.get("app.core") or types.ModuleType("app.core")
    if not hasattr(core_pkg, "__path__"):
        core_pkg.__path__ = []  # type: ignore[attr-defined]
    mongo_module = sys.modules.get("app.core.mongo") or types.ModuleType("app.core.mongo")

    def _build_host_mongo_uri(
        *,
        username: str = "admin_dev",
        password: str = "pass_dev",
        auth_source: str = "admin",
        default_host: str = "localhost",
        default_port: str = "27017",
        database: str | None = None,
        **_kwargs,
    ) -> str:
        credentials = ""
        if username and password:
            credentials = f"{username}:{password}@"
        elif username:
            credentials = f"{username}@"
        path = f"/{database}" if database else "/"
        query = f"?authSource={auth_source}" if auth_source else ""
        return f"mongodb://{credentials}{default_host}:{default_port}{path}{query}"

    mongo_module.build_host_mongo_uri = _build_host_mongo_uri  # type: ignore[attr-defined]
    app_pkg.core = core_pkg  # type: ignore[attr-defined]
    app_pkg.features = features_pkg  # type: ignore[attr-defined]
    features_pkg.exhibition = exhibition_pkg  # type: ignore[attr-defined]
    core_pkg.mongo = mongo_module  # type: ignore[attr-defined]

    sys.modules["app"] = app_pkg
    sys.modules["app.features"] = features_pkg
    sys.modules["app.features.exhibition"] = exhibition_pkg
    sys.modules["app.core"] = core_pkg
    sys.modules["app.core.mongo"] = mongo_module

    motor_pkg = types.ModuleType("motor")
    class _DummyClient:
        def __init__(self, *args, **kwargs) -> None:  # pragma: no cover - trivial stub
            pass

        def __getitem__(self, item):  # pragma: no cover - trivial stub
            return self

    motor_asyncio = types.SimpleNamespace(
        AsyncIOMotorClient=_DummyClient,
        AsyncIOMotorCollection=object,
        AsyncIOMotorDatabase=object,
    )
    motor_pkg.motor_asyncio = motor_asyncio  # type: ignore[attr-defined]

    class _DummyMinio:  # pragma: no cover - trivial stub
        def __init__(self, *args, **kwargs) -> None:
            pass

        def bucket_exists(self, *_args, **_kwargs) -> bool:
            return True

        def make_bucket(self, *_args, **_kwargs) -> None:
            pass

        def list_objects(self, *_args, **_kwargs):
            return []

    sys.modules["motor"] = motor_pkg
    sys.modules["motor.motor_asyncio"] = motor_asyncio
    sys.modules["minio"] = types.SimpleNamespace(Minio=_DummyMinio, MinioAdmin=object)

    minio_error_module = types.ModuleType("minio.error")
    class _DummyS3Error(Exception):
        pass

    minio_error_module.S3Error = _DummyS3Error  # type: ignore[attr-defined]
    sys.modules["minio.error"] = minio_error_module

    minio_credentials_module = types.ModuleType("minio.credentials")

    class _StaticProvider:  # pragma: no cover - trivial stub
        def __init__(self, *args, **kwargs) -> None:
            pass

    minio_credentials_module.StaticProvider = _StaticProvider  # type: ignore[attr-defined]
    sys.modules["minio.credentials"] = minio_credentials_module

    spec = importlib.util.spec_from_file_location(module_name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    if "." in module_name:
        module.__package__ = module_name.rsplit(".", 1)[0]
    spec.loader.exec_module(module)
    return module


def test_mongo_auth_kwargs_requires_flag(monkeypatch):
    module = _load_exhibition_module("mongo.py", "app.features.exhibition.mongo")

    for env in [
        "EXHIBITION_REQUIRE_MONGO_AUTH",
        "MONGO_REQUIRE_AUTH",
        "EXHIBITION_MONGO_USERNAME",
        "MONGO_USERNAME",
        "MONGO_USER",
        "EXHIBITION_MONGO_PASSWORD",
        "MONGO_PASSWORD",
        "MONGO_PASS",
        "EXHIBITION_MONGO_AUTH_SOURCE",
        "MONGO_AUTH_SOURCE",
        "MONGO_AUTH_DB",
        "EXHIBITION_MONGO_AUTH_MECHANISM",
        "MONGO_AUTH_MECHANISM",
    ]:
        monkeypatch.delenv(env, raising=False)

    monkeypatch.setenv("EXHIBITION_REQUIRE_MONGO_AUTH", "true")

    kwargs = module.resolve_mongo_auth_kwargs("mongodb://10.2.3.238:27017/trinity_db")

    assert kwargs == {
        "username": "admin_dev",
        "password": "pass_dev",
        "authSource": "admin",
    }


def test_mongo_auth_kwargs_respects_env(monkeypatch):
    module = _load_exhibition_module("mongo.py", "app.features.exhibition.mongo")

    monkeypatch.setenv("MONGO_USERNAME", "custom_user")
    monkeypatch.setenv("MONGO_PASSWORD", "custom_pass")
    monkeypatch.setenv("MONGO_AUTH_SOURCE", "custom_db")
    monkeypatch.setenv("MONGO_AUTH_MECHANISM", "SCRAM-SHA-256")

    kwargs = module.resolve_mongo_auth_kwargs("mongodb://mongo:27017/trinity_db")

    assert kwargs == {
        "username": "custom_user",
        "password": "custom_pass",
        "authSource": "custom_db",
        "authMechanism": "SCRAM-SHA-256",
    }


def test_mongo_auth_kwargs_skips_when_uri_contains_credentials(monkeypatch):
    module = _load_exhibition_module("mongo.py", "app.features.exhibition.mongo")

    monkeypatch.setenv("MONGO_USERNAME", "custom_user")
    monkeypatch.setenv("MONGO_PASSWORD", "custom_pass")

    kwargs = module.resolve_mongo_auth_kwargs("mongodb://user:pass@mongo:27017/trinity_db")

    assert kwargs == {}


def test_mongo_auth_kwargs_prefers_initdb_root(monkeypatch):
    module = _load_exhibition_module("mongo.py", "app.features.exhibition.mongo")

    monkeypatch.delenv("EXHIBITION_REQUIRE_MONGO_AUTH", raising=False)
    monkeypatch.setenv("MONGO_INITDB_ROOT_USERNAME", "root")
    monkeypatch.setenv("MONGO_INITDB_ROOT_PASSWORD", "rootpass")

    kwargs = module.resolve_mongo_auth_kwargs("mongodb://mongo:27017/trinity_db?authSource=admin")

    assert kwargs["username"] == "root"
    assert kwargs["password"] == "rootpass"
    assert kwargs["authSource"] == "admin"


def test_mongo_auth_kwargs_no_hints_use_defaults(monkeypatch):
    module = _load_exhibition_module("mongo.py", "app.features.exhibition.mongo")

    for env in [
        "EXHIBITION_REQUIRE_MONGO_AUTH",
        "MONGO_REQUIRE_AUTH",
        "EXHIBITION_MONGO_USERNAME",
        "MONGO_USERNAME",
        "MONGO_USER",
        "EXHIBITION_MONGO_PASSWORD",
        "MONGO_PASSWORD",
        "MONGO_PASS",
        "EXHIBITION_MONGO_AUTH_SOURCE",
        "MONGO_AUTH_SOURCE",
        "MONGO_AUTH_DB",
    ]:
        monkeypatch.delenv(env, raising=False)

    kwargs = module.resolve_mongo_auth_kwargs("mongodb://mongo:27017/trinity_db")

    assert kwargs == {
        "username": "admin_dev",
        "password": "pass_dev",
        "authSource": "admin",
    }


def test_mongo_auth_kwargs_disable_flag(monkeypatch):
    module = _load_exhibition_module("mongo.py", "app.features.exhibition.mongo")

    monkeypatch.setenv("EXHIBITION_REQUIRE_MONGO_AUTH", "false")

    kwargs = module.resolve_mongo_auth_kwargs("mongodb://mongo:27017/trinity_db")

    assert kwargs == {}


class _StubCollection:
    def __init__(self) -> None:
        self.calls: list[tuple[dict, dict, bool]] = []

    async def update_one(self, filter_query, update, *, upsert=False):  # pragma: no cover - exercised in tests
        self.calls.append((filter_query, update, upsert))


def test_save_layout_configuration_persists_metadata(monkeypatch):
    _load_exhibition_module("mongo.py", "app.features.exhibition.mongo")
    _load_exhibition_module("deps.py", "app.features.exhibition.deps")
    _load_exhibition_module("schemas.py", "app.features.exhibition.schemas")
    _load_exhibition_module("service.py", "app.features.exhibition.service")
    routes = _load_exhibition_module("routes.py", "app.features.exhibition.routes")

    layout_model = routes.ExhibitionLayoutConfigurationIn(
        client_name="Acme",
        app_name="Trinity",
        project_name="Demo",
        cards=[
            {
                "id": "slide-1",
                "atoms": [
                    {
                        "id": "atom-entry-1",
                        "atomId": "atom-123",
                        "title": "Example Atom",
                        "metadata": {"notes": "Preserve me"},
                    }
                ],
                "catalogueAtoms": [
                    {
                        "id": "catalogue-1",
                        "atomId": "atom-123",
                        "metadata": {"category": "alpha"},
                    }
                ],
                "presentationSettings": {"layout": "grid"},
            }
        ],
        slide_objects={
            "slide-1": [
                {
                    "id": "object-1",
                    "type": "text",
                    "x": 10,
                    "y": 15,
                    "props": {"value": "Hello"},
                }
            ]
        },
    )

    collection = _StubCollection()
    result = asyncio.run(routes.save_layout_configuration(layout_model, collection))  # type: ignore[arg-type]

    assert result["status"] == "ok"
    assert result["updated_at"] is not None

    assert len(collection.calls) == 1
    filter_query, update, upsert = collection.calls[0]
    assert upsert is True
    assert filter_query == {"client_name": "Acme", "app_name": "Trinity", "project_name": "Demo"}

    persisted = update["$set"]
    assert persisted["cards"][0]["atoms"][0]["metadata"] == {"notes": "Preserve me"}
    assert persisted["cards"][0]["catalogueAtoms"][0]["metadata"] == {"category": "alpha"}
    assert persisted["slide_objects"]["slide-1"][0]["props"] == {"value": "Hello"}
