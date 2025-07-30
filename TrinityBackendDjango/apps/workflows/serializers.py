from rest_framework import serializers
from .models import Workflow, WorkflowAtom, WorkflowRun


class WorkflowAtomSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkflowAtom
        fields = ["id", "workflow", "atom", "order", "config"]
        read_only_fields = ["id"]


class WorkflowSerializer(serializers.ModelSerializer):
    workflow_atoms = WorkflowAtomSerializer(many=True, read_only=True)

    class Meta:
        model = Workflow
        fields = [
            "id",
            "project",
            "name",
            "slug",
            "dag_spec",
            "created_by",
            "created_at",
            "updated_at",
            "workflow_atoms",
        ]
        read_only_fields = ["id", "created_by", "created_at", "updated_at"]


class WorkflowRunSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkflowRun
        fields = [
            "id",
            "workflow",
            "initiated_by",
            "status",
            "run_context",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "initiated_by", "created_at", "updated_at", "status"]
