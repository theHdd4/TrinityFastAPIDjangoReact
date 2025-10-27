from django.core.management.base import BaseCommand
from apps.usecase.models import UseCase


class Command(BaseCommand):
    help = 'Add a new app to the database'

    def add_arguments(self, parser):
        parser.add_argument('--name', required=True, help='App name')
        parser.add_argument('--slug', required=True, help='App slug (URL-friendly)')
        parser.add_argument('--description', required=True, help='App description')
        parser.add_argument('--modules', nargs='*', default=[], help='List of module IDs for this app')
        parser.add_argument('--molecules', nargs='*', default=[], help='List of molecule IDs for this app')

    def handle(self, *args, **options):
        """
        Add a new app to the database.
        """
        # Check if app already exists
        if UseCase.objects.filter(slug=options['slug']).exists():
            self.stdout.write(
                self.style.ERROR(f"❌ App with slug '{options['slug']}' already exists!")
            )
            return
        
        # Create new app
        try:
            usecase = UseCase.objects.create(
                name=options['name'],
                slug=options['slug'],
                description=options['description'],
                modules=options['modules'],
                molecules=options['molecules'],
                molecule_atoms={},  # Will be populated separately
                atoms_in_molecules=[]  # Will be populated separately
            )
            
            self.stdout.write(
                self.style.SUCCESS(
                    f"✅ Successfully created app: {usecase.name}"
                )
            )
            self.stdout.write(f"📊 App details:")
            self.stdout.write(f"  • Name: {usecase.name}")
            self.stdout.write(f"  • Slug: {usecase.slug}")
            self.stdout.write(f"  • Description: {usecase.description}")
            self.stdout.write(f"  • Modules: {usecase.modules}")
            self.stdout.write(f"  • Molecules: {usecase.molecules}")
            self.stdout.write(f"  • Molecule atoms: {usecase.molecule_atoms}")
            self.stdout.write(f"  • Atoms in molecules: {usecase.atoms_in_molecules}")
            self.stdout.write(f"  • ID: {usecase.id}")
            
        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f"❌ Error creating app: {str(e)}")
            )
            raise
