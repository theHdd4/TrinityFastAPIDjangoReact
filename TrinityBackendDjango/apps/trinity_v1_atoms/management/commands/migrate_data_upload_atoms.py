from django.core.management.base import BaseCommand
from apps.trinity_v1_atoms.models import TrinityV1Atom


class Command(BaseCommand):
    help = 'Migrate data-upload-validate atom to separate data-upload and data-validate atoms'

    def handle(self, *args, **options):
        """
        This command will:
        1. Create the new 'data-upload' atom
        2. Rename 'data-upload-validate' to 'data-validate'
        """
        self.stdout.write(self.style.SUCCESS('Starting migration of data upload atoms...'))
        
        # Step 1: Create the new data-upload atom if it doesn't exist
        data_upload, created = TrinityV1Atom.objects.get_or_create(
            atom_id='data-upload',
            defaults={
                'name': 'Data Upload',
                'description': 'Upload, clean, and prime your data files with guided workflow',
                'category': 'Data Sources',
                'tags': ['upload', 'data', 'import', 'prime', 'clean'],
                'color': 'bg-blue-500',
                'available_atoms': True
            }
        )
        
        if created:
            self.stdout.write(self.style.SUCCESS(f'✅ Created new atom: Data Upload (data-upload)'))
        else:
            # Update existing atom
            data_upload.name = 'Data Upload'
            data_upload.description = 'Upload, clean, and prime your data files with guided workflow'
            data_upload.category = 'Data Sources'
            data_upload.tags = ['upload', 'data', 'import', 'prime', 'clean']
            data_upload.color = 'bg-blue-500'
            data_upload.available_atoms = True
            data_upload.save()
            self.stdout.write(self.style.WARNING(f'🔄 Updated existing atom: Data Upload (data-upload)'))
        
        # Step 2: Rename data-upload-validate to data-validate
        try:
            old_atom = TrinityV1Atom.objects.get(atom_id='data-upload-validate')
            
            # Check if data-validate already exists
            existing_validate = TrinityV1Atom.objects.filter(atom_id='data-validate').first()
            
            if existing_validate:
                # Update existing data-validate atom
                existing_validate.name = 'Data Validate'
                existing_validate.description = 'Validate data with automatic type detection and quality checks'
                existing_validate.category = 'Data Sources'
                existing_validate.tags = ['validate', 'data', 'quality']
                existing_validate.color = 'bg-green-500'
                existing_validate.available_atoms = True
                existing_validate.save()
                self.stdout.write(self.style.WARNING(f'🔄 Updated existing atom: Data Validate (data-validate)'))
                
                # Delete the old data-upload-validate atom
                old_atom.delete()
                self.stdout.write(self.style.SUCCESS(f'🗑️ Deleted old atom: data-upload-validate'))
            else:
                # Rename the old atom by changing its atom_id
                old_atom.atom_id = 'data-validate'
                old_atom.name = 'Data Validate'
                old_atom.description = 'Validate data with automatic type detection and quality checks'
                old_atom.category = 'Data Sources'
                old_atom.tags = ['validate', 'data', 'quality']
                old_atom.color = 'bg-green-500'
                old_atom.available_atoms = True
                old_atom.save()
                self.stdout.write(self.style.SUCCESS(f'✅ Renamed atom: data-upload-validate → data-validate'))
                
        except TrinityV1Atom.DoesNotExist:
            # Old atom doesn't exist, create data-validate directly
            data_validate, created = TrinityV1Atom.objects.get_or_create(
                atom_id='data-validate',
                defaults={
                    'name': 'Data Validate',
                    'description': 'Validate data with automatic type detection and quality checks',
                    'category': 'Data Sources',
                    'tags': ['validate', 'data', 'quality'],
                    'color': 'bg-green-500',
                    'available_atoms': True
                }
            )
            
            if created:
                self.stdout.write(self.style.SUCCESS(f'✅ Created new atom: Data Validate (data-validate)'))
            else:
                data_validate.name = 'Data Validate'
                data_validate.description = 'Validate data with automatic type detection and quality checks'
                data_validate.category = 'Data Sources'
                data_validate.tags = ['validate', 'data', 'quality']
                data_validate.color = 'bg-green-500'
                data_validate.available_atoms = True
                data_validate.save()
                self.stdout.write(self.style.WARNING(f'🔄 Updated existing atom: Data Validate (data-validate)'))
        
        # Summary
        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('='*50))
        self.stdout.write(self.style.SUCCESS('Migration completed successfully!'))
        self.stdout.write(self.style.SUCCESS('='*50))
        
        # Show current state
        data_sources = TrinityV1Atom.objects.filter(category='Data Sources', available_atoms=True).order_by('name')
        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('📊 Current Data Sources atoms:'))
        for atom in data_sources:
            self.stdout.write(f'  • {atom.name} ({atom.atom_id})')

