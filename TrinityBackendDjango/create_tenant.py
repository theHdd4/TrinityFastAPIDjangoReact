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

    # Create additional users for each role. The admin, editor and viewer
    # accounts are tied to the Quant Matrix AI tenant to demonstrate
    # client-specific privileges. Passwords for the staff list below are set
    # to the employee ID provided.
    # Username for staff members uses their Quant Matrix email address
    email_domain = "quantmatrix.ai"
    role_users = [
        (admin_username, "neo_the_only_one", "admin", "", ""),
        ("editor_user", "editor", "editor", "", ""),
        ("viewer_user", "viewer", "viewer", "", ""),
        (f"gautami.sharma@{email_domain}", "QM250111", "editor", "Gautami", "Sharma"),
        (f"abhishek.sahu@{email_domain}", "QM240110", "editor", "Abhishek", "Sahu"),
        (f"aakash.verma@{email_domain}", "QM240109", "editor", "Aakash", "Verma"),
        (f"sushant.upadhyay@{email_domain}", "QM240108", "admin", "Sushant", "Upadhyay"),
        (f"mahek.kala@{email_domain}", "QM250107", "editor", "Mahek", "Kala"),
        (f"abhishek.tiwari@{email_domain}", "QM240106", "editor", "Abhishek", "Tiwari"),
        (f"sandesh.panale@{email_domain}", "QM240105", "viewer", "Sandesh", "Panale"),
        (f"rutuja.wagh@{email_domain}", "QM240104", "viewer", "Rutuja", "Wagh"),
        (f"saahil.kejriwal@{email_domain}", "QM240103", "viewer", "Saahil", "Kejriwal"),
        (f"harshadip.das@{email_domain}", "QM240102", "admin", "Harshadip", "Das"),
        (f"venu.gorti@{email_domain}", "QM240101", "admin", "Venu", "Gorti"),
    ]

    for username, password, role, first, last in role_users:
        is_staff = role == "admin"
        if not User.objects.filter(username=username).exists():
            User.objects.create_user(
                username=username,
                password=password,
                first_name=first,
                last_name=last,
                email=username if "@" in username else "",
                is_staff=is_staff,
            )
            print(f"→ 1c) Created user '{username}' with password '{password}'")
        else:
            user = User.objects.get(username=username)
            update_needed = False
            if is_staff and not user.is_staff:
                user.is_staff = True
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

    # Seed default App templates if none exist
    from apps.registry.models import App

    default_apps = [
        ("Marketing Mix Modeling", "marketing-mix", "Preset: Pre-process + Build"),
        ("Forecasting Analysis", "forecasting", "Preset: Pre-process + Explore"),
        ("Promo Effectiveness", "promo-effectiveness", "Preset: Explore + Build"),
        ("Blank App", "blank", "Start from an empty canvas"),
    ]

    allowed_app_ids = []
    # Ensure we're operating within the tenant schema when seeding data
    with schema_context(tenant_schema):
        for name, slug, desc in default_apps:
            obj, created = App.objects.get_or_create(
                slug=slug,
                defaults={"name": name, "description": desc},
            )
            allowed_app_ids.append(obj.id)
            if created:
                print(f"   → Created App template '{name}'")
            else:
                print(f"   → App template '{name}' already exists")

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

    print("All done! Tenant and all tables created.\n")


if __name__ == "__main__":
    main()
