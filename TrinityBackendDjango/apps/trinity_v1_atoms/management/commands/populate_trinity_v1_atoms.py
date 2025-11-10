from django.core.management.base import BaseCommand
from apps.trinity_v1_atoms.models import TrinityV1Atom


class Command(BaseCommand):
    help = 'Populate the TrinityV1Atom table with atoms from the frontend'

    def handle(self, *args, **options):
        """
        Populate the TrinityV1Atom table with atoms from the frontend.
        Data source: TrinityFrontend/src/components/AtomCategory/data/atomCategories.ts
        """
        # Data from atomCategories.ts - all atoms from the frontend
        atoms_data = [
            # Data Sources
            {'atom_id': 'data-upload-validate', 'name': 'Data Upload Validate', 'description': 'Validate and process uploaded data files', 'category': 'Data Sources'},
            {'atom_id': 'csv-import', 'name': 'CSV Import', 'description': 'Import data from CSV files', 'category': 'Data Sources'},
            {'atom_id': 'json-import', 'name': 'JSON Import', 'description': 'Import data from JSON files', 'category': 'Data Sources'},
            {'atom_id': 'database-connect', 'name': 'Database Connect', 'description': 'Connect to external databases', 'category': 'Data Sources'},
            
            # Data Processing
            {'atom_id': 'feature-overview', 'name': 'Feature Overview', 'description': 'Overview of dataset features and statistics', 'category': 'Data Processing'},
            {'atom_id': 'groupby-wtg-avg', 'name': 'GroupBy Weighted Average', 'description': 'Group data and calculate weighted averages', 'category': 'Data Processing'},
            {'atom_id': 'merge', 'name': 'Merge', 'description': 'Merge datasets based on common keys', 'category': 'Data Processing'},
            {'atom_id': 'concat', 'name': 'Concat', 'description': 'Concatenate datasets vertically or horizontally', 'category': 'Data Processing'},
            {'atom_id': 'scope-selector', 'name': 'Scope Selector', 'description': 'Select and filter data by scope', 'category': 'Data Processing'},
            {'atom_id': 'row-operations', 'name': 'Row Operations', 'description': 'Perform operations on data rows', 'category': 'Data Processing'},
            {'atom_id': 'column-classifier', 'name': 'Column Classifier', 'description': 'Classify and categorize data columns', 'category': 'Data Processing'},
            {'atom_id': 'create-column', 'name': 'Create and Transform Features', 'description': 'Create or Transform new features using arithmetic operations on dataframe columns', 'category': 'Data Processing'},
            {'atom_id': 'dataframe-operations', 'name': 'DataFrame Operations', 'description': 'Perform operations on DataFrames', 'category': 'Data Processing'},
            
            # Analytics
            {'atom_id': 'correlation', 'name': 'Correlation', 'description': 'Calculate correlation between variables', 'category': 'Analytics'},
            {'atom_id': 'explore', 'name': 'Explore', 'description': 'Interactive data exploration and visualization', 'category': 'Analytics'},
            {'atom_id': 'descriptive-stats', 'name': 'Descriptive Stats', 'description': 'Generate descriptive statistics', 'category': 'Analytics'},
            {'atom_id': 'trend-analysis', 'name': 'Trend Analysis', 'description': 'Analyze trends in time series data', 'category': 'Analytics'},
            
            # Machine Learning
            {'atom_id': 'regression-feature-based', 'name': 'Regression Feature Based', 'description': 'Feature-based regression modeling', 'category': 'Machine Learning'},
            {'atom_id': 'select-models-feature', 'name': 'Select Models Feature', 'description': 'Select best models for feature-based analysis', 'category': 'Machine Learning'},
            {'atom_id': 'evaluate-models-feature', 'name': 'Evaluate Models Feature', 'description': 'Evaluate feature-based models', 'category': 'Machine Learning'},
            {'atom_id': 'auto-regressive-models', 'name': 'Auto Regressive Models', 'description': 'Build auto-regressive time series models', 'category': 'Machine Learning'},
            {'atom_id': 'select-models-auto-regressive', 'name': 'Select Models Auto Regressive', 'description': 'Select best auto-regressive models', 'category': 'Machine Learning'},
            {'atom_id': 'evaluate-models-auto-regressive', 'name': 'Evaluate Models Auto Regressive', 'description': 'Evaluate auto-regressive models', 'category': 'Machine Learning'},
            {'atom_id': 'build-model-feature-based', 'name': 'Build Model Feature Based', 'description': 'Build feature-based machine learning models', 'category': 'Machine Learning'},
            {'atom_id': 'clustering', 'name': 'Clustering', 'description': 'Perform clustering analysis', 'category': 'Machine Learning'},
            
            # Visualization
            {'atom_id': 'chart-maker', 'name': 'Chart Maker', 'description': 'Create interactive charts and graphs', 'category': 'Visualization'},
            {'atom_id': 'text-box', 'name': 'Text Box', 'description': 'Add text annotations and descriptions', 'category': 'Visualization'},
            {'atom_id': 'scatter-plot', 'name': 'Scatter Plot', 'description': 'Create scatter plot visualizations', 'category': 'Visualization'},
            {'atom_id': 'histogram', 'name': 'Histogram', 'description': 'Create histogram visualizations', 'category': 'Visualization'},
            
            # Planning & Optimization
            {'atom_id': 'scenario-planner', 'name': 'Scenario Planner', 'description': 'Plan and analyze different scenarios', 'category': 'Planning & Optimization'},
            {'atom_id': 'optimizer', 'name': 'Optimizer', 'description': 'Optimize parameters and configurations', 'category': 'Planning & Optimization'},
            
            # Utilities
            {'atom_id': 'atom-maker', 'name': 'Atom Maker', 'description': 'Create custom atoms', 'category': 'Utilities'},
            {'atom_id': 'read-presentation-summarize', 'name': 'Read Presentation Summarize', 'description': 'Read and summarize presentations', 'category': 'Utilities'},
            
            # Business Intelligence
            {'atom_id': 'base-price-estimator', 'name': 'Base Price Estimator', 'description': 'Estimate base prices for products', 'category': 'Business Intelligence'},
            {'atom_id': 'promo-estimator', 'name': 'Promo Estimator', 'description': 'Estimate promotional effects', 'category': 'Business Intelligence'},
            {'atom_id': 'pivot-table', 'name': 'Pivot Table', 'description': 'Create interactive pivot table summaries', 'category': 'Business Intelligence'}
        ]

        created_count = 0
        updated_count = 0

        for atom_data in atoms_data:
            atom, created = TrinityV1Atom.objects.get_or_create(
                atom_id=atom_data['atom_id'],
                defaults={
                    'name': atom_data['name'],
                    'description': atom_data['description'],
                    'category': atom_data['category']
                }
            )
            
            if created:
                created_count += 1
                self.stdout.write(
                    self.style.SUCCESS(f'✅ Created: {atom.name} ({atom.atom_id})')
                )
            else:
                # Update existing record
                atom.name = atom_data['name']
                atom.description = atom_data['description']
                atom.category = atom_data['category']
                atom.save()
                updated_count += 1
                self.stdout.write(
                    self.style.WARNING(f'🔄 Updated: {atom.name} ({atom.atom_id})')
                )

        self.stdout.write(
            self.style.SUCCESS(
                f'\n✅ Successfully processed {len(atoms_data)} atoms. '
                f'Created: {created_count}, Updated: {updated_count}'
            )
        )
