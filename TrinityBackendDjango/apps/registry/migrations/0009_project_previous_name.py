from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [
        ('registry', '0008_arrowdataset_unique'),
    ]

    operations = [
        migrations.AddField(
            model_name='project',
            name='previous_name',
            field=models.CharField(
                max_length=150,
                blank=True,
                default='',
                help_text='Previous project name if renamed or deleted',
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='historicalproject',
            name='previous_name',
            field=models.CharField(
                max_length=150,
                blank=True,
                default='',
                help_text='Previous project name if renamed or deleted',
            ),
            preserve_default=False,
        ),
    ]
