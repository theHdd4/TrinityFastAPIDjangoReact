"""ReAct state and evaluation models."""

from dataclasses import dataclass
from typing import Any, Dict, List, Optional


@dataclass
class StepEvaluation:
    """Evaluation result for a workflow step execution."""

    decision: str  # "continue", "retry_with_correction", "change_approach", "complete"
    reasoning: str
    quality_score: Optional[float] = None  # 0.0 to 1.0
    correctness: bool = True
    issues: List[str] = None
    corrected_prompt: Optional[str] = None  # For retry_with_correction
    alternative_approach: Optional[str] = None  # For change_approach

    def __post_init__(self):
        if self.issues is None:
            self.issues = []


@dataclass
class ReActState:
    """ReAct agent state for a workflow sequence."""

    sequence_id: str
    user_prompt: str
    goal_achieved: bool = False
    current_step_number: int = 0
    paused: bool = False  # Indicates whether the loop was paused mid-generation
    paused_at_step: int = 0  # The step where generation paused
    awaiting_clarification: bool = False  # True when user input is required to proceed
    clarification_context: Optional[str] = None
    execution_history: List[Dict[str, Any]] = None  # Previous steps and results
    thoughts: List[str] = None  # Reasoning history
    observations: List[str] = None  # Observation history
    retry_count: int = 0  # Current step retry count
    max_retries_per_step: int = 2

    def __post_init__(self):
        if self.execution_history is None:
            self.execution_history = []
        if self.thoughts is None:
            self.thoughts = []
        if self.observations is None:
            self.observations = []

    def add_thought(self, thought: str):
        """Add a reasoning thought to history."""

        self.thoughts.append(thought)

    def add_observation(self, observation: str):
        """Add an observation to history."""

        self.observations.append(observation)

    def add_execution(
        self,
        step_number: int,
        atom_id: str,
        result: Dict[str, Any],
        evaluation: Optional[StepEvaluation] = None,
        description: Optional[str] = None,
        files_used: Optional[List[str]] = None,
    ):
        """Add execution result to history."""

        self.execution_history.append(
            {
                "step_number": step_number,
                "atom_id": atom_id,
                "result": result,
                "evaluation": evaluation.__dict__ if evaluation else None,
                "description": description,
                "files_used": files_used or [],
            }
        )
        self.current_step_number = step_number
