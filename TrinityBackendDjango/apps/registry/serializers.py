from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import App, Project, Session

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
