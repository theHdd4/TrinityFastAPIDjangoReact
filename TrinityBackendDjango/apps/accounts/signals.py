from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from django.conf import settings
from django.db import connection, models
from django_tenants.utils import get_tenant_model
import uuid

from apps.roles.models import UserRole


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def create_userrole_and_increment(sender, instance, created, **kwargs):
    if not created:
        return
    schema = connection.schema_name
    if schema == "public":
        return
    Tenant = get_tenant_model()
    try:
        tenant = Tenant.objects.get(schema_name=schema)
    except Tenant.DoesNotExist:
        return
    Tenant.objects.filter(id=tenant.id).update(users_in_use=models.F("users_in_use") + 1)
    try:
        UserRole.objects.create(
            user=instance,
            client_id=uuid.uuid4(),
            app_id=uuid.uuid4(),
            project_id=uuid.uuid4(),
            role=UserRole.ROLE_VIEWER,
            allowed_apps=tenant.allowed_apps,
        )
    except Exception:
        pass


@receiver(post_delete, sender=settings.AUTH_USER_MODEL)
def decrement_user_count(sender, instance, **kwargs):
    schema = connection.schema_name
    if schema == "public":
        return
    Tenant = get_tenant_model()
    try:
        tenant = Tenant.objects.get(schema_name=schema)
    except Tenant.DoesNotExist:
        return
    Tenant.objects.filter(id=tenant.id).update(users_in_use=models.F("users_in_use") - 1)
