from django.db import models


class TrinityV1Atom(models.Model):
    """
    Trinity V1 Atom model to store atom definitions.
    Stored in the public schema for global access.
    """
    atom_id = models.CharField(max_length=100, unique=True, help_text="Atom identifier")
    name = models.CharField(max_length=150, help_text="Atom name")
    description = models.TextField(blank=True, help_text="Atom description")
    category = models.CharField(max_length=100, blank=True, help_text="Atom category")
    tags = models.JSONField(default=list, blank=True, help_text="List of tags for the atom")
    color = models.CharField(max_length=50, blank=True, help_text="Color associated with the atom's category")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'trinity_v1_atoms'
        ordering = ["name"]
        verbose_name = "Trinity V1 Atom"
        verbose_name_plural = "Trinity V1 Atoms"
    
    def __str__(self):
        return f"{self.name} ({self.atom_id})"
