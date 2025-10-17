# Generated migration for UseCase table name change

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('usecase', '0009_usecase_molecule_objects_remove_usecase_molecules_and_more'),
    ]

    operations = [
        migrations.AlterModelTable(
            name='usecase',
            table='trinity_v1_apps',
        ),
    ]
