"""
Use Case URLs - API routing for use case management
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    UseCaseViewSet,
    UseCaseDeploymentViewSet,
    UseCaseExecutionViewSet,
    UseCaseTemplateViewSet
)

# Create router for API endpoints
router = DefaultRouter()
router.register(r'use-cases', UseCaseViewSet, basename='use-case')
router.register(r'deployments', UseCaseDeploymentViewSet, basename='deployment')
router.register(r'executions', UseCaseExecutionViewSet, basename='execution')
router.register(r'templates', UseCaseTemplateViewSet, basename='template')

urlpatterns = [
    path('', include(router.urls)),
]
