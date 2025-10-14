from django.core.management.base import BaseCommand
from django.core.management import call_command
from apps.usecase.models import UseCase
from apps.usecase.sync_utils import MoleculeAtomSync


class Command(BaseCommand):
    help = 'Automatically sync molecules and atoms - can be run during migrations'

    def add_arguments(self, parser):
        parser.add_argument(
            '--force',
            action='store_true',
            help='Force sync even if no changes detected'
        )

    def handle(self, *args, **options):
        """
        Automatically sync molecules and atoms from frontend.
        This command is designed to be run during migrations or as a scheduled task.
        """
        force = options.get('force', False)
        
        self.stdout.write("🤖 Auto-syncing molecules and atoms...")
        
        try:
            # Initialize sync utility
            sync_util = MoleculeAtomSync()
            
            # Get current data from frontend
            frontend_molecules = sync_util.get_molecules_from_frontend()
            frontend_atoms = sync_util.get_all_atoms_from_molecules(frontend_molecules)
            
            # Get current data from database
            usecase = UseCase.objects.first()
            if usecase:
                db_molecules = usecase.molecules
                db_atoms = usecase.atoms
                
                # Check if sync is needed
                molecules_changed = db_molecules != frontend_molecules
                atoms_changed = db_atoms != frontend_atoms
                
                if not (molecules_changed or atoms_changed) and not force:
                    self.stdout.write("✅ Database is already up to date with frontend")
                    return
                
                if molecules_changed:
                    self.stdout.write("🔄 Molecules have changed in frontend")
                if atoms_changed:
                    self.stdout.write("🔄 Atoms have changed in frontend")
            
            # Perform sync
            result = sync_util.sync_to_database(UseCase)
            
            if result['success']:
                self.stdout.write(
                    self.style.SUCCESS(
                        f"✅ Auto-sync completed: {result['molecules_count']} molecules, "
                        f"{result['atoms_count']} atoms, {result['updated_usecases']} use cases updated"
                    )
                )
            else:
                self.stdout.write(
                    self.style.WARNING(f"⚠️ Auto-sync had issues: {result['error']}")
                )
                
        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f"❌ Auto-sync failed: {str(e)}")
            )
            # Don't raise exception for auto-sync to avoid breaking migrations
            self.stdout.write("⚠️ Continuing despite sync failure...")
