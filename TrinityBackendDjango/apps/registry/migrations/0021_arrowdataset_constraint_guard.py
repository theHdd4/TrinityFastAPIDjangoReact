from django.db import migrations


CONSTRAINT_SQL = """
DO $$
BEGIN
    -- Rename any legacy single-column constraint to the canonical name so
    -- later operations referencing the constraint by name succeed.
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'registry_arrowdataset'::regclass
          AND conname = 'registry_arrowdataset_original_csv_key'
    ) THEN
        EXECUTE 'ALTER TABLE registry_arrowdataset RENAME CONSTRAINT registry_arrowdataset_original_csv_key TO unique_project_csv';
    END IF;

    -- Ensure the expected constraint exists so dropping it by name never fails.
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'registry_arrowdataset'::regclass
          AND conname = 'unique_project_csv'
    ) THEN
        BEGIN
            ALTER TABLE registry_arrowdataset
            ADD CONSTRAINT unique_project_csv UNIQUE (project_id, original_csv);
        EXCEPTION
            WHEN duplicate_object THEN
                NULL;
            WHEN undefined_table THEN
                NULL;
        END;
    END IF;

    -- Match the index the tenant creation script expects for fast lookups.
    IF NOT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = current_schema()
          AND indexname = 'registry_arrowdataset_project_csv_idx'
    ) THEN
        BEGIN
            CREATE UNIQUE INDEX registry_arrowdataset_project_csv_idx
                ON registry_arrowdataset (project_id, original_csv);
        EXCEPTION
            WHEN duplicate_table THEN
                NULL;
            WHEN undefined_table THEN
                NULL;
        END;
    END IF;
END$$;
"""


REVERSE_SQL = """
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'registry_arrowdataset'::regclass
          AND conname = 'unique_project_csv'
    ) THEN
        ALTER TABLE registry_arrowdataset DROP CONSTRAINT unique_project_csv;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = current_schema()
          AND indexname = 'registry_arrowdataset_project_csv_idx'
    ) THEN
        EXECUTE format('DROP INDEX IF EXISTS %I.%I', current_schema(), 'registry_arrowdataset_project_csv_idx');
    END IF;
END$$;
"""


class Migration(migrations.Migration):

    dependencies = [
        ("registry", "0020_alter_historicalproject_is_deleted"),
    ]

    operations = [
        migrations.RunSQL(CONSTRAINT_SQL, REVERSE_SQL),
    ]
