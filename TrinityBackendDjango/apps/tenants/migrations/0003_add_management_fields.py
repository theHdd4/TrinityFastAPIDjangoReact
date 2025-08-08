from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("tenants", "0002_alter_domain_domain_alter_domain_is_primary_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="tenant",
            name="primary_domain",
            field=models.CharField(max_length=253, blank=True),
        ),
        migrations.AddField(
            model_name="tenant",
            name="allowed_apps",
            field=models.JSONField(default=list, blank=True),
        ),
        migrations.AddField(
            model_name="tenant",
            name="seats_allowed",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="tenant",
            name="users_in_use",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="tenant",
            name="project_cap",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="tenant",
            name="projects_allowed",
            field=models.JSONField(default=list, blank=True),
        ),
    ]
