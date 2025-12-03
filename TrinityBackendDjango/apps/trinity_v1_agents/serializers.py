from rest_framework import serializers
from .models import TrinityV1Agent


class TrinityV1AgentSerializer(serializers.ModelSerializer):
    class Meta:
        model = TrinityV1Agent
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at')





