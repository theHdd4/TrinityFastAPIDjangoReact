from django.db import migrations


CONSTRAINT_SQL = """
DO $$
DECLARE
    target_table regclass := to_regclass('registry_arrowdataset');
BEGIN
    IF target_table IS NULL THEN
        RETURN;
    END IF;

    -- Rename any legacy single-column constraint to the canonical name so
    -- later operations referencing the constraint by name succeed.
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = target_table
          AND conname = 'registry_arrowdataset_original_csv_key'
    ) THEN
        BEGIN
            EXECUTE format(
                'ALTER TABLE %s RENAME CONSTRAINT %I TO %I',
                target_table,
                'registry_arrowdataset_original_csv_key',
                'unique_project_csv'
            );
        EXCEPTION
            WHEN duplicate_object THEN
                NULL;
            WHEN undefined_object THEN
                NULL;
        END;
    END IF;

    -- Ensure the expected constraint exists so dropping it by name never fails.
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = target_table
          AND conname = 'unique_project_csv'
    ) THEN
        BEGIN
            EXECUTE format(
                'ALTER TABLE %s ADD CONSTRAINT %I UNIQUE (project_id, original_csv)',
                target_table,
                'unique_project_csv'
            );
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
            EXECUTE format(
                'CREATE UNIQUE INDEX %I ON %s (project_id, original_csv)',
                'registry_arrowdataset_project_csv_idx',
                target_table
            );
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
DECLARE
    target_table regclass := to_regclass('registry_arrowdataset');
BEGIN
    IF target_table IS NULL THEN
        RETURN;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = target_table
          AND conname = 'unique_project_csv'
    ) THEN
        BEGIN
            EXECUTE format(
                'ALTER TABLE %s DROP CONSTRAINT %I',
                target_table,
                'unique_project_csv'
            );
        EXCEPTION
            WHEN undefined_object THEN
                NULL;
        END;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = current_schema()
          AND indexname = 'registry_arrowdataset_project_csv_idx'
    ) THEN
        BEGIN
            EXECUTE format(
                'DROP INDEX IF EXISTS %I.%I',
                current_schema(),
                'registry_arrowdataset_project_csv_idx'
            );
        EXCEPTION
            WHEN undefined_object THEN
                NULL;
        END;
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
