from rest_framework import serializers
from .models import AtomConfig


class AtomConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = AtomConfig
        fields = [
            "id",
            "project",
            "atom",
            "user",
            "config",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
