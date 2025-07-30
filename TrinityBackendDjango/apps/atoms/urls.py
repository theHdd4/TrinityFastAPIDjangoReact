from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import AtomCategoryViewSet, AtomViewSet, AtomVersionViewSet

router = DefaultRouter()
router.register(r"atom-categories", AtomCategoryViewSet, basename="atomcategory")
router.register(r"atoms", AtomViewSet, basename="atom")
router.register(r"atom-versions", AtomVersionViewSet, basename="atomversion")

urlpatterns = [
    path("", include(router.urls)),
]
