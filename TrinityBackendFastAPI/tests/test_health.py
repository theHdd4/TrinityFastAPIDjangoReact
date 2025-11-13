from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest
from fastapi import HTTPException

ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(ROOT))
os.environ.setdefault("ENVIRONMENT", "test")

from app.api import health  # noqa: E402  pylint: disable=wrong-import-position


class DummyRedis:
    def __init__(self, *, ping_result=True, stats=None, memory=None, clients=None):
        self.ping_result = ping_result
        self._stats = stats or {
            "keyspace_hits": 10,
            "keyspace_misses": 5,
        }
        self._memory = memory or {
            "used_memory": 1024,
            "used_memory_peak": 2048,
            "mem_fragmentation_ratio": 1.1,
            "allocator_active": 4096,
        }
        self._clients = clients or {
            "connected_clients": 12,
            "blocked_clients": 0,
            "client_recent_max_input_buffer": 1024,
        }

    def ping(self):
        return self.ping_result

    def info(self, section):  # noqa: D401 - mimic redis interface
        if section == "stats":
            return self._stats
        if section == "memory":
            return self._memory
        if section == "clients":
            return self._clients
        raise AssertionError(f"unexpected section: {section}")


@pytest.fixture(autouse=True)
def patch_dependencies(monkeypatch):
    monkeypatch.setattr("DataStorageRetrieval.arrow_client.load_env_from_redis", lambda: None)
    monkeypatch.setattr("DataStorageRetrieval.arrow_client.get_minio_prefix", lambda: "test")


@pytest.fixture(name="redis")
def redis_fixture(monkeypatch):
    client = DummyRedis()

    def _fake_get_sync_redis(*args, **kwargs):
        return client

    monkeypatch.setattr("app.api.health.get_sync_redis", _fake_get_sync_redis)
    return client


def test_redis_health_success(redis):
    payload = health.redis_health()
    assert payload["status"] == "ok"
    assert pytest.approx(payload["hit_rate"]) == pytest.approx(10 / 15)
    assert payload["stats"]["keyspace_hits"] == 10
    assert payload["memory"]["used_bytes"] == 1024
    assert payload["clients"]["connected"] == 12


def test_redis_health_ping_failure(monkeypatch, redis):
    redis.ping_result = False

    def _fake_get_sync_redis(*args, **kwargs):
        return redis

    monkeypatch.setattr("app.api.health.get_sync_redis", _fake_get_sync_redis)
    with pytest.raises(HTTPException) as exc:
        health.redis_health()
    assert exc.value.status_code == 503
    assert "did not return" in exc.value.detail
