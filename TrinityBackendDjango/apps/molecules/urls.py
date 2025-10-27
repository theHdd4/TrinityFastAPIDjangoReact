from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import MoleculeViewSet, molecules_api

router = DefaultRouter()
router.register(r'molecules', MoleculeViewSet, basename='molecule')

urlpatterns = [
    path('', include(router.urls)),
    path('molecules-simple/', molecules_api, name='molecules-simple-api'),
]

