from django.core.management.base import BaseCommand
from apps.trinity_v1_atoms.models import TrinityV1Atom
import os
import sys
import json

# Add the frontend path to sys.path to import the atom files
frontend_path = os.path.join(os.path.dirname(__file__), '../../../../TrinityFrontend/src/components/AtomList/atoms')
sys.path.insert(0, frontend_path)

class Command(BaseCommand):
    help = 'Update atoms with correct tags and descriptions from frontend atom files'

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('Starting update of atoms from frontend files...'))

        # Define the atom data from frontend files
        atom_data = {
            'correlation': {
                'description': 'Calculate correlation between variables',
                'tags': ['correlation', 'analysis', 'relationships'],
                'color': 'bg-purple-500'
            },
            'merge': {
                'description': 'Merge multiple datasets based on common keys',
                'tags': ['merge', 'join', 'combine'],
                'color': 'bg-green-500'
            },
            'groupby-wtg-avg': {
                'description': 'Group data and calculate weighted averages',
                'tags': ['groupby', 'weighted', 'average'],
                'color': 'bg-green-500'
            },
            'auto-regressive-models': {
                'description': 'Build auto-regressive time series models',
                'tags': ['autoregressive', 'timeseries', 'models'],
                'color': 'bg-orange-500'
            },
            'data-upload-validate': {
                'description': 'Upload and validate data files',
                'tags': ['upload', 'validation', 'data'],
                'color': 'bg-blue-500'
            },
            'csv-import': {
                'description': 'Import data from CSV files',
                'tags': ['csv', 'import', 'data'],
                'color': 'bg-blue-500'
            },
            'json-import': {
                'description': 'Import data from JSON files',
                'tags': ['json', 'import', 'data'],
                'color': 'bg-blue-500'
            },
            'database-connect': {
                'description': 'Connect to external databases',
                'tags': ['database', 'connection', 'sql'],
                'color': 'bg-blue-500'
            },
            'feature-overview': {
                'description': 'Get overview of dataset features',
                'tags': ['features', 'overview', 'analysis'],
                'color': 'bg-green-500'
            },
            'concat': {
                'description': 'Concatenate multiple datasets',
                'tags': ['concat', 'combine', 'data'],
                'color': 'bg-green-500'
            },
            'scope-selector': {
                'description': 'Select specific data scope or range',
                'tags': ['scope', 'filter', 'selection'],
                'color': 'bg-green-500'
            },
            'row-operations': {
                'description': 'Perform operations on data rows',
                'tags': ['rows', 'operations', 'data'],
                'color': 'bg-green-500'
            },
            'column-classifier': {
                'description': 'Classify and categorize columns',
                'tags': ['columns', 'classification', 'categorization'],
                'color': 'bg-green-500'
            },
            'create-column': {
                'name': 'Create and Transform Features',
                'description': 'Create or Transform new features using arithmetic operations on dataframe columns',
                'tags': ['feature', 'creation', 'transform'],
                'color': 'bg-green-500'
            },
            'explore': {
                'description': 'Interactive data exploration',
                'tags': ['exploration', 'interactive', 'analysis'],
                'color': 'bg-purple-500'
            },
            'descriptive-stats': {
                'description': 'Calculate descriptive statistics',
                'tags': ['statistics', 'descriptive', 'analysis'],
                'color': 'bg-purple-500'
            },
            'trend-analysis': {
                'description': 'Analyze trends in data',
                'tags': ['trends', 'analysis', 'time'],
                'color': 'bg-purple-500'
            },
            'regression-feature-based': {
                'description': 'Feature-based regression modeling',
                'tags': ['regression', 'features', 'modeling'],
                'color': 'bg-orange-500'
            },
            'select-models-feature': {
                'description': 'Select best feature-based models',
                'tags': ['selection', 'models', 'features'],
                'color': 'bg-orange-500'
            },
            'evaluate-models-feature': {
                'description': 'Evaluate feature-based models',
                'tags': ['evaluation', 'models', 'features'],
                'color': 'bg-orange-500'
            },
            'select-models-auto-regressive': {
                'description': 'Select best auto-regressive models',
                'tags': ['selection', 'models', 'autoregressive'],
                'color': 'bg-orange-500'
            },
            'evaluate-models-auto-regressive': {
                'description': 'Evaluate auto-regressive models',
                'tags': ['evaluation', 'models', 'autoregressive'],
                'color': 'bg-orange-500'
            },
            'build-model-feature-based': {
                'description': 'Build feature-based models',
                'tags': ['building', 'models', 'features'],
                'color': 'bg-orange-500'
            },
            'clustering': {
                'description': 'Perform data clustering analysis',
                'tags': ['clustering', 'analysis', 'groups'],
                'color': 'bg-orange-500'
            },
            'chart-maker': {
                'description': 'Create various types of charts',
                'tags': ['charts', 'visualization', 'graphs'],
                'color': 'bg-pink-500'
            },
            'text-box': {
                'description': 'Add text annotations to visualizations',
                'tags': ['text', 'annotations', 'labels'],
                'color': 'bg-pink-500'
            },
            'scatter-plot': {
                'description': 'Create scatter plot visualizations',
                'tags': ['scatter', 'plot', 'visualization'],
                'color': 'bg-pink-500'
            },
            'histogram': {
                'description': 'Create histogram visualizations',
                'tags': ['histogram', 'distribution', 'visualization'],
                'color': 'bg-pink-500'
            },
            'scenario-planner': {
                'description': 'Plan and analyze different scenarios',
                'tags': ['scenarios', 'planning', 'analysis'],
                'color': 'bg-indigo-500'
            },
            'optimizer': {
                'description': 'Optimize parameters and configurations',
                'tags': ['optimization', 'parameters', 'tuning'],
                'color': 'bg-indigo-500'
            },
            'atom-maker': {
                'description': 'Create custom atoms and components',
                'tags': ['custom', 'creation', 'tools'],
                'color': 'bg-gray-500'
            },
            'read-presentation-summarize': {
                'description': 'Read and summarize presentations',
                'tags': ['presentation', 'summarization', 'analysis'],
                'color': 'bg-teal-500'
            },
            'base-price-estimator': {
                'description': 'Estimate base prices for products',
                'tags': ['pricing', 'estimation', 'business'],
                'color': 'bg-teal-500'
            },
            'promo-estimator': {
                'description': 'Estimate promotional pricing effects',
                'tags': ['promotion', 'pricing', 'marketing'],
                'color': 'bg-teal-500'
            },
            'pivot-table': {
                'description': 'Create interactive pivot table summaries',
                'tags': ['pivot', 'aggregation', 'business'],
                'color': 'bg-teal-500'
            },
            'unpivot': {
                'description': 'Transform wide datasets into long format by unpivoting columns into rows',
                'tags': ['unpivot', 'melt', 'reshape', 'data-transformation'],
                'color': 'bg-cyan-500'
            },
            'dataframe-operations': {
                'description': 'Perform operations on dataframes',
                'tags': ['dataframe', 'operations', 'data'],
                'color': 'bg-green-500'
            }
        }

        updated_count = 0
        created_count = 0

        for atom_id, data in atom_data.items():
            try:
                atom, created = TrinityV1Atom.objects.get_or_create(
                    atom_id=atom_id,
                    defaults={
                        'name': data.get('name', data['description'].split(' ')[0].title()),  # Use explicit name if available, otherwise first word
                        'description': data['description'],
                        'category': self.get_category_from_color(data['color']),
                        'tags': data['tags'],
                        'color': data['color']
                    }
                )
                
                if not created:
                    # Update existing atom
                    if 'name' in data:
                        atom.name = data['name']
                    atom.description = data['description']
                    atom.tags = data['tags']
                    atom.color = data['color']
                    atom.save()
                    updated_count += 1
                    self.stdout.write(self.style.SUCCESS(f'✅ Updated: {atom.name} ({atom.atom_id})'))
                else:
                    created_count += 1
                    self.stdout.write(self.style.SUCCESS(f'✅ Created: {atom.name} ({atom.atom_id})'))
                    
            except Exception as e:
                self.stdout.write(self.style.ERROR(f'❌ Error updating {atom_id}: {e}'))

        self.stdout.write(
            self.style.SUCCESS(
                f'✅ Successfully processed {len(atom_data)} atoms. '
                f'Created: {created_count}, Updated: {updated_count}'
            )
        )

    def get_category_from_color(self, color):
        """Map color to category"""
        color_mapping = {
            'bg-blue-500': 'Data Sources',
            'bg-green-500': 'Data Processing',
            'bg-purple-500': 'Analytics',
            'bg-orange-500': 'Machine Learning',
            'bg-pink-500': 'Visualization',
            'bg-indigo-500': 'Planning & Optimization',
            'bg-gray-500': 'Utilities',
            'bg-teal-500': 'Business Intelligence'
        }
        return color_mapping.get(color, 'Utilities')
