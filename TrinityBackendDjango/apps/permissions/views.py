from django.contrib.auth.models import Permission
from rest_framework import viewsets, permissions
from .serializers import PermissionSerializer


class PermissionViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Returns the list of Permission objects the requesting user has,
    so the frontend can grey‐out disallowed actions.
    """
    serializer_class = PermissionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        # get_all_permissions returns strings like "app_label.codename"
        perm_strings = user.get_all_permissions()
        app_labels = set(p.split(".")[0] for p in perm_strings)
        codenames = set(p.split(".")[1] for p in perm_strings)

        return Permission.objects.filter(
            content_type__app_label__in=app_labels,
            codename__in=codenames
        )
