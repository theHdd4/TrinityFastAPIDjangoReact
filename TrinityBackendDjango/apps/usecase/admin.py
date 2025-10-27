from django.contrib import admin
from .models import UseCase


@admin.register(UseCase)
class UseCaseAdmin(admin.ModelAdmin):
    """
    Admin interface for managing UseCase (apps).
    """
    list_display = ['name', 'slug']
    search_fields = ['name', 'slug', 'description']
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('name', 'slug', 'description')
        }),
        ('Modules', {
            'fields': ('modules',),
            'description': 'List of module IDs associated with this app'
        }),
        ('Molecules and Atoms', {
            'fields': ('molecules', 'molecule_atoms', 'atoms_in_molecules'),
            'description': 'Molecule and atom configuration for this app'
        }),
    )