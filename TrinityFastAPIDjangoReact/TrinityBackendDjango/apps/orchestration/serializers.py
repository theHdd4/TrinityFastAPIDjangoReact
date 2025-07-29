from rest_framework import serializers
from .models import EngineRegistry, TaskRun


class EngineRegistrySerializer(serializers.ModelSerializer):
    class Meta:
        model = EngineRegistry
        fields = [
            "id",
            "name",
            "base_url",
            "schema_endpoint",
            "run_endpoint",
            "is_active",
            "last_heartbeat",
            "metadata",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "last_heartbeat", "created_at", "updated_at"]


class TaskRunSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaskRun
        fields = [
            "id",
            "workflow_run",
            "atom_slug",
            "engine",
            "status",
            "input",
            "output",
            "error",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "engine", "status", "output", "error", "created_at", "updated_at"]
