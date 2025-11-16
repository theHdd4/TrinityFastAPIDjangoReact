import secrets
import string
from typing import Optional

from django.conf import settings
from django.db import models
from django.utils import timezone


def _generate_token(length: int = 40) -> str:
    alphabet = string.ascii_lowercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


class ExhibitionShareLink(models.Model):
    """Stores share tokens for exhibition layouts."""

    id = models.BigAutoField(primary_key=True)
    token = models.CharField(max_length=64, unique=True, db_index=True, editable=False)
    client_name = models.CharField(max_length=255)
    app_name = models.CharField(max_length=255)
    project_name = models.CharField(max_length=255)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="exhibition_share_links",
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    last_accessed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "exhibition_share_links"
        indexes = [
            models.Index(fields=["client_name", "app_name", "project_name"]),
        ]
        verbose_name = "Exhibition Share Link"
        verbose_name_plural = "Exhibition Share Links"

    def __str__(self) -> str:  # pragma: no cover - admin representation helper
        return f"Share link for {self.client_name}/{self.app_name}/{self.project_name}"

    @classmethod
    def create_link(
        cls,
        *,
        client_name: str,
        app_name: str,
        project_name: str,
        created_by: Optional[models.Model] = None,
        expires_at: Optional[timezone.datetime] = None,
    ) -> "ExhibitionShareLink":
        token = _generate_token()
        while cls.objects.filter(token=token).exists():
            token = _generate_token()

        link = cls.objects.create(
            token=token,
            client_name=client_name.strip(),
            app_name=app_name.strip(),
            project_name=project_name.strip(),
            created_by=created_by,
            expires_at=expires_at,
        )
        return link

    def mark_accessed(self) -> None:
        self.last_accessed_at = timezone.now()
        self.save(update_fields=["last_accessed_at"])

    @property
    def is_expired(self) -> bool:
        if self.expires_at is None:
            return False
        return self.expires_at < timezone.now()

    @property
    def is_valid(self) -> bool:
        return self.is_active and not self.is_expired


class DataFrameShareLink(models.Model):
    """Stores share tokens for dataframe files."""

    id = models.BigAutoField(primary_key=True)
    token = models.CharField(max_length=64, unique=True, db_index=True, editable=False)
    object_name = models.CharField(max_length=1024)
    client_name = models.CharField(max_length=255)
    app_name = models.CharField(max_length=255)
    project_name = models.CharField(max_length=255)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="dataframe_share_links",
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    last_accessed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "dataframe_share_links"
        indexes = [
            models.Index(fields=["object_name"]),
            models.Index(fields=["client_name", "app_name", "project_name"]),
        ]
        verbose_name = "DataFrame Share Link"
        verbose_name_plural = "DataFrame Share Links"

    def __str__(self) -> str:  # pragma: no cover - admin representation helper
        return f"Share link for {self.object_name}"

    @classmethod
    def create_link(
        cls,
        *,
        object_name: str,
        client_name: str,
        app_name: str,
        project_name: str,
        created_by: Optional[models.Model] = None,
        expires_at: Optional[timezone.datetime] = None,
    ) -> "DataFrameShareLink":
        token = _generate_token()
        while cls.objects.filter(token=token).exists():
            token = _generate_token()

        link = cls.objects.create(
            token=token,
            object_name=object_name.strip(),
            client_name=client_name.strip(),
            app_name=app_name.strip(),
            project_name=project_name.strip(),
            created_by=created_by,
            expires_at=expires_at,
        )
        return link

    def mark_accessed(self) -> None:
        self.last_accessed_at = timezone.now()
        self.save(update_fields=["last_accessed_at"])

    @property
    def is_expired(self) -> bool:
        if self.expires_at is None:
            return False
        return self.expires_at < timezone.now()

    @property
    def is_valid(self) -> bool:
        return self.is_active and not self.is_expired