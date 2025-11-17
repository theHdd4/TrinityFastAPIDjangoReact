from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('share_links', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="DataFrameShareLink",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                ("token", models.CharField(editable=False, max_length=64, unique=True)),
                ("object_name", models.CharField(max_length=1024)),
                ("client_name", models.CharField(max_length=255)),
                ("app_name", models.CharField(max_length=255)),
                ("project_name", models.CharField(max_length=255)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("expires_at", models.DateTimeField(blank=True, null=True)),
                ("is_active", models.BooleanField(default=True)),
                ("last_accessed_at", models.DateTimeField(blank=True, null=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="dataframe_share_links",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "db_table": "dataframe_share_links",
                "verbose_name": "DataFrame Share Link",
                "verbose_name_plural": "DataFrame Share Links",
            },
        ),
        migrations.AddIndex(
            model_name="dataframesharelink",
            index=models.Index(fields=["object_name"], name="share_links_dataframe_object_idx"),
        ),
        migrations.AddIndex(
            model_name="dataframesharelink",
            index=models.Index(fields=["client_name", "app_name", "project_name"], name="share_links_dataframe_context_idx"),
        ),
    ]

