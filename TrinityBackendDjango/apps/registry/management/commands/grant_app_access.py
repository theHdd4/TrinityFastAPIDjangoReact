"""
Management command to grant app access to tenants.

Usage:
    # Grant access to all apps for a tenant
    python manage.py grant_app_access --tenant example_tenant --all
    
    # Grant access to specific apps
    python manage.py grant_app_access --tenant example_tenant --apps marketing-mix forecasting
    
    # Grant access to all tenants
    python manage.py grant_app_access --all-tenants --all
    
    # Revoke access to specific apps
    python manage.py grant_app_access --tenant example_tenant --apps marketing-mix --revoke
"""

from django.core.management.base import BaseCommand, CommandError
from django_tenants.utils import schema_context, get_tenant_model
from apps.registry.models import App
from apps.usecase.models import UseCase


class Command(BaseCommand):
    help = 'Grant or revoke app access to tenants'

    def add_arguments(self, parser):
        parser.add_argument(
            '--tenant',
            type=str,
            help='Schema name of the tenant'
        )
        parser.add_argument(
            '--all-tenants',
            action='store_true',
            help='Apply to all tenants'
        )
        parser.add_argument(
            '--apps',
            nargs='+',
            help='App slugs to grant access to'
        )
        parser.add_argument(
            '--all',
            action='store_true',
            dest='all_apps',
            help='Grant access to all available apps'
        )
        parser.add_argument(
            '--revoke',
            action='store_true',
            help='Revoke access instead of granting'
        )
        parser.add_argument(
            '--disable',
            action='store_true',
            help='Disable app access instead of deleting'
        )

    def handle(self, *args, **options):
        TenantModel = get_tenant_model()
        
        # Validate arguments
        if not options['tenant'] and not options['all_tenants']:
            raise CommandError('Please specify --tenant or --all-tenants')
        
        if not options['apps'] and not options['all_apps']:
            raise CommandError('Please specify --apps or --all')
        
        # Get tenants
        if options['all_tenants']:
            tenants = TenantModel.objects.exclude(schema_name='public')
            self.stdout.write(f"Processing {tenants.count()} tenants...")
        else:
            try:
                tenants = [TenantModel.objects.get(schema_name=options['tenant'])]
            except TenantModel.DoesNotExist:
                raise CommandError(f"Tenant '{options['tenant']}' not found")
        
        # Get apps from public schema
        if options['all_apps']:
            usecases = UseCase.objects.all()
            self.stdout.write(f"Found {usecases.count()} apps in public.usecase")
        else:
            usecases = UseCase.objects.filter(slug__in=options['apps'])
            if not usecases.exists():
                raise CommandError(f"No apps found with slugs: {options['apps']}")
        
        # Process each tenant
        for tenant in tenants:
            self.stdout.write(f"\n{'='*60}")
            self.stdout.write(f"Tenant: {tenant.schema_name} ({tenant.name})")
            self.stdout.write(f"{'='*60}")
            
            with schema_context(tenant.schema_name):
                for usecase in usecases:
                    if options['revoke']:
                        # Revoke access
                        if options['disable']:
                            # Just disable
                            updated = App.objects.filter(
                                usecase_id=usecase.id
                            ).update(is_enabled=False)
                            if updated:
                                self.stdout.write(
                                    self.style.WARNING(
                                        f"  ⚠ Disabled: {usecase.name} ({usecase.slug})"
                                    )
                                )
                        else:
                            # Delete
                            deleted, _ = App.objects.filter(
                                usecase_id=usecase.id
                            ).delete()
                            if deleted:
                                self.stdout.write(
                                    self.style.ERROR(
                                        f"  ❌ Revoked: {usecase.name} ({usecase.slug})"
                                    )
                                )
                    else:
                        # Grant access
                        app, created = App.objects.update_or_create(
                            usecase_id=usecase.id,
                            defaults={
                                'name': usecase.name,
                                'slug': usecase.slug,
                                'description': usecase.description,
                                'is_enabled': True,
                                'custom_config': {}
                            }
                        )
                        if created:
                            self.stdout.write(
                                self.style.SUCCESS(
                                    f"  ✅ Granted: {usecase.name} ({usecase.slug})"
                                )
                            )
                        else:
                            self.stdout.write(
                                self.style.WARNING(
                                    f"  ♻️ Updated: {usecase.name} ({usecase.slug}) - re-enabled"
                                )
                            )
        
        self.stdout.write(f"\n{'='*60}")
        self.stdout.write(self.style.SUCCESS('✨ Operation completed successfully!'))

