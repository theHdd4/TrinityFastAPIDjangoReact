from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("registry", "0012_template"),
    ]

    operations = [
        migrations.AddField(
            model_name="project",
            name="base_template",
            field=models.ForeignKey(
                to="registry.template",
                null=True,
                blank=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="projects",
                help_text="Template this project was created from, if any.",
            ),
        ),
    ]
