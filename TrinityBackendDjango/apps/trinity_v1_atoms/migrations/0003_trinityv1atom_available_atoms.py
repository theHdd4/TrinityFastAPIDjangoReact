# Generated manually for adding available_atoms column

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('trinity_v1_atoms', '0002_trinityv1atom_color_trinityv1atom_tags'),
    ]

    operations = [
        migrations.AddField(
            model_name='trinityv1atom',
            name='available_atoms',
            field=models.BooleanField(default=False, help_text='Whether this atom is available and functional'),
        ),
    ]