import os
from celery import Celery

celery_app = Celery(
    "trinity_backend",
    broker=os.getenv("CELERY_BROKER_URL", "redis://redis:6379/0"),
    backend=os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0"),
)

celery_app.conf.task_routes = {"app.*": {"queue": "default"}}
