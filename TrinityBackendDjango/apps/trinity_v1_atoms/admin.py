from django.contrib import admin
from .models import TrinityV1Atom


@admin.register(TrinityV1Atom)
class TrinityV1AtomAdmin(admin.ModelAdmin):
    """
    Admin interface for TrinityV1Atom model.
    """
    list_display = ['atom_id', 'name', 'category', 'created_at']
    list_filter = ['category', 'created_at']
    search_fields = ['atom_id', 'name', 'description', 'category']
    readonly_fields = ['created_at', 'updated_at']
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('atom_id', 'name')
        }),
        ('Details', {
            'fields': ('description', 'category')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
