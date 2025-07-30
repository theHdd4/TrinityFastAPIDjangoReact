from django.db import models


class AtomCategory(models.Model):
    """
    Categories for grouping atoms in the palette.
    """
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Atom(models.Model):
    """
    Core atom definition exposed to the front end.
    """
    name = models.CharField(max_length=150, unique=True)
    slug = models.SlugField(max_length=150, unique=True)
    category = models.ForeignKey(
        AtomCategory,
        on_delete=models.PROTECT,
        related_name="atoms"
    )
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class AtomVersion(models.Model):
    """
    Versioned metadata for each atom.
    """
    atom = models.ForeignKey(
        Atom,
        on_delete=models.CASCADE,
        related_name="versions"
    )
    version = models.CharField(max_length=50)
    release_date = models.DateField()
    release_notes = models.TextField(blank=True)
    config_schema = models.JSONField(
        help_text="JSON schema defining the config options for this version."
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("atom", "version")
        ordering = ["-release_date"]

    def __str__(self):
        return f"{self.atom.name} v{self.version}"
