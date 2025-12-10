"""Composite execution mixin assembled from modular helpers."""
from __future__ import annotations

from .execution.atom_execution import WorkflowAtomExecutionMixin
from .execution.autosave import WorkflowAutosaveMixin
from .execution.core import WorkflowCoreMixin
from .execution.events import WorkflowEventsMixin
from .execution.http_client import WorkflowHttpClientMixin
from .execution.insights import WorkflowInsightsMixin


class WorkflowExecutionMixin(
    WorkflowCoreMixin,
    WorkflowInsightsMixin,
    WorkflowAutosaveMixin,
    WorkflowHttpClientMixin,
    WorkflowEventsMixin,
    WorkflowAtomExecutionMixin,
):
    """Aggregate workflow execution behavior."""

    pass
