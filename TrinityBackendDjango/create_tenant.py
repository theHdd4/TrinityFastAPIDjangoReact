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
to populate trinity_v1_atoms: {exc}")
e atoms from frontend: {exc}")

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
    from apps.registry.models import App
    from apps.usecase.models import UseCase

    print(f"\n→ 4) Granting app access from public.usecase table...")
    
    # Get ALL available usecases from public schema instead of hardcoded list
    try:
        all_usecases = UseCase.objects.all()
        print(f"   Found {all_usecases.count()} apps in public.usecase table")
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
                client_id=tenant_client_id,
                app_id=uuid.uuid4(),
                defaults={
                    "role": role,
                    "allowed_apps": allowed_app_ids,
                    "client_name": tenant_obj.name,
                    "email": user.email,
                },
            )

    Tenant.objects.filter(id=tenant_obj.id).update(
        allowed_apps=allowed_app_ids, users_in_use=len(role_users)
    )

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
