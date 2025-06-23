from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    AppViewSet,
    ProjectViewSet,
    SessionViewSet,
    LaboratoryActionViewSet,
)

router = DefaultRouter()
router.register(r"apps", AppViewSet, basename="app")
router.register(r"projects", ProjectViewSet, basename="project")
router.register(r"sessions", SessionViewSet, basename="session")
router.register(r"laboratory-actions", LaboratoryActionViewSet, basename="laboratoryaction")

urlpatterns = [
    path("", include(router.urls)),
]
