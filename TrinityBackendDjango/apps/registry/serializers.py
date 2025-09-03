from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import App, Project, Session, LaboratoryAction, ArrowDataset, Template

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
    base_template = serializers.SerializerMethodField()
    base_template_id = serializers.PrimaryKeyRelatedField(
        queryset=Template.objects.all(),
        source="base_template",
        write_only=True,
        required=False,
        allow_null=True,
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
            "base_template",
            "base_template_id",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_base_template(self, obj):
        return obj.base_template.name if obj.base_template else None


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


class TemplateSerializer(serializers.ModelSerializer):
    owner = serializers.SlugRelatedField(
        slug_field="username",
        queryset=User.objects.all(),
        required=False,
        default=serializers.CurrentUserDefault(),
    )
    usage_count = serializers.SerializerMethodField()

    class Meta:
        model = Template
        fields = [
            "id",
            "name",
            "slug",
            "description",
            "owner",
            "app",
            "state",
            "base_project",
            "template_projects",
            "usage_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "template_projects",
            "usage_count",
            "created_at",
            "updated_at",
        ]

    def get_usage_count(self, obj):
        return len(obj.template_projects or [])
