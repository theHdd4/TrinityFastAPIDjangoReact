# expose the Celery app for Django’s autodiscovery and for imports elsewhere
try:
    # Celery is optional during some management commands
    from .celery import celery_app  # noqa
except Exception:  # pragma: no cover - ignore missing Celery deps
    celery_app = None

__all__ = ("celery_app",)
