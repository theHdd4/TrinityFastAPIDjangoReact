"""Dataclasses representing workflow planning structures."""

from dataclasses import dataclass
from typing import Any, Dict, List, Optional


@dataclass
class WorkflowStepPlan:
    """Represents a single workflow step with prompt metadata."""

    step_number: int
    atom_id: str
    description: str
    prompt: str
    files_used: List[str]
    inputs: List[str]
    output_alias: str
    enriched_description: Optional[str] = None  # Enriched description with file details for UI
    atom_prompt: Optional[str] = None  # Full prompt that will be sent to atom LLM

    def to_dict(self) -> Dict[str, Any]:
        return {
            "step_number": self.step_number,
            "atom_id": self.atom_id,
            "description": self.description,
            "enriched_description": self.enriched_description or self.description,
            "prompt": self.prompt,
            "atom_prompt": self.atom_prompt,  # Include full prompt for UI display
            "files_used": self.files_used,
            "inputs": self.inputs,
            "output_alias": self.output_alias,
        }


@dataclass
class WorkflowPlan:
    """Plan containing ordered workflow steps."""

    workflow_steps: List[WorkflowStepPlan]
    total_steps: int

    def to_dict(self) -> Dict[str, Any]:
        return {
            "workflow_steps": [step.to_dict() for step in self.workflow_steps],
            "total_steps": self.total_steps,
        }
