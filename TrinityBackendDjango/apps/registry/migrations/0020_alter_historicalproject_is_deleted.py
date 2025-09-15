from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("registry", "0019_project_is_deleted"),
    ]

    operations = [
        migrations.AlterField(
            model_name="historicalproject",
            name="is_deleted",
            field=models.BooleanField(default=False, null=True),
        ),
    ]
