from rest_framework import serializers
from .models import UseCase


class UseCaseSerializer(serializers.ModelSerializer):
    """
    Serializer for UseCase model.
    """
    molecules_count = serializers.SerializerMethodField()
    atoms_count = serializers.SerializerMethodField()
    
    class Meta:
        model = UseCase
        fields = [
            'id', 'name', 'slug', 'description', 
            'molecules', 'atoms', 'molecules_count', 'atoms_count',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_molecules_count(self, obj):
        """Get the number of molecules in this use case."""
        return len(obj.molecules) if obj.molecules else 0
    
    def get_atoms_count(self, obj):
        """Get the number of atoms in this use case."""
        return len(obj.atoms) if obj.atoms else 0
    
    def validate_slug(self, value):
        """Ensure slug is unique and URL-friendly."""
        if self.instance and self.instance.slug == value:
            return value
        
        if UseCase.objects.filter(slug=value).exists():
            raise serializers.ValidationError("A use case with this slug already exists.")
        
        return value
    
    def validate_molecules(self, value):
        """Validate molecules structure."""
        if not isinstance(value, list):
            raise serializers.ValidationError("Molecules must be a list.")
        
        # Validate each molecule has required fields
        for molecule in value:
            if not isinstance(molecule, dict):
                raise serializers.ValidationError("Each molecule must be a dictionary.")
            
            required_fields = ['id', 'type', 'title', 'atoms']
            for field in required_fields:
                if field not in molecule:
                    raise serializers.ValidationError(f"Molecule missing required field: {field}")
            
            if not isinstance(molecule['atoms'], list):
                raise serializers.ValidationError("Molecule atoms must be a list.")
        
        return value
    
    def validate_atoms(self, value):
        """Validate atoms structure."""
        if not isinstance(value, list):
            raise serializers.ValidationError("Atoms must be a list.")
        
        # Ensure all atoms are strings
        for atom in value:
            if not isinstance(atom, str):
                raise serializers.ValidationError("Each atom must be a string.")
        
        return value