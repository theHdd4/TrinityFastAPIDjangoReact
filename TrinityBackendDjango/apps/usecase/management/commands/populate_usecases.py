from django.core.management.base import BaseCommand
from apps.usecase.models import UseCase
from apps.usecase.sync_utils import MoleculeAtomSync


class Command(BaseCommand):
    help = 'Populate the UseCase table with predefined use cases using dynamic sync from frontend'

    def handle(self, *args, **options):
        """
        Populate the UseCase table with apps from frontend.
        Uses dynamic sync from frontend Apps.tsx file.
        """
        # Initialize sync utility
        sync_util = MoleculeAtomSync()
        
        self.stdout.write("🔄 Starting dynamic sync from frontend...")
        
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
                    self.style.ERROR(f"❌ Sync failed: {result['error']}")
                )
                self.stdout.write(
                    self.style.WARNING("⚠️ Falling back to hardcoded apps...")
                )
                
                # Fallback to hardcoded data
                self._fallback_populate()
                
        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f"❌ Unexpected error: {str(e)}")
            )
            self.stdout.write(
                self.style.WARNING("⚠️ Falling back to hardcoded apps...")
            )
            
            # Fallback to hardcoded data
            self._fallback_populate()
    
    def _fallback_populate(self):
        """
        Fallback method to populate with hardcoded data if frontend sync fails.
        """
        sync_util = MoleculeAtomSync()
        
        try:
            # Get fallback molecules and atoms
            all_molecules = sync_util._get_fallback_molecules()
            all_atoms = sync_util.get_all_atoms_from_molecules(all_molecules)
            
            self.stdout.write(f"📦 Using fallback data: {len(all_molecules)} molecules, {len(all_atoms)} atoms")
            
        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f"❌ Even fallback failed: {e}")
            )
            return
        
        # Hardcoded fallback apps
        use_cases_data = [
            {
                'name': 'Marketing Mix Modeling',
                'slug': 'marketing-mix',
                'description': 'Preset: Pre-process + Build',
                'molecules': all_molecules,
                'atoms': all_atoms
            },
            {
                'name': 'Forecasting Analysis',
                'slug': 'forecasting',
                'description': 'Preset: Pre-process + Explore',
                'molecules': all_molecules,
                'atoms': all_atoms
            },
            {
                'name': 'Promo Effectiveness',
                'slug': 'promo-effectiveness',
                'description': 'Preset: Explore + Build',
                'molecules': all_molecules,
                'atoms': all_atoms
            },
            {
                'name': 'Blank App',
                'slug': 'blank',
                'description': 'Start from an empty canvas',
                'molecules': all_molecules,
                'atoms': all_atoms
            }
        ]

        created_count = 0
        updated_count = 0

        for usecase_data in use_cases_data:
            usecase, created = UseCase.objects.get_or_create(
                slug=usecase_data['slug'],
                defaults={
                    'name': usecase_data['name'],
                    'description': usecase_data['description'],
                    'molecules': usecase_data['molecules'],
                    'atoms': usecase_data['atoms']
                }
            )
            
            if created:
                created_count += 1
                self.stdout.write(
                    self.style.SUCCESS(f'Created: {usecase.name}')
                )
            else:
                # Update existing record
                usecase.name = usecase_data['name']
                usecase.description = usecase_data['description']
                usecase.molecules = usecase_data['molecules']
                usecase.atoms = usecase_data['atoms']
                usecase.save()
                updated_count += 1
                self.stdout.write(
                    self.style.WARNING(f'Updated: {usecase.name}')
                )

        self.stdout.write(
            self.style.SUCCESS(
                f'Fallback completed: {len(use_cases_data)} use cases. '
                f'Created: {created_count}, Updated: {updated_count}'
            )
        )