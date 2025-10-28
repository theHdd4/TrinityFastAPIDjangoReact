from rest_framework import serializers
from .models import TrinityV1Atom


class TrinityV1AtomSerializer(serializers.ModelSerializer):
    """
    Serializer for TrinityV1Atom model.
    """
    
    class Meta:
        model = TrinityV1Atom
        fields = [
            'id', 'atom_id', 'name', 'description', 'category', 'tags', 'color', 'available_atoms',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def validate_atom_id(self, value):
        """Ensure atom_id is unique."""
        if self.instance and self.instance.atom_id == value:
            return value
        
        if TrinityV1Atom.objects.filter(atom_id=value).exists():
            raise serializers.ValidationError("An atom with this ID already exists.")
        
        return value
