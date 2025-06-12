from rest_framework import serializers
from django.utils import timezone
from django_tenants.utils import schema_context
from django.core.management import call_command
from django.db import transaction, connection
import os
import re
from .models import Tenant, Domain
from apps.subscriptions.models import Company, SubscriptionPlan
from apps.config_store.models import TenantConfig
from apps.registry.models import App


class TenantSerializer(serializers.ModelSerializer):
    domain = serializers.CharField(write_only=True, required=False)
    seats_allowed = serializers.IntegerField(write_only=True, required=False)
    project_cap = serializers.IntegerField(write_only=True, required=False)
    apps_allowed = serializers.ListField(
        child=serializers.IntegerField(), write_only=True, required=False
    )

    class Meta:
        model = Tenant
        fields = [
            "id",
            "name",
            "schema_name",
            "created_on",
            "domain",
            "seats_allowed",
            "project_cap",
            "apps_allowed",
        ]
        read_only_fields = ["id", "created_on"]

    def create(self, validated_data):
        """Create a new tenant using the same steps as create_tenant.py."""
        print("TenantSerializer.create called", validated_data)

        domain = validated_data.pop("domain", None)
        seats = validated_data.pop("seats_allowed", None)
        project_cap = validated_data.pop("project_cap", None)
        apps_allowed = validated_data.pop("apps_allowed", None)

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
            tenant = Tenant.objects.create(**validated_data)
            print("→ Created tenant", tenant)
            if domain:
                Domain.objects.create(domain=domain, tenant=tenant, is_primary=True)
                print("→ Created primary domain", domain)

            primary_domain = os.getenv("PRIMARY_DOMAIN", "localhost")
            for alias in ("localhost", "127.0.0.1"):
                if alias != primary_domain and alias != domain:
                    Domain.objects.get_or_create(domain=alias, tenant=tenant, defaults={"is_primary": False})

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
                ("Blank App", "blank", "Start from an empty canvas"),
            ]
            for name, slug, desc in default_apps:
                App.objects.get_or_create(slug=slug, defaults={"name": name, "description": desc})

            if seats is not None or project_cap is not None:
                company = Company.objects.create(tenant=tenant)
                SubscriptionPlan.objects.create(
                    company=company,
                    plan_name="Default",
                    seats_allowed=seats or 0,
                    project_cap=project_cap or 0,
                    renewal_date=timezone.now().date(),
                )

            if apps_allowed:
                TenantConfig.objects.create(tenant=tenant, key="apps_allowed", value=apps_allowed)

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
