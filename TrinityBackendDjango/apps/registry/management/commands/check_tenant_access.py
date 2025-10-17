"""
Management command to check app access for tenants and show the relationship between
public.usecase and tenant-specific registry.App tables.

Usage:
    # Check access for a specific tenant
    python manage.py check_tenant_access --tenant example_tenant
    
    # Check access for all tenants
    python manage.py check_tenant_access --all-tenants
    
    # Show which tenants have access to a specific app
    python manage.py check_tenant_access --app marketing-mix
"""

from django.core.management.base import BaseCommand, CommandError
from django_tenants.utils import schema_context, get_tenant_model
from apps.registry.models import App as TenantApp
from apps.usecase.models import UseCase


class Command(BaseCommand):
    help = 'Check app access control for tenants'

    def add_arguments(self, parser):
        parser.add_argument(
            '--tenant',
            type=str,
            help='Schema name of the tenant to check'
        )
        parser.add_argument(
            '--all-tenants',
            action='store_true',
            help='Check all tenants'
        )
        parser.add_argument(
            '--app',
            type=str,
            help='App slug - show which tenants have access to this app'
        )

    def handle(self, *args, **options):
        TenantModel = get_tenant_model()
        
        # Mode 1: Show which tenants have access to a specific app
        if options['app']:
            self.show_app_access_across_tenants(options['app'])
            return
        
        # Mode 2: Show app access for specific tenant(s)
        if options['all_tenants']:
            tenants = TenantModel.objects.exclude(schema_name='public')
        elif options['tenant']:
            try:
                tenants = [TenantModel.objects.get(schema_name=options['tenant'])]
            except TenantModel.DoesNotExist:
                raise CommandError(f"Tenant '{options['tenant']}' not found")
        else:
            raise CommandError('Please specify --tenant, --all-tenants, or --app')
        
        self.show_tenant_app_access(tenants)
    
    def show_app_access_across_tenants(self, app_slug):
        """Show which tenants have access to a specific app"""
        TenantModel = get_tenant_model()
        
        # Get the app from public schema
        try:
            usecase = UseCase.objects.get(slug=app_slug)
        except UseCase.DoesNotExist:
            raise CommandError(f"App '{app_slug}' not found in public.usecase table")
        
        self.stdout.write(f"\n{'='*80}")
        self.stdout.write(self.style.HTTP_INFO(
            f"📊 App Access Report: {usecase.name} ({usecase.slug})"
        ))
        self.stdout.write(f"{'='*80}")
        self.stdout.write(f"\n🔍 UseCase ID: {usecase.id}")
        self.stdout.write(f"📝 Description: {usecase.description}\n")
        
        # Check each tenant
        tenants = TenantModel.objects.exclude(schema_name='public')
        enabled_tenants = []
        disabled_tenants = []
        no_access_tenants = []
        
        for tenant in tenants:
            with schema_context(tenant.schema_name):
                try:
                    tenant_app = TenantApp.objects.get(usecase_id=usecase.id)
                    if tenant_app.is_enabled:
                        enabled_tenants.append((tenant, tenant_app))
                    else:
                        disabled_tenants.append((tenant, tenant_app))
                except TenantApp.DoesNotExist:
                    no_access_tenants.append(tenant)
        
        # Display results
        self.stdout.write(self.style.SUCCESS(
            f"\n✅ Tenants with ENABLED access ({len(enabled_tenants)}):"
        ))
        for tenant, app in enabled_tenants:
            self.stdout.write(f"  • {tenant.name} ({tenant.schema_name}) - App ID: {app.id}")
        
        if disabled_tenants:
            self.stdout.write(self.style.WARNING(
                f"\n⚠️  Tenants with DISABLED access ({len(disabled_tenants)}):"
            ))
            for tenant, app in disabled_tenants:
                self.stdout.write(f"  • {tenant.name} ({tenant.schema_name}) - App ID: {app.id}")
        
        if no_access_tenants:
            self.stdout.write(self.style.ERROR(
                f"\n❌ Tenants with NO access ({len(no_access_tenants)}):"
            ))
            for tenant in no_access_tenants:
                self.stdout.write(f"  • {tenant.name} ({tenant.schema_name})")
        
        self.stdout.write(f"\n{'='*80}")
    
    def show_tenant_app_access(self, tenants):
        """Show app access for specific tenant(s)"""
        # Get all apps from public schema for reference
        all_usecases = {uc.id: uc for uc in UseCase.objects.all()}
        
        for tenant in tenants:
            self.stdout.write(f"\n{'='*80}")
            self.stdout.write(self.style.HTTP_INFO(
                f"🏢 Client/Tenant: {tenant.name}"
            ))
            self.stdout.write(f"📌 Schema: {tenant.schema_name}")
            self.stdout.write(f"🌐 Domain: {tenant.domain_url if hasattr(tenant, 'domain_url') else 'N/A'}")
            self.stdout.write(f"{'='*80}\n")
            
            with schema_context(tenant.schema_name):
                tenant_apps = TenantApp.objects.all().order_by('name')
                
                if not tenant_apps.exists():
                    self.stdout.write(self.style.WARNING(
                        "  ⚠️  No apps configured for this tenant!\n"
                        "  Run: python manage.py grant_app_access --tenant {schema} --all"
                    ))
                    continue
                
                # Show summary
                enabled_count = tenant_apps.filter(is_enabled=True).count()
                disabled_count = tenant_apps.filter(is_enabled=False).count()
                
                self.stdout.write(f"📊 Total Apps: {tenant_apps.count()}")
                self.stdout.write(self.style.SUCCESS(f"✅ Enabled: {enabled_count}"))
                self.stdout.write(self.style.ERROR(f"❌ Disabled: {disabled_count}"))
                
                # Show table
                self.stdout.write(f"\n  {'Status':<10} {'App Name':<30} {'Slug':<25} {'UseCase ID':<12} {'Molecules':<10}")
                self.stdout.write(f"  {'-'*10} {'-'*30} {'-'*25} {'-'*12} {'-'*10}")
                
                for app in tenant_apps:
                    status_icon = '✅' if app.is_enabled else '❌'
                    status_text = 'ENABLED' if app.is_enabled else 'DISABLED'
                    
                    # Get molecule count from public.usecase if available
                    molecule_count = 'N/A'
                    if app.usecase_id and app.usecase_id in all_usecases:
                        uc = all_usecases[app.usecase_id]
                        molecule_count = len(uc.molecules) if uc.molecules else 0
                    
                    status_style = self.style.SUCCESS if app.is_enabled else self.style.ERROR
                    
                    self.stdout.write(
                        f"  {status_icon} {status_text:<8} "
                        f"{app.name[:28]:<30} "
                        f"{app.slug[:23]:<25} "
                        f"{app.usecase_id if app.usecase_id else 'NULL':<12} "
                        f"{molecule_count:<10}"
                    )
                    
                    # Show custom config if present
                    if app.custom_config:
                        self.stdout.write(self.style.WARNING(
                            f"       └─ Custom Config: {app.custom_config}"
                        ))
                
                self.stdout.write("")  # Empty line
        
        self.stdout.write(f"\n{'='*80}")
        self.stdout.write(self.style.SUCCESS('✨ Access check completed!'))

