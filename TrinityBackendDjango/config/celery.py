import os

from celery import Celery

from .celery_settings import configure_celery_app

# set the default Django settings module for the 'celery' program.
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

# instantiate Celery
celery_app = Celery("TrinityBackendDjango")

# pull in configuration from Django settings, using the CELERY_ namespace
celery_app.config_from_object("django.conf:settings", namespace="CELERY")
configure_celery_app(celery_app)

# auto-discover tasks in installed apps
celery_app.autodiscover_tasks()
