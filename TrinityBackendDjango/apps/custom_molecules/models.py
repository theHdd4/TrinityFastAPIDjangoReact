from django.db import models
from django.contrib.auth import get_user_model
from apps.registry.models import Project

User = get_user_model()


class CustomMolecule(models.Model):
    """
    Stores custom molecules created by users in the tenant schema.
    Independent of the public molecules table.
    """
    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="custom_molecules"
    )
    user = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="custom_molecules"
    )
    
    # Molecule details
    molecule_id = models.CharField(
        max_length=100, 
        help_text="Custom molecule identifier"
    )
    name = models.CharField(
        max_length=150, 
        help_text="Molecule name/title"
    )
    type = models.CharField(
        max_length=150, 
        blank=True,
        default='custom',
        help_text="Molecule type"
    )
    subtitle = models.CharField(
        max_length=255, 
        blank=True, 
        help_text="Molecule subtitle/description"
    )
    tag = models.CharField(
        max_length=100, 
        blank=True, 
        help_text="Category tag for the molecule"
    )
    
    # Atoms configuration
    atoms = models.JSONField(
        default=list, 
        blank=True, 
        help_text="List of atom IDs in this molecule"
    )
    atom_order = models.JSONField(
        default=list, 
        blank=True, 
        help_text="Order of atoms in this molecule"
    )
    selected_atoms = models.JSONField(
        default=dict, 
        blank=True, 
        help_text="Selected atoms configuration"
    )
    
    # Additional metadata
    connections = models.JSONField(
        default=list, 
        blank=True, 
        help_text="Molecule connections"
    )
    position = models.JSONField(
        default=dict, 
        blank=True, 
        help_text="Position data (x, y coordinates)"
    )
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'custom_molecules'  # Table in tenant schema
        unique_together = ("molecule_id",)  # Unique across entire tenant
        ordering = ["-updated_at"]
        verbose_name = "Custom Molecule"
        verbose_name_plural = "Custom Molecules"

    def __str__(self):
        return f"{self.name} ({self.molecule_id}) in {self.project.name}"
