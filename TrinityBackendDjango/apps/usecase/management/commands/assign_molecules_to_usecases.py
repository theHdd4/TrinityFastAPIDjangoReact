from django.core.management.base import BaseCommand
from apps.usecase.models import UseCase
from apps.molecules.models import Molecule


class Command(BaseCommand):
    help = 'Assign molecules to use cases based on their functionality'

    def handle(self, *args, **options):
        """
        Assign molecules to use cases based on their functionality.
        """
        # Get all molecules
        molecules = {mol.molecule_id: mol for mol in Molecule.objects.all()}
        
        # Define molecule assignments for each use case
        usecase_molecules = {
            'marketing-mix': ['build', 'data-pre-process', 'explore', 'engineer', 'evaluate', 'report'],
            'forecasting': ['build', 'data-pre-process', 'explore', 'engineer', 'evaluate', 'report'],
            'promo-effectiveness': ['build', 'data-pre-process', 'explore', 'engineer', 'evaluate', 'report'],
            'exploratory-data-analysis': ['explore', 'data-pre-process', 'pre-process', 'report'],
            'customer-segmentation': ['build', 'data-pre-process', 'explore', 'engineer', 'evaluate', 'report'],
            'demand-forecasting': ['build', 'data-pre-process', 'explore', 'engineer', 'evaluate', 'report'],
            'price-optimization': ['build', 'data-pre-process', 'explore', 'engineer', 'evaluate', 'report'],
            'churn-prediction': ['build', 'data-pre-process', 'explore', 'engineer', 'evaluate', 'report'],
            'data-integration': ['data-pre-process', 'pre-process', 'explore', 'report'],
            'stock-forecasting': ['build', 'data-pre-process', 'explore', 'engineer', 'evaluate', 'report'],
            'customer-analytics': ['explore', 'data-pre-process', 'pre-process', 'report'],
            'blank': ['build', 'data-pre-process', 'explore', 'engineer', 'pre-process', 'evaluate', 'plan', 'report']
        }
        
        assigned_count = 0
        
        for slug, molecule_ids in usecase_molecules.items():
            try:
                usecase = UseCase.objects.get(slug=slug)
                
                # Clear existing molecules
                usecase.molecule_objects.clear()
                
                # Add new molecules to many-to-many relationship
                molecule_objects = []
                for mol_id in molecule_ids:
                    if mol_id in molecules:
                        molecule_objects.append(molecules[mol_id])
                    # Remove verbose logging for individual molecule assignments
                
                # Add molecules to many-to-many relationship
                usecase.molecule_objects.set(molecule_objects)
                
                # Update the molecules JSONField with molecule IDs
                usecase.molecules = [mol.id for mol in molecule_objects]
                usecase.save()
                
                assigned_count += 1
                
            except UseCase.DoesNotExist:
                # Skip missing use cases silently
                continue
        
        # Only show summary if there were assignments made
        if assigned_count > 0:
            self.stdout.write(
                self.style.SUCCESS(
                    f'✅ Assigned molecules to {assigned_count} use cases'
                )
            )
