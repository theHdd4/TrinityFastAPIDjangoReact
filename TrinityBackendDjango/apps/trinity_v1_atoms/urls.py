from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import TrinityV1AtomViewSet, atoms_api, atoms_for_frontend_api

router = DefaultRouter()
router.register(r'atoms', TrinityV1AtomViewSet, basename='trinity-v1-atom')

urlpatterns = [
    path('', include(router.urls)),
    path('atoms-simple/', atoms_api, name='atoms-simple-api'),
    path('atoms-for-frontend/', atoms_for_frontend_api, name='atoms-for-frontend-api'),
]
