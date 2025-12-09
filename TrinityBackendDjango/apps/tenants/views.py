from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.decorators import action
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from django_tenants.utils import schema_context
from django.db import transaction, models, connection
from apps.accounts.views import CsrfExemptSessionAuthentication
from apps.accounts.tenant_utils import get_tenant_for_user
from apps.accounts.models import User, UserTenant
from apps.roles.models import UserRole
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

    def update(self, request, *args, **kwargs):
        """
        Update tenant's seats_allowed and allowed_apps.
        Staff and superusers can update any tenant.
        """
        # Ensure we're in public schema before getting the object
        try:
            connection.set_schema_to_public()
        except Exception:
            pass
        
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        
        try:
            serializer.is_valid(raise_exception=True)
            # Ensure we're in public schema for the update
            with schema_context('public'):
                self.perform_update(serializer)
        except Exception as exc:
            import traceback
            import sys
            print(f"Error updating tenant {instance.name}: {exc}")
            print(traceback.format_exc())
            sys.stdout.flush()
            raise
        
        return Response(serializer.data)

    def destroy(self, request, *args, **kwargs):
        """
        Soft delete a tenant: set is_active=False and deactivate all users of that tenant.
        Sets is_active=False on all users and is_deleted=True on all UserRoles in tenant schema.
        Staff and superusers can delete any tenant.
        """
        # Ensure we're in public schema before getting the object
        try:
            connection.set_schema_to_public()
        except Exception:
            pass
        
        instance = self.get_object()
        
        try:
            with transaction.atomic():
                # Set tenant as inactive (soft delete) - must be in public schema
                with schema_context('public'):
                    instance.is_active = False
                    instance.save(update_fields=['is_active'])
                
                # Find all users of this tenant via UserTenant mapping (public schema)
                with schema_context('public'):
                    user_ids = UserTenant.objects.filter(tenant=instance).values_list('user_id', flat=True).distinct()
                    
                    # Set all users as inactive (public schema)
                    User.objects.filter(id__in=user_ids).update(is_active=False)
                
                # Switch to tenant schema and mark all UserRoles as deleted
                with schema_context(instance.schema_name):
                    UserRole.objects.filter(user_id__in=user_ids).update(is_deleted=True)
                
        except Exception as e:
            import traceback
            import sys
            print(f"Error performing soft delete for tenant {instance.name}: {e}")
            print(traceback.format_exc())
            sys.stdout.flush()
            return Response(
                {"detail": f"Failed to soft delete tenant: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def reactivate(self, request, *args, **kwargs):
        """
        Reactivate a soft-deleted tenant: set is_active=True and reactivate all users of that tenant.
        Sets is_active=True on all users and is_deleted=False on all UserRoles in tenant schema.
        Staff and superusers can reactivate any tenant.
        """
        # Ensure we're in public schema before getting the object
        try:
            connection.set_schema_to_public()
        except Exception:
            pass
        
        instance = self.get_object()
        
        try:
            with transaction.atomic():
                # Set tenant as active (reactivate) - must be in public schema
                with schema_context('public'):
                    instance.is_active = True
                    instance.save(update_fields=['is_active'])
                
                # Find all users of this tenant via UserTenant mapping (public schema)
                with schema_context('public'):
                    user_ids = UserTenant.objects.filter(tenant=instance).values_list('user_id', flat=True).distinct()
                    
                    # Set all users as active (public schema)
                    User.objects.filter(id__in=user_ids).update(is_active=True)
                
                # Switch to tenant schema and mark all UserRoles as not deleted
                with schema_context(instance.schema_name):
                    UserRole.objects.filter(user_id__in=user_ids).update(is_deleted=False)
                
        except Exception as e:
            import traceback
            import sys
            print(f"Error reactivating tenant {instance.name}: {e}")
            print(traceback.format_exc())
            sys.stdout.flush()
            return Response(
                {"detail": f"Failed to reactivate tenant: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        # Return updated tenant data
        serializer = self.get_serializer(instance)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def get_permissions(self):
        # Staff and superusers can perform all actions including reactivate
        if self.action in ("create", "update", "partial_update", "destroy", "reactivate"):
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
