"""Health and diagnostics endpoints for infrastructure dependencies."""
from __future__ import annotations

import time
from typing import Any, Dict

from fastapi import APIRouter, HTTPException
from redis.exceptions import RedisError

from app.core.redis import get_sync_redis

router = APIRouter(prefix="/health", tags=["Health"])


def _calculate_hit_rate(hits: int | None, misses: int | None) -> float | None:
    if hits is None and misses is None:
        return None
    hits = hits or 0
    misses = misses or 0
    total = hits + misses
    if total <= 0:
        return None
    return hits / total


@router.get("/redis", summary="Inspect Redis connectivity and cache stats")
def redis_health() -> Dict[str, Any]:
    client = get_sync_redis(decode_responses=True)

    try:
        start = time.perf_counter()
        pong = client.ping()
        latency_ms = (time.perf_counter() - start) * 1000
    except RedisError as exc:  # pragma: no cover - exercised via tests
        raise HTTPException(status_code=503, detail=f"Redis ping failed: {exc}") from exc

    if not pong:
        raise HTTPException(status_code=503, detail="Redis ping did not return PONG")

    stats = client.info(section="stats")
    memory = client.info(section="memory")
    clients = client.info(section="clients")

    hits = stats.get("keyspace_hits") if isinstance(stats, dict) else None
    misses = stats.get("keyspace_misses") if isinstance(stats, dict) else None

    hit_rate = _calculate_hit_rate(
        int(hits) if hits is not None else None,
        int(misses) if misses is not None else None,
    )

    return {
        "status": "ok",
        "latency_ms": latency_ms,
        "hit_rate": hit_rate,
        "stats": {
            "keyspace_hits": hits,
            "keyspace_misses": misses,
        },
        "clients": {
            "connected": clients.get("connected_clients") if isinstance(clients, dict) else None,
            "blocked": clients.get("blocked_clients") if isinstance(clients, dict) else None,
            "max_input_buffer": clients.get("client_recent_max_input_buffer") if isinstance(clients, dict) else None,
        },
        "memory": {
            "used_bytes": memory.get("used_memory") if isinstance(memory, dict) else None,
            "peak_bytes": memory.get("used_memory_peak") if isinstance(memory, dict) else None,
            "fragmentation_ratio": memory.get("mem_fragmentation_ratio") if isinstance(memory, dict) else None,
            "allocator_active": memory.get("allocator_active") if isinstance(memory, dict) else None,
        },
    }
