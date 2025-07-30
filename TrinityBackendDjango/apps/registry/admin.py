from django.contrib import admin
from simple_history.admin import SimpleHistoryAdmin
from .models import App, Project, Session


@admin.register(App)
class AppAdmin(SimpleHistoryAdmin):
    list_display = ("name", "slug", "updated_at")
    search_fields = ("name", "slug")
    prepopulated_fields = {"slug": ("name",)}


@admin.register(Project)
class ProjectAdmin(SimpleHistoryAdmin):
    list_display = ("name", "owner", "app", "updated_at")
    list_filter = ("app", "owner")
    search_fields = ("name", "slug", "owner__username")
    prepopulated_fields = {"slug": ("name",)}


@admin.register(Session)
class SessionAdmin(SimpleHistoryAdmin):
    list_display = ("id", "project", "user", "created_at")
    list_filter = ("project", "user")
    search_fields = ("project__name", "user__username")
