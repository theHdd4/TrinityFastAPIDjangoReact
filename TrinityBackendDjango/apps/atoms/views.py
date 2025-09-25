from rest_framework import viewsets, permissions
from .models import AtomCategory, Atom, AtomVersion
from .serializers import (
    AtomCategorySerializer,
    AtomSerializer,
    AtomVersionSerializer,
)


class AtomCategoryViewSet(viewsets.ModelViewSet):
    """
    CRUD for AtomCategory. 
    Admins only; read-only for regular users.
    """
    queryset = AtomCategory.objects.all()
    serializer_class = AtomCategorySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [permissions.IsAdminUser()]
        return super().get_permissions()


class AtomViewSet(viewsets.ModelViewSet):
    """
    CRUD for Atom. 
    Admins only; read-only for regular users.
    """
    queryset = Atom.objects.select_related("category").prefetch_related("versions").all()
    serializer_class = AtomSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [permissions.IsAdminUser()]
        return super().get_permissions()


class AtomVersionViewSet(viewsets.ModelViewSet):
    """
    CRUD for AtomVersion. 
    Admin-only for writes; read-only for regular users.
    """
    queryset = AtomVersion.objects.select_related("atom").all()
    serializer_class = AtomVersionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [permissions.IsAdminUser()]
        return super().get_permissions()
