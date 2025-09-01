from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("registry", "0013_project_base_template"),
    ]

    operations = [
        migrations.AddField(
            model_name="historicalproject",
            name="base_template",
            field=models.ForeignKey(
                to="registry.template",
                null=True,
                blank=True,
                on_delete=django.db.models.deletion.DO_NOTHING,
                related_name="+",
                db_constraint=False,
                help_text="Template this project was created from, if any.",
            ),
        ),
    ]
