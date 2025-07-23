from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from django.db import connection
from .models import Project
from apps.tenants.models import Tenant
from common.minio_utils import create_prefix, rename_prefix


def _current_tenant_name() -> str:
    schema = connection.schema_name
    with connection.cursor() as cur:
        cur.execute("SET search_path TO public")
        try:
            name = Tenant.objects.get(schema_name=schema).name
        finally:
            cur.execute(f"SET search_path TO {schema}")
    return name.replace(" ", "_")


@receiver(post_save, sender=Project)
def create_project_folder(sender, instance, created, **kwargs):
    if created:
        tenant = _current_tenant_name()
        app_slug = instance.app.slug
        project_slug = instance.slug
        prefix = f"{tenant}/{app_slug}/{project_slug}"
        create_prefix(prefix)


@receiver(pre_save, sender=Project)
def rename_project_folder(sender, instance, **kwargs):
    if not instance.pk:
        return
    try:
        old = Project.objects.get(pk=instance.pk)
    except Project.DoesNotExist:
        return
    if old.slug != instance.slug:
        tenant = _current_tenant_name()
        app_slug = instance.app.slug
        old_prefix = f"{tenant}/{app_slug}/{old.slug}"
        new_prefix = f"{tenant}/{app_slug}/{instance.slug}"
        rename_prefix(old_prefix, new_prefix)
