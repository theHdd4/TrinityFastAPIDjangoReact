from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import AppViewSet, ProjectViewSet, SessionViewSet

router = DefaultRouter()
router.register(r"apps", AppViewSet, basename="app")
router.register(r"projects", ProjectViewSet, basename="project")
router.register(r"sessions", SessionViewSet, basename="session")

urlpatterns = [
    path("", include(router.urls)),
]
