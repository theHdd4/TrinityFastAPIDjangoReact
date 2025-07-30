from rest_framework import viewsets, permissions
from .models import Company, SubscriptionPlan
from .serializers import CompanySerializer, SubscriptionPlanSerializer


class CompanyViewSet(viewsets.ModelViewSet):
    """
    CRUD for Company metadata.
    Admin-only for writes; authenticated users may list/retrieve.
    """
    queryset = Company.objects.select_related("tenant").all()
    serializer_class = CompanySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [permissions.IsAdminUser()]
        return super().get_permissions()


class SubscriptionPlanViewSet(viewsets.ModelViewSet):
    """
    CRUD for SubscriptionPlan.
    Admin-only for writes; authenticated users may list/retrieve.
    """
    queryset = SubscriptionPlan.objects.select_related("company__tenant").all()
    serializer_class = SubscriptionPlanSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [permissions.IsAdminUser()]
        return super().get_permissions()
