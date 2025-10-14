from rest_framework import serializers
from .models import Workflow, WorkflowRun


class WorkflowSerializer(serializers.ModelSerializer):
    """
    Serializer for Workflow model.
    Handles workflow CRUD operations and validation.
    """
    # Provide defaults for optional fields
    description = serializers.CharField(required=False, allow_blank=True, default="")
    app_name = serializers.CharField(required=False, allow_blank=True, default="")
    molecules_used = serializers.JSONField(required=False, default=list)
    atoms_in_molecules = serializers.JSONField(required=False, default=dict)
    dag_spec = serializers.JSONField(required=False, default=dict)
    
    class Meta:
        model = Workflow
        fields = [
            "id",
            "project_id",
            "project_name",
            "name",
            "slug",
            "description",
            "app_name",
            "molecules_used",
            "atoms_in_molecules",
            "dag_spec",
            "user",
            "created_at",
            "updated_at",
            "is_active",
            "version",
            "execution_count",
            "last_executed_at",
        ]
        read_only_fields = [
            "id",
            "created_at",
            "updated_at",
            "execution_count",
            "last_executed_at",
        ]
    
    def validate_dag_spec(self, value):
        """Validate that dag_spec has required structure"""
        if not isinstance(value, dict):
            raise serializers.ValidationError("dag_spec must be a dictionary")
        
        # Optional: validate that it has nodes and edges
        if "nodes" not in value and "edges" not in value:
            # Allow empty specs for initial creation
            pass
        
        return value


class WorkflowRunSerializer(serializers.ModelSerializer):
    """
    Serializer for WorkflowRun model.
    Tracks individual workflow runs/executions.
    """
    workflow_name = serializers.CharField(source="workflow.name", read_only=True)
    error_message = serializers.CharField(required=False, allow_blank=True, default="")
    result_data = serializers.JSONField(required=False, default=dict)
    
    class Meta:
        model = WorkflowRun
        fields = [
            "id",
            "workflow",
            "workflow_name",
            "started_at",
            "completed_at",
            "status",
            "error_message",
            "result_data",
        ]
        read_only_fields = ["id", "started_at"]


# Alias for backwards compatibility
WorkflowExecutionSerializer = WorkflowRunSerializer

