from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("roles", "0002_userrole"),
    ]

    operations = [
        migrations.AddField(
            model_name="userrole",
            name="allowed_apps",
            field=models.JSONField(default=list, blank=True),
        ),
    ]
