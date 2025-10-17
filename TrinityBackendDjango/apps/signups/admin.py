from django.contrib import admin
from .models import SignupList


@admin.register(SignupList)
class SignupListAdmin(admin.ModelAdmin):
    """
    Admin interface for viewing signups.
    """
    list_display = ['first_name', 'last_name', 'email', 'institution_company', 'created_at']
    list_filter = ['created_at']
    search_fields = ['first_name', 'last_name', 'email', 'institution_company']
    readonly_fields = ['created_at']
    ordering = ['-created_at']

