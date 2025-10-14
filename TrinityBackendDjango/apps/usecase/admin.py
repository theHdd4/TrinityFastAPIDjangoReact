from django.contrib import admin
from django.utils.html import format_html
from .models import UseCase


@admin.register(UseCase)
class UseCaseAdmin(admin.ModelAdmin):
    """
    Admin interface for managing UseCase (apps).
    This allows easy management of apps through Django admin.
    """
    list_display = [
        'name', 'slug', 'molecules_count', 'atoms_count', 
        'created_at', 'updated_at'
    ]
    list_filter = ['created_at', 'updated_at']
    search_fields = ['name', 'slug', 'description']
    readonly_fields = ['created_at', 'updated_at', 'molecules_preview', 'atoms_preview']
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('name', 'slug', 'description')
        }),
        ('Molecules & Atoms', {
            'fields': ('molecules', 'atoms', 'molecules_preview', 'atoms_preview'),
            'description': 'JSON fields containing molecule and atom definitions'
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def molecules_count(self, obj):
        """Display count of molecules."""
        count = len(obj.molecules) if obj.molecules else 0
        return format_html(
            '<span style="color: #0066cc; font-weight: bold;">{}</span>',
            count
        )
    molecules_count.short_description = 'Molecules'
    
    def atoms_count(self, obj):
        """Display count of atoms."""
        count = len(obj.atoms) if obj.atoms else 0
        return format_html(
            '<span style="color: #cc6600; font-weight: bold;">{}</span>',
            count
        )
    atoms_count.short_description = 'Atoms'
    
    def molecules_preview(self, obj):
        """Show a preview of molecules."""
        if not obj.molecules:
            return "No molecules"
        
        preview = []
        for molecule in obj.molecules[:3]:  # Show first 3
            title = molecule.get('title', 'Unknown')
            type_name = molecule.get('type', 'Unknown')
            preview.append(f"• {title} ({type_name})")
        
        if len(obj.molecules) > 3:
            preview.append(f"... and {len(obj.molecules) - 3} more")
        
        return format_html('<br>'.join(preview))
    molecules_preview.short_description = 'Molecules Preview'
    
    def atoms_preview(self, obj):
        """Show a preview of atoms."""
        if not obj.atoms:
            return "No atoms"
        
        atoms_list = obj.atoms[:10]  # Show first 10
        preview = [f"• {atom}" for atom in atoms_list]
        
        if len(obj.atoms) > 10:
            preview.append(f"... and {len(obj.atoms) - 10} more")
        
        return format_html('<br>'.join(preview))
    atoms_preview.short_description = 'Atoms Preview'
    
    def save_model(self, request, obj, form, change):
        """Custom save to ensure molecules and atoms are properly formatted."""
        super().save_model(request, obj, form, change)
        
        # You can add validation or auto-sync logic here if needed
        if not obj.molecules:
            obj.molecules = []
        if not obj.atoms:
            obj.atoms = []
        
        obj.save()