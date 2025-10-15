from django.core.management.base import BaseCommand
from apps.molecules.models import Molecule


class Command(BaseCommand):
    help = 'Populate the Molecule table with data from molecules.ts'

    def handle(self, *args, **options):
        """
        Populate the Molecule table with predefined molecules.
        Data source: TrinityFrontend/src/components/MoleculeList/data/molecules.ts
        """
        # Data from molecules.ts
        molecules_data = [
            {
                'molecule_id': 'build',
                'name': 'Build',
                'type': 'Build',
                'subtitle': 'Model building and creation',
                'tag': 'Modeling',
                'atoms': [
                    'Auto-regressive models',
                    'Model Output - Non CSF',
                    'Single Modeling'
                ]
            },
            {
                'molecule_id': 'data-pre-process',
                'name': 'Data Pre-Process',
                'type': 'Data Pre-Process',
                'subtitle': 'Data preparation and processing',
                'tag': 'Data Processing',
                'atoms': [
                    'Base Price Estimator',
                    'Clustering',
                    'Data Preparation',
                    'Promo Comparison',
                    'Promotion Intensity Analysis'
                ]
            },
            {
                'molecule_id': 'explore',
                'name': 'Explore',
                'type': 'Explore',
                'subtitle': 'Data exploration and analysis',
                'tag': 'Exploration',
                'atoms': [
                    'Correlation',
                    'Depth Ladder',
                    'EDA',
                    'Promo Comparison',
                    'Promotion Intensity Analysis'
                ]
            },
            {
                'molecule_id': 'engineer',
                'name': 'Engineer',
                'type': 'Engineer',
                'subtitle': 'Model engineering and algorithm synthesis',
                'tag': 'Engineering',
                'atoms': [
                    'Bulk Model Output - CSF',
                    'Bulk Modeling',
                    'Key Selector',
                    'Model Performance',
                    'Model Selector',
                    'Concatination',
                    'Create or Transform',
                    'Delete',
                    'Merge',
                    'Rename'
                ]
            },
            {
                'molecule_id': 'pre-process',
                'name': 'Pre Process',
                'type': 'Pre Process',
                'subtitle': 'Initial data preprocessing',
                'tag': 'Preprocessing',
                'atoms': [
                    'Feature Over View',
                    'GroupBy'
                ]
            },
            {
                'molecule_id': 'evaluate',
                'name': 'Evaluate',
                'type': 'Evaluate',
                'subtitle': 'Model evaluation and results',
                'tag': 'Analysis',
                'atoms': []
            },
            {
                'molecule_id': 'plan',
                'name': 'Plan',
                'type': 'Plan',
                'subtitle': 'Planning tasks and workflows',
                'tag': 'Planning',
                'atoms': []
            },
            {
                'molecule_id': 'report',
                'name': 'Report',
                'type': 'Report',
                'subtitle': 'Reporting and presentation',
                'tag': 'Reporting',
                'atoms': []
            }
        ]

        created_count = 0
        updated_count = 0

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

