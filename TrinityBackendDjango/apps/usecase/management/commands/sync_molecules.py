from django.core.management.base import BaseCommand
from apps.usecase.models import UseCase
from apps.usecase.sync_utils import MoleculeAtomSync


class Command(BaseCommand):
    help = 'Sync molecules and atoms from frontend components to database'

    def add_arguments(self, parser):
        parser.add_argument(
            '--frontend-path',
            type=str,
            help='Path to frontend directory (auto-detected if not provided)'
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be synced without making changes'
        )

    def handle(self, *args, **options):
        """
        Sync molecules and atoms from frontend to database.
        """
        frontend_path = options.get('frontend_path')
        dry_run = options.get('dry_run', False)
        
        self.stdout.write("🔄 Starting molecule/atom sync from frontend...")
        
        try:
            # Initialize sync utility
            sync_util = MoleculeAtomSync(frontend_path)
            
            # Get molecules from frontend
            molecules = sync_util.get_molecules_from_frontend()
            atoms = sync_util.get_all_atoms_from_molecules(molecules)
            
            self.stdout.write(f"📦 Found {len(molecules)} molecules and {len(atoms)} atoms in frontend")
            
            if dry_run:
                self.stdout.write("🔍 DRY RUN - No changes will be made")
                self.stdout.write("Molecules:")
                for i, molecule in enumerate(molecules, 1):
                    self.stdout.write(f"  {i}. {molecule['title']} ({molecule['id']}) - {len(molecule['atoms'])} atoms")
                
                self.stdout.write("\nAtoms:")
                for i, atom in enumerate(atoms, 1):
                    self.stdout.write(f"  {i}. {atom}")
                
                return
            
            # Sync to database
            result = sync_util.sync_to_database(UseCase)
            
            if result['success']:
                self.stdout.write(
                    self.style.SUCCESS(
                        f"✅ Successfully synced {result['molecules_count']} molecules "
                        f"and {result['atoms_count']} atoms to {result['updated_usecases']} use cases"
                    )
                )
                
                # Show summary
                self.stdout.write("\n📊 Summary:")
                self.stdout.write(f"  • Molecules: {result['molecules_count']}")
                self.stdout.write(f"  • Atoms: {result['atoms_count']}")
                self.stdout.write(f"  • Updated UseCases: {result['updated_usecases']}")
                
            else:
                self.stdout.write(
                    self.style.ERROR(f"❌ Sync failed: {result['error']}")
                )
                
        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f"❌ Error during sync: {str(e)}")
            )
            raise
