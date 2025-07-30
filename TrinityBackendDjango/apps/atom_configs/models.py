from django.db import models
from django.contrib.auth import get_user_model

from apps.registry.models import Project
from apps.atoms.models import Atom

User = get_user_model()


class AtomConfig(models.Model):
    """
    Stores per-project, per-atom configuration settings.
    """
    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="atom_configs"
    )
    atom = models.ForeignKey(
        Atom, on_delete=models.CASCADE, related_name="configs"
    )
    user = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="atom_configs"
    )
    config = models.JSONField(
        help_text="Parameter sets, hyper-params, styling options, etc."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("project", "atom", "user")
        ordering = ["-updated_at"]

    def __str__(self):
        return f"Config for {self.atom.name} in {self.project.name}"
