from rest_framework import serializers
from .models import User, UserProfile


class UserSerializer(serializers.ModelSerializer):
    """Serializer for the custom User model with password handling."""

    password = serializers.CharField(write_only=True, required=False)
    allowed_apps = serializers.ListField(
        child=serializers.IntegerField(), write_only=True, required=False, default=list
    )
    role = serializers.SerializerMethodField()
    role_write = serializers.CharField(write_only=True, required=False)
    allowed_apps_read = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "password",
            "email",
            "first_name",
            "last_name",
            "mfa_enabled",
            "preferences",
            "is_staff",
            "allowed_apps",
            "role",
            "role_write",
            "allowed_apps_read",
        ]
        read_only_fields = ["id", "is_staff", "role", "allowed_apps_read"]

    def create(self, validated_data):
        password = validated_data.pop("password", None)
        allowed_apps = validated_data.pop("allowed_apps", None)
        role = validated_data.pop("role_write", None)
        user = User(**validated_data)
        # Ensure new users have is_superuser=False and is_staff=False
        user.is_superuser = False
        user.is_staff = False
        if allowed_apps is not None:
            user._allowed_apps = allowed_apps
        if role is not None:
            user._role = role
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save()
        return user
    
    def to_internal_value(self, data):
        # Map 'role' from frontend to 'role_write' internally
        if 'role' in data and 'role_write' not in data:
            data = data.copy()
            data['role_write'] = data.pop('role')
        return super().to_internal_value(data)

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance

    def get_role(self, obj):
        """Return the user's role if available, queried within tenant schema context."""
        try:
            from apps.roles.models import UserRole
            from apps.accounts.tenant_utils import switch_to_user_tenant, get_user_tenant_schema

            # Get user's tenant schema
            schema_name = get_user_tenant_schema(obj)
            if schema_name:
                # Query UserRole within tenant schema context
                with switch_to_user_tenant(obj):
                    role_obj = UserRole.objects.filter(user=obj).first()
                    if role_obj:
                        return role_obj.role
            else:
                # Fallback: query without tenant context (for backward compatibility)
                role_obj = UserRole.objects.filter(user=obj).first()
                if role_obj:
                    return role_obj.role
        except Exception:
            # Roles app may not be migrated yet; ignore errors
            pass
        return None

    def get_allowed_apps_read(self, obj):
        """Return the user's allowed apps if available, queried within tenant schema context."""
        try:
            from apps.roles.models import UserRole
            from apps.accounts.tenant_utils import switch_to_user_tenant, get_user_tenant_schema

            # Get user's tenant schema
            schema_name = get_user_tenant_schema(obj)
            if schema_name:
                # Query UserRole within tenant schema context
                with switch_to_user_tenant(obj):
                    role_obj = UserRole.objects.filter(user=obj).first()
                    if role_obj:
                        return role_obj.allowed_apps
            else:
                # Fallback: query without tenant context (for backward compatibility)
                role_obj = UserRole.objects.filter(user=obj).first()
                if role_obj:
                    return role_obj.allowed_apps
        except Exception:
            # Roles app may not be migrated yet; ignore errors
            pass
        return []


class UserProfileSerializer(serializers.ModelSerializer):
    user = serializers.SlugRelatedField(
        slug_field="username", queryset=User.objects.all()
    )

    class Meta:
        model = UserProfile
        fields = ["id", "user", "bio", "avatar_url"]
        read_only_fields = ["id"]
