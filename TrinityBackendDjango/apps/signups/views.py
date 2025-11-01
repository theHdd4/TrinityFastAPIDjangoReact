from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.authentication import SessionAuthentication
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from .models import SignupList
from .serializers import SignupListSerializer


class CsrfExemptSessionAuthentication(SessionAuthentication):
    """Session authentication that bypasses CSRF checks."""
    def enforce_csrf(self, request):
        return  # Ignore CSRF for API views


@method_decorator(csrf_exempt, name="dispatch")
class SignupListViewSet(viewsets.ModelViewSet):
    """
    API endpoint for landing page signups.
    Anyone can create a signup (no authentication required).
    Only admins can view/list signups.
    """
    queryset = SignupList.objects.all()
    serializer_class = SignupListSerializer
    authentication_classes = [CsrfExemptSessionAuthentication]

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

