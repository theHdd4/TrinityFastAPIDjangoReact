# Generated migration for workflows app

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Workflow',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('project_id', models.IntegerField(help_text='ID of the project this workflow belongs to')),
                ('project_name', models.CharField(help_text='Name of the project (denormalized for easy access)', max_length=255)),
                ('name', models.CharField(help_text="Name of the workflow (e.g., 'Data Analysis - Q4 Report')", max_length=255)),
                ('slug', models.SlugField(help_text='URL-friendly version of the name', max_length=255)),
                ('description', models.TextField(blank=True, help_text='Optional description of what this workflow does')),
                ('app_name', models.CharField(blank=True, help_text='Name of the app using this workflow', max_length=255)),
                ('molecules_used', models.JSONField(default=list, help_text='List of molecule IDs/names used in this workflow')),
                ('atoms_in_molecules', models.JSONField(default=dict, help_text='Mapping of molecules to their atoms: {molecule_id: [atom1, atom2, ...]}')),
                ('dag_spec', models.JSONField(default=dict, help_text='Complete DAG specification with nodes, edges, positions, and metadata')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('is_active', models.BooleanField(default=True, help_text='Whether this workflow is currently active/published')),
                ('version', models.IntegerField(default=1, help_text='Version number of this workflow')),
                ('execution_count', models.IntegerField(default=0, help_text='Number of times this workflow has been executed')),
                ('last_executed_at', models.DateTimeField(blank=True, help_text='Last time this workflow was executed', null=True)),
                ('user', models.ForeignKey(blank=True, help_text='User who created this workflow', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='workflows', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-updated_at'],
            },
        ),
        migrations.CreateModel(
            name='WorkflowRun',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('started_at', models.DateTimeField(auto_now_add=True)),
                ('completed_at', models.DateTimeField(blank=True, null=True)),
                ('status', models.CharField(choices=[('pending', 'Pending'), ('running', 'Running'), ('completed', 'Completed'), ('success', 'Success'), ('failed', 'Failed'), ('failure', 'Failure'), ('cancelled', 'Cancelled')], default='pending', max_length=50)),
                ('error_message', models.TextField(blank=True, help_text='Error message if execution failed')),
                ('result_data', models.JSONField(default=dict, help_text='Execution results and output data')),
                ('workflow', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='runs', to='workflows.workflow')),
            ],
            options={
                'ordering': ['-started_at'],
            },
        ),
        migrations.AddIndex(
            model_name='workflowrun',
            index=models.Index(fields=['workflow', '-started_at'], name='workflows_w_workflo_a5e1c8_idx'),
        ),
        migrations.AddIndex(
            model_name='workflowrun',
            index=models.Index(fields=['status'], name='workflows_w_status_d2f3a1_idx'),
        ),
        migrations.AddIndex(
            model_name='workflow',
            index=models.Index(fields=['project_id'], name='workflows_w_project_1e4b2a_idx'),
        ),
        migrations.AddIndex(
            model_name='workflow',
            index=models.Index(fields=['user'], name='workflows_w_user_id_7c8d3e_idx'),
        ),
        migrations.AddIndex(
            model_name='workflow',
            index=models.Index(fields=['slug'], name='workflows_w_slug_9f2a1b_idx'),
        ),
        migrations.AddIndex(
            model_name='workflow',
            index=models.Index(fields=['-created_at'], name='workflows_w_created_4a3e2c_idx'),
        ),
    ]

