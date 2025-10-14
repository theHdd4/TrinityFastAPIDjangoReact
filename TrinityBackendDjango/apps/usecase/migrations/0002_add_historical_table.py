# Generated manually for usecase app - Add historical table

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('usecase', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='HistoricalUseCase',
            fields=[
                ('id', models.BigIntegerField(auto_created=True, blank=True, db_index=True, verbose_name='ID')),
                ('name', models.CharField(max_length=150)),
                ('slug', models.SlugField(max_length=150)),
                ('description', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(blank=True, editable=False)),
                ('updated_at', models.DateTimeField(blank=True, editable=False)),
                ('history_id', models.AutoField(primary_key=True, serialize=False)),
                ('history_date', models.DateTimeField(db_index=True)),
                ('history_change_reason', models.CharField(max_length=100, null=True)),
                ('history_type', models.CharField(choices=[('+', 'Created'), ('~', 'Changed'), ('-', 'Deleted')], max_length=1)),
                ('history_user_id', models.IntegerField(null=True)),
            ],
            options={
                'verbose_name': 'historical use case',
                'verbose_name_plural': 'historical use cases',
                'ordering': ('-history_date', '-history_id'),
                'get_latest_by': ('history_date', 'history_id'),
            },
        ),
    ]
