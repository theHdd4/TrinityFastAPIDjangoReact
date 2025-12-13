#!/usr/bin/env python3
"""Tenant creation utility.

Ensures Django settings are loaded before any framework modules that expect
configured settings are imported. This avoids ``ImproperlyConfigured`` errors
when the script is executed directly.
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
    tenant_name = "Quant Matrix AI"
    tenant_schema = "Quant_Matrix_AI_Schema"
    primary_domain = os.getenv("PRIMARY_DOMAIN", "quantmatrix.ai")
    seats_allowed = int(os.getenv("TENANT_SEATS", 20))
    project_cap = int(os.getenv("TENANT_PROJECT_CAP", 5))
    projects_allowed = ["Demo Project"]
    admin_username = "neo"
    admin_email = f"{admin_username}@{primary_domain}"
    
    # List of allowed app slugs (will be resolved to usecase IDs)
    # Empty list [] means grant access to ALL apps (backward compatibility)
    # Since usecase IDs and registry.App IDs are the same, we can use either
    TENANT_ALLOWED_APPS = [
        # Add app slugs here, e.g.:
        # "marketing-mix",
        # "forecasting",
        # "churn-prediction"
        # Leave empty [] to grant all apps
    ]

    print("→ 0) Making sure migrations are generated…")
    call_command("makemigrations", "registry", interactive=False, verbosity=1)
    call_command("makemigrations", "trinity_v1_agents", interactive=False, verbosity=1)

    print("\n→ 1) Applying SHARED (public) migrations…")
    # Run only shared apps into the public schema
    # Ensure the connection points to the public schema before migrating
    try:
        connection.set_schema_to_public()
    except Exception:
        pass
    call_command("migrate_schemas", "--shared", interactive=False, verbosity=1)
    print("   ✅ Shared migrations complete.\n")

    # Create the default super admin user for testing login if it doesn't exist
    from django.contrib.auth import get_user_model

    User = get_user_model()
    if not User.objects.filter(username=admin_username).exists():
        User.objects.create_superuser(
            username=admin_username,
            password="neo_the_only_one",
            email=admin_email,
        )
        print(
            "→ 1b) Created default super admin 'neo' with password 'neo_the_only_one'"
        )
    else:
        user = User.objects.get(username=admin_username)
        if user.email != admin_email:
            user.email = admin_email
            user.save()
        print("→ 1b) Default super admin 'neo' already exists")

    email_domain = "quantmatrix.ai"
    role_users = [
        (admin_username, "neo_the_only_one", "admin", "", ""),
        ("editor_user", "editor", "admin", "", ""),
        ("viewer_user", "viewer", "admin", "", ""),
        (f"gautami.sharma@{email_domain}", "QM250111", "admin", "Gautami", "Sharma"),
        (f"abhishek.sahu@{email_domain}", "QM240110", "admin", "Abhishek", "Sahu"),
        (f"aakash.verma@{email_domain}", "QM240109", "admin", "Aakash", "Verma"),
        (f"sushant.upadhyay@{email_domain}", "QM240108", "admin", "Sushant", "Upadhyay"),
        (f"mahek.kala@{email_domain}", "QM250107", "admin", "Mahek", "Kala"),
        (f"abhishek.tiwari@{email_domain}", "QM240106", "admin", "Abhishek", "Tiwari"),
        (f"sandesh.panale@{email_domain}", "QM240105", "admin", "Sandesh", "Panale"),
        (f"rutuja.wagh@{email_domain}", "QM240104", "admin", "Rutuja", "Wagh"),
        (f"saahil.kejriwal@{email_domain}", "QM240103", "admin", "Saahil", "Kejriwal"),
        (f"harshadip.das@{email_domain}", "QM240102", "admin", "Harshadip", "Das"),
        (f"venu.gorti@{email_domain}", "QM240101", "admin", "Venu", "Gorti"),
    ]

    for username, password, role, first, last in role_users:
        if not User.objects.filter(username=username).exists():
            User.objects.create_user(
                username=username,
                password=password,
                first_name=first,
                last_name=last,
                email=username if "@" in username else "",
                is_staff=True,
                is_superuser=True,
            )
            print(f"→ 1c) Created user '{username}' with password '{password}'")
        else:
            user = User.objects.get(username=username)
            update_needed = False
            if not user.is_staff:
                user.is_staff = True
                update_needed = True
            if not user.is_superuser:
                user.is_superuser = True
                update_needed = True
            if first and user.first_name != first:
                user.first_name = first
                update_needed = True
            if last and user.last_name != last:
                user.last_name = last
                update_needed = True
            if "@" in username and user.email != username:
                user.email = username
                update_needed = True
            if not user.check_password(password):
                user.set_password(password)
                update_needed = True
            if update_needed:
                user.save()
            print(f"→ 1c) User '{username}' already exists")

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
            schema_name=tenant_schema, defaults={**tenant_defaults, "allowed_apps": []}
        )
        if created:
            print(f"→ 2) Created Tenant: {tenant_obj}")
        else:
            for field, value in tenant_defaults.items():
                setattr(tenant_obj, field, value)
            tenant_obj.save()
            print(f"→ 2) Updated Tenant: {tenant_obj}")

        domain_obj, domain_created = Domain.objects.get_or_create(
            domain=primary_domain,
            tenant=tenant_obj,
            defaults={"is_primary": True},
        )
        if domain_created:
            print(f"   → Created Domain: {domain_obj}")
        else:
            print(f"   → Domain already existed: {domain_obj}")

        tenant_client_id = uuid.uuid5(uuid.NAMESPACE_DNS, tenant_schema)

        # Additional localhost aliases for convenience
        for extra in ("localhost", "127.0.0.1"):
            if extra != primary_domain:
                try:
                    alias, created = Domain.objects.get_or_create(
                        domain=extra,
                        tenant=tenant_obj,
                        defaults={"is_primary": False},
                    )
                    if created:
                        print(f"   → Added alias domain: {alias}")
                    else:
                        print(f"   → Alias domain already exists for this tenant: {alias}")
                except Exception as e:
                    # Check if domain exists for another tenant
                    existing_domain = Domain.objects.filter(domain=extra).first()
                    if existing_domain:
                        print(f"   → Domain '{extra}' already exists for tenant '{existing_domain.tenant.name}', skipping")
                    else:
                        print(f"   → Error creating domain '{extra}': {e}")

        # Allow optional extra domains via env var so the app works when
        # accessed from an IP or external hostname.
        additional = os.getenv("ADDITIONAL_DOMAINS", "")
        hosts = [h.strip() for h in additional.split(",") if h.strip()]
        host_ip = os.getenv("HOST_IP", "")
        if host_ip and host_ip not in hosts:
            hosts.append(host_ip)

        for host in hosts:
            if host != primary_domain:
                try:
                    alias, created = Domain.objects.get_or_create(
                        domain=host,
                        tenant=tenant_obj,
                        defaults={"is_primary": False},
                    )
                    if created:
                        print(f"   → Added extra domain: {alias}")
                    else:
                        print(f"   → Extra domain already exists for this tenant: {alias}")
                except Exception as e:
                    # Check if domain exists for another tenant
                    existing_domain = Domain.objects.filter(domain=host).first()
                    if existing_domain:
                        print(f"   → Domain '{host}' already exists for tenant '{existing_domain.tenant.name}', skipping")
                    else:
                        print(f"   → Error creating domain '{host}': {e}")
    print()

    # Ensure trinity_v1_apps (UseCase) table is populated before resolving allowed apps
    print(f"→ 2a) Ensuring trinity_v1_apps (UseCase) table is populated...")
    from apps.usecase.models import UseCase
    
    total_usecases = UseCase.objects.count()
    if total_usecases == 0:
        print(f"   ⚠️  trinity_v1_apps table is empty, populating now...")
        try:
            call_command("populate_usecases")
            total_usecases = UseCase.objects.count()
            print(f"   ✅ Populated trinity_v1_apps table with {total_usecases} entries")
        except Exception as exc:
            print(f"   ❌ Failed to populate usecases: {exc}")
            raise ValueError(f"Could not populate trinity_v1_apps table: {exc}")
    else:
        print(f"   ✅ trinity_v1_apps table already has {total_usecases} entries")
    print()

    # Resolve allowed apps to usecase IDs and update Tenant.allowed_apps
    # This must happen BEFORE creating registry.App entries so we can filter them
    # Flow: TENANT_ALLOWED_APPS (hardcoded list of slugs) → resolved to usecase IDs → stored in Tenant.allowed_apps
    # If TENANT_ALLOWED_APPS is empty [], grants access to ALL apps (backward compatibility)
    print(f"→ 2b) Resolving allowed apps and updating Tenant.allowed_apps...")
    
    # Table is now guaranteed to be populated (auto-populated above if needed)
    total_usecases = UseCase.objects.count()
    print(f"   Found {total_usecases} usecases in trinity_v1_apps table")
    
    if TENANT_ALLOWED_APPS:
        # Resolve slugs to usecase IDs
        print(f"   Requested slugs: {TENANT_ALLOWED_APPS}")
        allowed_usecases = UseCase.objects.filter(slug__in=TENANT_ALLOWED_APPS)
        allowed_usecase_ids = list(allowed_usecases.values_list('id', flat=True))
        found_slugs = list(allowed_usecases.values_list('slug', flat=True))
        print(f"   Resolved {len(allowed_usecase_ids)} allowed apps from {len(TENANT_ALLOWED_APPS)} slugs")
        print(f"   Found slugs: {found_slugs}")
        
        if len(allowed_usecase_ids) < len(TENANT_ALLOWED_APPS):
            missing = set(TENANT_ALLOWED_APPS) - set(found_slugs)
            print(f"   ⚠️  Warning: {len(missing)} slugs not found in usecase table: {missing}")
            
            # Show available slugs for debugging
            all_available_slugs = list(UseCase.objects.values_list('slug', flat=True))
            print(f"   📋 Available slugs in usecase table ({len(all_available_slugs)} total):")
            for slug in sorted(all_available_slugs):
                print(f"      - {slug}")
            
            # Check for potential typos (case-insensitive or similar slugs)
            print(f"   💡 Tip: Check for typos in TENANT_ALLOWED_APPS list")
            for missing_slug in missing:
                # Find similar slugs (case-insensitive match)
                similar = [s for s in all_available_slugs if s.lower() == missing_slug.lower()]
                if similar:
                    print(f"      → '{missing_slug}' not found, but found similar: {similar}")
    else:
        # Empty list = grant all apps (backward compatibility)
        allowed_usecase_ids = list(UseCase.objects.values_list('id', flat=True))
        print(f"   No allowed apps specified - granting access to ALL {len(allowed_usecase_ids)} apps")
    
    # Update Tenant.allowed_apps BEFORE creating registry.App entries
    # This ensures we can filter usecases based on Tenant.allowed_apps
    # Use save() instead of update() to ensure JSONField is properly serialized
    tenant_obj.allowed_apps = allowed_usecase_ids
    tenant_obj.save(update_fields=['allowed_apps'])
    print(f"   ✅ Updated Tenant.allowed_apps with {len(allowed_usecase_ids)} usecase IDs: {allowed_usecase_ids}")
    print(f"   ✅ Verified: Tenant.allowed_apps = {tenant_obj.allowed_apps}")
    print()

    print(f"→ 3) Running TENANT-SCHEMA migrations for '{tenant_schema}'…")
    # Switch into the tenant schema and apply all tenant apps there
    # `migrate_schemas` expects the schema name via the --schema flag.
    call_command(
        "migrate_schemas", "--schema", tenant_schema, interactive=False, verbosity=1
    )
    print("   ✅ Tenant-schema migrations complete.\n")

    print(f"→ 3b) Applying registry migrations for '{tenant_schema}'…")
    call_command(
        "migrate_schemas", "registry", "--schema", tenant_schema, interactive=False, verbosity=1
    )
    with schema_context(tenant_schema):
        with connection.cursor() as cursor:
            cursor.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS registry_arrowdataset_project_csv_idx "
                "ON registry_arrowdataset (project_id, original_csv)"
            )
    print("   ✅ Registry migrations complete.\n")

    # Load atom catalogue from FastAPI features
    try:
        call_command("sync_features")
        print("   ✅ Atom catalogue synced from features folder")
    except Exception as exc:
        print(f"   ⚠️  Failed to sync atoms: {exc}")

    # Populate molecules data in public schema
    try:
        call_command("populate_molecules")
        print("   ✅ Molecules data populated in public schema")
    except Exception as exc:
        print(f"   ⚠️  Failed to populate molecules: {exc}")

    # Populate trinity_v1_atoms data in public schema
    try:
        call_command("populate_trinity_v1_atoms")
        print("   ✅ Trinity V1 Atoms data populated in public schema")
    except Exception as exc:
        print(f"   ⚠️  Failed to populate trinity_v1_atoms: {exc}")

    # Sync agents to PostgreSQL trinity_v1_agents table
    try:
        call_command("sync_agents_to_postgres", verbosity=1)
        print("   ✅ Trinity V1 Agents synced to PostgreSQL")
    except Exception as exc:
        print(f"   ⚠️  Failed to sync agents to PostgreSQL: {exc}")
        print("       This is non-critical - agents will sync automatically when registered.")
        print("       You can manually run: python manage.py sync_agents_to_postgres")

    # Update available atoms status based on working atoms list
    try:
        call_command("update_available_atoms")
        print("   ✅ Available atoms status updated")
    except Exception as exc:
        print(f"   ⚠️  Failed to update available atoms: {exc}")

    # Populate use cases if they don't exist
    try:
        call_command("populate_usecases")
        print("   ✅ Use cases populated in public schema")
    except Exception as exc:
        print(f"   ⚠️  Failed to populate use cases: {exc}")

    # Assign molecules to use cases
    try:
        call_command("assign_molecules_to_usecases")
        print("   ✅ Molecules assigned to use cases")
    except Exception as exc:
        print(f"   ⚠️  Failed to assign molecules to use cases: {exc}")

    # Grant app access from public.usecase table
    # Filter usecases based on Tenant.allowed_apps (which was set in step 2b)
    # Flow: TENANT_ALLOWED_APPS (slugs) → resolved to usecase IDs → stored in Tenant.allowed_apps
    #       → filtered here → only creates registry.App entries for allowed apps
    from apps.registry.models import App
    # UseCase is already imported from earlier step

    print(f"\n→ 4) Granting app access from public.usecase table...")
    
    # Get usecases - filter by Tenant.allowed_apps if set
    # Tenant.allowed_apps was populated earlier (step 2b) with usecase IDs
    # Note: usecase IDs and registry.App IDs are the same, so we can use either
    try:
        # Refresh tenant_obj to ensure we have the latest allowed_apps from database
        tenant_obj.refresh_from_db()
        print(f"   🔍 Debug: tenant_obj.allowed_apps = {tenant_obj.allowed_apps} (type: {type(tenant_obj.allowed_apps)})")
        
        all_usecases = UseCase.objects.all()
        if tenant_obj.allowed_apps and len(tenant_obj.allowed_apps) > 0:
            # Filter to only allowed apps (usecase IDs stored in Tenant.allowed_apps)
            all_usecases = all_usecases.filter(id__in=tenant_obj.allowed_apps)
            print(f"   ✅ Filtering to {all_usecases.count()} allowed apps (from Tenant.allowed_apps: {tenant_obj.allowed_apps})")
        else:
            # Fallback: if allowed_apps is empty, use all (shouldn't happen after step 2b, but safety check)
            print(f"   ⚠️  No allowed_apps filter - Tenant.allowed_apps is empty! Using all {all_usecases.count()} apps")
        print(f"   Found {all_usecases.count()} apps in public.usecase table (after filtering)")
    except Exception as e:
        print(f"   ⚠️  Error fetching usecases: {e}")
        print(f"       Run: python manage.py populate_usecases")
        all_usecases = []
    
    allowed_app_ids = []
    # Ensure we're operating within the tenant schema when granting access
    with schema_context(tenant_schema):
        for usecase in all_usecases:
            try:
                # Create or update tenant's registry.App
                # Use slug as the lookup field since it's unique and causes the constraint violation
                obj, created = App.objects.update_or_create(
                    slug=usecase.slug,
                    defaults={
                        "usecase_id": usecase.id,
                        "name": usecase.name,
                        "description": usecase.description,
                        "is_enabled": True,
                        "custom_config": {
                            "molecules": usecase.molecules,  # Include molecules data
                            "modules": usecase.modules       # Include modules data
                        }
                    }
                )
                allowed_app_ids.append(obj.id)
                
                if created:
                    print(f"   ✅ Granted access: {usecase.name} (UseCase ID: {usecase.id})")
                    print(f"       Molecules: {usecase.molecules}")
                else:
                    print(f"   ♻️  Updated access: {usecase.name} (UseCase ID: {usecase.id})")
                    print(f"       Molecules: {usecase.molecules}")
                    
            except Exception as e:
                print(f"   ⚠️  Error processing app '{usecase.slug}': {e}")
                continue
        
        print(f"   📊 Total apps granted access: {len(allowed_app_ids)}")

        from apps.roles.models import UserRole

        for username, _, role, *_ in role_users:
            user = User.objects.get(username=username)
            UserRole.objects.update_or_create(
                user=user,
                defaults={
                    "role": role,
                    "allowed_apps": allowed_app_ids,
                },
            )

    # Note: Tenant.allowed_apps was already updated earlier (step 2b) with usecase IDs
    # The allowed_app_ids collected here should match since usecase IDs = registry.App IDs
    # Only update users_in_use, not allowed_apps (to avoid overwriting with registry.App IDs)
    Tenant.objects.filter(id=tenant_obj.id).update(
        users_in_use=len(role_users)
    )

    # Create UserTenant mappings for all users
    print(f"\n→ 4b) Creating UserTenant mappings for all users...")
    from apps.accounts.models import UserTenant
    
    # Check if this is the "Quant Matrix AI" tenant (primary tenant)
    is_primary_tenant = tenant_name == "Quant Matrix AI"
    
    for user in User.objects.all():
        try:
            # Check if mapping already exists
            user_tenant, created = UserTenant.objects.get_or_create(
                user=user,
                tenant=tenant_obj,
                defaults={
                    "is_primary": is_primary_tenant and not UserTenant.objects.filter(user=user, is_primary=True).exists()
                }
            )
            if created:
                print(f"   ✅ Created UserTenant mapping: {user.username} → {tenant_obj.name}")
            else:
                # Update is_primary if this is the primary tenant and user doesn't have one
                if is_primary_tenant and not user_tenant.is_primary and not UserTenant.objects.filter(user=user, is_primary=True).exists():
                    user_tenant.is_primary = True
                    user_tenant.save()
                    print(f"   ♻️  Updated UserTenant mapping (set as primary): {user.username} → {tenant_obj.name}")
                else:
                    print(f"   ℹ️  UserTenant mapping already exists: {user.username} → {tenant_obj.name}")
        except Exception as exc:
            print(f"   ⚠️  Failed to create UserTenant mapping for {user.username}: {exc}")

    # Set default tenant environment for all users
    print(f"\n→ 5) Setting default tenant environment for all users...")
    from apps.accounts.utils import save_env_var
    
    for user in User.objects.all():
        try:
            save_env_var(user, 'CLIENT_NAME', tenant_name)  # Use tenant_name, not tenant_schema
            save_env_var(user, 'CLIENT_ID', f"{tenant_schema}_{user.id}")
            print(f"   ✅ Set tenant environment for user: {user.username}")
        except Exception as exc:
            print(f"   ⚠️  Failed to set environment for {user.username}: {exc}")

    print("All done! Tenant and all tables created.\n")


if __name__ == "__main__":
    main()