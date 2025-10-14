# Generated manually for usecase app - Add molecule and atom fields

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('usecase', '0002_add_historical_table'),
    ]

    operations = [
        migrations.AddField(
            model_name='usecase',
            name='molecules',
            field=models.JSONField(blank=True, default=list, help_text='List of molecules available for this use case'),
        ),
        migrations.AddField(
            model_name='usecase',
            name='atoms',
            field=models.JSONField(blank=True, default=list, help_text='List of atoms available for this use case'),
        ),
    ]
