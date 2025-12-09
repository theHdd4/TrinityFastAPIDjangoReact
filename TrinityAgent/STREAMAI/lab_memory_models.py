"""Structured schemas for deterministic Laboratory Mode context persistence."""

from __future__ import annotations

import hashlib
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class LaboratoryEnvelope(BaseModel):
    """Immutable envelope describing a laboratory-mode inference request."""

    request_id: str
    session_id: str
    user_id: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    model_version: str
    prompt_template_version: str
    feature_flags: Dict[str, Any] = Field(default_factory=dict)
    prompt_template_hash: str
    input_hash: str
    deterministic_params: Dict[str, Any] = Field(default_factory=dict)


class WorkflowStepRecord(BaseModel):
    step_number: int
    atom_id: str
    inputs: Dict[str, Any] = Field(default_factory=dict)
    outputs: Dict[str, Any] = Field(default_factory=dict)
    tool_calls: List[Dict[str, Any]] = Field(default_factory=list)
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    decision_rationale: Optional[str] = None
    edge_cases: List[str] = Field(default_factory=list)


class WorkflowState(BaseModel):
    steps: List[WorkflowStepRecord] = Field(default_factory=list)
    template_hash: Optional[str] = None
    input_hash: Optional[str] = None


class BusinessGoals(BaseModel):
    user_intent: str
    success_criteria: List[str] = Field(default_factory=list)
    constraints: List[str] = Field(default_factory=list)
    decision_log: List[str] = Field(default_factory=list)
    acceptance_checks: List[str] = Field(default_factory=list)


class AnalysisInsights(BaseModel):
    observations: List[str] = Field(default_factory=list)
    hypotheses: List[str] = Field(default_factory=list)
    evidence: List[str] = Field(default_factory=list)
    decisions: List[str] = Field(default_factory=list)
    rationale: Optional[str] = None


class LaboratoryMemoryDocument(BaseModel):
    """Full document persisted per laboratory request."""

    envelope: LaboratoryEnvelope
    workflow_state: WorkflowState
    business_goals: BusinessGoals
    analysis_insights: AnalysisInsights

    def to_sorted_dict(self) -> Dict[str, Any]:
        return self.model_dump(mode="python", exclude_none=True)

    @staticmethod
    def compute_hash_for_payload(payload: Dict[str, Any]) -> str:
        """Generate SHA256 hash for deterministic regression tracking."""

        serialized = LaboratoryMemoryDocument._stable_json(payload)
        return hashlib.sha256(serialized.encode("utf-8")).hexdigest()

    @staticmethod
    def _stable_json(payload: Dict[str, Any]) -> str:
        import json

        return json.dumps(payload, sort_keys=True, ensure_ascii=False, default=str)
