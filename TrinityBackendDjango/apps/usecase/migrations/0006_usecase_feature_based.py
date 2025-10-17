# Generated migration for feature_based field

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('usecase', '0005_add_molecule_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='usecase',
            name='feature_based',
            field=models.BooleanField(default=False, help_text='Whether this is a feature-based app from Apps.tsx'),
        ),
    ]

