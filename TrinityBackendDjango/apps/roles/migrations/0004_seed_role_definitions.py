from django.db import migrations


def seed_roles(apps, schema_editor):
    RoleDefinition = apps.get_model("roles", "RoleDefinition")
    Group = apps.get_model("auth", "Group")
    Permission = apps.get_model("auth", "Permission")
    from django.db.models import Q

    # Create groups
    admin_group, _ = Group.objects.get_or_create(name="admin")
    editor_group, _ = Group.objects.get_or_create(name="editor")
    viewer_group, _ = Group.objects.get_or_create(name="viewer")

    # Assign basic permissions
    all_perms = Permission.objects.all()
    view_perms = Permission.objects.filter(codename__startswith="view_")
    edit_perms = Permission.objects.filter(
        Q(codename__startswith="view_")
        | Q(codename__startswith="add_")
        | Q(codename__startswith="change_")
    )

    admin_group.permissions.set(all_perms)
    editor_group.permissions.set(edit_perms)
    viewer_group.permissions.set(view_perms)

    RoleDefinition.objects.get_or_create(name="admin", defaults={"group": admin_group})
    RoleDefinition.objects.get_or_create(name="editor", defaults={"group": editor_group})
    RoleDefinition.objects.get_or_create(name="viewer", defaults={"group": viewer_group})


def unseed_roles(apps, schema_editor):
    RoleDefinition = apps.get_model("roles", "RoleDefinition")
    RoleDefinition.objects.filter(name__in=["admin", "editor", "viewer"]).delete()
    Group = apps.get_model("auth", "Group")
    Group.objects.filter(name__in=["admin", "editor", "viewer"]).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("roles", "0003_userrole_allowed_apps"),
    ]

    operations = [
        migrations.RunPython(seed_roles, reverse_code=unseed_roles),
    ]
