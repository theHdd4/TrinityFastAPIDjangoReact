from django.contrib import admin
from .models import CustomMolecule


@admin.register(CustomMolecule)
class CustomMoleculeAdmin(admin.ModelAdmin):
    """
    Admin interface for CustomMolecule model.
    """
    list_display = [
        'molecule_id', 'name', 'type', 'tag', 'project', 'user', 
        'atoms_count', 'created_at'
    ]
    list_filter = ['tag', 'type', 'created_at', 'project']
    search_fields = ['molecule_id', 'name', 'type', 'subtitle', 'tag', 'project__name']
    readonly_fields = ['created_at', 'updated_at']
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('molecule_id', 'name', 'type', 'project', 'user')
        }),
        ('Details', {
            'fields': ('subtitle', 'tag')
        }),
        ('Atoms Configuration', {
            'fields': ('atoms', 'atom_order', 'selected_atoms'),
            'description': 'Atom configuration for this custom molecule'
        }),
        ('Additional Data', {
            'fields': ('connections', 'position'),
            'classes': ('collapse',)
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
