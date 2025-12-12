# Generated migration to add is_deleted field to UserRole model

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("roles", "0007_simplify_userrole"),
    ]

    operations = [
        migrations.AddField(
            model_name="userrole",
            name="is_deleted",
            field=models.BooleanField(default=False),
        ),
    ]

