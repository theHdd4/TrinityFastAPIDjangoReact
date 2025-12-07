"""
Tenant switching utilities for API-level tenant routing.
This allows switching tenant context based on UserTenant mapping (preferred)
with fallback to environment variables for backward compatibility.
"""
import os
from django_tenants.utils import schema_context
from apps.tenants.models import Tenant
from apps.accounts.utils import get_env_dict


def get_user_tenant_schema(user):
    """
    Get the tenant schema name for a user based on UserTenant mapping.
    
    Args:
        user: Django User instance
        
    Returns:
        str: Tenant schema name (e.g., 'TestClient_Schema', 'Quant_Matrix_AI_Schema')
    """
    if not user or not user.is_authenticated:
        return None
    
    # Use UserTenant mapping (preferred method)
    try:
        from apps.accounts.models import UserTenant
        # Try to get primary tenant first
        user_tenant = UserTenant.objects.filter(user=user, is_primary=True).first()
        if not user_tenant:
            # If no primary tenant, get the first tenant mapping
            user_tenant = UserTenant.objects.filter(user=user).first()
        
        if user_tenant:
            return user_tenant.tenant.schema_name
    except Exception as e:
        print(f"⚠️  Error retrieving tenant from UserTenant mapping: {e}")
        import sys
        sys.stdout.flush()
    
    # Fallback to Redis/env vars for backward compatibility
    try:
        env_dict = get_env_dict(user)
        client_id = env_dict.get('CLIENT_ID', '')
        if client_id:
            return client_id
    except Exception:
        pass
    
    # Final fallback
    return 'Quant_Matrix_AI_Schema'


def switch_to_user_tenant(user):
    """
    Context manager to switch to the user's tenant schema.
    
    Usage:
        with switch_to_user_tenant(request.user):
            # Code here runs in the user's tenant schema
            apps = App.objects.all()  # Gets apps from user's tenant
    """
    schema_name = get_user_tenant_schema(user)
    if not schema_name:
        raise ValueError(f"No tenant schema found for user {user.username}")
    
    return schema_context(schema_name)


def get_tenant_for_user(user):
    """
    Get the Tenant object for a user.
    
    Args:
        user: Django User instance
        
    Returns:
        Tenant: Tenant object or None if not found
    """
    if not user or not user.is_authenticated:
        return None
    
    # Use UserTenant mapping (preferred method)
    try:
        from apps.accounts.models import UserTenant
        # Try to get primary tenant first
        user_tenant = UserTenant.objects.filter(user=user, is_primary=True).first()
        if not user_tenant:
            # If no primary tenant, get the first tenant mapping
            user_tenant = UserTenant.objects.filter(user=user).first()
        
        if user_tenant:
            return user_tenant.tenant
    except Exception as e:
        print(f"⚠️  Error retrieving tenant from UserTenant mapping: {e}")
        import sys
        sys.stdout.flush()
    
    # Fallback to schema name lookup
    schema_name = get_user_tenant_schema(user)
    if not schema_name:
        return None
    
    try:
        return Tenant.objects.get(schema_name=schema_name)
    except Tenant.DoesNotExist:
        return None


def ensure_user_tenant_environment(user):
    """
    Ensure a user has the correct tenant environment set.
    This is useful for debugging and fixing tenant routing issues.
    
    Args:
        user: Django User instance
        
    Returns:
        dict: Environment information
    """
    env_dict = get_env_dict(user)
    schema_name = get_user_tenant_schema(user)
    tenant = get_tenant_for_user(user)
    
    return {
        'user': user.username,
        'schema_name': schema_name,
        'tenant': tenant.name if tenant else None,
        'client_id': env_dict.get('CLIENT_ID', ''),
        'client_name': env_dict.get('CLIENT_NAME', ''),
        'is_valid': tenant is not None
    }
