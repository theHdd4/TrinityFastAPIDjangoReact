from rest_framework import serializers
from django_tenants.utils import schema_context
from django.core.management import call_command
from django.db import transaction, connection
import os
import re
from .models import Tenant, Domain
from apps.registry.models import App
from apps.accounts.models import User, UserTenant
from apps.roles.models import UserRole
from apps.usecase.models import UseCase
from apps.accounts.utils import save_env_var
from apps.accounts.tenant_utils import get_user_tenant_schema, switch_to_user_tenant


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
        admin_name = validated_data.pop("admin_name")
        admin_email = validated_data.pop("admin_email")
        admin_password = validated_data.pop("admin_password")

        # Normalize schema name
        schema = (
            validated_data.get("schema_name", "")
            .lower()
            .replace("-", "_")
            .replace(" ", "_")
        )
        if not schema or not re.match(r"^[a-z][a-z0-9_]+$", schema):
            raise serializers.ValidationError({"schema_name": "Invalid schema name"})
        validated_data["schema_name"] = schema

        # Step: Resolve App IDs to UseCase IDs via slug join
        # Frontend sends App IDs from tenant schema, we need to:
        # 1. Get current user's tenant schema
        # 2. Query App objects from that tenant schema using received App IDs
        # 3. Extract slugs and join with UseCase by slug to get UseCase IDs
        resolved_usecase_ids = []
        app_slugs_map = {}  # Map slug to App ID for later reference
        
        if allowed_apps:
            # Get the current user from request context
            request = self.context.get('request')
            if not request or not request.user:
                raise serializers.ValidationError({
                    "allowed_apps": "Unable to determine user context for app resolution"
                })
            
            current_user = request.user
            user_schema = get_user_tenant_schema(current_user)
            
            if not user_schema:
                raise serializers.ValidationError({
                    "allowed_apps": f"Unable to determine tenant schema for user {current_user.username}. Cannot resolve App IDs."
                })
            
            print(f"→ Resolving App IDs from user's tenant schema: {user_schema}")
            
            # Query App objects from current user's tenant schema
            try:
                with schema_context(user_schema):
                    source_apps = App.objects.filter(id__in=allowed_apps).select_related()
                    found_app_ids = set(source_apps.values_list('id', flat=True))
                    missing_app_ids = set(allowed_apps) - found_app_ids
                    
                    if missing_app_ids:
                        raise serializers.ValidationError({
                            "allowed_apps": f"App IDs not found in source tenant schema: {list(missing_app_ids)}"
                        })
                    
                    # Extract slugs and build mapping
                    app_slugs = []
                    for app in source_apps:
                        if app.slug:
                            app_slugs.append(app.slug)
                            app_slugs_map[app.slug] = app.id
                        else:
                            print(f"   ⚠️  App ID {app.id} ({app.name}) has no slug, skipping")
                    
                    print(f"   📋 Found {len(app_slugs)} apps with slugs: {app_slugs}")
                    
            except Exception as e:
                if isinstance(e, serializers.ValidationError):
                    raise
                raise serializers.ValidationError({
                    "allowed_apps": f"Error querying apps from source tenant: {str(e)}"
                })
            
            # Now join with UseCase table (public schema) by slug
            try:
                connection.set_schema_to_public()
            except Exception:
                pass
            
            if app_slugs:
                usecases = UseCase.objects.filter(slug__in=app_slugs)
                found_slugs = set(usecases.values_list('slug', flat=True))
                missing_slugs = set(app_slugs) - found_slugs
                
                if missing_slugs:
                    raise serializers.ValidationError({
                        "allowed_apps": f"App slugs not found in UseCase table: {list(missing_slugs)}"
                    })
                
                resolved_usecase_ids = list(usecases.values_list('id', flat=True))
                print(f"   ✅ Resolved {len(resolved_usecase_ids)} UseCase IDs from {len(app_slugs)} app slugs")
            else:
                print("   ⚠️  No valid app slugs found to resolve")
        
        # Store resolved UseCase IDs for later use (replacing the original allowed_apps)
        # We'll use resolved_usecase_ids to create App entries in the new tenant schema
        usecase_ids_for_tenant = resolved_usecase_ids

        # Check for duplicate username/email in public schema
        if User.objects.filter(username=admin_name).exists():
            raise serializers.ValidationError({"admin_name": "Username already exists"})
        if User.objects.filter(email=admin_email).exists():
            raise serializers.ValidationError({"admin_email": "Email already exists"})

        with transaction.atomic():
            # Step 1: Create Tenant in public schema
            # Store resolved UseCase IDs in tenant.allowed_apps for reference
            # (This is metadata, actual App entries will be created in tenant schema)
            tenant = Tenant.objects.create(
                **validated_data,
                primary_domain=domain,
                allowed_apps=usecase_ids_for_tenant,  # Store UseCase IDs as metadata
                projects_allowed=projects_allowed,
                admin_name=admin_name,
                admin_email=admin_email,
            )
            print("→ Created tenant", tenant)

            # Step 2: Create Domain entries
            if domain:
                if Domain.objects.filter(domain=domain).exists():
                    raise serializers.ValidationError({"primary_domain": "Domain already exists"})
                Domain.objects.create(domain=domain, tenant=tenant, is_primary=True)
                print("→ Created primary domain", domain)

            # Add localhost aliases
            primary = os.getenv("PRIMARY_DOMAIN", "localhost")
            for alias in ("localhost", "127.0.0.1"):
                if alias != primary and alias != domain:
                    try:
                        if not Domain.objects.filter(domain=alias).exists():
                            Domain.objects.create(domain=alias, tenant=tenant, is_primary=False)
                            print(f"→ Added alias domain: {alias}")
                    except Exception as e:
                        print(f"→ Error creating domain '{alias}': {e}")

        # Step 3: Run tenant schema migrations
        try:
            connection.set_schema_to_public()
        except Exception:
            pass

        print(f"→ Applying tenant migrations for '{tenant.schema_name}'")
        try:
            call_command(
                "migrate_schemas",
                "--schema",
                tenant.schema_name,
                interactive=False,
                verbosity=1,
            )
            print("   ✅ Tenant-schema migrations complete.")
        except Exception as e:
            print(f"   ⚠️  Migration error (non-critical): {e}")

        # Step 4: Populate registry.App entries in tenant schema
        # Use resolved UseCase IDs to create App entries in the new tenant schema
        allowed_app_ids = []
        
        if usecase_ids_for_tenant:
            # Ensure we're in public schema to query UseCase
            try:
                connection.set_schema_to_public()
            except Exception:
                pass
            
            usecases = UseCase.objects.filter(id__in=usecase_ids_for_tenant)
            print(f"→ Granting app access from {len(usecases)} resolved usecases...")
            
            # Now switch to tenant schema to create App entries
            with schema_context(tenant.schema_name):
                for usecase in usecases:
                    try:
                        # Create or update tenant's registry.App
                        obj, created = App.objects.update_or_create(
                            slug=usecase.slug,
                            defaults={
                                "usecase_id": usecase.id,
                                "name": usecase.name,
                                "description": usecase.description,
                                "is_enabled": True,
                                "custom_config": {
                                    "molecules": usecase.molecules,
                                    "modules": usecase.modules
                                }
                            }
                        )
                        allowed_app_ids.append(obj.id)
                        
                        if created:
                            print(f"   ✅ Granted access: {usecase.name} (UseCase ID: {usecase.id}, App ID: {obj.id})")
                        else:
                            print(f"   ♻️  Updated access: {usecase.name} (UseCase ID: {usecase.id}, App ID: {obj.id})")
                    except Exception as e:
                        print(f"   ⚠️  Error processing app '{usecase.slug}': {e}")
                        continue
                
                print(f"   📊 Total apps granted access: {len(allowed_app_ids)}")
        else:
            print("   ⚠️  No allowed apps specified - tenant will have no app access")

        # Step 5: Create User in public schema (accounts_user table)
        # Ensure we're in public schema context
        try:
            connection.set_schema_to_public()
        except Exception:
            pass

        print(f"→ Creating admin user in public schema...")
        admin_user = User.objects.create_user(
            username=admin_name,
            email=admin_email,
            password=admin_password,
            is_superuser=False,
            is_staff=False,
        )
        print(f"   ✅ Created user '{admin_name}' in public schema")

        # Step 6: Create UserTenant mapping in public schema
        print(f"→ Creating UserTenant mapping...")
        user_tenant, created = UserTenant.objects.get_or_create(
            user=admin_user,
            tenant=tenant,
            defaults={"is_primary": True}
        )
        if created:
            print(f"   ✅ Created UserTenant mapping: {admin_name} → {tenant.name} (is_primary=True)")
        else:
            # Update is_primary if it wasn't set
            if not user_tenant.is_primary:
                user_tenant.is_primary = True
                user_tenant.save()
                print(f"   ♻️  Updated UserTenant mapping (set as primary): {admin_name} → {tenant.name}")

        # Step 7: Set environment variables
        print(f"→ Setting default tenant environment for user...")
        try:
            # Temporarily set environment variables for save_env_var to work
            os.environ["CLIENT_NAME"] = tenant.name
            os.environ["CLIENT_ID"] = f"{tenant.schema_name}_{admin_user.id}"
            
            save_env_var(admin_user, 'CLIENT_NAME', tenant.name)
            save_env_var(admin_user, 'CLIENT_ID', f"{tenant.schema_name}_{admin_user.id}")
            print(f"   ✅ Set tenant environment for user: {admin_name}")
        except Exception as exc:
            print(f"   ⚠️  Failed to set environment for {admin_name}: {exc}")

        # Step 8: Create UserRole in tenant schema
        with schema_context(tenant.schema_name):
            print(f"→ Creating UserRole for admin user...")
            user_role, created = UserRole.objects.update_or_create(
                user=admin_user,
                defaults={
                    "role": UserRole.ROLE_ADMIN,
                    "allowed_apps": allowed_app_ids,  # Use registry.App IDs, not usecase IDs
                }
            )
            if created:
                print(f"   ✅ Created UserRole: {admin_name} - {UserRole.ROLE_ADMIN}")
            else:
                print(f"   ♻️  Updated UserRole: {admin_name} - {UserRole.ROLE_ADMIN}")

        # Update tenant users_in_use count
        Tenant.objects.filter(id=tenant.id).update(users_in_use=1)

        print("✅ Tenant creation complete")
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
