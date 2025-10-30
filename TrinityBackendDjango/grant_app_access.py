#!/usr/bin/env python3
"""Grant app access to all users in the tenant."""

import os
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django
django.setup()

from django.contrib.auth import get_user_model
from apps.tenants.models import Tenant
from apps.usecase.models import UseCase
from apps.registry.models import App
from apps.roles.models import UserRole
from django_tenants.utils import schema_context
import uuid

User = get_user_model()

def main():
    # Find the tenant
    tenant = Tenant.objects.filter(name__icontains='Quant Matrix').first()
    
    if not tenant:
        print("❌ Tenant not found!")
        print("Available tenants:")
        for t in Tenant.objects.all():
            print(f"   - {t.name} (schema: {t.schema_name})")
        return
    
    print(f"✅ Found tenant: {tenant.name}")
    print(f"   Schema: {tenant.schema_name}")
    
    # Get all use cases from public schema
    all_usecases = UseCase.objects.all()
    print(f"\n✅ Found {all_usecases.count()} use cases in public schema")
    
    tenant_client_id = uuid.uuid5(uuid.NAMESPACE_DNS, tenant.schema_name)
    allowed_app_ids = []
    
    # Grant app access in tenant schema
    with schema_context(tenant.schema_name):
        print(f"\n🔧 Granting app access in tenant schema...")
        
        for usecase in all_usecases:
            try:
                obj, created = App.objects.update_or_create(
                    slug=usecase.slug,
                    defaults={
                        "usecase_id": usecase.id,
                        "name": usecase.name,
                        "description": usecase.description,
                        "is_enabled": True,
                        "custom_config": {
                            "molecules": usecase.molecules,
                            "modules": usecase.modules
                        }
                    }
                )
                allowed_app_ids.append(obj.id)
                
                if created:
                    print(f"   ✅ Granted: {usecase.name}")
                else:
                    print(f"   ♻️  Updated: {usecase.name}")
                    
            except Exception as e:
                print(f"   ⚠️  Error with '{usecase.slug}': {e}")
                continue
        
        print(f"\n📊 Total apps granted: {len(allowed_app_ids)}")
        
        # Update user roles
        print(f"\n🔧 Updating user roles...")
        all_users = User.objects.all()
        
        for user in all_users:
            try:
                role_obj, created = UserRole.objects.update_or_create(
                    user=user,
                    client_id=tenant_client_id,
                    defaults={
                        "role": "admin",
                        "allowed_apps": allowed_app_ids,
                        "client_name": tenant.name,
                        "email": user.email,
                        "app_id": uuid.uuid4(),
                    }
                )
                
                if created:
                    print(f"   ✅ Created role for: {user.username}")
                else:
                    print(f"   ♻️  Updated role for: {user.username}")
                    
            except Exception as e:
                print(f"   ⚠️  Error for {user.username}: {e}")
    
    # Update tenant with allowed apps
    Tenant.objects.filter(id=tenant.id).update(
        allowed_apps=allowed_app_ids,
        users_in_use=all_users.count()
    )
    
    print(f"\n✅ App access granted to all {all_users.count()} users!")
    print(f"   Users can now see {len(allowed_app_ids)} apps")

if __name__ == "__main__":
    main()

