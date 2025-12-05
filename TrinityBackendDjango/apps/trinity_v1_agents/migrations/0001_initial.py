# Generated migration for TrinityV1Agent model

from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
    ]

    operations = [
        migrations.CreateModel(
            name='TrinityV1Agent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('agent_id', models.CharField(help_text='Agent identifier', max_length=100, unique=True)),
                ('name', models.CharField(help_text='Agent name', max_length=150)),
                ('description', models.TextField(blank=True, help_text='Agent description')),
                ('category', models.CharField(blank=True, help_text='Agent category', max_length=100)),
                ('tags', models.JSONField(blank=True, default=list, help_text='List of tags for the agent')),
                ('route_count', models.IntegerField(default=0, help_text='Number of routes registered')),
                ('routes', models.JSONField(blank=True, default=list, help_text='Array of route metadata objects')),
                ('is_active', models.BooleanField(default=True, help_text='Whether this agent is available and functional')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Trinity V1 Agent',
                'verbose_name_plural': 'Trinity V1 Agents',
                'db_table': 'trinity_v1_agents',
                'ordering': ['name'],
            },
        ),
    ]





