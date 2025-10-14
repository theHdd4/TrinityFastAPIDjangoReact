from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import connection
from django_tenants.utils import schema_context
from .models import Workflow, WorkflowRun
from .serializers import WorkflowSerializer, WorkflowRunSerializer


class WorkflowViewSet(viewsets.ModelViewSet):
    """
    CRUD operations for Workflows stored in public schema.
    Users can see their own workflows; admins can see all.
    Note: List endpoint disabled - use project_id filter required.
    
    IMPORTANT: Always operates in public schema regardless of tenant context.
    """
    queryset = Workflow.objects.select_related("user").all()
    serializer_class = WorkflowSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def dispatch(self, request, *args, **kwargs):
        """Force all operations to use public schema"""
        with schema_context('public'):
            return super().dispatch(request, *args, **kwargs)
    
    def list(self, request, *args, **kwargs):
        """
        Disabled - workflows must be queried by project_id.
        Use: GET /api/workflows/workflows/{id}/ for individual workflow
        Or access via project's workflow relationship.
        """
        from rest_framework.response import Response
        return Response(
            {
                "detail": "List endpoint disabled. Please access workflows through project relationships or individual IDs."
            },
            status=status.HTTP_405_METHOD_NOT_ALLOWED
        )
    
    def get_queryset(self):
        """Filter workflows based on user permissions and project_id"""
        user = self.request.user
        queryset = self.queryset
        
        # Non-staff users only see their own workflows
        if not user.is_staff:
            queryset = queryset.filter(user=user)
        
        return queryset
    
    def perform_create(self, serializer):
        """Automatically set the user when creating a workflow"""
        serializer.save(user=self.request.user)
    
    @action(detail=True, methods=["post"])
    def execute(self, request, pk=None):
        """
        Execute a workflow and track the execution.
        This creates a WorkflowRun record.
        """
        workflow = self.get_object()
        
        # Create run record
        run = WorkflowRun.objects.create(
            workflow=workflow,
            status="pending"
        )
        
        # Increment execution counter
        workflow.increment_execution_count()
        
        # Here you would typically:
        # 1. Queue the workflow for execution (e.g., via Celery)
        # 2. Return the run ID for tracking
        
        return Response({
            "message": "Workflow execution started",
            "run_id": run.id,
            "workflow_id": workflow.id,
            "workflow_name": workflow.name
        }, status=status.HTTP_202_ACCEPTED)
    
    @action(detail=True, methods=["get"])
    def runs(self, request, pk=None):
        """Get all runs for this workflow"""
        workflow = self.get_object()
        runs = workflow.runs.all()
        serializer = WorkflowRunSerializer(runs, many=True)
        return Response(serializer.data)


class WorkflowRunViewSet(viewsets.ModelViewSet):
    """
    ViewSet for tracking workflow runs/executions.
    IMPORTANT: Always operates in public schema regardless of tenant context.
    """
    queryset = WorkflowRun.objects.select_related("workflow").all()
    serializer_class = WorkflowRunSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def dispatch(self, request, *args, **kwargs):
        """Force all operations to use public schema"""
        with schema_context('public'):
            return super().dispatch(request, *args, **kwargs)
    
    def get_queryset(self):
        """Filter runs based on user permissions"""
        user = self.request.user
        queryset = self.queryset
        
        # Filter by workflow_id if provided
        workflow_id = self.request.query_params.get("workflow_id")
        if workflow_id:
            queryset = queryset.filter(workflow_id=workflow_id)
        
        # Non-staff users only see runs of their own workflows
        if not user.is_staff:
            queryset = queryset.filter(workflow__user=user)
        
        return queryset


# Alias for backwards compatibility
WorkflowExecutionViewSet = WorkflowRunViewSet

