from django.db import migrations


PERMISSIONS = [
    ("workflow_edit", "Can edit workflow"),
    ("laboratory_edit", "Can edit laboratory"),
    ("exhibition_edit", "Can edit exhibition"),
    ("project_create", "Can create project"),
]


def create_permissions(apps, schema_editor):
    Permission = apps.get_model("auth", "Permission")
    ContentType = apps.get_model("contenttypes", "ContentType")
    Group = apps.get_model("auth", "Group")

    content_type, _ = ContentType.objects.get_or_create(
        app_label="permissions", model="apppermission"
    )

    perms = []
    for codename, name in PERMISSIONS:
        perm, _ = Permission.objects.get_or_create(
            codename=codename, content_type=content_type, defaults={"name": name}
        )
        perms.append(perm)

    admin_group, _ = Group.objects.get_or_create(name="admin")
    editor_group, _ = Group.objects.get_or_create(name="editor")
    admin_group.permissions.add(*perms)
    editor_group.permissions.add(*perms)


def remove_permissions(apps, schema_editor):
    Permission = apps.get_model("auth", "Permission")
    Group = apps.get_model("auth", "Group")

    codenames = [c for c, _ in PERMISSIONS]
    perms = list(Permission.objects.filter(codename__in=codenames))

    admin_group = Group.objects.filter(name="admin").first()
    editor_group = Group.objects.filter(name="editor").first()
    if admin_group:
        admin_group.permissions.remove(*perms)
    if editor_group:
        editor_group.permissions.remove(*perms)

    Permission.objects.filter(codename__in=codenames).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("roles", "0006_alter_userrole_allowed_apps"),
    ]

    operations = [
        migrations.RunPython(create_permissions, remove_permissions),
    ]
