from rest_framework import viewsets, permissions
from .models import SiteConfig, TenantConfig
from .serializers import SiteConfigSerializer, TenantConfigSerializer


class SiteConfigViewSet(viewsets.ModelViewSet):
    """
    CRUD for global SiteConfig.
    Admins may create/update; all authenticated users may list/retrieve.
    """
    queryset = SiteConfig.objects.all()
    serializer_class = SiteConfigSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [permissions.IsAdminUser()]
        return super().get_permissions()


class TenantConfigViewSet(viewsets.ModelViewSet):
    """
    CRUD for tenant-specific configs.
    Admins may manage any; tenant users may only see their own tenant’s configs.
    """
    serializer_class = TenantConfigSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        # Assuming django-tenants sets request.tenant
        current_tenant = getattr(self.request, "tenant", None)
        qs = TenantConfig.objects.all()
        if not user.is_staff and current_tenant:
            qs = qs.filter(tenant=current_tenant)
        return qs

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            # Only staff users may create or mutate tenant configs
            return [permissions.IsAdminUser()]
        return super().get_permissions()

    def perform_create(self, serializer):
        serializer.save()
