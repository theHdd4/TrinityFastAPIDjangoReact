import pytest
from fastapi.testclient import TestClient

from .test_laboratory_cards import _load_main_module


@pytest.fixture()
def main_module(monkeypatch):
    module = _load_main_module(monkeypatch)
    yield module


def test_exhibition_layout_exception_sets_cors_headers(main_module):
    origin = "http://192.168.1.7:8080"

    @main_module.app.post("/api/exhibition/layout")
    async def boom():  # pragma: no cover - behaviour checked via response
        raise RuntimeError("boom")

    client = TestClient(main_module.app, raise_server_exceptions=False)
    response = client.post("/api/exhibition/layout", headers={"Origin": origin})

    assert response.status_code == 500
    assert response.headers.get("access-control-allow-origin") == origin
    assert response.headers.get("access-control-allow-credentials") == "true"
    assert "Internal Server Error" in response.text


def test_exhibition_layout_options_allows_origin(main_module):
    origin = "http://192.168.1.7:8080"

    client = TestClient(main_module.app)
    response = client.options(
        "/api/exhibition/layout",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == origin
    assert response.headers.get("access-control-allow-methods") in {"POST", "DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT"}
    assert response.headers.get("access-control-allow-headers") in {"content-type", "*"}


def test_disallowed_origin_is_not_echoed(main_module):
    origin = "https://unauthorised.example"

    client = TestClient(main_module.app)
    response = client.post("/api/exhibition/layout", headers={"Origin": origin})

    assert response.status_code in {404, 405}
    assert response.headers.get("access-control-allow-origin") is None
