from rest_framework import serializers
from .models import Revision


class RevisionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Revision
        fields = ["id", "content_type", "object_id", "data", "created_at"]
        read_only_fields = ["id", "created_at"]
