"""
Workflow Mode Package
Separate AI agent for workflow composition and design
Following the same pattern as other agents (merge, concat, etc.)
"""

from .llm_workflow_agent import WorkflowCompositionAgent, get_workflow_composition_agent
from .api import router as workflow_router

__all__ = ['WorkflowCompositionAgent', 'get_workflow_composition_agent', 'workflow_router']

