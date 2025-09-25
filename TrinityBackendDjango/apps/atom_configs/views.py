from rest_framework import viewsets, permissions
from .models import AtomConfig
from .serializers import AtomConfigSerializer


class AtomConfigViewSet(viewsets.ModelViewSet):
    """
    CRUD for AtomConfig. 
    Admins see all; regular users see only configs they created.
    """
    queryset = AtomConfig.objects.select_related("project", "atom", "user").all()
    serializer_class = AtomConfigSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.is_staff:
            return self.queryset
        return self.queryset.filter(user=user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
