from __future__ import annotations

from contextlib import nullcontext
from datetime import timedelta
from typing import ContextManager, Optional

from django.conf import settings
from django.utils import timezone

try:  # pragma: no cover - fallback for environments without django-tenants
    from django_tenants.utils import schema_context as tenant_schema_context
except Exception:  # pragma: no cover - django-tenants should always be present
    tenant_schema_context = None

from .models import ExhibitionShareLink

DEFAULT_SHARE_TTL_HOURS = getattr(settings, "EXHIBITION_SHARE_LINK_TTL_HOURS", 0)
PUBLIC_SCHEMA_NAME = getattr(settings, "PUBLIC_SCHEMA_NAME", "public")


def _public_schema_context() -> ContextManager[None]:
    """Return a context manager that ensures we operate on the public schema."""

    if tenant_schema_context is None:
        return nullcontext()

    return tenant_schema_context(PUBLIC_SCHEMA_NAME)


def create_exhibition_share_link(
    *,
    client_name: str,
    app_name: str,
    project_name: str,
    created_by=None,
    expires_in: Optional[int] = None,
) -> ExhibitionShareLink:
    """Create a share link for an exhibition project.

    Parameters
    ----------
    client_name, app_name, project_name:
        Identifiers for the exhibition context.
    created_by:
        Optional user who initiated the share.
    expires_in:
        Optional number of seconds until the link expires. When omitted the
        ``EXHIBITION_SHARE_LINK_TTL_HOURS`` Django setting (if provided) is
        used. A value of ``0`` leaves the link without an expiry.
    """

    resolved_client = (client_name or "").strip()
    resolved_app = (app_name or "").strip()
    resolved_project = (project_name or "").strip()

    if not (resolved_client and resolved_app and resolved_project):
        raise ValueError("client_name, app_name, and project_name are required")

    expiry: Optional[timezone.datetime] = None
    now = timezone.now()

    if expires_in is not None:
        if expires_in > 0:
            expiry = now + timedelta(seconds=expires_in)
    elif DEFAULT_SHARE_TTL_HOURS > 0:
        expiry = now + timedelta(hours=DEFAULT_SHARE_TTL_HOURS)

    with _public_schema_context():
        link = ExhibitionShareLink.create_link(
            client_name=resolved_client,
            app_name=resolved_app,
            project_name=resolved_project,
            created_by=created_by,
            expires_at=expiry,
        )

    return link
