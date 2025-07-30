# expose the Celery app for Django’s autodiscovery and for imports elsewhere
from .celery import celery_app  # noqa

__all__ = ("celery_app",)
