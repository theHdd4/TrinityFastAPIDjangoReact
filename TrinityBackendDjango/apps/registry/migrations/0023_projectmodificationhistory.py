# Generated migration for ProjectModificationHistory

from django.db import migrations, models
import django.db.models.deletion


def backfill_existing_projects(apps, schema_editor):
    """
    Backfill existing projects: create history entries for all project owners.
    This ensures that existing projects appear in the "My Projects" tab for their owners.
    """
    Project = apps.get_model('registry', 'Project')
    ProjectModificationHistory = apps.get_model('registry', 'ProjectModificationHistory')
    
    # Get all non-deleted projects
    projects = Project.objects.filter(is_deleted=False)
    
    # Create history entries for each project owner
    for project in projects:
        ProjectModificationHistory.objects.get_or_create(
            project=project,
            user=project.owner,
            defaults={'modified_at': project.created_at}
        )


def reverse_backfill(apps, schema_editor):
    """Reverse migration - no action needed as we'll drop the table"""
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('registry', '0022_app_custom_config_app_is_enabled_app_usecase_id_and_more'),
        ('accounts', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='ProjectModificationHistory',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('modified_at', models.DateTimeField(auto_now_add=True)),
                ('project', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='modification_history', to='registry.project')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='project_modifications', to='accounts.user')),
            ],
            options={
                'db_table': 'registry_project_modification_history',
                'ordering': ['-modified_at'],
            },
        ),
        migrations.AddIndex(
            model_name='projectmodificationhistory',
            index=models.Index(fields=['user', '-modified_at'], name='registry_pr_user_id_modified_idx'),
        ),
        migrations.AddIndex(
            model_name='projectmodificationhistory',
            index=models.Index(fields=['project', '-modified_at'], name='registry_pr_project_id_modified_idx'),
        ),
        migrations.AlterUniqueTogether(
            name='projectmodificationhistory',
            unique_together={('project', 'user')},
        ),
        migrations.RunPython(backfill_existing_projects, reverse_backfill),
    ]

