from django.core.management.base import BaseCommand
from apps.molecules.models import Molecule
from apps.trinity_v1_atoms.models import TrinityV1Atom


class Command(BaseCommand):
    help = 'Update molecules to use atom IDs instead of atom names'

    def handle(self, *args, **options):
        """
        Update molecules to use atom IDs from trinity_v1_atoms table.
        """
        # Get all atoms for mapping
        atoms = {atom.name: atom.id for atom in TrinityV1Atom.objects.all()}
        
        # Original molecule data with atom names
        molecules_data = {
            'build': ['Auto-regressive models', 'Model Output - Non CSF', 'Single Modeling'],
            'data-pre-process': ['Base Price Estimator', 'Clustering', 'Data Preparation', 'Promo Comparison', 'Promotion Intensity Analysis'],
            'explore': ['Correlation', 'Depth Ladder', 'EDA', 'Promo Comparison', 'Promotion Intensity Analysis'],
            'engineer': ['Bulk Model Output - CSF', 'Bulk Modeling', 'Key Selector', 'Model Performance', 'Model Selector', 'Concatination', 'Create or Transform', 'Delete', 'Merge', 'Rename'],
            'pre-process': ['Feature Over View', 'GroupBy'],
            'evaluate': [],
            'plan': [],
            'report': []
        }
        
        updated_count = 0
        
        for molecule in Molecule.objects.all():
            if molecule.molecule_id in molecules_data:
                atom_names = molecules_data[molecule.molecule_id]
                atom_ids = []
                
                for atom_name in atom_names:
                    # Try to find matching atom by name
                    matching_atom = TrinityV1Atom.objects.filter(name__icontains=atom_name).first()
                    if matching_atom:
                        atom_ids.append(matching_atom.id)
                        self.stdout.write(f'  ✅ Mapped "{atom_name}" to atom ID {matching_atom.id}')
                    else:
                        self.stdout.write(f'  ⚠️  Could not find atom for "{atom_name}"')
                
                # Update the molecule with atom IDs
                molecule.atoms = atom_ids
                molecule.save()
                updated_count += 1
                
                self.stdout.write(
                    self.style.SUCCESS(f'✅ Updated {molecule.name}: {atom_ids}')
                )
        
        self.stdout.write(
            self.style.SUCCESS(
                f'\n✅ Successfully updated {updated_count} molecules with atom IDs'
            )
        )
