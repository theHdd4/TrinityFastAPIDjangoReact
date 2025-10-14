from django.db import models


class UseCase(models.Model):
    """
    UseCase model to store application definitions.
    Clean, simple structure matching the image requirements.
    """
    name = models.CharField(max_length=150, unique=True, help_text="App name")
    slug = models.CharField(max_length=150, unique=True, help_text="URL-friendly identifier")
    description = models.TextField(blank=True, help_text="App description")
    modules = models.JSONField(default=list, blank=True, help_text="List of module IDs for this app")
    
    # Molecule and atom information
    molecules = models.JSONField(default=list, blank=True, help_text="List of molecule IDs available for this use case")
    molecule_atoms = models.JSONField(default=dict, blank=True, help_text="Mapping of molecule details with their atoms")
    atoms_in_molecules = models.JSONField(default=list, blank=True, help_text="Flattened list of all atoms from selected molecules")
    
    class Meta:
        db_table = 'usecase'
        ordering = ["name"]
        verbose_name = "Use Case"
        verbose_name_plural = "Use Cases"
    
    def __str__(self):
        return self.name