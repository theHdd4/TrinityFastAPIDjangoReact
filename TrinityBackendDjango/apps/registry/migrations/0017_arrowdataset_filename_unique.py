from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("registry", "0016_historicaltemplate"),
    ]

    operations = [
        migrations.AlterField(
            model_name="arrowdataset",
            name="original_csv",
            field=models.CharField(max_length=200, unique=True),
        ),
        migrations.AlterUniqueTogether(
            name="arrowdataset",
            unique_together=set(),
        ),
    ]
