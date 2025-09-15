from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("registry", "0020_merge_20250912_0743"),
    ]

    operations = [
        migrations.AlterField(
            model_name="historicalproject",
            name="is_deleted",
            field=models.BooleanField(default=False, null=True),
        ),
    ]
