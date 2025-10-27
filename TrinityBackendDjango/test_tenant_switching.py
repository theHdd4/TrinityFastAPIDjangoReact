#!/usr/bin/env python3
import os
import django

# Configure Django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from apps.accounts.tenant_utils import switch_to_user_tenant, get_user_tenant_schema
from django.contrib.auth import get_user_model
from apps.registry.models import App

User = get_user_model()
user = User.objects.get(username='abhishek.sahu@quantmatrix.ai')

print(f"User: {user.username}")
print(f"Schema: {get_user_tenant_schema(user)}")

try:
    with switch_to_user_tenant(user):
        print("✅ Successfully switched to tenant schema")
        app_count = App.objects.count()
        print(f"✅ Registry Apps count: {app_count}")
        
        # List first few apps
        apps = App.objects.all()[:3]
        for app in apps:
            print(f"  - {app.name} (usecase_id: {app.usecase_id})")
            
except Exception as e:
    print(f"❌ Tenant switching error: {e}")
    import traceback
    traceback.print_exc()

print("Done!")
