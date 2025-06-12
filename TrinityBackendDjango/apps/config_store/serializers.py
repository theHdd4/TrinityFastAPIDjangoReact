from rest_framework import serializers
from .models import SiteConfig, TenantConfig


class SiteConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = SiteConfig
        fields = ["id", "key", "value", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class TenantConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = TenantConfig
        fields = ["id", "tenant", "key", "value", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]
