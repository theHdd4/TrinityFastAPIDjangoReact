from rest_framework import viewsets, permissions
from .models import RoleDefinition, UserRole
from .serializers import RoleDefinitionSerializer, UserRoleSerializer


class RoleDefinitionViewSet(viewsets.ModelViewSet):
    """
    Manage RoleDefinitions. Admin-only for create/update/delete;
    read-only for authenticated users.
    """
    queryset = RoleDefinition.objects.select_related("group").prefetch_related("permissions").all()
    serializer_class = RoleDefinitionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [permissions.IsAdminUser()]
        return super().get_permissions()


class UserRoleViewSet(viewsets.ModelViewSet):
    """
    Manage UserRoles. Users can view their own role; admins can manage all roles.
    """
    queryset = UserRole.objects.select_related("user").all()
    serializer_class = UserRoleSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        """Filter queryset based on user permissions."""
        user = self.request.user
        if user.is_staff:
            return self.queryset
        # Non-staff users can only see their own role
        return self.queryset.filter(user=user)

    def get_permissions(self):
        """Admin-only for create/update/delete; authenticated users can view."""
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [permissions.IsAdminUser()]
        return super().get_permissions()
