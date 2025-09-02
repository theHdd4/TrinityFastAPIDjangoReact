from django.db import migrations


class Migration(migrations.Migration):
    """Ensure base_template column exists on historical project table."""

    dependencies = [
        ("registry", "0014_historicalproject_base_template"),
    ]

    operations = [
        migrations.RunSQL(
            sql=(
                "ALTER TABLE registry_historicalproject "
                "ADD COLUMN IF NOT EXISTS base_template_id bigint"
            ),
            reverse_sql=(
                "ALTER TABLE registry_historicalproject "
                "DROP COLUMN IF EXISTS base_template_id"
            ),
        ),
    ]
