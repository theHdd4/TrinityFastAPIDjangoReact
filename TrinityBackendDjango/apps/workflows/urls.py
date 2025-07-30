from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import WorkflowViewSet, WorkflowAtomViewSet, WorkflowRunViewSet

router = DefaultRouter()
router.register(r"workflows", WorkflowViewSet, basename="workflow")
router.register(r"workflow-atoms", WorkflowAtomViewSet, basename="workflowatom")
router.register(r"workflow-runs", WorkflowRunViewSet, basename="workflowrun")

urlpatterns = [
    path("", include(router.urls)),
]
