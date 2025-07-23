import os
import time
from django.utils import timezone
from .models import UserEnvironmentVariable


def save_env_var(user, key, value) -> None:
    """Create or update an environment variable record for the user."""
    client_name = os.environ.get("CLIENT_NAME", "")
    app_name = os.environ.get("APP_NAME", "")
    project_name = os.environ.get("PROJECT_NAME", "")

    client_id = os.environ.get("CLIENT_ID")
    if not client_id and client_name:
        client_id = f"{client_name}_{int(time.time())}"
        os.environ["CLIENT_ID"] = client_id
    app_id = os.environ.get("APP_ID")
    if not app_id and app_name:
        app_id = f"{app_name}_{int(time.time())}"
        os.environ["APP_ID"] = app_id
    project_id = os.environ.get("PROJECT_ID")
    if not project_id and project_name:
        project_id = f"{project_name}_{int(time.time())}"
        os.environ["PROJECT_ID"] = project_id

    UserEnvironmentVariable.objects.update_or_create(
        user=user,
        client_id=client_id or "",
        app_id=app_id or "",
        project_id=project_id or "",
        key=key,
        defaults={
            "value": value,
            "client_name": client_name,
            "app_name": app_name,
            "project_name": project_name,
            "last_used": timezone.now(),
        },
    )

def get_env_dict(user):
    """Return the user's environment variables as a simple dict."""
    envs = UserEnvironmentVariable.objects.filter(user=user)
    return {e.key: e.value for e in envs}
