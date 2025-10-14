from django.core.management.base import BaseCommand
from apps.usecase.models import UseCase
from apps.usecase.sync_utils import MoleculeAtomSync


class Command(BaseCommand):
    help = 'Add a new app to the database'

    def add_arguments(self, parser):
        parser.add_argument('--name', required=True, help='App name')
        parser.add_argument('--slug', required=True, help='App slug (URL-friendly)')
        parser.add_argument('--description', required=True, help='App description')
        parser.add_argument('--molecules-only', action='store_true', help='Only add molecules, skip atoms')

    def handle(self, *args, **options):
        """
        Add a new app to the database.
        """
        # Initialize sync utility to get molecules and atoms
        sync_util = MoleculeAtomSync()
        
        try:
            # Get molecules and atoms
            molecules = sync_util.get_molecules_from_frontend()
            atoms = sync_util.get_all_atoms_from_molecules(molecules)
            
            self.stdout.write(f"📦 Found {len(molecules)} molecules and {len(atoms)} atoms")
            
        except Exception as e:
            self.stdout.write(
                self.style.WARNING(f"⚠️ Could not get molecules/atoms: {e}. Using fallback data.")
            )
            # Fallback to hardcoded data
            molecules = sync_util._get_fallback_molecules()
            atoms = sync_util.get_all_atoms_from_molecules(molecules)
        
        # Check if app already exists
        if UseCase.objects.filter(slug=options['slug']).exists():
            self.stdout.write(
                self.style.ERROR(f"❌ App with slug '{options['slug']}' already exists!")
            )
            return
        
        # Create new app
        app_data = {
            'name': options['name'],
            'slug': options['slug'],
            'description': options['description'],
            'molecules': molecules,
            'atoms': atoms if not options['molecules_only'] else []
        }
        
        try:
            usecase = UseCase.objects.create(**app_data)
            
            self.stdout.write(
                self.style.SUCCESS(
                    f"✅ Successfully created app: {usecase.name}"
                )
            )
            self.stdout.write(f"📊 App details:")
            self.stdout.write(f"  • Name: {usecase.name}")
            self.stdout.write(f"  • Slug: {usecase.slug}")
            self.stdout.write(f"  • Description: {usecase.description}")
            self.stdout.write(f"  • Molecules: {len(usecase.molecules)}")
            self.stdout.write(f"  • Atoms: {len(usecase.atoms)}")
            self.stdout.write(f"  • ID: {usecase.id}")
            
        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f"❌ Error creating app: {str(e)}")
            )
            raise
