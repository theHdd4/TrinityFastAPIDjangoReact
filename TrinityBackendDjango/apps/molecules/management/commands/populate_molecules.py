from django.core.management.base import BaseCommand
from apps.molecules.models import Molecule
from apps.trinity_v1_atoms.models import TrinityV1Atom


class Command(BaseCommand):
    help = 'Populate the Molecule table with data from molecules.ts'

    def handle(self, *args, **options):
        """
        Populate the Molecule table with predefined molecules using real atom IDs from the atom library.
        Updated to use correct atom IDs from TrinityV1Atom model instead of dummy atom names.
        """
        # Data from molecules.ts - Updated to use correct atom IDs from atom library
        molecules_data = [
            {
                'molecule_id': 'build',
                'name': 'Build',
                'type': 'Build',
                'subtitle': 'Model building and creation',
                'tag': 'Modeling',
                'atoms': [
                    'auto-regressive-models',
                    'build-model-feature-based',
                    'regression-feature-based'
                ]
            },
            {
                'molecule_id': 'data-pre-process',
                'name': 'Data Pre-Process',
                'type': 'Data Pre-Process',
                'subtitle': 'Data preparation and processing',
                'tag': 'Data Processing',
                'atoms': [
                    'data-upload-validate',
                    'feature-overview',
                    'dataframe-operations',
                    'clustering'
                ]
            },
            {
                'molecule_id': 'explore',
                'name': 'Explore',
                'type': 'Explore',
                'subtitle': 'Data exploration and analysis',
                'tag': 'Exploration',
                'atoms': [
                    'correlation',
                    'explore',
                    'descriptive-stats',
                    'chart-maker'
                ]
            },
            {
                'molecule_id': 'engineer',
                'name': 'Engineer',
                'type': 'Engineer',
                'subtitle': 'Model engineering and algorithm synthesis',
                'tag': 'Engineering',
                'atoms': [
                    'select-models-feature',
                    'evaluate-models-feature',
                    'merge',
                    'concat'
                ]
            },
            {
                'molecule_id': 'pre-process',
                'name': 'Pre Process',
                'type': 'Pre Process',
                'subtitle': 'Initial data preprocessing',
                'tag': 'Preprocessing',
                'atoms': [
                    'feature-overview',
                    'groupby-wtg-avg',
                    'scope-selector'
                ]
            },
            {
                'molecule_id': 'evaluate',
                'name': 'Evaluate',
                'type': 'Evaluate',
                'subtitle': 'Model evaluation and results',
                'tag': 'Analysis',
                'atoms': [
                    'evaluate-models-feature',
                    'evaluate-models-auto-regressive',
                    'chart-maker',
                    'descriptive-stats'
                ]
            },
            {
                'molecule_id': 'plan',
                'name': 'Plan',
                'type': 'Plan',
                'subtitle': 'Planning tasks and workflows',
                'tag': 'Planning',
                'atoms': [
                    'scenario-planner',
                    'optimizer'
                ]
            },
            {
                'molecule_id': 'report',
                'name': 'Report',
                'type': 'Report',
                'subtitle': 'Reporting and presentation',
                'tag': 'Reporting',
                'atoms': [
                    'chart-maker',
                    'text-box',
                    'histogram',
                    'scatter-plot'
                ]
            }
        ]

        created_count = 0
        updated_count = 0

        # Validate that all atoms exist in the atom library and no molecule has more than 4 atoms
        all_atom_ids = set()
        molecules_with_too_many_atoms = []
        
        for mol_data in molecules_data:
            all_atom_ids.update(mol_data['atoms'])
            
            # Check if molecule has more than 4 atoms
            if len(mol_data['atoms']) > 4:
                molecules_with_too_many_atoms.append(f"{mol_data['name']} ({mol_data['molecule_id']}) has {len(mol_data['atoms'])} atoms")
        
        existing_atoms = set(TrinityV1Atom.objects.values_list('atom_id', flat=True))
        missing_atoms = all_atom_ids - existing_atoms
        
        if missing_atoms:
            self.stdout.write(
                self.style.WARNING(
                    f'⚠️  Warning: The following atoms are not found in the atom library: {sorted(missing_atoms)}\n'
                    'Some molecules may have invalid atom references.'
                )
            )
        
        if molecules_with_too_many_atoms:
            self.stdout.write(
                self.style.ERROR(
                    f'❌ Error: The following molecules exceed the 4-atom limit:\n' +
                    '\n'.join(f'  • {mol}' for mol in molecules_with_too_many_atoms) +
                    '\nPlease reduce atoms to maximum 4 per molecule.'
                )
            )
            return

        for mol_data in molecules_data:
            molecule, created = Molecule.objects.get_or_create(
                molecule_id=mol_data['molecule_id'],
                defaults={
                    'name': mol_data['name'],
                    'type': mol_data['type'],
                    'subtitle': mol_data['subtitle'],
                    'tag': mol_data['tag'],
                    'atoms': mol_data['atoms']
                }
            )
            
            if created:
                created_count += 1
                self.stdout.write(
                    self.style.SUCCESS(f'✅ Created: {molecule.name} ({molecule.molecule_id})')
                )
            else:
                # Update existing record
                molecule.name = mol_data['name']
                molecule.type = mol_data['type']
                molecule.subtitle = mol_data['subtitle']
                molecule.tag = mol_data['tag']
                molecule.atoms = mol_data['atoms']
                molecule.save()
                updated_count += 1
                self.stdout.write(
                    self.style.WARNING(f'🔄 Updated: {molecule.name} ({molecule.molecule_id})')
                )

        self.stdout.write(
            self.style.SUCCESS(
                f'\n✅ Successfully processed {len(molecules_data)} molecules. '
                f'Created: {created_count}, Updated: {updated_count}'
            )
        )

