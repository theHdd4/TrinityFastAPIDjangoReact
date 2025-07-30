from django.contrib import admin
from .models import AtomCategory, Atom, AtomVersion


@admin.register(AtomCategory)
class AtomCategoryAdmin(admin.ModelAdmin):
    list_display = ("name",)
    search_fields = ("name",)


@admin.register(Atom)
class AtomAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "category", "updated_at")
    list_filter = ("category",)
    search_fields = ("name", "slug")


@admin.register(AtomVersion)
class AtomVersionAdmin(admin.ModelAdmin):
    list_display = ("atom", "version", "release_date", "is_active")
    list_filter = ("is_active",)
    search_fields = ("atom__name", "version")
