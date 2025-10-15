"""
Management command to list app access for tenants.

Usage:
    # List apps for a specific tenant
    python manage.py list_tenant_apps --tenant example_tenant
    
    # List apps for all tenants
    python manage.py list_tenant_apps --all-tenants
    
    # Show only enabled apps
    python manage.py list_tenant_apps --tenant example_tenant --enabled-only
"""

from django.core.management.base import BaseCommand, CommandError
from django_tenants.utils import schema_context, get_tenant_model
from apps.registry.models import App


class Command(BaseCommand):
    help = 'List app access for tenants'

    def add_arguments(self, parser):
        parser.add_argument(
            '--tenant',
            type=str,
            help='Schema name of the tenant'
        )
        parser.add_argument(
            '--all-tenants',
            action='store_true',
            help='List apps for all tenants'
        )
        parser.add_argument(
            '--enabled-only',
            action='store_true',
            help='Show only enabled apps'
        )

    def handle(self, *args, **options):
        TenantModel = get_tenant_model()
        
        # Get tenants
        if options['all_tenants']:
            tenants = TenantModel.objects.exclude(schema_name='public')
        elif options['tenant']:
            try:
                tenants = [TenantModel.objects.get(schema_name=options['tenant'])]
            except TenantModel.DoesNotExist:
                raise CommandError(f"Tenant '{options['tenant']}' not found")
        else:
            raise CommandError('Please specify --tenant or --all-tenants')
        
        # Process each tenant
        for tenant in tenants:
            self.stdout.write(f"\n{'='*70}")
            self.stdout.write(
                self.style.HTTP_INFO(
                    f"📊 Tenant: {tenant.schema_name} ({tenant.name})"
                )
            )
            self.stdout.write(f"{'='*70}")
            
            with schema_context(tenant.schema_name):
                if options['enabled_only']:
                    apps = App.objects.filter(is_enabled=True)
                else:
                    apps = App.objects.all()
                
                if not apps.exists():
                    self.stdout.write(
                        self.style.WARNING("  ⚠️  No apps found for this tenant")
                    )
                    continue
                
                self.stdout.write(f"\n  Total Apps: {apps.count()}")
                self.stdout.write(f"  Enabled: {apps.filter(is_enabled=True).count()}")
                self.stdout.write(f"  Disabled: {apps.filter(is_enabled=False).count()}\n")
                
                # Table header
                self.stdout.write(
                    f"  {'ID':<5} {'UseCase ID':<12} {'Slug':<25} {'Name':<30} {'Status':<10}"
                )
                self.stdout.write(f"  {'-'*5} {'-'*12} {'-'*25} {'-'*30} {'-'*10}")
                
                # List apps
                for app in apps:
                    status = '✅ Enabled' if app.is_enabled else '❌ Disabled'
                    status_style = self.style.SUCCESS if app.is_enabled else self.style.ERROR
                    
                    self.stdout.write(
                        f"  {app.id:<5} {app.usecase_id:<12} {app.slug:<25} "
                        f"{app.name[:28]:<30} {status_style(status)}"
                    )
                    
                    # Show custom config if present
                    if app.custom_config:
                        self.stdout.write(
                            self.style.WARNING(
                                f"       └─ Custom Config: {app.custom_config}"
                            )
                        )
        
        self.stdout.write(f"\n{'='*70}")
        self.stdout.write(self.style.SUCCESS('✨ Listing completed!'))

