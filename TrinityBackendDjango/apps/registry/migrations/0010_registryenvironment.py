from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("registry", "0009_project_unique"),
    ]

    operations = [
        migrations.CreateModel(
            name="RegistryEnvironment",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("client_name", models.CharField(max_length=255)),
                ("app_name", models.CharField(max_length=255)),
                ("project_name", models.CharField(max_length=255)),
                ("envvars", models.JSONField(blank=True, default=dict)),
                ("identifiers", models.JSONField(blank=True, default=list)),
                ("measures", models.JSONField(blank=True, default=list)),
                ("dimensions", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "db_table": "registry_environment",
                "unique_together": {("client_name", "app_name", "project_name")},
            },
        ),
    ]
