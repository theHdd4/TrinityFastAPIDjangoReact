from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [
        ("registry", "0006_arrowdataset"),
    ]

    operations = [
        migrations.AddField(
            model_name="arrowdataset",
            name="project",
            field=models.ForeignKey(
                default=1,
                on_delete=models.CASCADE,
                related_name="arrow_datasets",
                to="registry.project",
            ),
            preserve_default=False,
        ),
    ]
