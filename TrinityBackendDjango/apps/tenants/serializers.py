from rest_framework import serializers
from django_tenants.utils import schema_context
from django.core.management import call_command
from django.db import transaction, connection
import os
import re
from .models import Tenant, Domain
from apps.registry.models import App


class TenantSerializer(serializers.ModelSerializer):
    primary_domain = serializers.CharField(required=False, allow_blank=True)
    allowed_apps = serializers.ListField(
        child=serializers.IntegerField(), required=False
    )
    projects_allowed = serializers.ListField(
        child=serializers.CharField(), required=False
    )
    users_in_use = serializers.IntegerField(read_only=True)
    admin_name = serializers.CharField()
    admin_email = serializers.EmailField()
    admin_password = serializers.CharField(write_only=True)

    class Meta:
        model = Tenant
        fields = [
            "id",
            "name",
            "schema_name",
            "created_on",
            "primary_domain",
            "seats_allowed",
            "project_cap",
            "allowed_apps",
            "projects_allowed",
            "users_in_use",
            "admin_name",
            "admin_email",
            "admin_password",
        ]
        read_only_fields = ["id", "created_on", "users_in_use"]

    def create(self, validated_data):
        """Create a new tenant using the same steps as create_tenant.py."""
        print("TenantSerializer.create called", validated_data)

        # Ensure the connection is on the public schema before saving the
        # tenant. django-tenants guards against calling save() while another
        # tenant schema is active which would raise a GuardRailException.
        try:
            connection.set_schema_to_public()
        except Exception:
            pass

        domain = validated_data.pop("primary_domain", "")
        allowed_apps = validated_data.pop("allowed_apps", [])
        projects_allowed = validated_data.pop("projects_allowed", [])
        admin_password = validated_data.pop("admin_password")

        schema = (
            validated_data.get("schema_name", "")
            .lower()
            .replace("-", "_")
            .replace(" ", "_")
        )
        if not schema or not re.match(r"^[a-z][a-z0-9_]+$", schema):
            raise serializers.ValidationError({"schema_name": "Invalid schema name"})
        validated_data["schema_name"] = schema

        with transaction.atomic():
            tenant = Tenant.objects.create(
                **validated_data,
                primary_domain=domain,
                allowed_apps=allowed_apps,
                projects_allowed=projects_allowed,
            )
            print("→ Created tenant", tenant)
            if domain:
                if Domain.objects.filter(domain=domain).exists():
                    raise serializers.ValidationError({"primary_domain": "Domain already exists"})
                Domain.objects.create(domain=domain, tenant=tenant, is_primary=True)
                print("→ Created primary domain", domain)

            primary = os.getenv("PRIMARY_DOMAIN", "localhost")
            for alias in ("localhost", "127.0.0.1"):
                if alias != primary and alias != domain and not Domain.objects.filter(domain=alias).exists():
                    Domain.objects.create(domain=alias, tenant=tenant, is_primary=False)

        # Allow skipping heavy migration logic when running in simple mode
        # Default to simple creation to avoid heavy migrations in dev setups
        simple_mode = os.getenv("SIMPLE_TENANT_CREATION", "true").lower() == "true"

        if not simple_mode:
            try:
                connection.set_schema_to_public()
            except Exception:
                pass

            print("→ Applying tenant migrations for", tenant.schema_name)
            call_command(
                "migrate_schemas",
                "--schema",
                tenant.schema_name,
                interactive=False,
                verbosity=1,
            )

            print("→ Seeding default data")
            with schema_context(tenant.schema_name):
                default_apps = [
                    ("Marketing Mix Modeling", "marketing-mix", "Preset: Pre-process + Build"),
                    ("Forecasting Analysis", "forecasting", "Preset: Pre-process + Explore"),
                    ("Promo Effectiveness", "promo-effectiveness", "Preset: Explore + Build"),
                    ("Custom Workspace", "blank", "Start from an empty canvas"),
                ]
                for name, slug, desc in default_apps:
                    App.objects.get_or_create(slug=slug, defaults={"name": name, "description": desc})

        with schema_context(tenant.schema_name):
            from apps.accounts.models import User
            from apps.roles.models import UserRole

            admin_user = User.objects.create_user(
                username=validated_data["admin_name"],
                email=validated_data["admin_email"],
                password=admin_password,
            )
            UserRole.objects.update_or_create(
                user=admin_user,
                defaults={
                    "role": UserRole.ROLE_ADMIN,
                    "allowed_apps": tenant.allowed_apps,
                }
            )

        print("Tenant creation complete")
        return tenant


class DomainSerializer(serializers.ModelSerializer):
    class Meta:
        model = Domain
        fields = [
            "id",
            "domain",
            "tenant",
            "is_primary",
        ]
        read_only_fields = ["id"]
