from django.db import migrations

class Migration(migrations.Migration):
    dependencies = [
        ("registry", "0008_arrowdataset_unique"),
    ]

    operations = [
        migrations.AlterUniqueTogether(
            name="project",
            unique_together={("slug", "owner"), ("owner", "app", "name")},
        ),
    ]
