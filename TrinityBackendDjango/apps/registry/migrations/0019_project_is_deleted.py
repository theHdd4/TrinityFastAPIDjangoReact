from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("registry", "0018_arrowdataset_project_csv_unique"),
    ]

    operations = [
        migrations.AddField(
            model_name="project",
            name="is_deleted",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="historicalproject",
            name="is_deleted",
            field=models.BooleanField(default=False),
        ),
    ]
