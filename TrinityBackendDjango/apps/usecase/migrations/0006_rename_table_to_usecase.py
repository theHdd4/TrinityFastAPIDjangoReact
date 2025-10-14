# Generated manually for usecase app - Rename table from trinity_db_public_table_usecase to usecase

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('usecase', '0005_remove_molecules_used_atoms_in_molecules'),
    ]

    operations = [
        migrations.RunSQL(
            sql="ALTER TABLE trinity_db_public_table_usecase RENAME TO usecase;",
            reverse_sql="ALTER TABLE usecase RENAME TO trinity_db_public_table_usecase;"
        ),
    ]
