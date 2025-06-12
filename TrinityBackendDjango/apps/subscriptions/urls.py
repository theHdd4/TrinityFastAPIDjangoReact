from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CompanyViewSet, SubscriptionPlanViewSet

router = DefaultRouter()
router.register(r"companies", CompanyViewSet, basename="company")
router.register(r"subscription-plans", SubscriptionPlanViewSet, basename="subscriptionplan")

urlpatterns = [
    path("", include(router.urls)),
]
