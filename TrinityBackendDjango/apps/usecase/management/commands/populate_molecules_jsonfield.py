from django.core.management.base import BaseCommand
from apps.usecase.models import UseCase
from apps.molecules.models import Molecule


class Command(BaseCommand):
    help = 'Populate the molecules JSONField with molecule IDs based on existing relationships'

    def handle(self, *args, **options):
        """
        Populate the molecules JSONField with molecule IDs from the many-to-many relationship.
        """
        # Get all use cases
        usecases = UseCase.objects.prefetch_related('molecule_objects').all()
        
        updated_count = 0
        
        for usecase in usecases:
            # Get molecule IDs from the many-to-many relationship
            molecule_ids = [mol.id for mol in usecase.molecule_objects.all()]
            
            # Update the molecules JSONField
            usecase.molecules = molecule_ids
            usecase.save()
            
            updated_count += 1
            self.stdout.write(
                self.style.SUCCESS(f'✅ Updated {usecase.name}: {molecule_ids}')
            )
        
        self.stdout.write(
            self.style.SUCCESS(
                f'\n✅ Successfully updated {updated_count} use cases with molecule IDs'
            )
        )
