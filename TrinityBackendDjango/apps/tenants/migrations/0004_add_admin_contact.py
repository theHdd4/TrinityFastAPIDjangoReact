from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("tenants", "0003_add_management_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="tenant",
            name="admin_name",
            field=models.CharField(max_length=255, blank=True),
        ),
        migrations.AddField(
            model_name="tenant",
            name="admin_email",
            field=models.EmailField(max_length=254, blank=True),
        ),
    ]
