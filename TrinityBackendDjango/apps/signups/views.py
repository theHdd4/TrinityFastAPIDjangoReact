from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from .models import SignupList
from .serializers import SignupListSerializer


class SignupListViewSet(viewsets.ModelViewSet):
    """
    API endpoint for landing page signups.
    Anyone can create a signup (no authentication required).
    Only admins can view/list signups.
    """
    queryset = SignupList.objects.all()
    serializer_class = SignupListSerializer

    def get_permissions(self):
        # Allow anyone to create a signup (POST)
        if self.action == 'create':
            return [permissions.AllowAny()]
        # Only admins can view signups
        return [permissions.IsAdminUser()]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(
            {
                'success': True,
                'message': 'Thank you for signing up! You have been added to the waitlist. We will contact you soon.',
                'data': serializer.data
            },
            status=status.HTTP_201_CREATED,
            headers=headers
        )

