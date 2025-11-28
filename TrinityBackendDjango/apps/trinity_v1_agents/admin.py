from django.contrib import admin
from .models import TrinityV1Agent


@admin.register(TrinityV1Agent)
class TrinityV1AgentAdmin(admin.ModelAdmin):
    list_display = ('agent_id', 'name', 'category', 'route_count', 'is_active', 'created_at', 'updated_at')
    list_filter = ('is_active', 'category', 'created_at')
    search_fields = ('agent_id', 'name', 'description')
    readonly_fields = ('created_at', 'updated_at')
    fieldsets = (
        ('Basic Information', {
            'fields': ('agent_id', 'name', 'description', 'category')
        }),
        ('Metadata', {
            'fields': ('tags', 'route_count', 'routes', 'is_active')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )





