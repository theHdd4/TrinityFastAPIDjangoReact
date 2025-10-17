# Generated migration for TrinityV1Atom model

from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
    ]

    operations = [
        migrations.CreateModel(
            name='TrinityV1Atom',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('atom_id', models.CharField(help_text='Atom identifier', max_length=100, unique=True)),
                ('name', models.CharField(help_text='Atom name', max_length=150)),
                ('description', models.TextField(blank=True, help_text='Atom description')),
                ('category', models.CharField(blank=True, help_text='Atom category', max_length=100)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Trinity V1 Atom',
                'verbose_name_plural': 'Trinity V1 Atoms',
                'db_table': 'trinity_v1_atoms',
                'ordering': ['name'],
            },
        ),
    ]
