from rest_framework import serializers
from django.contrib.auth.models import Permission, Group
from .models import RoleDefinition, UserRole


class PermissionRelatedField(serializers.PrimaryKeyRelatedField):
    def to_representation(self, value):
        return {
            "id": value.id,
            "codename": value.codename,
            "name": value.name,
            "content_type": value.content_type.model,
        }


class GroupRelatedField(serializers.PrimaryKeyRelatedField):
    def to_representation(self, value):
        return {
            "id": value.id,
            "name": value.name,
        }


class RoleDefinitionSerializer(serializers.ModelSerializer):
    group = GroupRelatedField(queryset=Group.objects.all())
    permissions = PermissionRelatedField(
        many=True,
        queryset=Permission.objects.all(),
        required=False
    )

    class Meta:
        model = RoleDefinition
        fields = [
            "id",
            "name",
            "group",
            "permissions",
            "description",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class UserRoleSerializer(serializers.ModelSerializer):
    """Serializer for UserRole model."""
    user = serializers.PrimaryKeyRelatedField(read_only=True)
    user_username = serializers.CharField(source="user.username", read_only=True)
    user_email = serializers.EmailField(source="user.email", read_only=True)

    class Meta:
        model = UserRole
        fields = [
            "id",
            "user",
            "user_username",
            "user_email",
            "role",
            "allowed_apps",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_allowed_apps(self, value):
        """Validate that allowed_apps is a list of integers."""
        if not isinstance(value, list):
            raise serializers.ValidationError("allowed_apps must be a list.")
        if not all(isinstance(item, int) for item in value):
            raise serializers.ValidationError("All items in allowed_apps must be integers.")
        return value
