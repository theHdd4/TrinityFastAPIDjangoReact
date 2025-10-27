# Generated migration for Molecule model

from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
    ]

    operations = [
        migrations.CreateModel(
            name='Molecule',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('molecule_id', models.CharField(help_text="Molecule identifier (e.g., 'build', 'explore')", max_length=100, unique=True)),
                ('name', models.CharField(help_text='Molecule name/title', max_length=150)),
                ('type', models.CharField(help_text='Molecule type', max_length=150)),
                ('subtitle', models.CharField(blank=True, help_text='Molecule subtitle/description', max_length=255)),
                ('tag', models.CharField(blank=True, help_text='Category tag for the molecule', max_length=100)),
                ('atoms', models.JSONField(blank=True, default=list, help_text='List of atom names in this molecule')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Molecule',
                'verbose_name_plural': 'Molecules',
                'db_table': 'molecule',
                'ordering': ['name'],
            },
        ),
    ]

