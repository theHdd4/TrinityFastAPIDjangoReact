from rest_framework import serializers
from .models import UseCase


class UseCaseSerializer(serializers.ModelSerializer):
    """
    Serializer for UseCase model.
    """
    
    class Meta:
        model = UseCase
        fields = [
            'id', 'name', 'slug', 'description', 'modules', 'molecules'
        ]
        read_only_fields = ['id']
    
    def validate_slug(self, value):
        """Ensure slug is unique."""
        if self.instance and self.instance.slug == value:
            return value
        
        if UseCase.objects.filter(slug=value).exists():
            raise serializers.ValidationError("A use case with this slug already exists.")
        
        return value
