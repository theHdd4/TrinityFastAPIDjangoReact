from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [
        ('registry', '0002_historicalsession_historicalproject_historicalapp'),
    ]

    operations = [
        migrations.AddField(
            model_name='project',
            name='state',
            field=models.JSONField(blank=True, null=True, help_text='Persisted workflow/laboratory configuration for this project.'),
        ),
    ]
