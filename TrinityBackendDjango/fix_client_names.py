#!/usr/bin/env python3
import os
import django

# Configure Django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from apps.accounts.utils import save_env_var
from django.contrib.auth import get_user_model

User = get_user_model()

print("Fixing CLIENT_NAME for all users...")
for user in User.objects.all():
    save_env_var(user, 'CLIENT_NAME', 'Quant Matrix AI')
    print(f"✅ Fixed CLIENT_NAME for: {user.username}")

print("Done!")
