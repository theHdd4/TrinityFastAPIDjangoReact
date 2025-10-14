from django.core.management.base import BaseCommand
from apps.usecase.models import UseCase
from apps.usecase.sync_utils import MoleculeAtomSync


class Command(BaseCommand):
    help = 'Sync app definitions from frontend Apps.tsx to the database'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be synced without making changes',
        )
        parser.add_argument(
            '--frontend-path',
            type=str,
            help='Path to the frontend directory (auto-detected if not provided)',
        )

    def handle(self, *args, **options):
        """
        Sync app definitions from frontend to database.
        """
        # Initialize sync utility
        frontend_path = options.get('frontend_path')
        sync_util = MoleculeAtomSync(frontend_path)
        
        self.stdout.write("🔄 Starting app sync from frontend...")
        
        if options['dry_run']:
            self.stdout.write("🔍 DRY RUN - No changes will be made")
            
            try:
                # Get apps from frontend
                frontend_apps = sync_util.get_apps_from_frontend()
                molecules = sync_util.get_molecules_from_frontend()
                atoms = sync_util.get_all_atoms_from_molecules(molecules)
                
                self.stdout.write(f"📱 Found {len(frontend_apps)} apps in frontend:")
                for app in frontend_apps:
                    self.stdout.write(f"  • {app['name']} ({app['slug']})")
                    self.stdout.write(f"    Description: {app['description']}")
                
                self.stdout.write(f"\n📦 Molecules: {len(molecules)}")
                self.stdout.write(f"📦 Atoms: {len(atoms)}")
                
                # Show current database state
                existing_usecases = UseCase.objects.all()
                self.stdout.write(f"\n🗄️ Current database has {existing_usecases.count()} use cases:")
                for uc in existing_usecases:
                    self.stdout.write(f"  • {uc.name} ({uc.slug})")
                
                return
                
            except Exception as e:
                self.stdout.write(
                    self.style.ERROR(f"❌ Dry run failed: {str(e)}")
                )
                return
        
        try:
            # Sync apps from frontend to database
            result = sync_util.sync_apps_to_database(UseCase)
            
            if result['success']:
                self.stdout.write(
                    self.style.SUCCESS(
                        f"✅ Successfully synced {result['apps_count']} apps from frontend!"
                    )
                )
                self.stdout.write(f"📊 Results:")
                self.stdout.write(f"  • Apps found: {result['apps_count']}")
                self.stdout.write(f"  • Molecules: {result['molecules_count']}")
                self.stdout.write(f"  • Atoms: {result['atoms_count']}")
                self.stdout.write(f"  • Created: {result['created_usecases']}")
                self.stdout.write(f"  • Updated: {result['updated_usecases']}")
                
                # Show which apps were processed
                self.stdout.write("\n📱 Apps processed:")
                try:
                    frontend_apps = sync_util.get_apps_from_frontend()
                    for app in frontend_apps:
                        self.stdout.write(f"  • {app['name']} ({app['slug']})")
                except Exception as e:
                    self.stdout.write(f"  ⚠️ Could not list apps: {e}")
                    
            else:
                self.stdout.write(
                    self.style.ERROR(f"❌ App sync failed: {result['error']}")
                )
                
        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f"❌ Unexpected error: {str(e)}")
            )
            raise
