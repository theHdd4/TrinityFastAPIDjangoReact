from django.contrib import admin
from .models import Revision


@admin.register(Revision)
class RevisionAdmin(admin.ModelAdmin):
    list_display = ("content_type", "object_id", "created_at")
    list_filter = ("content_type",)
    search_fields = ("object_id",)
