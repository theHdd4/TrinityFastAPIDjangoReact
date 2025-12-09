# Generated migration to add is_active field to Tenant model

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("tenants", "0004_add_admin_contact"),
    ]

    operations = [
        migrations.AddField(
            model_name="tenant",
            name="is_active",
            field=models.BooleanField(default=True),
        ),
    ]

