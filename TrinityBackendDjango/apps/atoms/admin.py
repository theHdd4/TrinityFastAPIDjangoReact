from django.contrib import admin
from .models import AtomCategory, Atom, AtomVersion, EmbeddingCache, RetrievalDocument


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


@admin.register(RetrievalDocument)
class RetrievalDocumentAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "created_at")
    search_fields = ("title", "text")
    readonly_fields = ("created_at", "updated_at")


@admin.register(EmbeddingCache)
class EmbeddingCacheAdmin(admin.ModelAdmin):
    list_display = ("id", "document", "model_name", "vector_dim", "created_at")
    search_fields = ("document__title", "model_name")
    readonly_fields = ("created_at", "updated_at")
