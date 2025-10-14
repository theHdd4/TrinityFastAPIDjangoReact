from django.core.management.base import BaseCommand
from apps.usecase.models import UseCase
from apps.usecase.sync_utils import MoleculeAtomSync


class Command(BaseCommand):
    help = 'Add a new molecule to the system and sync to all use cases'

    def add_arguments(self, parser):
        parser.add_argument('--id', required=True, help='Molecule ID')
        parser.add_argument('--type', required=True, help='Molecule type')
        parser.add_argument('--title', required=True, help='Molecule title')
        parser.add_argument('--subtitle', required=True, help='Molecule subtitle')
        parser.add_argument('--tag', required=True, help='Molecule tag')
        parser.add_argument('--atoms', nargs='+', default=[], help='List of atoms')

    def handle(self, *args, **options):
        """
        Add a new molecule to the system.
        """
        # Create new molecule
        new_molecule = {
            'id': options['id'],
            'type': options['type'],
            'title': options['title'],
            'subtitle': options['subtitle'],
            'tag': options['tag'],
            'atoms': options['atoms']
        }
        
        self.stdout.write(f"🆕 Adding new molecule: {new_molecule['title']}")
        
        try:
            # Get current molecules from database
            usecase = UseCase.objects.first()
            if not usecase:
                self.stdout.write(
                    self.style.ERROR("❌ No use cases found. Run populate_usecases first.")
                )
                return
            
            current_molecules = list(usecase.molecules)
            
            # Check if molecule already exists
            for molecule in current_molecules:
                if molecule['id'] == new_molecule['id']:
                    self.stdout.write(
                        self.style.WARNING(f"⚠️ Molecule with ID '{new_molecule['id']}' already exists")
                    )
                    return
            
            # Add new molecule
            current_molecules.append(new_molecule)
            
            # Get all atoms (including new ones)
            all_atoms = set()
            for molecule in current_molecules:
                all_atoms.update(molecule.get('atoms', []))
            all_atoms = sorted(list(all_atoms))
            
            # Update all use cases
            updated_count = UseCase.objects.update(
                molecules=current_molecules,
                atoms=all_atoms
            )
            
            self.stdout.write(
                self.style.SUCCESS(
                    f"✅ Successfully added molecule '{new_molecule['title']}' "
                    f"to {updated_count} use cases"
                )
            )
            
            self.stdout.write(f"📊 Total molecules: {len(current_molecules)}")
            self.stdout.write(f"📊 Total atoms: {len(all_atoms)}")
            
        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f"❌ Error adding molecule: {str(e)}")
            )
            raise
