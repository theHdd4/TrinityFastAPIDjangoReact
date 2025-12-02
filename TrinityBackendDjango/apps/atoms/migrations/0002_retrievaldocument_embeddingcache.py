# Generated manually for retrieval document and embedding cache tables
from django.db import migrations, models
import django.db.models.deletion
import django.contrib.postgres.fields


class Migration(migrations.Migration):

    dependencies = [
        ('atoms', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='RetrievalDocument',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(blank=True, max_length=255)),
                ('text', models.TextField()),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='EmbeddingCache',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('model_name', models.CharField(max_length=255)),
                ('vector', django.contrib.postgres.fields.ArrayField(base_field=models.FloatField(), blank=True, default=list, size=None)),
                ('vector_dim', models.PositiveIntegerField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('document', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='embeddings', to='atoms.retrievaldocument')),
            ],
            options={
                'ordering': ['-created_at'],
                'unique_together': {('document', 'model_name')},
            },
        ),
    ]
