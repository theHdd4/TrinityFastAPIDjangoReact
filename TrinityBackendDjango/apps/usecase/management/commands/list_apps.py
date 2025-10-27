from django.core.management.base import BaseCommand
from apps.usecase.models import UseCase


class Command(BaseCommand):
    help = 'List all apps in the database'

    def add_arguments(self, parser):
        parser.add_argument('--detailed', action='store_true', help='Show detailed information')
        parser.add_argument('--format', choices=['table', 'json'], default='table', help='Output format')

    def handle(self, *args, **options):
        """
        List all apps in the database.
        """
        apps = UseCase.objects.all().order_by('name')
        
        if not apps.exists():
            self.stdout.write(
                self.style.WARNING("⚠️ No apps found in database.")
            )
            return
        
        self.stdout.write(f"📱 Found {apps.count()} apps in database:")
        
        if options['format'] == 'json':
            import json
            apps_data = []
            for app in apps:
                apps_data.append({
                    'id': app.id,
                    'name': app.name,
                    'slug': app.slug,
                    'description': app.description,
                    'modules': app.modules,
                    'molecules': app.molecules,
                    'molecule_atoms': app.molecule_atoms,
                    'atoms_in_molecules': app.atoms_in_molecules,
                    'created_at': app.created_at.isoformat() if app.created_at else None,
                    'updated_at': app.updated_at.isoformat() if app.updated_at else None
                })
            
            self.stdout.write(json.dumps(apps_data, indent=2))
            return
        
        # Table format
        for i, app in enumerate(apps, 1):
            self.stdout.write(f"\n{i}. {app.name} ({app.slug})")
            self.stdout.write(f"   Description: {app.description}")
            self.stdout.write(f"   Modules: {app.modules}")
            self.stdout.write(f"   Molecules: {app.molecules}")
            self.stdout.write(f"   Atoms in molecules: {app.atoms_in_molecules}")
            self.stdout.write(f"   ID: {app.id}")
            
            if options['detailed']:
                self.stdout.write(f"   Created: {app.created_at}")
                self.stdout.write(f"   Updated: {app.updated_at}")
        
        self.stdout.write(f"\n📊 Summary:")
        self.stdout.write(f"  • Total apps: {apps.count()}")
