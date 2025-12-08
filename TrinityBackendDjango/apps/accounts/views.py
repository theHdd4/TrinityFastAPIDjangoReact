from django.contrib.auth import authenticate, login, logout
import os
import sys
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from django.db import models, transaction
from django_tenants.utils import schema_context
from rest_framework import viewsets, permissions, status
from rest_framework.authentication import SessionAuthentication
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.decorators import action
from .models import User, UserProfile, UserTenant
from .serializers import UserSerializer, UserProfileSerializer
from .tenant_utils import get_tenant_for_user, switch_to_user_tenant
from apps.roles.models import UserRole
# Commented out for now - will use UserTenant mapping instead
# from .utils import save_env_var, get_env_dict, load_env_vars
from redis_store.env_cache import set_env_var, set_current_env


class IsTenantAdminOrStaff(permissions.BasePermission):
    """
    Allows access only to tenant admins (role='admin' in UserRole) or staff users.
    Checks UserRole in tenant schema first, then falls back to is_staff.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        
        # Backward compatibility: allow staff users
        if request.user.is_staff:
            return True
        
        # Check if user has admin role in their tenant schema
        try:
            with switch_to_user_tenant(request.user):
                user_role = UserRole.objects.filter(user=request.user).first()
                if user_role and user_role.role == UserRole.ROLE_ADMIN:
                    return True
        except Exception:
            # If tenant schema doesn't exist or UserRole query fails, deny access
            pass
        
        return False


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
            return [IsTenantAdminOrStaff()]
        return super().get_permissions()

    def get_queryset(self):
        """
        Filter queryset based on user permissions:
        - Staff/superuser: see all users
        - Tenant admin: see only users from their tenant
        """
        user = self.request.user
        
        # Staff/superuser can see all users
        if user.is_staff or user.is_superuser:
            return User.objects.all().distinct()
        
        # Tenant admin: filter by their tenant
        try:
            # Get admin's tenant
            admin_tenant = get_tenant_for_user(user)
            if not admin_tenant:
                # No tenant assigned, return empty queryset
                return User.objects.none()
            
            # Get all users that belong to the same tenant
            # Using UserTenant mapping in public schema
            tenant_user_ids = UserTenant.objects.filter(
                tenant=admin_tenant
            ).values_list('user_id', flat=True).distinct()
            
            return User.objects.filter(id__in=tenant_user_ids).distinct()
            
        except Exception as e:
            # Log error and return empty queryset for safety
            print(f"Error filtering users by tenant: {e}", file=sys.stderr)
            sys.stderr.flush()
            return User.objects.none()

    def create(self, request, *args, **kwargs):
        """
        Create a new user with UserTenant mapping and UserRole in tenant schema.
        """
        # Get admin's tenant
        admin_tenant = get_tenant_for_user(request.user)
        if not admin_tenant:
            return Response(
                {"detail": "Admin user has no tenant assigned. Cannot create user."},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Validate role if provided
        role = request.data.get("role")
        if role and role not in [UserRole.ROLE_ADMIN, UserRole.ROLE_EDITOR, UserRole.ROLE_VIEWER]:
            return Response(
                {"detail": f"Invalid role. Must be one of: {UserRole.ROLE_ADMIN}, {UserRole.ROLE_EDITOR}, {UserRole.ROLE_VIEWER}"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Validate allowed_apps if provided
        allowed_apps = request.data.get("allowed_apps", [])
        if allowed_apps is not None and not isinstance(allowed_apps, list):
            return Response(
                {"detail": "allowed_apps must be a list of integers"},
                status=status.HTTP_400_BAD_REQUEST
            )
        if allowed_apps and not all(isinstance(app_id, int) for app_id in allowed_apps):
            return Response(
                {"detail": "All items in allowed_apps must be integers"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Serialize and validate user data
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        try:
            with transaction.atomic():
                # Create User in public schema
                user = serializer.save()
                
                # Create UserTenant mapping in public schema
                user_tenant, created = UserTenant.objects.get_or_create(
                    user=user,
                    tenant=admin_tenant,
                    defaults={"is_primary": True}
                )
                if not created:
                    # If mapping already exists, ensure is_primary is True
                    user_tenant.is_primary = True
                    user_tenant.save()
                
                # Switch to tenant schema and create UserRole
                with schema_context(admin_tenant.schema_name):
                    role_value = getattr(user, "_role", role) or UserRole.ROLE_VIEWER
                    allowed_apps_value = getattr(user, "_allowed_apps", allowed_apps) or []
                    
                    # Create or update UserRole
                    user_role, role_created = UserRole.objects.get_or_create(
                        user=user,
                        defaults={
                            "role": role_value,
                            "allowed_apps": allowed_apps_value
                        }
                    )
                    if not role_created:
                        # Update existing role
                        user_role.role = role_value
                        user_role.allowed_apps = allowed_apps_value
                        user_role.save()
                
                # Increment tenant's users_in_use counter
                from apps.tenants.models import Tenant
                Tenant.objects.filter(id=admin_tenant.id).update(users_in_use=models.F("users_in_use") + 1)
                
        except Exception as e:
            # If UserRole creation fails, the transaction will rollback
            # UserTenant and User will also be rolled back
            import traceback
            print(f"Error creating user: {e}")
            print(traceback.format_exc())
            sys.stdout.flush()
            return Response(
                {"detail": f"Failed to create user: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        # Return created user data
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def destroy(self, request, *args, **kwargs):
        """
        Delete a user and decrement tenant's users_in_use counter.
        """
        instance = self.get_object()
        
        # Get user's tenant from UserTenant mapping
        user_tenant = instance.tenant_mappings.first()
        
        # Delete the user (this will cascade delete UserTenant and UserRole)
        self.perform_destroy(instance)
        
        # Decrement tenant's users_in_use counter if tenant exists
        if user_tenant:
            from apps.tenants.models import Tenant
            Tenant.objects.filter(id=user_tenant.tenant.id).update(
                users_in_use=models.F("users_in_use") - 1
            )
        
        return Response(status=status.HTTP_204_NO_CONTENT)

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
