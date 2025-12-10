from rest_framework import serializers
from django_tenants.utils import schema_context
from django.core.management import call_command
from django.db import transaction, connection
from django.utils import timezone
from datetime import timedelta
import os
import re
import sys
from .models import Tenant, Domain
from apps.registry.models import App
from apps.accounts.models import User, UserTenant, OnboardToken
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
    onboard_token = serializers.SerializerMethodField()
    onboard_token_expires_at = serializers.SerializerMethodField()
    admin_username = serializers.SerializerMethodField()

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
            "is_active",
            "onboard_token",
            "onboard_token_expires_at",
            "admin_username",
        ]
        read_only_fields = ["id", "created_on", "users_in_use", "is_active", "onboard_token", "onboard_token_expires_at", "admin_username"]

    def get_onboard_token(self, obj):
        """Return onboard token if available (only after creation)."""
        return getattr(obj, '_onboard_token', None)

    def get_onboard_token_expires_at(self, obj):
        """Return onboard token expiration if available."""
        return getattr(obj, '_onboard_token_expires_at', None)

    def get_admin_username(self, obj):
        """Return admin username if available."""
        return getattr(obj, '_admin_username', None)

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

        # Step: Validate UseCase IDs directly from public schema
        # For client management, frontend sends UseCase IDs directly from trinity_v1_apps
        # No need to resolve from tenant schema App objects
        resolved_usecase_ids = []
        
        if allowed_apps:
            # Ensure we're in public schema to query UseCase table
            try:
                connection.set_schema_to_public()
            except Exception:
                pass
            
            # Validate that all provided UseCase IDs exist in public schema
            print(f"→ Validating UseCase IDs from trinity_v1_apps: {allowed_apps}")
            try:
                usecases = UseCase.objects.filter(id__in=allowed_apps)
                found_usecase_ids = set(usecases.values_list('id', flat=True))
                missing_ids = set(allowed_apps) - found_usecase_ids
                
                if missing_ids:
                    raise serializers.ValidationError({
                        "allowed_apps": f"UseCase IDs not found in trinity_v1_apps: {list(missing_ids)}"
                    })
                
                resolved_usecase_ids = list(found_usecase_ids)
                print(f"   ✅ Validated {len(resolved_usecase_ids)} UseCase IDs from trinity_v1_apps")
            except Exception as e:
                if isinstance(e, serializers.ValidationError):
                    raise
                raise serializers.ValidationError({
                    "allowed_apps": f"Error validating UseCase IDs: {str(e)}"
                })
        
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
            is_active=False,  # Set inactive for onboarding
        )
        print(f"   ✅ Created user '{admin_name}' in public schema (inactive)")
        
        # Get the user who created the tenant (if available)
        created_by_user = None
        request = self.context.get('request')
        if request and hasattr(request, 'user') and request.user.is_authenticated:
            created_by_user = request.user
        
        # Create OnboardToken for the admin user
        expires_at = timezone.now() + timedelta(hours=48)
        onboard_token = OnboardToken.objects.create(
            user=admin_user,
            purpose="onboard",
            expires_at=expires_at,
            created_by=created_by_user
        )
        
        # Console log the token
        print("=" * 50)
        print(f"Onboarding Token Created for Tenant Admin:")
        print(f"  Tenant: {tenant.name} ({tenant.schema_name})")
        print(f"  User: {admin_user.username} ({admin_user.email})")
        print(f"  Token: {onboard_token.token}")
        print(f"  Expires at: {expires_at}")
        if created_by_user:
            print(f"  Created by: {created_by_user.username}")
        print("=" * 50)
        sys.stdout.flush()

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

        # Initialize tenant users_in_use count to 0
        # It will be incremented when the admin user completes onboarding
        Tenant.objects.filter(id=tenant.id).update(users_in_use=0)

        # Store token in tenant instance for serializer response
        tenant._onboard_token = str(onboard_token.token)
        tenant._onboard_token_expires_at = expires_at.isoformat()
        tenant._admin_username = admin_user.username
        tenant._admin_email = admin_user.email

        print("✅ Tenant creation complete")
        return tenant

    def update(self, instance, validated_data):
        """
        Update tenant's seats_allowed and allowed_apps.
        Updates Tenant table, registry.App entries in tenant schema, and admin UserRole.allowed_apps.
        """
        print(f"TenantSerializer.update called for tenant {instance.name}", validated_data)
        
        # Only allow updating seats_allowed and allowed_apps
        # Remove other fields that shouldn't be updated
        validated_data.pop("name", None)
        validated_data.pop("schema_name", None)
        validated_data.pop("primary_domain", None)
        validated_data.pop("project_cap", None)
        validated_data.pop("projects_allowed", None)
        validated_data.pop("admin_name", None)
        validated_data.pop("admin_email", None)
        validated_data.pop("admin_password", None)
        
        # Extract allowed_apps if present
        allowed_apps = validated_data.pop("allowed_apps", None)
        seats_allowed = validated_data.get("seats_allowed", None)
        
        # Ensure we're in public schema
        try:
            connection.set_schema_to_public()
        except Exception:
            pass
        
        # Validate allowed_apps if provided
        resolved_usecase_ids = []
        if allowed_apps is not None:
            # Validate UseCase IDs exist in public schema
            print(f"→ Validating UseCase IDs from trinity_v1_apps: {allowed_apps}")
            try:
                usecases = UseCase.objects.filter(id__in=allowed_apps)
                found_usecase_ids = set(usecases.values_list('id', flat=True))
                missing_ids = set(allowed_apps) - found_usecase_ids
                
                if missing_ids:
                    raise serializers.ValidationError({
                        "allowed_apps": f"UseCase IDs not found in trinity_v1_apps: {list(missing_ids)}"
                    })
                
                resolved_usecase_ids = list(found_usecase_ids)
                print(f"   ✅ Validated {len(resolved_usecase_ids)} UseCase IDs from trinity_v1_apps")
            except Exception as e:
                if isinstance(e, serializers.ValidationError):
                    raise
                raise serializers.ValidationError({
                    "allowed_apps": f"Error validating UseCase IDs: {str(e)}"
                })
        
        try:
            with transaction.atomic():
                # Step 1: Update Tenant in public schema
                with schema_context('public'):
                    if seats_allowed is not None:
                        instance.seats_allowed = seats_allowed
                    if allowed_apps is not None:
                        instance.allowed_apps = resolved_usecase_ids
                    instance.save(update_fields=['seats_allowed', 'allowed_apps'])
                    print(f"→ Updated tenant {instance.name}: seats_allowed={seats_allowed}, allowed_apps={resolved_usecase_ids}")
                
                # Step 2: Update registry.App entries in tenant schema (if allowed_apps changed)
                if allowed_apps is not None:
                    # Get current App entries in tenant schema
                    with schema_context(instance.schema_name):
                        current_apps = App.objects.all()
                        current_usecase_ids = set(app.usecase_id for app in current_apps if app.usecase_id)
                        
                        new_usecase_ids = set(resolved_usecase_ids)
                        apps_to_add = new_usecase_ids - current_usecase_ids
                        apps_to_remove = current_usecase_ids - new_usecase_ids
                        
                        print(f"→ Current UseCase IDs in tenant schema: {current_usecase_ids}")
                        print(f"→ New UseCase IDs: {new_usecase_ids}")
                        print(f"→ Apps to add: {apps_to_add}")
                        print(f"→ Apps to remove: {apps_to_remove}")
                        
                        # Ensure we're in public schema to query UseCase
                        try:
                            connection.set_schema_to_public()
                        except Exception:
                            pass
                        
                        # Add new apps
                        allowed_app_ids = []
                        if apps_to_add:
                            usecases_to_add = UseCase.objects.filter(id__in=apps_to_add)
                            with schema_context(instance.schema_name):
                                for usecase in usecases_to_add:
                                    try:
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
                                            print(f"   ✅ Added app: {usecase.name} (UseCase ID: {usecase.id}, App ID: {obj.id})")
                                        else:
                                            print(f"   ♻️  Updated app: {usecase.name} (UseCase ID: {usecase.id}, App ID: {obj.id})")
                                    except Exception as e:
                                        print(f"   ⚠️  Error adding app '{usecase.slug}': {e}")
                                        continue
                        
                        # Remove apps that are no longer in allowed_apps
                        if apps_to_remove:
                            with schema_context(instance.schema_name):
                                apps_to_delete = App.objects.filter(usecase_id__in=apps_to_remove)
                                deleted_count = apps_to_delete.count()
                                apps_to_delete.delete()
                                print(f"   🗑️  Deleted {deleted_count} app(s) that are no longer allowed")
                        
                        # Get all App IDs for apps that are still allowed
                        with schema_context(instance.schema_name):
                            remaining_apps = App.objects.filter(usecase_id__in=resolved_usecase_ids)
                            allowed_app_ids = list(remaining_apps.values_list('id', flat=True))
                            print(f"   📊 Total apps after update: {len(allowed_app_ids)}")
                        
                        # Step 3: Update admin UserRole.allowed_apps
                        with schema_context('public'):
                            # Find admin user via UserTenant mapping
                            user_tenant = UserTenant.objects.filter(tenant=instance, is_primary=True).first()
                            if not user_tenant:
                                user_tenant = UserTenant.objects.filter(tenant=instance).first()
                            
                            if user_tenant:
                                admin_user = user_tenant.user
                                with schema_context(instance.schema_name):
                                    user_role = UserRole.objects.filter(
                                        user=admin_user,
                                        role=UserRole.ROLE_ADMIN
                                    ).first()
                                    
                                    if user_role:
                                        user_role.allowed_apps = allowed_app_ids
                                        user_role.save(update_fields=['allowed_apps'])
                                        print(f"   ✅ Updated admin UserRole.allowed_apps: {admin_user.username} - {allowed_app_ids}")
                                    else:
                                        print(f"   ⚠️  No UserRole found for admin user {admin_user.username}")
                            else:
                                print(f"   ⚠️  No admin user found for tenant {instance.name}")
                
        except Exception as e:
            import traceback
            import sys
            print(f"Error updating tenant {instance.name}: {e}")
            print(traceback.format_exc())
            sys.stdout.flush()
            raise
        
        return instance


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
