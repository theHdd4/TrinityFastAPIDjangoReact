#!/usr/bin/env python3
import os
import django
from django.core.management import call_command
from django.db import transaction, connection

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

# Adjust this import path if your app label is different:
from apps.tenants.models import Tenant, Domain

def main():
    tenant_name = "acme_corp"
    tenant_schema = "acme_corp_schema"
    # Map localhost requests to the default tenant unless overridden
    primary_domain = os.getenv("PRIMARY_DOMAIN", "localhost")

    print("\n→ 1) Applying SHARED (public) migrations…")
    # Run only shared apps into the public schema
    # Ensure the connection points to the public schema before migrating
    try:
        connection.set_schema_to_public()
    except Exception:
        pass
    call_command("migrate_schemas", "--shared", interactive=False, verbosity=1)
    print("   ✅ Shared migrations complete.\n")

    # Create an initial admin user for testing login if it doesn't exist
    from django.contrib.auth import get_user_model
    User = get_user_model()
    if not User.objects.filter(username="harsha").exists():
        User.objects.create_superuser(
            username="harsha", password="harsha", email=""
        )
        print("→ 1b) Created default admin 'harsha' with password 'harsha'")
    else:
        print("→ 1b) Default admin 'harsha' already exists")

    with transaction.atomic():
        # 2a) Create (or get) the Tenant row in public
        tenant_obj, created = Tenant.objects.get_or_create(
            schema_name=tenant_schema,
            defaults={"name": tenant_name},
        )
        if created:
            print(f"→ 2) Created Tenant: {tenant_obj}")
        else:
            print(f"→ 2) Tenant already existed: {tenant_obj}")

        # 2b) Create its primary Domain in public
        domain_obj, domain_created = Domain.objects.get_or_create(
            domain=primary_domain,
            tenant=tenant_obj,
            defaults={"is_primary": True},
        )
        if domain_created:
            print(f"   → Created Domain: {domain_obj}")
        else:
            print(f"   → Domain already existed: {domain_obj}")

        # Additional localhost aliases for convenience
        for extra in ("localhost", "127.0.0.1"):
            if extra != primary_domain:
                alias, created = Domain.objects.get_or_create(
                    domain=extra,
                    tenant=tenant_obj,
                    defaults={"is_primary": False},
                )
                if created:
                    print(f"   → Added alias domain: {alias}")
    print()

    print(f"→ 3) Running TENANT-SCHEMA migrations for '{tenant_schema}'…")
    # Switch into the tenant schema and apply all tenant apps there
    # `migrate_schemas` expects the schema name via the --schema flag.
    call_command("migrate_schemas", "--schema", tenant_schema, interactive=False, verbosity=1)
    print("   ✅ Tenant-schema migrations complete.\n")

    # Seed default App templates if none exist
    from apps.registry.models import App
    from django_tenants.utils import schema_context

    default_apps = [
        ("Marketing Mix Modeling", "marketing-mix", "Preset: Pre-process + Build"),
        ("Forecasting Analysis", "forecasting", "Preset: Pre-process + Explore"),
        ("Promo Effectiveness", "promo-effectiveness", "Preset: Explore + Build"),
        ("Blank App", "blank", "Start from an empty canvas"),
    ]

    # Ensure we're operating within the tenant schema when seeding data
    with schema_context(tenant_schema):
        for name, slug, desc in default_apps:
            obj, created = App.objects.get_or_create(
                slug=slug,
                defaults={"name": name, "description": desc},
            )
            if created:
                print(f"   → Created App template '{name}'")
            else:
                print(f"   → App template '{name}' already exists")

    print("All done! Tenant and all tables created.\n")

if __name__ == "__main__":
    main()
