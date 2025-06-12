from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import RevisionViewSet

router = DefaultRouter()
router.register(r"revisions", RevisionViewSet, basename="revision")

urlpatterns = [
    path("", include(router.urls)),
]
