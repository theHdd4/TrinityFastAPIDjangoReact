from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import SignupListViewSet

router = DefaultRouter()
# Use empty string since the prefix is already in config/urls.py
router.register(r"", SignupListViewSet, basename="signup")

urlpatterns = [
    path("", include(router.urls)),
]

