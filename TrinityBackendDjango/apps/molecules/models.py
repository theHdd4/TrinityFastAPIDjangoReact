from django.db import models


class Molecule(models.Model):
    """
    Molecule model to store molecule definitions with their atoms.
    Stored in the public schema for global access.
    """
    molecule_id = models.CharField(max_length=100, unique=True, help_text="Molecule identifier (e.g., 'build', 'explore')")
    name = models.CharField(max_length=150, help_text="Molecule name/title")
    type = models.CharField(max_length=150, help_text="Molecule type")
    subtitle = models.CharField(max_length=255, blank=True, help_text="Molecule subtitle/description")
    tag = models.CharField(max_length=100, blank=True, help_text="Category tag for the molecule")
    atoms = models.JSONField(default=list, blank=True, help_text="List of atom IDs in this molecule")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'trinity_v1_molecules'  # Table name in public schema
        ordering = ["name"]
        verbose_name = "Molecule"
        verbose_name_plural = "Molecules"
    
    def __str__(self):
        return f"{self.name} ({self.molecule_id})"

