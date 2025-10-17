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
        """Ensure molecule_id is unique within the project."""
        project = self.context.get('project')
        if project and CustomMolecule.objects.filter(
            project=project, 
            molecule_id=value
        ).exclude(id=self.instance.id if self.instance else None).exists():
            raise serializers.ValidationError(
                "A custom molecule with this ID already exists in this project."
            )
        return value
