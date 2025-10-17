from rest_framework import serializers
from .models import Molecule


class MoleculeSerializer(serializers.ModelSerializer):
    """
    Serializer for Molecule model.
    """
    
    class Meta:
        model = Molecule
        fields = [
            'id', 'molecule_id', 'name', 'type', 'subtitle', 
            'tag', 'atoms', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def validate_molecule_id(self, value):
        """Ensure molecule_id is unique."""
        if self.instance and self.instance.molecule_id == value:
            return value
        
        if Molecule.objects.filter(molecule_id=value).exists():
            raise serializers.ValidationError("A molecule with this ID already exists.")
        
        return value

