"""Celery application configured for the FastAPI service."""
from __future__ import annotations

from celery import Celery

from TrinityBackendDjango.config.celery_settings import configure_celery_app

celery_app = Celery("TrinityBackendFastAPI")
configure_celery_app(celery_app)

__all__ = ["celery_app"]
