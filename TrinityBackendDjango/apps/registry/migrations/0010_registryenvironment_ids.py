from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [
        ("registry", "0009_registryenvironment"),
    ]

    operations = [
        migrations.AddField(
            model_name="registryenvironment",
            name="client_id",
            field=models.CharField(max_length=255, blank=True),
        ),
        migrations.AddField(
            model_name="registryenvironment",
            name="app_id",
            field=models.CharField(max_length=255, blank=True),
        ),
        migrations.AddField(
            model_name="registryenvironment",
            name="project_id",
            field=models.CharField(max_length=255, blank=True),
        ),
        migrations.AddField(
            model_name="registryenvironment",
            name="user_id",
            field=models.CharField(max_length=255, blank=True),
        ),
    ]
