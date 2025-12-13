# Generated manually for UserTenant model

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0003_alter_userenvironmentvariable_unique_together"),
        ("tenants", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="UserTenant",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "is_primary",
                    models.BooleanField(
                        default=False,
                        help_text="Marks the primary tenant for this user",
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "tenant",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="user_mappings",
                        to="tenants.tenant",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="tenant_mappings",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "db_table": "accounts_usertenant",
                "verbose_name": "User Tenant Mapping",
                "verbose_name_plural": "User Tenant Mappings",
            },
        ),
        migrations.AlterUniqueTogether(
            name="usertenant",
            unique_together={("user", "tenant")},
        ),
        migrations.AddIndex(
            model_name="usertenant",
            index=models.Index(
                fields=["user", "tenant"], name="accounts_us_user_id_tenant_idx"
            ),
        ),
        migrations.AddIndex(
            model_name="usertenant",
            index=models.Index(
                fields=["user", "is_primary"], name="accounts_us_user_id_is_prim_idx"
            ),
        ),
    ]

