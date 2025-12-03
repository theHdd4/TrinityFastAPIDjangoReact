"""Structured intent representation for Trinity AI laboratory mode.

This module defines the IntentRecord schema along with helper utilities for
merging updates, computing diffs, and normalizing field values. The intent
record is designed to persist across a conversation so that new turns inherit
prior assumptions and only override the fields that change.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set, Tuple


IntentField = str


@dataclass
class IntentEvidenceSpan:
    """Tracks which part of the user message influenced an intent decision."""

    field: IntentField
    text: str


@dataclass
class IntentRecord:
    """Normalized intent representation that can be persisted per session."""

    goal_type: str = "ask"  # ask | explain | summarize | plan | execute
    subject_domain: str = "general"
    required_data_freshness: str = "unspecified"
    required_tools: Set[str] = field(default_factory=set)  # {"llm", "atom"}
    output_format: str = "text"
    safety_constraints: str = "standard"
    urgency_budget: str = "normal"
    confidence: Dict[IntentField, float] = field(default_factory=dict)
    evidence: List[IntentEvidenceSpan] = field(default_factory=list)
    scratchpad_refs: List[str] = field(default_factory=list)
    clarifications: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, object]:
        return {
            "goal_type": self.goal_type,
            "subject_domain": self.subject_domain,
            "required_data_freshness": self.required_data_freshness,
            "required_tools": sorted(self.required_tools),
            "output_format": self.output_format,
            "safety_constraints": self.safety_constraints,
            "urgency_budget": self.urgency_budget,
            "confidence": self.confidence,
            "evidence": [e.__dict__ for e in self.evidence],
            "scratchpad_refs": self.scratchpad_refs,
            "clarifications": self.clarifications,
        }

    def merge(self, other: "IntentRecord") -> "IntentRecord":
        """Merge another record, preferring non-default values from the other."""

        merged = IntentRecord(
            goal_type=other.goal_type or self.goal_type,
            subject_domain=other.subject_domain or self.subject_domain,
            required_data_freshness=other.required_data_freshness
            or self.required_data_freshness,
            required_tools=self.required_tools | other.required_tools,
            output_format=other.output_format or self.output_format,
            safety_constraints=other.safety_constraints or self.safety_constraints,
            urgency_budget=other.urgency_budget or self.urgency_budget,
            confidence={**self.confidence, **other.confidence},
            evidence=[*self.evidence, *other.evidence],
            scratchpad_refs=list({*self.scratchpad_refs, *other.scratchpad_refs}),
            clarifications=list({*self.clarifications, *other.clarifications}),
        )
        return merged

    def diff(self, other: "IntentRecord") -> Dict[str, Tuple[object, object]]:
        """Return the fields that differ between two records."""

        diffs: Dict[str, Tuple[object, object]] = {}
        for field_name in [
            "goal_type",
            "subject_domain",
            "required_data_freshness",
            "output_format",
            "safety_constraints",
            "urgency_budget",
        ]:
            self_val = getattr(self, field_name)
            other_val = getattr(other, field_name)
            if self_val != other_val:
                diffs[field_name] = (self_val, other_val)

        if self.required_tools != other.required_tools:
            diffs["required_tools"] = (self.required_tools, other.required_tools)

        return diffs


@dataclass
class IntentValidationIssue:
    """Represents a conflict or missing requirement in the intent record."""

    field: IntentField
    message: str


@dataclass
class RoutingDecision:
    """Determines how Trinity AI should satisfy the user's intent."""

    path: str  # llm_only | atom_agents | mixed
    rationale: str
    clarifications: List[str] = field(default_factory=list)
    requires_files: bool = False
    required_tools: Set[str] = field(default_factory=set)

