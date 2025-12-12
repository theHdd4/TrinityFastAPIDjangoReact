from django.core.management.base import BaseCommand
from apps.trinity_v1_atoms.models import TrinityV1Atom


class Command(BaseCommand):
    help = 'Update available_atoms field based on working atoms list'

    def handle(self, *args, **options):
        """
        Update the available_atoms field for atoms that are working/functional.
        """
        
        # List of working atoms provided by user (these are the actual atom_ids from populate command)
        working_atom_ids = [
            'data-upload',
            'data-validate',
            'column-classifier', 
            'dataframe-operations',
            'merge',
            'concat',
            'groupby-wtg-avg',
            'scope-selector',
            'chart-maker',
            'explore',
            'create-column',  # Correct ID from populate command
            'feature-overview',
            'correlation',
            'build-model-feature-based',
            'select-models-feature',
            'evaluate-models-feature',
            'auto-regressive-models',  # Correct ID from populate command
            'scenario-planner',
            'clustering',  # Added missing clustering atom
            'pivot-table',
            'unpivot',
            'table'  # Table atom - display and manipulate data in table format
        ]
        
        updated_count = 0
        not_found_count = 0
        
        # First, set all atoms to False (not available)
        TrinityV1Atom.objects.all().update(available_atoms=False)
        self.stdout.write("🔄 Set all atoms to available_atoms=False")
        
        # Then set working atoms to True
        for atom_id in working_atom_ids:
            try:
                atom = TrinityV1Atom.objects.get(atom_id=atom_id)
                atom.available_atoms = True
                atom.save()
                updated_count += 1
                self.stdout.write(f"✅ Updated {atom.name} ({atom_id}) - available_atoms=True")
            except TrinityV1Atom.DoesNotExist:
                not_found_count += 1
                self.stdout.write(f"❌ Atom not found: {atom_id}")
        
        # Show summary
        total_atoms = TrinityV1Atom.objects.count()
        available_atoms = TrinityV1Atom.objects.filter(available_atoms=True).count()
        
        self.stdout.write(
            self.style.SUCCESS(
                f"\n📊 Summary:\n"
                f"  • Total atoms: {total_atoms}\n"
                f"  • Available atoms: {available_atoms}\n"
                f"  • Updated: {updated_count}\n"
                f"  • Not found: {not_found_count}"
            )
        )
        
        # Show available atoms
        available = TrinityV1Atom.objects.filter(available_atoms=True).values_list('name', 'atom_id')
        if available:
            self.stdout.write("\n🎯 Available Atoms:")
            for name, atom_id in available:
                self.stdout.write(f"  • {name} ({atom_id})")
