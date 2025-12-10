# Generated migration to simplify UserRole model

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("roles", "0006_alter_userrole_allowed_apps"),
    ]

    operations = [
        # Remove unique constraint on (user, client_id, app_id)
        migrations.AlterUniqueTogether(
            name="userrole",
            unique_together=set(),
        ),
        # Remove fields: client_id, client_name, email, app_id
        migrations.RemoveField(
            model_name="userrole",
            name="client_id",
        ),
        migrations.RemoveField(
            model_name="userrole",
            name="client_name",
        ),
        migrations.RemoveField(
            model_name="userrole",
            name="email",
        ),
        migrations.RemoveField(
            model_name="userrole",
            name="app_id",
        ),
        # Update role choices to remove super_admin
        migrations.AlterField(
            model_name="userrole",
            name="role",
            field=models.CharField(
                choices=[
                    ("admin", "Admin"),
                    ("editor", "Editor"),
                    ("viewer", "Viewer"),
                ],
                max_length=20,
            ),
        ),
        # Add new unique constraint on (user,)
        migrations.AlterUniqueTogether(
            name="userrole",
            unique_together={("user",)},
        ),
    ]

