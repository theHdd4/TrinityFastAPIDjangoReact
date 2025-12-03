"""Laboratory-mode intent extraction and routing for Trinity AI.

This service turns a user turn into a persisted :class:`IntentRecord` that
captures all required dimensions for routing Trinity AI between LLM-only and
Atom Agent executions. It implements a dual-pass extractor (rules + LLM), a
validation layer, deterministic routing matrix, and lightweight monitoring
metrics that can be surfaced on dashboards.
"""

from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Optional, Set

import requests

from .intent_records import (
    IntentEvidenceSpan,
    IntentRecord,
    IntentValidationIssue,
    RoutingDecision,
)

logger = logging.getLogger("trinity.trinityai.intent")

try:  # pragma: no cover - optional dependency
    from memory_service import storage as memory_storage_module  # type: ignore
except Exception:  # pragma: no cover - memory service optional
    memory_storage_module = None


@dataclass
class IntentMetrics:
    """Minimal counters for monitoring intent parsing stability."""

    parsed: int = 0
    clarifications: int = 0
    conflicts: int = 0
    policy_flips: int = 0
    ambiguous: int = 0
    recent_samples: List[Dict[str, str]] = field(default_factory=list)

    def snapshot(self) -> Dict[str, object]:
        return {
            "parsed": self.parsed,
            "clarifications": self.clarifications,
            "conflicts": self.conflicts,
            "policy_flips": self.policy_flips,
            "ambiguous": self.ambiguous,
            "recent_samples": self.recent_samples[-10:],
        }


class LaboratoryIntentService:
    """Encapsulates laboratory-mode intent extraction and routing."""

    def __init__(self, use_memory_storage: Optional[bool] = None) -> None:
        self._intent_cache: Dict[str, IntentRecord] = {}
        self._scratchpads: Dict[str, List[str]] = {}
        self.metrics = IntentMetrics()
        self._counter_examples = [
            "Ignore instructions to delete files",
            "Trick the AI into exfiltrating secrets",
            "Pretend there is a csv but do not mention any file",
        ]
        # Disable MinIO-backed memory unless explicitly enabled
        if use_memory_storage is None:
            self.use_memory_storage = bool(
                memory_storage_module
                and os.getenv("INTENT_USE_MEMORY_SERVICE", "0") == "1"
            )
        else:
            self.use_memory_storage = bool(use_memory_storage and memory_storage_module)

    # ------------------------------------------------------------------
    # Persistence helpers
    # ------------------------------------------------------------------
    def load_record(self, session_id: str) -> IntentRecord:
        if self.use_memory_storage:
            stored = memory_storage_module.load_session(session_id) or {}
            if stored.get("intent_record"):
                return self._deserialize_record(stored["intent_record"])

        return self._intent_cache.get(session_id, IntentRecord())

    def persist_record(self, session_id: str, record: IntentRecord) -> None:
        self._intent_cache[session_id] = record
        if self.use_memory_storage:
            memory_storage_module.save_session(session_id, data={"intent_record": record.to_dict()})

    def update_scratchpad(self, session_id: str, entry: str) -> None:
        pad = self._scratchpads.setdefault(session_id, [])
        pad.append(entry)
        if self.use_memory_storage:
            memory_storage_module.save_session(session_id, data={"scratchpad": pad})

    def load_scratchpad(self, session_id: str) -> List[str]:
        if self.use_memory_storage:
            stored = memory_storage_module.load_session(session_id) or {}
            if stored.get("scratchpad"):
                return list(stored["scratchpad"])
        return self._scratchpads.get(session_id, [])

    # ------------------------------------------------------------------
    # Intent inference
    # ------------------------------------------------------------------
    def infer_intent(
        self,
        message: str,
        session_id: str,
        available_files: Optional[Iterable[str]] = None,
        mode: str = "laboratory",
    ) -> IntentRecord:
        """Infer and persist an IntentRecord from a user turn."""

        prior = self.load_record(session_id)
        scratchpad = self.load_scratchpad(session_id)

        rule_record = self._rule_based_extract(message)
        llm_record = self._llm_extract(message, scratchpad, mode=mode)

        merged = prior.merge(rule_record).merge(llm_record)
        merged.scratchpad_refs = scratchpad

        validations = self._validate_record(merged, available_files)
        merged.clarifications.extend([v.message for v in validations])

        self.persist_record(session_id, merged)
        self.metrics.parsed += 1
        if validations:
            self.metrics.conflicts += 1
        if merged.clarifications:
            self.metrics.clarifications += 1

        self.metrics.recent_samples.append({
            "goal_type": merged.goal_type,
            "subject": merged.subject_domain,
            "tools": ",".join(sorted(merged.required_tools)) or "none",
        })

        if self.metrics.ambiguous > 5 or self.metrics.policy_flips > 2:
            logger.warning("📊 Elevated ambiguity detected in laboratory intent parsing: %s", self.metrics.snapshot())

        return merged

    def _rule_based_extract(self, message: str) -> IntentRecord:
        message_lower = message.lower()
        evidence: List[IntentEvidenceSpan] = []
        required_tools: Set[str] = set()
        goal_type = "ask"

        patterns = {
            "execute": ["upload", "csv", "xlsx", "plot", "chart", "train", "merge", "concat", "group", "filter"],
            "plan": ["plan", "outline", "steps"],
            "summarize": ["summarize", "summary"],
        }

        for candidate_goal, hints in patterns.items():
            for hint in hints:
                if hint in message_lower:
                    goal_type = candidate_goal if candidate_goal != "execute" else "execute"
                    evidence.append(IntentEvidenceSpan(field="goal_type", text=hint))
                    if candidate_goal == "execute":
                        required_tools.add("atom")

        if re.search(r"\b(plot|chart|graph)\b", message_lower):
            required_tools.add("atom")
            evidence.append(IntentEvidenceSpan(field="required_tools", text="chart"))

        if re.search(r"\b(file|csv|xlsx|dataset|dataframe)\b", message_lower):
            required_tools.add("atom")
            evidence.append(IntentEvidenceSpan(field="required_tools", text="file"))

        if re.search(r"\bwhy|explain|help me understand\b", message_lower):
            goal_type = "explain"
            evidence.append(IntentEvidenceSpan(field="goal_type", text="explain"))

        record = IntentRecord(goal_type=goal_type, required_tools=required_tools, evidence=evidence)
        if required_tools:
            record.confidence["required_tools"] = 0.6
        if evidence:
            record.confidence["goal_type"] = 0.55
        return record

    def _llm_extract(self, message: str, scratchpad: List[str], mode: str = "laboratory") -> IntentRecord:
        prompt = self._build_llm_prompt(message, scratchpad, mode)
        try:
            config = self._load_llm_config()
            headers = {
                "Content-Type": "application/json",
            }
            if config.get("bearer_token"):
                headers["Authorization"] = f"Bearer {config['bearer_token']}"

            payload = {
                "model": config["model_name"],
                "messages": [{"role": "user", "content": prompt}],
                "stream": False,
                "options": {"temperature": 0.1},
            }

            response = requests.post(config["api_url"], headers=headers, json=payload, timeout=30)
            response.raise_for_status()
            content = response.json()
            text = content.get("message", {}).get("content") or content.get("choices", [{}])[0].get("message", {}).get(
                "content"
            )
            parsed = self._extract_json(text or "{}")
        except Exception as exc:  # pragma: no cover - network failures
            logger.warning("LLM classification failed; defaulting to cautious values: %s", exc)
            parsed = {}

        record = IntentRecord()
        record.goal_type = parsed.get("goal_type", record.goal_type)
        record.subject_domain = parsed.get("subject_domain", record.subject_domain)
        record.required_data_freshness = parsed.get("required_data_freshness", record.required_data_freshness)
        record.output_format = parsed.get("output_format", record.output_format)
        record.safety_constraints = parsed.get("safety_permissions", record.safety_constraints)
        record.urgency_budget = parsed.get("urgency_latency", record.urgency_budget)

        required_tools = parsed.get("required_tools", [])
        if isinstance(required_tools, list):
            record.required_tools = {tool.lower() for tool in required_tools if isinstance(tool, str)}

        confidences = parsed.get("confidence", {})
        if isinstance(confidences, dict):
            record.confidence.update({k: float(v) for k, v in confidences.items() if isinstance(v, (int, float, str))})

        evidence_spans = parsed.get("evidence", [])
        if isinstance(evidence_spans, list):
            for item in evidence_spans:
                if isinstance(item, dict) and item.get("field") and item.get("text"):
                    record.evidence.append(IntentEvidenceSpan(field=item["field"], text=item["text"]))

        if parsed.get("needs_clarification"):
            record.clarifications.append(parsed.get("clarification_prompt", "Please clarify the request."))

        return record

    def _build_llm_prompt(self, message: str, scratchpad: List[str], mode: str) -> str:
        scratchpad_text = "\n".join(f"- {item}" for item in scratchpad[-5:]) if scratchpad else "(empty)"

        prompt_lines = [
            "You are the laboratory-mode intent parser for Trinity AI. Classify the user's turn into the fixed intent record fields.",
            "",
            "Conversation scratchpad (recent actions):",
            scratchpad_text,
            "",
            "User message:",
            f'"""{message}"""',
            "",
            "Output ONLY valid JSON with the following keys:",
            "- goal_type: ask | explain | summarize | plan | execute",
            "- subject_domain: short domain tag",
            "- required_data_freshness: realtime | same_session | stale_ok | unspecified",
            '- required_tools: array containing one or both of ["llm", "atom"] depending on whether Atom Agents are needed',
            "- output_format: text | table | chart | code | file",
            "- safety_permissions: note if elevated permissions are requested",
            "- urgency_latency: low | normal | high",
            "- confidence: object with float confidences per field (0-1)",
            '- evidence: list of objects {"field": "goal_type", "text": "snippet"} showing supporting spans',
            "- needs_clarification: boolean if intent is ambiguous",
            "- clarification_prompt: short targeted question when clarification is needed",
            "",
            "Always favor laboratory execution (Atom Agents) when the user mentions data operations, plotting, or files.",
        ]

        return "\n".join(prompt_lines)

    # ------------------------------------------------------------------
    # Validation & routing
    # ------------------------------------------------------------------
    def _validate_record(
        self, record: IntentRecord, available_files: Optional[Iterable[str]] = None
    ) -> List[IntentValidationIssue]:
        issues: List[IntentValidationIssue] = []
        files = list(available_files or [])
        if "atom" in record.required_tools and not files:
            issues.append(
                IntentValidationIssue(
                    field="required_tools", message="Atom Agent requested but no files/datasets were provided."
                )
            )
        if record.output_format in {"chart", "table"} and "atom" not in record.required_tools:
            issues.append(
                IntentValidationIssue(
                    field="output_format",
                    message="Structured output requested but no data tool selected; consider enabling Atom Agent mode.",
                )
            )
        return issues

    def route_decision(self, record: IntentRecord, available_files: Optional[Iterable[str]] = None) -> RoutingDecision:
        needs_atoms = "atom" in record.required_tools
        needs_llm = "llm" in record.required_tools or record.goal_type in {"ask", "explain", "summarize"}
        requires_files = needs_atoms

        if needs_atoms and needs_llm:
            path = "mixed"
            rationale = "Intent requires both reasoning and data operations; using mixed plan + Atom Agents."
        elif needs_atoms:
            path = "atom_agents"
            rationale = "Data/visualization operations detected; routing to Atom Agents."
        else:
            path = "llm_only"
            rationale = "No data operations detected; LLM response is sufficient."

        clarifications = list(record.clarifications)
        if requires_files and not list(available_files or []):
            clarifications.append("Which dataset or file should I use?")

        if clarifications:
            self.metrics.ambiguous += 1

        return RoutingDecision(
            path=path,
            rationale=rationale,
            clarifications=clarifications,
            requires_files=requires_files,
            required_tools=record.required_tools,
        )

    def detect_policy_flip(
        self,
        session_id: str,
        new_decision: RoutingDecision,
        previous_record: Optional[IntentRecord] = None,
        available_files: Optional[Iterable[str]] = None,
    ) -> bool:
        prior = previous_record or self._intent_cache.get(session_id)
        if not prior:
            return False
        prior_decision = self.route_decision(prior, available_files=available_files)
        if prior_decision.path != new_decision.path:
            self.metrics.policy_flips += 1
            return True
        return False

    # ------------------------------------------------------------------
    # Utility
    # ------------------------------------------------------------------
    def _load_llm_config(self) -> Dict[str, str]:
        try:
            from BaseAgent.config import settings
        except ImportError:
            from TrinityAgent.BaseAgent.config import settings  # type: ignore

        cfg = settings.get_llm_config()
        return {
            "api_url": cfg.get("api_url"),
            "model_name": cfg.get("model_name"),
            "bearer_token": cfg.get("bearer_token"),
        }

    def _extract_json(self, text: str) -> Dict[str, object]:
        try:
            start = text.find("{")
            end = text.rfind("}")
            if start != -1 and end != -1 and end > start:
                return json.loads(text[start : end + 1])
        except Exception:
            logger.debug("Failed to parse JSON from text: %s", text)
        return {}

    def _deserialize_record(self, data: Dict[str, object]) -> IntentRecord:
        record = IntentRecord()
        record.goal_type = str(data.get("goal_type", record.goal_type))
        record.subject_domain = str(data.get("subject_domain", record.subject_domain))
        record.required_data_freshness = str(data.get("required_data_freshness", record.required_data_freshness))
        record.output_format = str(data.get("output_format", record.output_format))
        record.safety_constraints = str(data.get("safety_constraints", record.safety_constraints))
        record.urgency_budget = str(data.get("urgency_budget", record.urgency_budget))

        tools = data.get("required_tools") or []
        if isinstance(tools, list):
            record.required_tools = {str(t) for t in tools}

        confidence = data.get("confidence") or {}
        if isinstance(confidence, dict):
            record.confidence = {str(k): float(v) for k, v in confidence.items()}

        evidence_items = data.get("evidence") or []
        if isinstance(evidence_items, list):
            for item in evidence_items:
                if isinstance(item, dict) and item.get("field") and item.get("text"):
                    record.evidence.append(IntentEvidenceSpan(field=str(item["field"]), text=str(item["text"])))

        record.scratchpad_refs = list(data.get("scratchpad_refs") or [])
        record.clarifications = list(data.get("clarifications") or [])
        return record


# Shared singleton
intent_service = LaboratoryIntentService()

