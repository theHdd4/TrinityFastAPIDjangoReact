#!/usr/bin/env python3
import os
import django

# Configure Django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django_tenants.utils import schema_context
from apps.registry.models import App
from apps.usecase.models import UseCase

print("Checking tenant schema...")

try:
    with schema_context('Quant_Matrix_AI_Schema'):
        print("✅ Successfully switched to tenant schema")
        
        # Check registry apps
        try:
            app_count = App.objects.count()
            print(f"✅ Registry Apps count: {app_count}")
        except Exception as e:
            print(f"❌ Registry Apps error: {e}")
        
        # Check usecase
        try:
            usecase_count = UseCase.objects.count()
            print(f"✅ UseCase count: {usecase_count}")
        except Exception as e:
            print(f"❌ UseCase error: {e}")
            
except Exception as e:
    print(f"❌ Schema context error: {e}")

print("Done!")
