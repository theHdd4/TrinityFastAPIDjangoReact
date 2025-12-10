from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import RoleDefinitionViewSet, UserRoleViewSet

router = DefaultRouter()
router.register(r"roles", RoleDefinitionViewSet, basename="role")
router.register(r"user-roles", UserRoleViewSet, basename="user-role")

urlpatterns = [
    path("", include(router.urls)),
]
