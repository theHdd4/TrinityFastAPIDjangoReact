from django.core.management.base import BaseCommand
from apps.usecase.models import UseCase


class Command(BaseCommand):
    help = 'Populate the UseCase table with data from Apps.tsx'

    def handle(self, *args, **options):
        """
        Populate the UseCase table with predefined use cases.
        """
        # Data from Apps.tsx
        apps_data = [
            {
                'name': 'Marketing Mix Modeling',
                'slug': 'marketing-mix',
                'description': 'Optimize marketing spend allocation across different channels and measure incremental impact',
                'modules': ['marketing-data-prep', 'marketing-explore', 'mmm-builder']
            },
            {
                'name': 'Forecasting Analysis',
                'slug': 'forecasting',
                'description': 'Predict future trends and patterns with advanced time series analysis and modeling',
                'modules': ['time-series-prep', 'forecasting-explore', 'forecast-builder']
            },
            {
                'name': 'Promo Effectiveness',
                'slug': 'promo-effectiveness',
                'description': 'Measure and analyze promotional campaign performance and ROI across touchpoints',
                'modules': ['promo-data-prep', 'promo-explore', 'promo-builder']
            },
            {
                'name': 'Exploratory Data Analysis',
                'slug': 'exploratory-data-analysis',
                'description': 'Perform comprehensive exploratory data analysis with advanced visualization and statistical insights',
                'modules': ['eda-data-prep', 'eda-explore', 'eda-visualize']
            },
            {
                'name': 'Customer Segmentation',
                'slug': 'customer-segmentation',
                'description': 'Segment customers based on behavior, demographics, and purchase patterns using ML clustering',
                'modules': ['segment-prep', 'cluster-analysis', 'segment-profile']
            },
            {
                'name': 'Demand Forecasting',
                'slug': 'demand-forecasting',
                'description': 'Predict product demand and inventory requirements with machine learning models',
                'modules': ['demand-prep', 'forecast-models', 'inventory-optimizer']
            },
            {
                'name': 'Price Optimization',
                'slug': 'price-optimization',
                'description': 'Optimize pricing strategies using elasticity models and competitive intelligence',
                'modules': ['price-prep', 'elasticity-model', 'price-simulator']
            },
            {
                'name': 'Churn Prediction',
                'slug': 'churn-prediction',
                'description': 'Identify at-risk customers and predict churn probability with ML classification models',
                'modules': ['churn-prep', 'feature-engineering', 'churn-model']
            },
            {
                'name': 'Data Integration Hub',
                'slug': 'data-integration',
                'description': 'Connect, transform, and consolidate data from multiple sources into unified datasets',
                'modules': ['data-connectors', 'etl-pipeline', 'data-quality']
            },
            {
                'name': 'Create Blank App',
                'slug': 'blank',
                'description': 'Start from scratch with a clean canvas and build your custom analysis workflow',
                'modules': []
            }
        ]

        created_count = 0
        updated_count = 0

        for app_data in apps_data:
            usecase, created = UseCase.objects.get_or_create(
                slug=app_data['slug'],
                defaults={
                    'name': app_data['name'],
                    'description': app_data['description'],
                    'modules': app_data['modules']
                }
            )
            
            if created:
                created_count += 1
                self.stdout.write(
                    self.style.SUCCESS(f'✅ Created: {usecase.name}')
                )
            else:
                # Update existing record
                usecase.name = app_data['name']
                usecase.description = app_data['description']
                usecase.modules = app_data['modules']
                usecase.save()
                updated_count += 1
                self.stdout.write(
                    self.style.WARNING(f'🔄 Updated: {usecase.name}')
                )

        self.stdout.write(
            self.style.SUCCESS(
                f'✅ Successfully processed {len(apps_data)} use cases. '
                f'Created: {created_count}, Updated: {updated_count}'
            )
        )
