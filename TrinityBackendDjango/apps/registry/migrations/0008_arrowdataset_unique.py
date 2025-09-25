from django.db import migrations

class Migration(migrations.Migration):
    dependencies = [
        ("registry", "0007_arrowdataset_project"),
    ]

    operations = [
        migrations.AlterUniqueTogether(
            name="arrowdataset",
            unique_together={("project", "atom_id", "file_key")},
        ),
    ]
