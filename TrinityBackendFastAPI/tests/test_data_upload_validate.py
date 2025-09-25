from fastapi.testclient import TestClient
from fastapi import FastAPI, APIRouter
import importlib.util
import pathlib


def load_module(path: pathlib.Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_upload_file(monkeypatch):
    base = pathlib.Path(__file__).resolve().parents[1] / "app" / "features" / "data_upload_validate"
    routes_module = load_module(base / "app" / "routes.py", "routes")

    async def fake_get_object_prefix(*args, **kwargs):
        return ""

    def fake_upload_to_minio(content, filename, prefix):
        return {"status": "success", "object_name": f"{prefix}{filename}"}

    monkeypatch.setattr(routes_module, "get_object_prefix", fake_get_object_prefix)
    monkeypatch.setattr(routes_module, "upload_to_minio", fake_upload_to_minio)

    app = FastAPI()
    router = APIRouter()
    router.include_router(routes_module.router, prefix="/data-upload-validate", tags=["Data Upload & Validate"])
    app.include_router(router, prefix="/api")
    client = TestClient(app)
    files = {"file": ("test.csv", "a,b\n1,2\n", "text/csv")}
    response = client.post("/api/data-upload-validate/upload-file", files=files)
    assert response.status_code == 200
    assert "file_path" in response.json()

