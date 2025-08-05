from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("roles", "0004_seed_role_definitions"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="userrole",
            name="project_id",
        ),
        migrations.AddField(
            model_name="userrole",
            name="client_name",
            field=models.CharField(max_length=255, blank=True),
        ),
        migrations.AddField(
            model_name="userrole",
            name="email",
            field=models.EmailField(max_length=254, blank=True),
        ),
        migrations.AlterUniqueTogether(
            name="userrole",
            unique_together={("user", "client_id", "app_id")},
        ),
    ]
