from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PermissionViewSet

router = DefaultRouter()
router.register(r"permissions", PermissionViewSet, basename="permission")

urlpatterns = [
    path("", include(router.urls)),
]
