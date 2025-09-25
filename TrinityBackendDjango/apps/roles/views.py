from rest_framework import viewsets, permissions
from .models import RoleDefinition
from .serializers import RoleDefinitionSerializer


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
