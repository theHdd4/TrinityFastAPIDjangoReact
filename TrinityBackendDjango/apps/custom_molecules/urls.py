from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CustomMoleculeViewSet, custom_molecules_api

router = DefaultRouter()
router.register(r"custom-molecules", CustomMoleculeViewSet, basename="custommolecule")

urlpatterns = [
    path("", include(router.urls)),
    path("custom-molecules-simple/", custom_molecules_api, name="custom-molecules-simple-api"),
]
