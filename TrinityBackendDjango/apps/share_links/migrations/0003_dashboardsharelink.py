from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('share_links', '0002_dataframesharelink'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="DashboardShareLink",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                ("token", models.CharField(editable=False, max_length=64, unique=True)),
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
                        related_name="dashboard_share_links",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "db_table": "dashboard_share_links",
                "verbose_name": "Dashboard Share Link",
                "verbose_name_plural": "Dashboard Share Links",
            },
        ),
        migrations.AddIndex(
            model_name="dashboardsharelink",
            index=models.Index(fields=["client_name", "app_name", "project_name"], name="share_links_dashboard_context_idx"),
        ),
    ]
