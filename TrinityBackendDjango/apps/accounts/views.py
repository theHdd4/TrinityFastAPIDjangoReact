from django.contrib.auth import authenticate, login, logout
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework import viewsets, permissions, status
from rest_framework.authentication import SessionAuthentication
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.decorators import action
from .models import User, UserProfile
from .serializers import UserSerializer, UserProfileSerializer


class CsrfExemptSessionAuthentication(SessionAuthentication):
    """Session authentication that bypasses CSRF checks."""

    def enforce_csrf(self, request):
        return  # Ignore CSRF for API views


@method_decorator(csrf_exempt, name="dispatch")
class UserViewSet(viewsets.ModelViewSet):
    """
    CRUD for users. Admin-only for list/create; users can retrieve/update their own.
    """
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]
    authentication_classes = [CsrfExemptSessionAuthentication]

    def get_permissions(self):
        if self.action in ("list", "create", "destroy"):
            return [permissions.IsAdminUser()]
        return super().get_permissions()

    @action(detail=False, methods=["get"], permission_classes=[permissions.IsAuthenticated])
    def me(self, request):
        """Return the currently authenticated user."""
        serializer = self.get_serializer(request.user)
        return Response(serializer.data)


class UserProfileViewSet(viewsets.ModelViewSet):
    """
    CRUD for user profiles. Users can manage their own profile; admins can view all.
    """
    queryset = UserProfile.objects.select_related("user").all()
    serializer_class = UserProfileSerializer
    permission_classes = [permissions.IsAuthenticated]
    authentication_classes = [CsrfExemptSessionAuthentication]

    def get_queryset(self):
        user = self.request.user
        if user.is_staff:
            return self.queryset
        return self.queryset.filter(user=user)


@method_decorator(csrf_exempt, name="dispatch")
class LoginView(APIView):
    """Authenticate a user and start a session."""
    # No authentication required for login, CSRF disabled by decorator
    permission_classes = [permissions.AllowAny]
    authentication_classes: list = []

    def post(self, request):
        username = request.data.get("username")
        password = request.data.get("password")
        user = authenticate(request, username=username, password=password)
        if user is not None:
            login(request, user)
            return Response(UserSerializer(user).data)
        return Response({"detail": "Invalid credentials"}, status=status.HTTP_400_BAD_REQUEST)


class LogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    authentication_classes = [CsrfExemptSessionAuthentication]

    def post(self, request):
        logout(request)
        return Response({"detail": "Logged out"})
