# Generated manually for usecase app - Remove molecules_used and atoms_in_molecules columns

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('usecase', '0004_auto_sync_molecules'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='usecase',
            name='molecules_used',
        ),
        migrations.RemoveField(
            model_name='usecase',
            name='atoms_in_molecules',
        ),
    ]
