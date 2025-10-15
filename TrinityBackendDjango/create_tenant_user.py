#!/usr/bin/env python3
"""Create a new tenant user/client utility.

This script creates a new tenant client with their own schema and registry apps.
Configure via environment variables or modify defaults below.
"""

import os

# Django modules such as ``django_tenants`` access ``settings`` at import time.
# Configure Django **before** importing those modules.
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django

django.setup()

import uuid
from django.core.management import call_command
from django.db import transaction, connection
from django_tenants.utils import schema_context

# Adjust this import path if your app label is different:
from apps.tenants.models import Tenant, Domain


def main():
    # ============================================
    # CONFIGURATION - Modify these for each new client
    # ============================================
    tenant_name = "Test Marketing Agency"
    tenant_schema = "test_marketing_agency"  # Schema name (lowercase, underscores)
    primary_domain = "testmarketing.local"    # Primary domain for this tenant
    seats_allowed = int(os.getenv("TENANT_SEATS", 10))
    project_cap = int(os.getenv("TENANT_PROJECT_CAP", 3))
    projects_allowed = ["Marketing Campaign 2025"]
    
    # Admin user credentials for this tenant
    admin_username = "admin_marketing"
    admin_email = "admin@testmarketing.com"
    admin_password = "marketing_2025"
    admin_first_name = "Marketing"
    admin_last_name = "Admin"

    print(f"\n{'='*60}")
    print(f"Creating New Tenant: {tenant_name}")
    print(f"{'='*60}\n")

    # Ensure migrations exist
    print("→ 0) Making sure migrations are generated…")
    try:
        call_command("makemigrations", "registry", interactive=False, verbosity=1)
    except Exception as e:
        print(f"   ⚠️  Migration generation note: {e}")

    print("\n→ 1) Ensuring SHARED (public) migrations are up to date…")
    # Run only shared apps into the public schema
    try:
        connection.set_schema_to_public()
    except Exception:
        pass
    call_command("migrate_schemas", "--shared", interactive=False, verbosity=1)
    print("   ✅ Shared migrations complete.\n")

    # Create the admin user for this tenant
    from django.contrib.auth import get_user_model

    User = get_user_model()
    
    print(f"→ 2) Creating admin user '{admin_username}'…")
    if not User.objects.filter(username=admin_username).exists():
        admin_user = User.objects.create_user(
            username=admin_username,
            password=admin_password,
            email=admin_email,
            first_name=admin_first_name,
            last_name=admin_last_name,
            is_staff=True,
            is_superuser=False,  # Not a global superuser, just tenant admin
        )
        print(f"   ✅ Created admin user '{admin_username}' with password '{admin_password}'")
        print(f"      Email: {admin_email}")
    else:
        admin_user = User.objects.get(username=admin_username)
        # Update password and details if user exists
        admin_user.email = admin_email
        admin_user.first_name = admin_first_name
        admin_user.last_name = admin_last_name
        admin_user.is_staff = True
        admin_user.set_password(admin_password)
        admin_user.save()
        print(f"   ♻️  User '{admin_username}' already exists - updated credentials")
        print(f"      Email: {admin_email}")
        print(f"      Password: {admin_password}")

    print(f"\n→ 3) Creating Tenant '{tenant_name}'…")
    with transaction.atomic():
        tenant_defaults = {
            "name": tenant_name,
            "primary_domain": primary_domain,
            "seats_allowed": seats_allowed,
            "project_cap": project_cap,
            "projects_allowed": projects_allowed,
            "admin_name": admin_username,
            "admin_email": admin_email,
        }
        tenant_obj, created = Tenant.objects.get_or_create(
            schema_name=tenant_schema, 
            defaults={**tenant_defaults, "allowed_apps": []}
        )
        if created:
            print(f"   ✅ Created Tenant: {tenant_obj}")
        else:
            # Update existing tenant
            for field, value in tenant_defaults.items():
                setattr(tenant_obj, field, value)
            tenant_obj.save()
            print(f"   ♻️  Updated Tenant: {tenant_obj}")

        # Create primary domain
        domain_obj, domain_created = Domain.objects.get_or_create(
            domain=primary_domain,
            tenant=tenant_obj,
            defaults={"is_primary": True},
        )
        if domain_created:
            print(f"   → Created Primary Domain: {domain_obj}")
        else:
            print(f"   → Primary Domain already exists: {domain_obj}")

        tenant_client_id = uuid.uuid5(uuid.NAMESPACE_DNS, tenant_schema)

        # Add localhost aliases for development
        for extra in ("localhost", "127.0.0.1"):
            if extra != primary_domain:
                try:
                    # Check if domain already exists for another tenant
                    existing = Domain.objects.filter(domain=extra).first()
                    if existing and existing.tenant != tenant_obj:
                        print(f"   → Domain '{extra}' already used by '{existing.tenant.name}', skipping")
                        continue
                    
                    alias, created = Domain.objects.get_or_create(
                        domain=extra,
                        tenant=tenant_obj,
                        defaults={"is_primary": False},
                    )
                    if created:
                        print(f"   → Added alias domain: {alias}")
                    else:
                        print(f"   → Alias domain already exists: {alias}")
                except Exception as e:
                    print(f"   → Note: {e}")

        # Add any additional domains from environment
        additional = os.getenv("ADDITIONAL_DOMAINS", "")
        hosts = [h.strip() for h in additional.split(",") if h.strip()]
        host_ip = os.getenv("HOST_IP", "")
        if host_ip and host_ip not in hosts:
            hosts.append(host_ip)

        for host in hosts:
            if host and host != primary_domain:
                try:
                    existing = Domain.objects.filter(domain=host).first()
                    if existing and existing.tenant != tenant_obj:
                        print(f"   → Domain '{host}' already used by '{existing.tenant.name}', skipping")
                        continue
                    
                    alias, created = Domain.objects.get_or_create(
                        domain=host,
                        tenant=tenant_obj,
                        defaults={"is_primary": False},
                    )
                    if created:
                        print(f"   → Added extra domain: {alias}")
                    else:
                        print(f"   → Extra domain already exists: {alias}")
                except Exception as e:
                    print(f"   → Note: {e}")

    print(f"\n→ 4) Running TENANT-SCHEMA migrations for '{tenant_schema}'…")
    # Switch into the tenant schema and apply all tenant apps there
    call_command(
        "migrate_schemas", "--schema", tenant_schema, interactive=False, verbosity=1
    )
    print("   ✅ Tenant-schema migrations complete.")

    print(f"\n→ 5) Applying registry migrations for '{tenant_schema}'…")
    call_command(
        "migrate_schemas", "registry", "--schema", tenant_schema, interactive=False, verbosity=1
    )
    with schema_context(tenant_schema):
        with connection.cursor() as cursor:
            cursor.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS registry_arrowdataset_project_csv_idx "
                "ON registry_arrowdataset (project_id, original_csv)"
            )
    print("   ✅ Registry migrations complete.")

    # Grant app access from public.usecase table
    from apps.registry.models import App
    from apps.usecase.models import UseCase

    # ============================================
    # APP ACCESS CONFIGURATION (SUBSET OF QUANT MATRIX SCHEMA)
    # ============================================
    # Quant Matrix Schema has ALL apps: marketing-mix, forecasting, promo-effectiveness, blank
    # This tenant gets a SUBSET - only the apps they purchased/need
    # 
    # Modify this list based on what apps this tenant should have access to:
    default_app_slugs = [
        "marketing-mix",    # ✅ Granted - Marketing Mix Modeling
        "churn-prediction", # ✅ Granted - Churn Prediction with ML models
        # "forecasting",    # ❌ Not granted - Forecasting not included in their plan
        # "promo-effectiveness",  # ❌ Not granted - Promo Effectiveness not included
        "blank"             # ✅ Granted - Blank template for custom workflows
    ]
    
    print(f"\n   📦 App Access Plan: {len(default_app_slugs)} apps (subset of Quant Matrix)")
    print(f"   Quant Matrix has: marketing-mix, forecasting, promo-effectiveness, churn-prediction, blank")
    print(f"   This tenant gets: {', '.join(default_app_slugs)}")

    print(f"\n→ 6) Ensuring usecases are populated...")
    # Make sure all usecases exist in public.usecase table
    try:
        call_command("populate_usecases")
        print("   ✅ Usecases populated/updated in public schema")
    except Exception as exc:
        print(f"   ⚠️  Failed to populate usecases: {exc}")

    print(f"\n→ 7) Granting app access from public.usecase table...")
    
    allowed_app_ids = []
    # Ensure we're operating within the tenant schema when granting access
    with schema_context(tenant_schema):
        for slug in default_app_slugs:
            try:
                # Get app from public.usecase
                usecase = UseCase.objects.get(slug=slug)
                
                # Create or update tenant's registry.App
                obj, created = App.objects.update_or_create(
                    usecase_id=usecase.id,
                    defaults={
                        "name": usecase.name,
                        "slug": usecase.slug,
                        "description": usecase.description,
                        "is_enabled": True,
                        "custom_config": {
                            "molecules": getattr(usecase, 'molecules', []),  # Include molecules data if available
                            "modules": usecase.modules       # Include modules data
                        }
                    }
                )
                allowed_app_ids.append(obj.id)
                
                if created:
                    print(f"   ✅ Granted access: {usecase.name} (UseCase ID: {usecase.id})")
                    print(f"       Modules: {usecase.modules}")
                else:
                    print(f"   ♻️  Updated access: {usecase.name} (UseCase ID: {usecase.id})")
                    print(f"       Modules: {usecase.modules}")
                    
            except UseCase.DoesNotExist:
                print(f"   ❌ App '{slug}' not found in public.usecase table!")
                print(f"       This means the usecase was not created properly.")
                print(f"       Available usecases:")
                # Show what usecases are actually available
                available_usecases = UseCase.objects.all()
                for uc in available_usecases:
                    print(f"         - {uc.slug} ({uc.name})")
                continue

        # Create UserRole for the admin user
        from apps.roles.models import UserRole

        UserRole.objects.update_or_create(
            user=admin_user,
            client_id=tenant_client_id,
            app_id=uuid.uuid4(),
            defaults={
                "role": "admin",
                "allowed_apps": allowed_app_ids,
                "client_name": tenant_obj.name,
                "email": admin_user.email,
            },
        )
        print(f"\n   ✅ Created UserRole for '{admin_username}' with 'admin' privileges")

    # Update tenant with allowed apps
    Tenant.objects.filter(id=tenant_obj.id).update(
        allowed_apps=allowed_app_ids, 
        users_in_use=1  # Only the admin user for now
    )
    
    # Verify what apps were actually granted
    print(f"\n→ 8) Verifying granted apps in tenant schema...")
    with schema_context(tenant_schema):
        granted_apps = App.objects.filter(id__in=allowed_app_ids)
        print(f"   📋 Apps actually granted to {tenant_name}:")
        for app in granted_apps:
            print(f"      ✅ {app.slug} - {app.name}")
        print(f"   Total granted: {granted_apps.count()} apps")

    print(f"\n{'='*60}")
    print(f"✅ TENANT CREATION COMPLETE!")
    print(f"{'='*60}")
    print(f"\nTenant Details:")
    print(f"  Name:           {tenant_name}")
    print(f"  Schema:         {tenant_schema}")
    print(f"  Domain:         {primary_domain}")
    print(f"  Client ID:      {tenant_client_id}")
    print(f"\nAdmin Credentials:")
    print(f"  Username:       {admin_username}")
    print(f"  Email:          {admin_email}")
    print(f"  Password:       {admin_password}")
    print(f"\n{'='*60}")
    print(f"APP ACCESS COMPARISON")
    print(f"{'='*60}")
    print(f"\n📊 Quant Matrix Schema (Main Tenant):")
    print(f"  ✅ marketing-mix")
    print(f"  ✅ forecasting")
    print(f"  ✅ promo-effectiveness")
    print(f"  ✅ churn-prediction")
    print(f"  ✅ blank")
    print(f"  Total: 5 apps")
    print(f"\n🎯 {tenant_name} Schema (This Tenant):")
    for slug in default_app_slugs:
        print(f"  ✅ {slug}")
    print(f"  Total: {len(allowed_app_ids)} apps (SUBSET)")
    print(f"\n❌ Apps NOT granted to this tenant:")
    all_apps = ["marketing-mix", "forecasting", "promo-effectiveness", "churn-prediction", "blank"]
    denied_apps = [app for app in all_apps if app not in default_app_slugs]
    if denied_apps:
        for app in denied_apps:
            print(f"  ⛔ {app}")
    else:
        print(f"  (None - tenant has access to all apps)")
    print(f"\n{'='*60}\n")


if __name__ == "__main__":
    main()

