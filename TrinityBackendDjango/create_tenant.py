#!/usr/bin/env python3
import os
import uuid
import django
from django.core.management import call_command
from django.db import transaction, connection

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

# Adjust this import path if your app label is different:
from apps.tenants.models import Tenant, Domain


def main():
    tenant_name = "Quant_Matrix_AI"
    tenant_schema = "Quant_Matrix_AI_Schema"
    # Map localhost requests to the default tenant unless overridden
    primary_domain = os.getenv("PRIMARY_DOMAIN", "quantmatrix.ai")

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
    if not User.objects.filter(username="neo").exists():
        User.objects.create_superuser(username="neo", password="neo_the_one", email="")
        print("→ 1b) Created default super admin 'neo' with password 'neo_the_one'")
    else:
        print("→ 1b) Default super admin 'neo' already exists")

    # Create additional users for each role
    role_users = [
        ("neo", "neo_the_one", "super_admin"),
        ("admin_user", "admin", "admin"),
        ("editor_user", "editor", "editor"),
        ("viewer_user", "viewer", "viewer"),
    ]
    for username, password, _ in role_users:
        if not User.objects.filter(username=username).exists():
            is_staff = username in ("neo", "admin_user")
            User.objects.create_user(
                username=username,
                password=password,
                is_staff=is_staff,
            )
            print(f"→ 1c) Created user '{username}' with password '{password}'")
        else:
            user = User.objects.get(username=username)
            if username == "admin_user" and not user.is_staff:
                user.is_staff = True
                user.save()
            print(f"→ 1c) User '{username}' already exists")

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

        tenant_client_id = uuid.uuid5(uuid.NAMESPACE_DNS, tenant_schema)

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

        # Allow optional extra domains via env var so the app works when
        # accessed from an IP or external hostname.
        additional = os.getenv("ADDITIONAL_DOMAINS", "")
        hosts = [h.strip() for h in additional.split(",") if h.strip()]
        host_ip = os.getenv("HOST_IP", "")
        if host_ip and host_ip not in hosts:
            hosts.append(host_ip)

        for host in hosts:
            if host != primary_domain:
                alias, created = Domain.objects.get_or_create(
                    domain=host,
                    tenant=tenant_obj,
                    defaults={"is_primary": False},
                )
                if created:
                    print(f"   → Added extra domain: {alias}")
    print()

    print(f"→ 3) Running TENANT-SCHEMA migrations for '{tenant_schema}'…")
    # Switch into the tenant schema and apply all tenant apps there
    # `migrate_schemas` expects the schema name via the --schema flag.
    call_command(
        "migrate_schemas", "--schema", tenant_schema, interactive=False, verbosity=1
    )
    print("   ✅ Tenant-schema migrations complete.\n")

    # Load atom catalogue from FastAPI features
    try:
        call_command("sync_features")
        print("   ✅ Atom catalogue synced from features folder")
    except Exception as exc:
        print(f"   ⚠️  Failed to sync atoms: {exc}")

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

        # Assign roles to the default users within this tenant
        from apps.roles.models import UserRole

        for username, _, role in role_users:
            user = User.objects.get(username=username)
            client_uuid = tenant_client_id if username == "admin_user" else uuid.uuid4()
            UserRole.objects.get_or_create(
                user=user,
                client_id=client_uuid,
                app_id=uuid.uuid4(),
                project_id=uuid.uuid4(),
                role=role,
            )

    print("All done! Tenant and all tables created.\n")


if __name__ == "__main__":
    main()
