"""Celery application configured for the FastAPI service."""
from __future__ import annotations

import os
import sys
from pathlib import Path

from celery import Celery

# Ensure the monorepo root is importable so we can reuse the shared Celery config
# defined within the Django project. This mirrors the behaviour of the Django
# settings module which assumes the repository root is on ``sys.path``. When the
# FastAPI service is executed in isolation (for example inside tests), the
# repository root might be missing from ``sys.path`` which prevents importing the
# shared configuration module. Adding it explicitly keeps the dependency between
# the two services intact without requiring environment-specific path tweaks.
repo_root = Path(__file__).resolve().parents[2]
if str(repo_root) not in sys.path:
    sys.path.insert(0, str(repo_root))

try:  # pragma: no cover - import side-effect configuration
    from TrinityBackendDjango.config.celery_settings import configure_celery_app  # type: ignore
except ModuleNotFoundError:  # pragma: no cover - executed in reduced deployments
    # When the FastAPI service is deployed in isolation the Django project (which
    # owns the shared Celery configuration) might be unavailable. Falling back to
    # a local copy of the configuration keeps the worker functional while still
    # allowing projects that ship both services to share the original module.
    import logging

    logger = logging.getLogger(__name__)
    logger.warning(
        "TrinityBackendDjango.config.celery_settings is unavailable; using the"
        " FastAPI local Celery configuration fallback."
    )

    from typing import Any, Dict

    from kombu import Queue

    DEFAULT_QUEUE = os.getenv("CELERY_TASK_DEFAULT_QUEUE", "trinity.tasks")
    DEFAULT_BEAT_QUEUE = os.getenv("CELERY_BEAT_QUEUE", f"{DEFAULT_QUEUE}.beat")
    CPU_QUEUE = os.getenv("CELERY_CPU_QUEUE", f"{DEFAULT_QUEUE}.cpu")
    IO_QUEUE = os.getenv("CELERY_IO_QUEUE", f"{DEFAULT_QUEUE}.io")

    CELERY_CONFIG: Dict[str, Any] = {
        "broker_url": os.getenv("CELERY_BROKER_URL")
        or os.getenv("REDIS_URL", "redis://localhost:6379/0"),
        "result_backend": os.getenv("CELERY_RESULT_BACKEND")
        or os.getenv("REDIS_URL", "redis://localhost:6379/0"),
        "accept_content": ["json"],
        "task_serializer": "json",
        "result_serializer": "json",
        "task_default_exchange_type": "direct",
        "task_default_queue": DEFAULT_QUEUE,
        "task_queues": (
            Queue(DEFAULT_QUEUE, routing_key=DEFAULT_QUEUE),
            Queue(DEFAULT_BEAT_QUEUE, routing_key=DEFAULT_BEAT_QUEUE),
            Queue(CPU_QUEUE, routing_key=CPU_QUEUE),
            Queue(IO_QUEUE, routing_key=IO_QUEUE),
        ),
        "task_routes": {
            "apps.orchestration.tasks.execute_task": {
                "queue": IO_QUEUE,
                "routing_key": IO_QUEUE,
            },
            "apps.orchestration.tasks.persist_task_result": {
                "queue": IO_QUEUE,
                "routing_key": IO_QUEUE,
            },
        },
        "worker_concurrency": int(os.getenv("CELERY_WORKER_CONCURRENCY", "2")),
    }

    def configure_celery_app(celery_app: "Celery") -> None:
        celery_app.conf.update(CELERY_CONFIG)

celery_app = Celery("TrinityBackendFastAPI")
configure_celery_app(celery_app)

# Ensure task modules are registered when the Celery app is imported.
import app.tasks  # noqa: F401

__all__ = ["celery_app"]
