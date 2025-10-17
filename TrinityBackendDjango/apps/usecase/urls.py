from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import UseCaseViewSet, apps_api

# Create a router for the API
router = DefaultRouter()
router.register(r'usecases', UseCaseViewSet, basename='usecase')

urlpatterns = [
    # API endpoints
    path('', include(router.urls)),
    
    # Simple API endpoints for frontend
    path('apps/', apps_api, name='apps-api'),
    path('apps-for-frontend/', UseCaseViewSet.as_view({'get': 'apps_for_frontend'}), name='apps-for-frontend'),
]
