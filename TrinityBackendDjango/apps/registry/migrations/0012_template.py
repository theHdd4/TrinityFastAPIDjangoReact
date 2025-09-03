from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('registry', '0011_alter_registryenvironment_id'),
        ('accounts', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='Template',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=150)),
                ('slug', models.SlugField(max_length=150)),
                ('description', models.TextField(blank=True)),
                ('state', models.JSONField(blank=True, null=True)),
                ('base_project', models.JSONField(help_text='Serialized details of the project this template was created from.')),
                ('template_projects', models.JSONField(blank=True, default=list, help_text='Serialized details of projects created from this template.')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('owner', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='templates', to='accounts.user')),
                ('app', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='templates', to='registry.app')),
            ],
            options={
                'db_table': 'registry_templates',
                'ordering': ['-updated_at'],
            },
        ),
    ]
