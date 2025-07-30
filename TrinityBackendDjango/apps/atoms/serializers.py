from rest_framework import serializers
from .models import AtomCategory, Atom, AtomVersion


class AtomCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = AtomCategory
        fields = ["id", "name", "description"]
        read_only_fields = ["id"]


class AtomVersionSerializer(serializers.ModelSerializer):
    class Meta:
        model = AtomVersion
        fields = [
            "id",
            "atom",
            "version",
            "release_date",
            "release_notes",
            "config_schema",
            "is_active",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class AtomSerializer(serializers.ModelSerializer):
    versions = AtomVersionSerializer(many=True, read_only=True)

    class Meta:
        model = Atom
        fields = [
            "id",
            "name",
            "slug",
            "category",
            "description",
            "created_at",
            "updated_at",
            "versions",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
