from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path("admin/", admin.site.urls),

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
]
