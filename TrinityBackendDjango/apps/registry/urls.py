from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    AppViewSet,
    ProjectViewSet,
    TemplateViewSet,
    SessionViewSet,
    LaboratoryActionViewSet,
    ArrowDatasetViewSet,
)

router = DefaultRouter()
router.register(r"apps", AppViewSet, basename="app")
router.register(r"projects", ProjectViewSet, basename="project")
router.register(r"templates", TemplateViewSet, basename="template")
router.register(r"sessions", SessionViewSet, basename="session")
router.register(r"laboratory-actions", LaboratoryActionViewSet, basename="laboratoryaction")
router.register(r"arrow-datasets", ArrowDatasetViewSet, basename="arrowdataset")

urlpatterns = [
    path("", include(router.urls)),
]
