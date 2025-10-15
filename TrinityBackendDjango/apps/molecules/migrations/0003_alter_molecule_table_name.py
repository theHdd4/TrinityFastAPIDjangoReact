# Generated migration for Molecule table name change

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('molecules', '0002_alter_molecule_atoms'),
    ]

    operations = [
        migrations.AlterModelTable(
            name='molecule',
            table='trinity_v1_molecules',
        ),
    ]
