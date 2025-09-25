from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("registry", "0017_arrowdataset_filename_unique"),
    ]

    operations = [
        migrations.AlterField(
            model_name="arrowdataset",
            name="original_csv",
            field=models.CharField(max_length=200),
        ),
        migrations.AddConstraint(
            model_name="arrowdataset",
            constraint=models.UniqueConstraint(
                fields=("project", "original_csv"), name="unique_project_csv"
            ),
        ),
    ]
