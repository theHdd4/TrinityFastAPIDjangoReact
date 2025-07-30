from rest_framework import serializers
from django.contrib.auth.models import Permission, Group
from .models import RoleDefinition


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
