"""Celery application configured for the FastAPI service."""
from __future__ import annotations

from celery import Celery

from TrinityBackendDjango.config.celery_settings import configure_celery_app

celery_app = Celery("TrinityBackendFastAPI")
configure_celery_app(celery_app)

# Ensure task modules are imported when the worker or application initialises so
# Celery registers the FastAPI-side jobs.
import app.core.cache_tasks  # noqa: F401  (imported for side effects)
import app.features.data_upload_validate.app.tasks  # noqa: F401
import app.features.dataframe_operations.app.tasks  # noqa: F401

__all__ = ["celery_app"]
