from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import EngineRegistryViewSet, TaskRunViewSet

router = DefaultRouter()
router.register(r"engines", EngineRegistryViewSet, basename="engine")
router.register(r"task-runs", TaskRunViewSet, basename="taskrun")

urlpatterns = [
    path("", include(router.urls)),
]
