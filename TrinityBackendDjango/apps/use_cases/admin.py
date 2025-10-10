"""
Use Case Admin - Django admin interface for use case management
"""
from django.contrib import admin
from .models import UseCase, UseCaseDeployment, UseCaseExecution, UseCaseTemplate


@admin.register(UseCase)
class UseCaseAdmin(admin.ModelAdmin):
    list_display = ['id', 'title', 'category', 'status', 'is_active', 'created_at']
    list_filter = ['category', 'status', 'is_active', 'created_at']
    search_fields = ['id', 'title', 'description']
    readonly_fields = ['created_at', 'updated_at']
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('id', 'title', 'description', 'category', 'icon', 'color', 'bg_gradient')
        }),
        ('Configuration', {
            'fields': ('molecules_config', 'deployment_config')
        }),
        ('Status', {
            'fields': ('status', 'version', 'is_active')
        }),
        ('Metadata', {
            'fields': ('created_by', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(UseCaseDeployment)
class UseCaseDeploymentAdmin(admin.ModelAdmin):
    list_display = ['deployment_id', 'use_case', 'project', 'status', 'deployed_at']
    list_filter = ['status', 'deployed_at', 'use_case__category']
    search_fields = ['deployment_id', 'use_case__title', 'project__name']
    readonly_fields = ['deployment_id', 'deployed_at', 'last_updated']
    
    fieldsets = (
        ('Deployment Information', {
            'fields': ('deployment_id', 'use_case', 'project', 'workflow')
        }),
        ('Status', {
            'fields': ('status', 'health_status', 'last_health_check')
        }),
        ('Configuration', {
            'fields': ('deployment_config', 'environment_variables', 'resource_requirements'),
            'classes': ('collapse',)
        }),
        ('Infrastructure', {
            'fields': ('kubernetes_namespace', 'service_endpoints', 'health_check_urls'),
            'classes': ('collapse',)
        }),
        ('Metadata', {
            'fields': ('deployed_by', 'deployed_at', 'last_updated'),
            'classes': ('collapse',)
        }),
    )


@admin.register(UseCaseExecution)
class UseCaseExecutionAdmin(admin.ModelAdmin):
    list_display = ['execution_id', 'deployment', 'status', 'start_time', 'duration_seconds']
    list_filter = ['status', 'start_time', 'deployment__use_case']
    search_fields = ['execution_id', 'deployment__deployment_id']
    readonly_fields = ['execution_id', 'created_at']
    
    fieldsets = (
        ('Execution Information', {
            'fields': ('execution_id', 'deployment', 'status')
        }),
        ('Data', {
            'fields': ('input_data', 'output_data', 'results'),
            'classes': ('collapse',)
        }),
        ('Performance', {
            'fields': ('start_time', 'end_time', 'duration_seconds', 'cpu_usage', 'memory_usage')
        }),
        ('Error Handling', {
            'fields': ('error_message', 'error_details'),
            'classes': ('collapse',)
        }),
        ('Metadata', {
            'fields': ('executed_by', 'created_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(UseCaseTemplate)
class UseCaseTemplateAdmin(admin.ModelAdmin):
    list_display = ['name', 'category', 'version', 'is_active', 'created_at']
    list_filter = ['category', 'is_active', 'created_at']
    search_fields = ['name', 'description']
    readonly_fields = ['created_at']
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('name', 'description', 'category', 'version', 'is_active')
        }),
        ('Template Configuration', {
            'fields': ('template_config', 'default_molecules', 'default_atoms'),
            'classes': ('collapse',)
        }),
        ('Deployment Templates', {
            'fields': ('docker_template', 'kubernetes_template', 'helm_chart_template'),
            'classes': ('collapse',)
        }),
        ('Metadata', {
            'fields': ('created_by', 'created_at'),
            'classes': ('collapse',)
        }),
    )
