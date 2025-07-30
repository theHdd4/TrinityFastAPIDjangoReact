from rest_framework import serializers
from django.contrib.auth.models import Permission


class PermissionSerializer(serializers.ModelSerializer):
    """
    Serializes Django Permission objects for the RBAC matrix.
    """
    content_type = serializers.StringRelatedField()

    class Meta:
        model = Permission
        fields = ["id", "name", "codename", "content_type"]
        read_only_fields = ["id", "name", "codename", "content_type"]
