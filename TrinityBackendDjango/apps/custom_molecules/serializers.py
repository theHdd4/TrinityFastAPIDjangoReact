from rest_framework import serializers
from .models import CustomMolecule


class CustomMoleculeSerializer(serializers.ModelSerializer):
    """
    Serializer for CustomMolecule model.
    """
    
    class Meta:
        model = CustomMolecule
        fields = [
            "id",
            "project",
            "user",
            "molecule_id",
            "name",
            "type",
            "subtitle",
            "tag",
            "atoms",
            "atom_order",
            "selected_atoms",
            "connections",
            "position",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_molecule_id(self, value):
        """Ensure molecule_id is unique across the tenant (all projects)."""
        # Check for uniqueness across all projects since custom molecules are shared
        if CustomMolecule.objects.filter(
            molecule_id=value
        ).exclude(id=self.instance.id if self.instance else None).exists():
            raise serializers.ValidationError(
                "A custom molecule with this ID already exists."
            )
        return value
