# Generated manually for OnboardToken model

import uuid
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0004_usertenant"),
    ]

    operations = [
        migrations.CreateModel(
            name="OnboardToken",
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
                    "token",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        unique=True,
                    ),
                ),
                (
                    "purpose",
                    models.CharField(
                        choices=[
                            ("onboard", "Onboard"),
                            ("password_reset", "Password Reset"),
                        ],
                        default="onboard",
                        max_length=32,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("expires_at", models.DateTimeField()),
                ("used_at", models.DateTimeField(blank=True, null=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="onboard_tokens",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="+",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "Onboard Token",
                "verbose_name_plural": "Onboard Tokens",
            },
        ),
        migrations.AddIndex(
            model_name="onboardtoken",
            index=models.Index(
                fields=["token"], name="accounts_on_token_idx"
            ),
        ),
        migrations.AddIndex(
            model_name="onboardtoken",
            index=models.Index(
                fields=["user", "purpose"], name="accounts_on_user_id_purpose_idx"
            ),
        ),
    ]

