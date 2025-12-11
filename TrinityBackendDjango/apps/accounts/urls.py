from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    UserViewSet,
    UserProfileViewSet,
    LoginView,
    LogoutView,
    OnboardCompleteView,
)

router = DefaultRouter()
router.register(r"users", UserViewSet, basename="user")
router.register(r"profiles", UserProfileViewSet, basename="userprofile")

urlpatterns = [
    path("login/", LoginView.as_view(), name="login"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("onboard/complete/", OnboardCompleteView.as_view(), name="onboard-complete"),
    path("", include(router.urls)),
]
