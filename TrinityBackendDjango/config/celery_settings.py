"""Reusable Celery configuration shared between Django and FastAPI services."""
from __future__ import annotations

import os
from typing import Any, Dict

from kombu import Queue

DEFAULT_QUEUE = os.getenv("CELERY_TASK_DEFAULT_QUEUE", "trinity.tasks")
DEFAULT_BEAT_QUEUE = os.getenv("CELERY_BEAT_QUEUE", f"{DEFAULT_QUEUE}.beat")

CELERY_CONFIG: Dict[str, Any] = {
    "broker_url": os.getenv("CELERY_BROKER_URL") or os.getenv("REDIS_URL", "redis://localhost:6379/0"),
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
    ),
    "worker_concurrency": int(os.getenv("CELERY_WORKER_CONCURRENCY", "2")),
}


def configure_celery_app(celery_app: "Celery") -> None:
    """Apply the shared Celery configuration to ``celery_app``."""

    celery_app.conf.update(CELERY_CONFIG)

