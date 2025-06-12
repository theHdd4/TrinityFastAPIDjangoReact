from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import AtomConfigViewSet

router = DefaultRouter()
router.register(r"atom-configs", AtomConfigViewSet, basename="atomconfig")

urlpatterns = [
    path("", include(router.urls)),
]
