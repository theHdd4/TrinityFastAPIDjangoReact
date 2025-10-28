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
                'name': 'Price Ladder Analytics',
                'slug': 'price-ladder-analytics',
                'description': 'Analyze price elasticity and optimize pricing strategies across product portfolios using advanced ladder analysis',
                'modules': ['price-ladder-prep', 'elasticity-analysis', 'price-optimization']
            },
            {
                'name': 'Revenue Mix Optimization',
                'slug': 'revenue-mix-optimization',
                'description': 'Optimize revenue streams and product mix allocation to maximize profitability and market share',
                'modules': ['revenue-prep', 'mix-analysis', 'optimization-engine']
            },
            {
                'name': 'E-Com Promo Planning',
                'slug': 'ecom-promo-planning',
                'description': 'Plan and optimize e-commerce promotional campaigns with data-driven insights and ROI forecasting',
                'modules': ['promo-planning', 'campaign-optimizer', 'roi-forecasting']
            },
            {
                'name': 'E-Com Media Planning',
                'slug': 'ecom-media-planning',
                'description': 'Strategic media planning and budget allocation for e-commerce channels with performance analytics',
                'modules': ['media-planning', 'budget-optimizer', 'channel-analytics']
            },
            {
                'name': 'Create Custom App',
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
                # Remove verbose logging for individual use case creation
            else:
                # Update existing record
                usecase.name = app_data['name']
                usecase.description = app_data['description']
                usecase.modules = app_data['modules']
                usecase.save()
                updated_count += 1
                # Remove verbose logging for individual use case updates

        # Only show summary if there were changes made
        if created_count > 0 or updated_count > 0:
            self.stdout.write(
                self.style.SUCCESS(
                    f'✅ Processed {len(apps_data)} use cases (Created: {created_count}, Updated: {updated_count})'
                )
            )
