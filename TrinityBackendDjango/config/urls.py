from django.contrib import admin
from django.urls import path, include

from redis_store.health import redis_health_view

# Apply custom admin branding
from . import admin as _admin_setup  # noqa: F401

urlpatterns = [
    path("admin/", admin.site.urls),
    path("health/redis/", redis_health_view, name="redis-health"),

    # REST API endpoints for each app
    path("api/accounts/", include("apps.accounts.urls")),
    path("api/registry/", include("apps.registry.urls")),
    path("api/subscriptions/", include("apps.subscriptions.urls")),
    path("api/workflows/", include("apps.workflows.urls")),
    path("api/atoms/", include("apps.atoms.urls")),
    path("api/atom-configs/", include("apps.atom_configs.urls")),
    path("api/config-store/", include("apps.config_store.urls")),
    path("api/permissions/", include("apps.permissions.urls")),
    path("api/orchestration/", include("apps.orchestration.urls")),
    path("api/tenants/", include("apps.tenants.urls")),
    path("api/roles/", include("apps.roles.urls")),
    path("api/audit/", include("apps.audit.urls")),
    path("api/session/", include("apps.session_state.urls")),
    path("api/usecases/", include("apps.usecase.urls")),
    path("api/", include("apps.molecules.urls")),
    path("api/", include("apps.custom_molecules.urls")),
    path("api/", include("apps.trinity_v1_atoms.urls")),
    path("api/", include("apps.trinity_v1_agents.urls")),
    path("api/share-links/", include("apps.share_links.urls")),
    path("api/signups/", include("apps.signups.urls")),
]
