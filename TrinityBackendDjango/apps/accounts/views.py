from django.contrib.auth import authenticate, login, logout
import os
import sys
from datetime import timedelta
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from django.db import models, transaction
from django_tenants.utils import schema_context
from rest_framework import viewsets, permissions, status
from rest_framework.authentication import SessionAuthentication
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.decorators import action
from .models import User, UserProfile, UserTenant, OnboardToken
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
        if self.action in ("list", "create", "update", "destroy"):
            return [IsTenantAdminOrStaff()]
        return super().get_permissions()

    def get_queryset(self):
        """
        Filter queryset based on user permissions:
        - Superuser: see all users
        - Tenant admin (even if is_staff=True): see only users from their tenant
        
        This method implements defense-in-depth by explicitly verifying tenant admin role
        and filtering by tenant, even if the permission check allows access.
        """
        user = self.request.user
        
        # Only superusers can see all users (not regular staff or tenant admins)
        # Include both active and inactive users
        if user.is_superuser:
            return User.objects.all().distinct()
        
        # For tenant admins (including those with is_staff=True), always filter by tenant
        # The permission check (IsTenantAdminOrStaff) ensures only authorized users reach here,
        # but we add explicit verification as a defensive measure
        try:
            # Explicitly verify user is a tenant admin by checking their role in tenant schema
            is_tenant_admin = False
            try:
                with switch_to_user_tenant(user):
                    user_role = UserRole.objects.filter(user=user, is_deleted=False).first()
                    if user_role and user_role.role == UserRole.ROLE_ADMIN:
                        is_tenant_admin = True
            except Exception as e:
                # If we can't verify tenant admin role, deny access (fail-safe)
                print(f"Warning: Could not verify tenant admin role for {user.username}: {e}", file=sys.stderr)
                sys.stderr.flush()
                return User.objects.none()
            
            # If user is staff but not a tenant admin, deny access (defensive check)
            # This prevents staff users who aren't tenant admins from seeing any users
            if user.is_staff and not is_tenant_admin:
                # Staff users who aren't tenant admins shouldn't access this endpoint
                # but if they do, return empty queryset
                print(f"Warning: Staff user {user.username} is not a tenant admin, denying access", file=sys.stderr)
                sys.stderr.flush()
                return User.objects.none()
            
            # Get admin's tenant
            admin_tenant = get_tenant_for_user(user)
            if not admin_tenant:
                # No tenant assigned, return empty queryset for safety
                print(f"Warning: User {user.username} has no tenant assigned but passed permission check", file=sys.stderr)
                sys.stderr.flush()
                return User.objects.none()
            
            # Get all users that belong to the same tenant
            # Using UserTenant mapping in public schema
            # Include both active and inactive users
            tenant_user_ids = UserTenant.objects.filter(
                tenant=admin_tenant
            ).values_list('user_id', flat=True).distinct()
            
            return User.objects.filter(id__in=tenant_user_ids).distinct()
            
        except Exception as e:
            # Log error and return empty queryset for safety (fail-safe approach)
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
                
                # Set user as inactive for onboarding
                user.is_active = False
                user.save(update_fields=['is_active'])
                
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
                
                # Create OnboardToken for the new user
                expires_at = timezone.now() + timedelta(hours=48)
                onboard_token = OnboardToken.objects.create(
                    user=user,
                    purpose="onboard",
                    expires_at=expires_at,
                    created_by=request.user
                )
                
                # Console log the token
                print("=" * 50)
                print(f"Onboarding Token Created:")
                print(f"  User: {user.username} ({user.email})")
                print(f"  Token: {onboard_token.token}")
                print(f"  Expires at: {expires_at}")
                print(f"  Created by: {request.user.username}")
                print("=" * 50)
                sys.stdout.flush()
                
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
        
        # Return created user data with onboarding token
        response_data = serializer.data
        response_data['onboard_token'] = str(onboard_token.token)
        response_data['onboard_token_expires_at'] = expires_at.isoformat()
        headers = self.get_success_headers(serializer.data)
        return Response(response_data, status=status.HTTP_201_CREATED, headers=headers)

    def update(self, request, *args, **kwargs):
        """
        Update user's role and allowed_apps. Only updates UserRole in tenant schema.
        Does not modify username, email, password, or is_active.
        """
        instance = self.get_object()
        
        # Get the user's tenant
        user_tenant = instance.tenant_mappings.filter(is_primary=True).first()
        if not user_tenant:
            user_tenant = instance.tenant_mappings.first()
        
        if not user_tenant:
            return Response(
                {"detail": "User has no tenant mapping. Cannot update user."},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        tenant = user_tenant.tenant
        
        # For tenant admins, verify they can only edit users from their tenant
        requesting_user = request.user
        if not (requesting_user.is_staff or requesting_user.is_superuser):
            # Check if requesting user is admin of the same tenant
            admin_tenant = get_tenant_for_user(requesting_user)
            if not admin_tenant or admin_tenant.id != tenant.id:
                return Response(
                    {"detail": "You can only edit users from your own tenant."},
                    status=status.HTTP_403_FORBIDDEN
                )
        
        # Validate role if provided
        role = request.data.get("role")
        if role and role not in [UserRole.ROLE_ADMIN, UserRole.ROLE_EDITOR, UserRole.ROLE_VIEWER]:
            return Response(
                {"detail": f"Invalid role. Must be one of: {UserRole.ROLE_ADMIN}, {UserRole.ROLE_EDITOR}, {UserRole.ROLE_VIEWER}"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Validate allowed_apps if provided
        allowed_apps = request.data.get("allowed_apps")
        if allowed_apps is not None:
            if not isinstance(allowed_apps, list):
                return Response(
                    {"detail": "allowed_apps must be a list of integers"},
                    status=status.HTTP_400_BAD_REQUEST
                )
            if allowed_apps and not all(isinstance(app_id, int) for app_id in allowed_apps):
                return Response(
                    {"detail": "All items in allowed_apps must be integers"},
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        try:
            with transaction.atomic():
                # Switch to tenant schema and update UserRole
                with schema_context(tenant.schema_name):
                    user_role = UserRole.objects.filter(user=instance, is_deleted=False).first()
                    
                    if not user_role:
                        # If UserRole doesn't exist, create one
                        role_value = role or UserRole.ROLE_VIEWER
                        allowed_apps_value = allowed_apps if allowed_apps is not None else []
                        user_role = UserRole.objects.create(
                            user=instance,
                            role=role_value,
                            allowed_apps=allowed_apps_value
                        )
                    else:
                        # Update existing UserRole
                        if role is not None:
                            user_role.role = role
                        if allowed_apps is not None:
                            user_role.allowed_apps = allowed_apps
                        user_role.save()
                
        except Exception as e:
            import traceback
            print(f"Error updating user {instance.username}: {e}")
            print(traceback.format_exc())
            sys.stdout.flush()
            return Response(
                {"detail": f"Failed to update user: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        # Return updated user data
        serializer = self.get_serializer(instance)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def destroy(self, request, *args, **kwargs):
        """
        Soft delete a user: set is_active=False, decrement tenant's users_in_use counter,
        and set is_deleted=True in UserRole within tenant schema.
        UserTenant mappings are preserved.
        
        Restrictions:
        - Staff/superusers can delete any user
        - Tenant admins cannot delete other admins (can only delete editors/viewers)
        """
        instance = self.get_object()
        
        # Get primary tenant mapping for the user being deleted
        user_tenant = instance.tenant_mappings.filter(is_primary=True).first()
        if not user_tenant:
            # Fallback to first tenant if no primary tenant exists
            user_tenant = instance.tenant_mappings.first()
        
        if not user_tenant:
            return Response(
                {"detail": "User has no tenant mapping. Cannot perform soft delete."},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        tenant = user_tenant.tenant
        
        # Check if requesting user is staff/superuser - they can delete anyone
        requesting_user = request.user
        if not (requesting_user.is_staff or requesting_user.is_superuser):
            # Requesting user is a tenant admin - check if they're trying to delete another admin
            try:
                # Get the role of the user being deleted from tenant schema
                with schema_context(tenant.schema_name):
                    target_user_role = UserRole.objects.filter(user=instance, is_deleted=False).first()
                    if target_user_role and target_user_role.role == UserRole.ROLE_ADMIN:
                        # Tenant admin is trying to delete another admin - prevent this
                        return Response(
                            {"detail": "Tenant admins cannot delete other admins. Only editors and viewers can be deleted."},
                            status=status.HTTP_403_FORBIDDEN
                        )
            except Exception as e:
                # If we can't check the role, deny deletion for safety
                print(f"Error checking user role for deletion: {e}", file=sys.stderr)
                sys.stderr.flush()
                return Response(
                    {"detail": "Unable to verify user role. Deletion denied for safety."},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
        
        try:
            with transaction.atomic():
                # Public schema operations
                # Set user as inactive (soft delete)
                instance.is_active = False
                instance.save(update_fields=['is_active'])
                
                # Decrement tenant's users_in_use counter
                from apps.tenants.models import Tenant
                Tenant.objects.filter(id=tenant.id).update(
                    users_in_use=models.F("users_in_use") - 1
                )
                
                # Tenant schema operations
                # Switch to tenant schema and mark UserRole as deleted
                with schema_context(tenant.schema_name):
                    user_role = UserRole.objects.filter(user=instance).first()
                    if user_role:
                        user_role.is_deleted = True
                        user_role.save(update_fields=['is_deleted'])
                    # If UserRole doesn't exist, that's okay - user might not have been fully set up
                
        except Exception as e:
            import traceback
            print(f"Error performing soft delete for user {instance.username}: {e}")
            print(traceback.format_exc())
            sys.stdout.flush()
            return Response(
                {"detail": f"Failed to soft delete user: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], permission_classes=[IsTenantAdminOrStaff])
    def reactivate(self, request, *args, **kwargs):
        """
        Reactivate a soft-deleted user: set is_active=True, increment tenant's users_in_use counter,
        and set is_deleted=False in UserRole within tenant schema.
        """
        instance = self.get_object()
        
        # Get primary tenant mapping for the user
        user_tenant = instance.tenant_mappings.filter(is_primary=True).first()
        if not user_tenant:
            # Fallback to first tenant if no primary tenant exists
            user_tenant = instance.tenant_mappings.first()
        
        if not user_tenant:
            return Response(
                {"detail": "User has no tenant mapping. Cannot reactivate user."},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        tenant = user_tenant.tenant
        
        try:
            with transaction.atomic():
                # Public schema operations
                # Set user as active (reactivate)
                instance.is_active = True
                instance.save(update_fields=['is_active'])
                
                # Increment tenant's users_in_use counter
                from apps.tenants.models import Tenant
                Tenant.objects.filter(id=tenant.id).update(
                    users_in_use=models.F("users_in_use") + 1
                )
                
                # Tenant schema operations
                # Switch to tenant schema and mark UserRole as not deleted
                with schema_context(tenant.schema_name):
                    user_role = UserRole.objects.filter(user=instance).first()
                    if user_role:
                        user_role.is_deleted = False
                        user_role.save(update_fields=['is_deleted'])
                    # If UserRole doesn't exist, create one with default viewer role
                    else:
                        user_role = UserRole.objects.create(
                            user=instance,
                            role=UserRole.ROLE_VIEWER,
                            allowed_apps=[],
                            is_deleted=False
                        )
                
        except Exception as e:
            import traceback
            print(f"Error reactivating user {instance.username}: {e}")
            print(traceback.format_exc())
            sys.stdout.flush()
            return Response(
                {"detail": f"Failed to reactivate user: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        # Return updated user data
        serializer = self.get_serializer(instance)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], permission_classes=[IsTenantAdminOrStaff])
    def generate_password_reset_token(self, request, *args, **kwargs):
        """
        Generate a password reset token for an active user.
        Only available for active users.
        """
        instance = self.get_object()
        
        # Validate that user is active
        if not instance.is_active:
            return Response(
                {"detail": "Password reset tokens can only be generated for active users."},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            # Create OnboardToken with password_reset purpose
            expires_at = timezone.now() + timedelta(hours=48)
            onboard_token = OnboardToken.objects.create(
                user=instance,
                purpose="password_reset",
                expires_at=expires_at,
                created_by=request.user
            )
            
            # Console log the token
            print("=" * 50)
            print(f"Password Reset Token Generated:")
            print(f"  User: {instance.username} ({instance.email})")
            print(f"  Token: {onboard_token.token}")
            print(f"  Expires at: {expires_at}")
            print(f"  Generated by: {request.user.username}")
            print("=" * 50)
            sys.stdout.flush()
            
            return Response({
                "token": str(onboard_token.token),
                "expires_at": expires_at.isoformat(),
                "user": instance.username,
                "email": instance.email,
                "message": "Password reset token generated successfully"
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            import traceback
            print(f"Error generating password reset token for user {instance.username}: {e}")
            print(traceback.format_exc())
            sys.stdout.flush()
            return Response(
                {"detail": f"Failed to generate password reset token: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

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

    def get(self, request):
        """Validate onboarding token and return user information."""
        token_str = request.query_params.get("token")
        if not token_str:
            return Response(
                {"detail": "Token parameter is required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            import uuid
            token_uuid = uuid.UUID(token_str)
        except (ValueError, TypeError):
            return Response(
                {"detail": "Invalid token format"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Query OnboardToken in public schema
        try:
            onboard_token = OnboardToken.objects.get(token=token_uuid)
        except OnboardToken.DoesNotExist:
            return Response(
                {"detail": "Invalid or expired token"},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Check if token is expired
        if onboard_token.expires_at < timezone.now():
            return Response(
                {"detail": "Token has expired"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check if token has already been used
        if onboard_token.used_at is not None:
            return Response(
                {"detail": "Token has already been used"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Return user information
        return Response({
            "username": onboard_token.user.username,
            "email": onboard_token.user.email,
            "valid": True
        })

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


@method_decorator(csrf_exempt, name="dispatch")
class OnboardCompleteView(APIView):
    """Complete onboarding by setting password and activating user."""
    permission_classes = [permissions.AllowAny]
    authentication_classes: list = []

    def post(self, request):
        """Set password and activate user using onboarding token."""
        token_str = request.data.get("token")
        password = request.data.get("password")
        confirm_password = request.data.get("confirm_password")
        
        if not token_str:
            return Response(
                {"detail": "Token is required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if not password:
            return Response(
                {"detail": "Password is required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if password != confirm_password:
            return Response(
                {"detail": "Passwords do not match"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            import uuid
            token_uuid = uuid.UUID(token_str)
        except (ValueError, TypeError):
            return Response(
                {"detail": "Invalid token format"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Query OnboardToken in public schema
        try:
            onboard_token = OnboardToken.objects.select_related('user').get(token=token_uuid)
        except OnboardToken.DoesNotExist:
            return Response(
                {"detail": "Invalid or expired token"},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Check if token is expired
        if onboard_token.expires_at < timezone.now():
            return Response(
                {"detail": "Token has expired"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check if token has already been used
        if onboard_token.used_at is not None:
            return Response(
                {"detail": "Token has already been used"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Update user
        try:
            with transaction.atomic():
                user = onboard_token.user
                
                # Set password
                user.set_password(password)
                
                # Activate user
                user.is_active = True
                user.save(update_fields=['password', 'is_active'])
                
                # Mark token as used
                onboard_token.used_at = timezone.now()
                onboard_token.save(update_fields=['used_at'])
            
            return Response({
                "detail": "Password set successfully. Please login with your credentials.",
                "username": user.username
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            import traceback
            print(f"Error completing onboarding: {e}")
            print(traceback.format_exc())
            sys.stdout.flush()
            return Response(
                {"detail": f"Failed to complete onboarding: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class LogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    authentication_classes = [CsrfExemptSessionAuthentication]

    def post(self, request):
        logout(request)
        return Response({"detail": "Logged out"})
