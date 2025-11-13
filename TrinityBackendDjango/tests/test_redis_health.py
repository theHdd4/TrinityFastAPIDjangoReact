import os
import sys
from pathlib import Path

import django
import pytest
from django.test import Client

# Configure Django settings
sys.path.append(str(Path(__file__).resolve().parents[2]))
sys.path.append(str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "TrinityBackendDjango.config.settings")
django.setup()

from redis_store import health  # noqa: E402  pylint: disable=wrong-import-position


class DummyRedis:
    def __init__(self, *, ping=True):
        self._ping = ping

    def ping(self):
        return self._ping

    def info(self, section):
        if section == "stats":
            return {"keyspace_hits": 4, "keyspace_misses": 1}
        if section == "memory":
            return {
                "used_memory": 512,
                "used_memory_peak": 1024,
                "mem_fragmentation_ratio": 1.05,
            }
        if section == "clients":
            return {"connected_clients": 7, "blocked_clients": 0}
        raise AssertionError(f"Unexpected section: {section}")


@pytest.fixture(autouse=True)
def patch_redis(monkeypatch):
    dummy = DummyRedis()
    monkeypatch.setattr(health, "redis_client", dummy)
    yield dummy


def test_health_endpoint_returns_metrics():
    client = Client()
    response = client.get("/health/redis/")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert pytest.approx(payload["hit_rate"]) == pytest.approx(4 / 5)
    assert payload["clients"]["connected"] == 7
    assert payload["memory"]["used_bytes"] == 512


def test_health_endpoint_ping_failure(monkeypatch, patch_redis):
    patch_redis._ping = False
    monkeypatch.setattr(health, "redis_client", patch_redis)
    client = Client()
    response = client.get("/health/redis/")
    assert response.status_code == 503
    assert "did not return" in response.json()["detail"]
