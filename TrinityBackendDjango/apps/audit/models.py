from django.db import models
from django.contrib.contenttypes.models import ContentType
from django.contrib.contenttypes.fields import GenericForeignKey


class Revision(models.Model):
    """
    Immutable snapshot of any model instance for audit and rollback.
    """
    content_type = models.ForeignKey(
        ContentType,
        on_delete=models.CASCADE,
        help_text="The type of the object being versioned."
    )
    object_id = models.PositiveBigIntegerField(
        help_text="The primary key of the object being versioned."
    )
    content_object = GenericForeignKey("content_type", "object_id")
    data = models.JSONField(
        help_text="JSON snapshot of the object's fields at this point in time."
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Revision of {self.content_type} #{self.object_id} @ {self.created_at}"
