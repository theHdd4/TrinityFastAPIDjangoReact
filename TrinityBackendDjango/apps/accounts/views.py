from django.contrib.auth import authenticate, login, logout
import os
import sys
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework import viewsets, permissions, status
from rest_framework.authentication import SessionAuthentication
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.decorators import action
from .models import User, UserProfile
from .serializers import UserSerializer, UserProfileSerializer
from .utils import save_env_var, get_env_dict, load_env_vars


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
            # Ensure environment variables are loaded from Redis or backend
            loaded_envs = load_env_vars(user)
            if loaded_envs:
                print("Loaded env vars from cache", loaded_envs)
            tenant = getattr(request, "tenant", None)
            if tenant is not None:
                os.environ["CLIENT_NAME"] = getattr(
                    tenant,
                    "schema_name",
                    tenant.name if hasattr(tenant, "name") else str(tenant),
                )
            os.environ["USER_ID"] = str(user.id)
            os.environ["USER_NAME"] = user.username
            print(
                f"✅ login: USER_ID={os.environ['USER_ID']} CLIENT_NAME={os.environ.get('CLIENT_NAME')}"
            )
            sys.stdout.flush()
            save_env_var(user, "CLIENT_NAME", os.environ.get("CLIENT_NAME", ""))
            save_env_var(user, "CLIENT_ID", os.environ.get("CLIENT_ID", ""))
            save_env_var(user, "USER_NAME", os.environ.get("USER_NAME", ""))
            print("Current env vars after login", get_env_dict(user))
            sys.stdout.flush()
            data = UserSerializer(user).data
            # Include user role and allowed apps if available
            try:
                from apps.roles.models import UserRole

                role_obj = UserRole.objects.filter(user=user).first()
                if role_obj:
                    data["role"] = role_obj.role
                    data["allowed_apps"] = role_obj.allowed_apps
            except Exception:
                # Roles app may not be migrated yet; ignore errors
                pass

            data["environment"] = get_env_dict(user)
            return Response(data)
        return Response({"detail": "Invalid credentials"}, status=status.HTTP_400_BAD_REQUEST)


class LogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    authentication_classes = [CsrfExemptSessionAuthentication]

    def post(self, request):
        logout(request)
        return Response({"detail": "Logged out"})
