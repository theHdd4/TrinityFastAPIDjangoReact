from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import App, Project, Session, LaboratoryAction, ArrowDataset

User = get_user_model()


class AppSerializer(serializers.ModelSerializer):
    class Meta:
        model = App
        fields = ["id", "name", "slug", "description", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class ProjectSerializer(serializers.ModelSerializer):
    owner = serializers.SlugRelatedField(
        slug_field="username",
        queryset=User.objects.all(),
        required=False,
        default=serializers.CurrentUserDefault(),
    )

    class Meta:
        model = Project
        fields = [
            "id",
            "name",
            "slug",
            "description",
            "owner",
            "app",
            "state",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class SessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Session
        fields = ["id", "project", "user", "context", "created_at", "updated_at"]
        read_only_fields = ["id", "user", "created_at", "updated_at"]


class LaboratoryActionSerializer(serializers.ModelSerializer):
    class Meta:
        model = LaboratoryAction
        fields = ["id", "project", "user", "state", "created_at"]
        read_only_fields = ["id", "user", "created_at"]

class ArrowDatasetSerializer(serializers.ModelSerializer):
    class Meta:
        model = ArrowDataset
        fields = [
            "id",
            "project",
            "atom_id",
            "file_key",
            "arrow_object",
            "flight_path",
            "original_csv",
            "descriptor",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]
