"""Celery application configured for the FastAPI service."""
from __future__ import annotations

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

from TrinityBackendDjango.config.celery_settings import configure_celery_app

celery_app = Celery("TrinityBackendFastAPI")
configure_celery_app(celery_app)

# Ensure task modules are registered when the Celery app is imported.
import app.tasks  # noqa: F401

__all__ = ["celery_app"]
