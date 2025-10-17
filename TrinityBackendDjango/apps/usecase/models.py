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
    
    # Molecule IDs stored as JSON array (like modules)
    molecules = models.JSONField(default=list, blank=True, help_text="List of molecule IDs for this use case")
    
    # Molecule relationship - many-to-many with Molecule model (for detailed queries)
    molecule_objects = models.ManyToManyField(
        'molecules.Molecule', 
        blank=True, 
        help_text="Molecules available for this use case",
        related_name='usecases'
    )
    
    class Meta:
        db_table = 'trinity_v1_apps'
        ordering = ["name"]
        verbose_name = "Use Case"
        verbose_name_plural = "Use Cases"
    
    def __str__(self):
        return self.name