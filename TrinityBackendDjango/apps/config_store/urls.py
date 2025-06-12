from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import SiteConfigViewSet, TenantConfigViewSet

router = DefaultRouter()
router.register(r"site-configs", SiteConfigViewSet, basename="siteconfig")
router.register(r"tenant-configs", TenantConfigViewSet, basename="tenantconfig")

urlpatterns = [
    path("", include(router.urls)),
]
