from rest_framework import serializers
from django.contrib.auth import get_user_model
import logging

from django.conf import settings
from pymongo import MongoClient

from .models import App, Project, Session, LaboratoryAction, ArrowDataset, Template

logger = logging.getLogger(__name__)

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
    configuration_summary = serializers.SerializerMethodField()

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
            "configuration_summary",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "template_projects",
            "usage_count",
            "configuration_summary",
            "created_at",
            "updated_at",
        ]

    def get_usage_count(self, obj):
        return len(obj.template_projects or [])

    def get_configuration_summary(self, obj):
        mongo_uri = getattr(settings, "MONGO_URI", "mongodb://mongo:27017/trinity_db")
        try:
            with MongoClient(mongo_uri) as client:
                collection = client["trinity_db"]["template_configuration"]
                document = collection.find_one({"template_id": str(obj.pk)})
                if not document:
                    return None
                summary = document.get("summary") or {}
                atom_cards = summary.get("atom_cards") or {}
                return {
                    "exhibitionSlides": summary.get("exhibition_slides", 0),
                    "atomCards": {
                        "laboratory": atom_cards.get("laboratory", 0),
                        "workflow": atom_cards.get("workflow", 0),
                        "exhibition": atom_cards.get("exhibition", 0),
                    },
                    "atomEntryCount": summary.get("atom_entry_count", 0),
                    "moleculeCount": summary.get("molecule_count", 0),
                }
        except Exception as exc:  # pragma: no cover - Mongo failures shouldn't block API
            logger.error("Failed to load template configuration summary for %s: %s", obj.pk, exc)
        return None
