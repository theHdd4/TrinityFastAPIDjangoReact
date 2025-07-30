import os
from celery import Celery

# set the default Django settings module for the 'celery' program.
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

# instantiate Celery
celery_app = Celery("TrinityBackendDjango")

# pull in configuration from Django settings, using the CELERY_ namespace
celery_app.config_from_object("django.conf:settings", namespace="CELERY")

# auto-discover tasks in installed apps
celery_app.autodiscover_tasks()
