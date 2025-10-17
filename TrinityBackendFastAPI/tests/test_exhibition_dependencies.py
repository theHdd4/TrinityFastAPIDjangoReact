from __future__ import annotations

import importlib.util
import pathlib
import sys
import types


def _load_exhibition_deps():
    module_name = "exhibition_deps_for_tests"
    path = (
        pathlib.Path(__file__).resolve().parents[1]
        / "app"
        / "features"
        / "exhibition"
        / "deps.py"
    )

    for name in [module_name, "motor", "motor.motor_asyncio"]:
        sys.modules.pop(name, None)

    motor_pkg = types.ModuleType("motor")
    motor_asyncio = types.SimpleNamespace(
        AsyncIOMotorClient=object,
        AsyncIOMotorCollection=object,
        AsyncIOMotorDatabase=object,
    )
    motor_pkg.motor_asyncio = motor_asyncio  # type: ignore[attr-defined]

    sys.modules["motor"] = motor_pkg
    sys.modules["motor.motor_asyncio"] = motor_asyncio

    spec = importlib.util.spec_from_file_location(module_name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_mongo_auth_kwargs_fallback_credentials(monkeypatch):
    module = _load_exhibition_deps()

    for env in [
        "MONGO_USERNAME",
        "MONGO_USER",
        "MONGO_PASSWORD",
        "MONGO_PASS",
        "MONGO_AUTH_SOURCE",
        "MONGO_AUTH_DB",
        "MONGO_AUTH_MECHANISM",
    ]:
        monkeypatch.delenv(env, raising=False)

    kwargs = module._mongo_auth_kwargs("mongodb://10.2.3.238:27017/trinity_db")

    assert kwargs["username"] == "admin_dev"
    assert kwargs["password"] == "pass_dev"
    assert kwargs["authSource"] == "admin"
    assert "authMechanism" not in kwargs


def test_mongo_auth_kwargs_respects_env(monkeypatch):
    module = _load_exhibition_deps()

    monkeypatch.setenv("MONGO_USERNAME", "custom_user")
    monkeypatch.setenv("MONGO_PASSWORD", "custom_pass")
    monkeypatch.setenv("MONGO_AUTH_SOURCE", "custom_db")
    monkeypatch.setenv("MONGO_AUTH_MECHANISM", "SCRAM-SHA-256")

    kwargs = module._mongo_auth_kwargs("mongodb://mongo:27017/trinity_db")

    assert kwargs == {
        "username": "custom_user",
        "password": "custom_pass",
        "authSource": "custom_db",
        "authMechanism": "SCRAM-SHA-256",
    }


def test_mongo_auth_kwargs_skips_when_uri_contains_credentials(monkeypatch):
    module = _load_exhibition_deps()

    monkeypatch.setenv("MONGO_USERNAME", "custom_user")
    monkeypatch.setenv("MONGO_PASSWORD", "custom_pass")

    kwargs = module._mongo_auth_kwargs("mongodb://user:pass@mongo:27017/trinity_db")

    assert kwargs == {}
