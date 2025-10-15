# Generated migration for UseCase molecules relationship

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('usecase', '0006_usecase_feature_based'),
        ('molecules', '0001_initial'),
    ]

    operations = [
        # Remove old JSON fields
        migrations.RemoveField(
            model_name='usecase',
            name='molecules',
        ),
        migrations.RemoveField(
            model_name='usecase',
            name='molecule_atoms',
        ),
        migrations.RemoveField(
            model_name='usecase',
            name='atoms_in_molecules',
        ),
        
        # Add new many-to-many relationship
        migrations.AddField(
            model_name='usecase',
            name='molecules',
            field=models.ManyToManyField(
                blank=True, 
                help_text='Molecules available for this use case',
                to='molecules.molecule'
            ),
        ),
    ]
