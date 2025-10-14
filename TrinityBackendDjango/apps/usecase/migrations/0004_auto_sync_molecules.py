# Generated manually for usecase app - Auto-sync molecules from frontend

from django.db import migrations
from django.core.management import call_command


def sync_molecules_from_frontend(apps, schema_editor):
    """
    Sync molecules and atoms from frontend components during migration.
    """
    try:
        # Run the auto-sync command
        call_command('auto_sync', verbosity=0)
    except Exception as e:
        # Log the error but don't fail the migration
        print(f"Warning: Could not sync molecules during migration: {e}")


def reverse_sync_molecules(apps, schema_editor):
    """
    Reverse operation - nothing to do for sync.
    """
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('usecase', '0003_add_molecule_atom_fields'),
    ]

    operations = [
        migrations.RunPython(
            sync_molecules_from_frontend,
            reverse_sync_molecules,
        ),
    ]
