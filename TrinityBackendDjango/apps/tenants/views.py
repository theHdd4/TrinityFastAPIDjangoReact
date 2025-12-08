from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.decorators import action
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from django_tenants.utils import schema_context
from apps.accounts.views import CsrfExemptSessionAuthentication
from apps.accounts.tenant_utils import get_tenant_for_user
from .models import Tenant, Domain
from .serializers import TenantSerializer, DomainSerializer


@method_decorator(csrf_exempt, name="dispatch")
class TenantViewSet(viewsets.ModelViewSet):
    """
    Manage tenants (schemas). Admin-only for writes; all authenticated may list/retrieve.
    """
    queryset = Tenant.objects.all()
    serializer_class = TenantSerializer
    permission_classes = [permissions.IsAuthenticated]
    authentication_classes = [CsrfExemptSessionAuthentication]

    def create(self, request, *args, **kwargs):
        print('TenantViewSet.create called with', request.data)
        serializer = self.get_serializer(data=request.data)
        try:
            serializer.is_valid(raise_exception=True)
            print('Tenant data validated')
            # Ensure the tenant save happens while connected to the public schema
            # to avoid django-tenants GuardRail exceptions.
            with schema_context('public'):
                self.perform_create(serializer)
            print('Tenant instance created')
        except Exception as exc:
            print('Tenant creation failed:', exc)
            raise
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [permissions.IsAdminUser()]
        return super().get_permissions()

    @action(detail=False, methods=['get'])
    def current(self, request):
        """
        Get the current user's tenant.
        Returns the tenant object for the authenticated user based on UserTenant mapping.
        """
        user = request.user
        if not user or not user.is_authenticated:
            return Response(
                {"detail": "Authentication required."},
                status=status.HTTP_401_UNAUTHORIZED
            )
        
        tenant = get_tenant_for_user(user)
        if not tenant:
            return Response(
                {"detail": "No tenant found for user."},
                status=status.HTTP_404_NOT_FOUND
            )
        
        serializer = self.get_serializer(tenant)
        return Response(serializer.data)


@method_decorator(csrf_exempt, name="dispatch")
class DomainViewSet(viewsets.ModelViewSet):
    """
    Manage domain mappings for tenants. Admin-only for writes; authenticated users may list/retrieve.
    """
    queryset = Domain.objects.select_related("tenant").all()
    serializer_class = DomainSerializer
    permission_classes = [permissions.IsAuthenticated]
    authentication_classes = [CsrfExemptSessionAuthentication]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [permissions.IsAdminUser()]
        return super().get_permissions()
