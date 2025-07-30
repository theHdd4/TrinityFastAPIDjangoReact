from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import RoleDefinitionViewSet

router = DefaultRouter()
router.register(r"roles", RoleDefinitionViewSet, basename="role")

urlpatterns = [
    path("", include(router.urls)),
]
