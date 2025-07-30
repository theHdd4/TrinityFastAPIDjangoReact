from rest_framework import viewsets, permissions
from .models import Workflow, WorkflowAtom, WorkflowRun
from .serializers import (
    WorkflowSerializer,
    WorkflowAtomSerializer,
    WorkflowRunSerializer,
)


class WorkflowViewSet(viewsets.ModelViewSet):
    """
    CRUD for Workflows. 
    Admin-only for writes; read-only for authenticated users.
    """
    queryset = Workflow.objects.select_related("project", "created_by").all()
    serializer_class = WorkflowSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [permissions.IsAdminUser()]
        return super().get_permissions()

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class WorkflowAtomViewSet(viewsets.ModelViewSet):
    """
    CRUD for WorkflowAtom entries.
    Admin-only for writes; read-only for authenticated users.
    """
    queryset = WorkflowAtom.objects.select_related("workflow", "atom").all()
    serializer_class = WorkflowAtomSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [permissions.IsAdminUser()]
        return super().get_permissions()


class WorkflowRunViewSet(viewsets.ModelViewSet):
    """
    CRUD for WorkflowRun. 
    Admin-only for destructive writes; authenticated may list/retrieve their runs.
    """
    queryset = WorkflowRun.objects.select_related("workflow", "initiated_by").all()
    serializer_class = WorkflowRunSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.action in ("update", "partial_update", "destroy"):
            return [permissions.IsAdminUser()]
        return super().get_permissions()

    def perform_create(self, serializer):
        serializer.save(initiated_by=self.request.user)
