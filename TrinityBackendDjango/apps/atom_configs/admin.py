from django.contrib import admin
from .models import AtomConfig


@admin.register(AtomConfig)
class AtomConfigAdmin(admin.ModelAdmin):
    list_display = ("project", "atom", "user", "updated_at")
    list_filter = ("project", "atom")
    search_fields = ("project__name", "atom__name", "user__username")
