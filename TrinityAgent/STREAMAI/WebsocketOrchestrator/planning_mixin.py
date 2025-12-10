"""Composite planning mixin assembled from modular helpers."""
from __future__ import annotations

from .planning.atom_context import WorkflowAtomContextMixin
from .planning.context_sections import WorkflowContextSectionsMixin
from .planning.dependencies import WorkflowDependenciesMixin
from .planning.history import WorkflowHistoryMixin
from .planning.insights import WorkflowInsightsMixin
from .planning.json_generation import WorkflowJsonGenerationMixin
from .planning.lifecycle import WorkflowLifecycleMixin
from .planning.react_prompts import WorkflowReactPromptsMixin


class WorkflowPlanningMixin(
    WorkflowJsonGenerationMixin,
    WorkflowAtomContextMixin,
    WorkflowReactPromptsMixin,
    WorkflowDependenciesMixin,
    WorkflowInsightsMixin,
    WorkflowLifecycleMixin,
    WorkflowHistoryMixin,
    WorkflowContextSectionsMixin,
):
    """Aggregate workflow planning behavior."""

    pass
