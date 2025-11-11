"""Utilities for lightweight instrumentation across FastAPI routers."""
from __future__ import annotations

import logging
from time import perf_counter
from typing import Callable

from fastapi import Request


def timing_dependency_factory(logger_name: str) -> Callable[[Request], None]:
    """Return a dependency that logs the request duration for a router."""

    logger = logging.getLogger(logger_name)

    async def _timing_dependency(request: Request):  # pragma: no cover - simple wrapper
        start = perf_counter()
        try:
            yield
        finally:
            duration_ms = (perf_counter() - start) * 1000
            endpoint = request.url.path
            method = request.method
            logger.info("endpoint_timing path=%s method=%s duration_ms=%.2f", endpoint, method, duration_ms)

    return _timing_dependency


__all__ = ["timing_dependency_factory"]
