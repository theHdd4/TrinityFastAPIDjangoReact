from django.contrib import admin
from .models import Molecule


@admin.register(Molecule)
class MoleculeAdmin(admin.ModelAdmin):
    """
    Admin interface for Molecule model.
    """
    list_display = ['molecule_id', 'name', 'type', 'tag', 'atoms_count', 'created_at']
    list_filter = ['tag', 'type', 'created_at']
    search_fields = ['molecule_id', 'name', 'type', 'subtitle', 'tag']
    readonly_fields = ['created_at', 'updated_at']
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('molecule_id', 'name', 'type')
        }),
        ('Details', {
            'fields': ('subtitle', 'tag')
        }),
        ('Atoms', {
            'fields': ('atoms',),
            'description': 'List of atom names in this molecule'
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def atoms_count(self, obj):
        """Display the count of atoms."""
        return len(obj.atoms) if obj.atoms else 0
    atoms_count.short_description = 'Atoms Count'

