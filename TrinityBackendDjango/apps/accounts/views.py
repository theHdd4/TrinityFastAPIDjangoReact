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
from .models import User, UserProfile, UserTenant
from .serializers import UserSerializer, UserProfileSerializer
# Commented out for now - will use UserTenant mapping instead
# from .utils import save_env_var, get_env_dict, load_env_vars
from redis_store.env_cache import set_env_var, set_current_env


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
            
            # Commented out Redis and os.environ operations - using UserTenant mapping instead
            # # Ensure environment variables are loaded from Redis or backend
            # loaded_envs = load_env_vars(user)
            # if loaded_envs:
            #     print("Loaded env vars from cache", loaded_envs)
            # tenant = getattr(request, "tenant", None)
            # if tenant is not None:
            #     os.environ["CLIENT_NAME"] = getattr(
            #         tenant,
            #         "schema_name",
            #         tenant.name if hasattr(tenant, "name") else str(tenant),
            #     )
            # os.environ["USER_ID"] = str(user.id)
            # os.environ["USER_NAME"] = user.username
            # print(
            #     f"✅ login: USER_ID={os.environ['USER_ID']} CLIENT_NAME={os.environ.get('CLIENT_NAME')}"
            # )
            # sys.stdout.flush()
            # save_env_var(user, "CLIENT_NAME", os.environ.get("CLIENT_NAME", ""))
            # save_env_var(user, "CLIENT_ID", os.environ.get("CLIENT_ID", ""))
            # save_env_var(user, "USER_NAME", os.environ.get("USER_NAME", ""))
            # print("Current env vars after login", get_env_dict(user))
            # sys.stdout.flush()
            
            # Get tenant from UserTenant mapping
            tenant = None
            try:
                # Try to get primary tenant first
                user_tenant = user.tenant_mappings.filter(is_primary=True).first()
                if not user_tenant:
                    # If no primary tenant, get the first tenant mapping
                    user_tenant = user.tenant_mappings.first()
                
                if user_tenant:
                    tenant = user_tenant.tenant
            except Exception as e:
                print(f"⚠️  Error retrieving tenant from UserTenant mapping: {e}")
                sys.stdout.flush()
            
            # Build environment dictionary with tenant information
            environment = {}
            if tenant:
                environment = {
                    "CLIENT_NAME": tenant.name,
                    "CLIENT_ID": tenant.schema_name,
                    "schema_name": tenant.schema_name,
                }
            else:
                print(f"⚠️  No tenant mapping found for user: {user.username}")
                sys.stdout.flush()
                environment = {
                    "CLIENT_NAME": "",
                    "CLIENT_ID": "",
                    "schema_name": "",
                }
            
            # Save to Redis for backward compatibility with other features
            # Using direct Redis functions to avoid os.environ (bad practice)
            try:
                client_id = environment.get("CLIENT_ID", "")
                client_name = environment.get("CLIENT_NAME", "")
                user_id = str(user.id)
                
                # Save CLIENT_NAME, CLIENT_ID, and USER_NAME to Redis and DB
                set_env_var(
                    user,
                    client_id=client_id,
                    app_id="",  # Empty for now
                    project_id="",  # Empty for now
                    key="CLIENT_NAME",
                    value=client_name,
                    client_name=client_name,
                )
                set_env_var(
                    user,
                    client_id=client_id,
                    app_id="",
                    project_id="",
                    key="CLIENT_ID",
                    value=client_id,
                    client_name=client_name,
                )
                set_env_var(
                    user,
                    client_id=client_id,
                    app_id="",
                    project_id="",
                    key="USER_NAME",
                    value=user.username,
                    client_name=client_name,
                )
                
                # Set current environment in Redis
                set_current_env(
                    user_id,
                    client_id=client_id,
                    app_id="",
                    project_id="",
                    client_name=client_name,
                )
                
                print(f"✅ Saved environment variables to Redis for user: {user.username}")
                sys.stdout.flush()
            except Exception as e:
                print(f"⚠️  Failed to save environment variables to Redis: {e}")
                sys.stdout.flush()
            
            data = UserSerializer(user).data
            # UserSerializer now handles role and allowed_apps in tenant context
            # The role and allowed_apps_read fields are already populated by the serializer

            data["environment"] = environment
            
            # Console log for testing
            print("=" * 50)
            print("Login response data:")
            print(data)
            print("=" * 50)
            sys.stdout.flush()
            
            return Response(data)
        return Response({"detail": "Invalid credentials"}, status=status.HTTP_400_BAD_REQUEST)


class LogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    authentication_classes = [CsrfExemptSessionAuthentication]

    def post(self, request):
        logout(request)
        return Response({"detail": "Logged out"})
