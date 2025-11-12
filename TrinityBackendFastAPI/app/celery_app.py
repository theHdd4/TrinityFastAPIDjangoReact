"""Celery application configured for the FastAPI service."""
from __future__ import annotations

from celery import Celery

from TrinityBackendDjango.config.celery_settings import configure_celery_app

celery_app = Celery("TrinityBackendFastAPI")
configure_celery_app(celery_app)

# Ensure task modules are registered when the Celery app is imported.
import app.tasks  # noqa: F401

__all__ = ["celery_app"]
