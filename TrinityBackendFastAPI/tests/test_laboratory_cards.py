from __future__ import annotations

import importlib.util
import pathlib
import sys
import types

from fastapi import APIRouter


def _load_laboratory_models():
    """Load the laboratory models module without importing the full app package."""

    path = (
        pathlib.Path(__file__).resolve().parents[1]
        / "app"
        / "features"
        / "laboratory"
        / "models.py"
    )

    spec = importlib.util.spec_from_file_location("laboratory_models_for_tests", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _load_main_module(monkeypatch):
    """Import ``app.main`` with lightweight stubs for optional dependencies."""

    module_name = "trinity_main_for_tests"
    path = pathlib.Path(__file__).resolve().parents[1] / "app" / "main.py"

    # Ensure previous imports don't leak into the test environment.
    for name in [
        module_name,
        "app.api.router",
        "app.api",
        "DataStorageRetrieval.arrow_client",
        "DataStorageRetrieval",
    ]:
        sys.modules.pop(name, None)

    api_pkg = types.ModuleType("app.api")
    api_pkg.__path__ = []  # type: ignore[attr-defined]
    router_module = types.ModuleType("app.api.router")
    router_module.api_router = APIRouter()
    router_module.text_router = APIRouter()

    ds_pkg = types.ModuleType("DataStorageRetrieval")
    ds_pkg.__path__ = []  # type: ignore[attr-defined]
    arrow_module = types.ModuleType("DataStorageRetrieval.arrow_client")

    def _noop():
        return None

    arrow_module.load_env_from_redis = _noop  # type: ignore[attr-defined]
    arrow_module.get_minio_prefix = lambda: "test"  # type: ignore[attr-defined]

    sys.modules["app.api"] = api_pkg
    sys.modules["app.api.router"] = router_module
    sys.modules["DataStorageRetrieval"] = ds_pkg
    sys.modules["DataStorageRetrieval.arrow_client"] = arrow_module

    spec = importlib.util.spec_from_file_location(module_name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_laboratory_response_uses_camel_case_aliases():
    models = _load_laboratory_models()

    request = models.LaboratoryCardRequest(atomId="feature-overview")
    assert request.atom_id == "feature-overview"

    response = models.LaboratoryCardResponse(
        id="card-123",
        atoms=[
            models.LaboratoryAtomResponse(
                id="feature-overview-instance",
                atom_id="feature-overview",
            )
        ],
    )

    payload = response.model_dump(by_alias=True)
    assert payload["atoms"][0]["atomId"] == "feature-overview"


def test_default_cors_respects_env_hosts(monkeypatch):
    monkeypatch.setenv("HOST_IP", "10.2.4.48 10.2.3.238")
    monkeypatch.setenv("FRONTEND_PORT", "9090")
    monkeypatch.setenv(
        "FASTAPI_ADDITIONAL_CORS_HOSTS",
        "lab.example.com, extra.local",
    )

    module = _load_main_module(monkeypatch)

    monkeypatch.setattr(module, "_detect_runtime_hosts", lambda: ["192.168.1.5"])

    origins = module._default_cors_origins()

    assert "http://10.2.3.238:9090" in origins
    assert "http://10.2.4.48:8080" in origins
    assert "http://lab.example.com:8081" in origins
    assert "https://trinity.quantmatrixai.com" in origins
    assert "http://192.168.1.5:8080" in origins
