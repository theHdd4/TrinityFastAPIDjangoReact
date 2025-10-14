from django.db import models
# from simple_history.models import HistoricalRecords


class UseCase(models.Model):
    """
    Represents use case applications that can be selected by users.
    This table stores app definitions in the public schema.
    
    IMPORTANT: This model only uses 'molecules' and 'atoms' fields.
    DO NOT add 'molecules_used' or 'atoms_in_molecules' fields as they are deprecated.
    """
    name = models.CharField(max_length=150, unique=True)
    slug = models.SlugField(max_length=150, unique=True)
    description = models.TextField(blank=True)
    
    # Molecule and atom information
    molecules = models.JSONField(
        default=list,
        blank=True,
        help_text="List of molecules available for this use case"
    )
    atoms = models.JSONField(
        default=list,
        blank=True,
        help_text="List of atoms available for this use case"
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    # history = HistoricalRecords()  # Temporarily disabled

    class Meta:
        db_table = 'usecase'
        ordering = ["name"]

    def __str__(self):
        return self.name
