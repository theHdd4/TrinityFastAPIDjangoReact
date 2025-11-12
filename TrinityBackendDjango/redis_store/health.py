"""Utility helpers to expose Redis health metrics via Django endpoints."""
from __future__ import annotations

import time
from typing import Any, Dict

from django.http import JsonResponse
from redis.exceptions import RedisError

from .redis_client import redis_client


def _calculate_hit_rate(hits: int | None, misses: int | None) -> float | None:
    if hits is None and misses is None:
        return None
    hits = hits or 0
    misses = misses or 0
    total = hits + misses
    if total <= 0:
        return None
    return hits / total


def redis_health_view(_request) -> JsonResponse:
    start = time.perf_counter()

    try:
        pong = redis_client.ping()
    except RedisError as exc:  # pragma: no cover - exercised via tests
        return JsonResponse(
            {"status": "error", "detail": f"Redis ping failed: {exc}"}, status=503
        )

    if not pong:
        return JsonResponse(
            {"status": "error", "detail": "Redis ping did not return PONG"}, status=503
        )

    latency_ms = (time.perf_counter() - start) * 1000

    stats = redis_client.info(section="stats")
    memory = redis_client.info(section="memory")
    clients = redis_client.info(section="clients")

    hits = stats.get("keyspace_hits") if isinstance(stats, dict) else None
    misses = stats.get("keyspace_misses") if isinstance(stats, dict) else None

    payload: Dict[str, Any] = {
        "status": "ok",
        "latency_ms": latency_ms,
        "hit_rate": _calculate_hit_rate(
            int(hits) if hits is not None else None,
            int(misses) if misses is not None else None,
        ),
        "stats": {
            "keyspace_hits": hits,
            "keyspace_misses": misses,
        },
        "clients": {
            "connected": clients.get("connected_clients") if isinstance(clients, dict) else None,
            "blocked": clients.get("blocked_clients") if isinstance(clients, dict) else None,
        },
        "memory": {
            "used_bytes": memory.get("used_memory") if isinstance(memory, dict) else None,
            "peak_bytes": memory.get("used_memory_peak") if isinstance(memory, dict) else None,
            "fragmentation_ratio": memory.get("mem_fragmentation_ratio") if isinstance(memory, dict) else None,
        },
    }

    return JsonResponse(payload)


__all__ = ["redis_health_view"]
