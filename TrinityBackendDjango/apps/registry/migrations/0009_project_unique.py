from django.db import migrations
from django.db.models import Count
from django.utils.text import slugify


def dedupe_projects(apps, schema_editor):
    Project = apps.get_model("registry", "Project")
    dup_groups = (
        Project.objects.values("owner_id", "app_id", "name")
        .annotate(c=Count("id"))
        .filter(c__gt=1)
    )
    for dup in dup_groups:
        owner_id = dup["owner_id"]
        app_id = dup["app_id"]
        name = dup["name"]
        projects = list(
            Project.objects.filter(owner_id=owner_id, app_id=app_id, name=name).order_by("id")
        )
        base_name = name
        for index, project in enumerate(projects[1:], start=1):
            new_name = f"{base_name} {index}"
            while Project.objects.filter(owner_id=owner_id, app_id=app_id, name=new_name).exclude(pk=project.pk).exists():
                index += 1
                new_name = f"{base_name} {index}"
            slug_base = slugify(new_name)
            slug_val = slug_base
            s_count = 1
            while Project.objects.filter(owner_id=owner_id, slug=slug_val).exclude(pk=project.pk).exists():
                s_count += 1
                slug_val = f"{slug_base}-{s_count}"
            project.name = new_name
            project.slug = slug_val
            project.save(update_fields=["name", "slug"])

class Migration(migrations.Migration):
    dependencies = [
        ("registry", "0008_arrowdataset_unique"),
    ]

    operations = [
        migrations.RunPython(dedupe_projects),
        migrations.AlterUniqueTogether(
            name="project",
            unique_together={("slug", "owner"), ("owner", "app", "name")},
        ),
    ]
