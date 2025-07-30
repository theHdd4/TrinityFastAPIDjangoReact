from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    UserViewSet,
    UserProfileViewSet,
    LoginView,
    LogoutView,
)

router = DefaultRouter()
router.register(r"users", UserViewSet, basename="user")
router.register(r"profiles", UserProfileViewSet, basename="userprofile")

urlpatterns = [
    path("login/", LoginView.as_view(), name="login"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("", include(router.urls)),
]
