"""Deterministic context builder for Trinity AI Laboratory Mode."""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from BaseAgent.config import settings
from STREAMAI.lab_memory_models import (
    AnalysisInsights,
    BusinessGoals,
    LaboratoryEnvelope,
    LaboratoryMemoryDocument,
    WorkflowState,
    WorkflowStepRecord,
)
from STREAMAI.lab_memory_store import LabMemoryStore

logger = logging.getLogger("trinity.trinityai.lab_context_builder")


class LabContextBuilder:
    """Build deterministic, reproducible context for laboratory mode."""

    prompt_template_version: str = "lab-context-v1"
    prompt_template: str = (
        "You are running in TRINITY LABORATORY MODE. "
        "Preserve prior decisions, never contradict earlier outputs, "
        "surface uncertainty, and request missing data instead of inventing details. "
        "Always cite evidence from loaded context."
    )

    def __init__(self, store: LabMemoryStore) -> None:
        self.store = store
        self.deterministic_params = {
            "temperature": 0,
            "top_p": 0.9,
            "max_tokens": 2048,
            "tool_choice": "auto",
        }

    @staticmethod
    def _hash_payload(payload: Dict[str, Any]) -> str:
        serialized = json.dumps(payload, sort_keys=True, ensure_ascii=False, default=str)
        return hashlib.sha256(serialized.encode("utf-8")).hexdigest()

    def build_envelope(
        self,
        request_id: str,
        session_id: str,
        user_id: str,
        model_version: str,
        feature_flags: Optional[Dict[str, Any]],
        prompt_template: str,
        prompt_template_version: Optional[str] = None,
        raw_inputs: Optional[Dict[str, Any]] = None,
    ) -> LaboratoryEnvelope:
        template_version = prompt_template_version or self.prompt_template_version
        prompt_hash = hashlib.sha256(prompt_template.encode("utf-8")).hexdigest()
        input_hash = self._hash_payload(raw_inputs or {})
        return LaboratoryEnvelope(
            request_id=request_id,
            session_id=session_id,
            user_id=user_id,
            timestamp=datetime.utcnow(),
            model_version=model_version,
            prompt_template_version=template_version,
            feature_flags=feature_flags or {},
            prompt_template_hash=prompt_hash,
            input_hash=input_hash,
            deterministic_params=self.deterministic_params,
        )

    def _build_workflow_state(self, execution_history: List[Dict[str, Any]], envelope: LaboratoryEnvelope) -> WorkflowState:
        steps: List[WorkflowStepRecord] = []
        for entry in execution_history:
            steps.append(
                WorkflowStepRecord(
                    step_number=entry.get("step_number", 0),
                    atom_id=entry.get("atom_id", "unknown"),
                    inputs=entry.get("inputs", {}),
                    outputs=entry.get("result", {}),
                    tool_calls=entry.get("tool_calls") or [],
                    decision_rationale=entry.get("description"),
                    edge_cases=entry.get("edge_cases") or [],
                )
            )
        return WorkflowState(
            steps=steps,
            template_hash=envelope.prompt_template_hash,
            input_hash=envelope.input_hash,
        )

    def _build_business_goals(self, user_prompt: str, project_context: Dict[str, Any]) -> BusinessGoals:
        goals = [user_prompt]
        constraints = []
        success = []
        decision_log = []
        acceptance = []

        context_constraints = project_context.get("constraints") or []
        if isinstance(context_constraints, list):
            constraints.extend(context_constraints)

        business_rules = project_context.get("business_rules") or []
        if isinstance(business_rules, list):
            decision_log.extend(business_rules)

        success_criteria = project_context.get("success_criteria") or []
        if isinstance(success_criteria, list):
            success.extend(success_criteria)

        acceptance_checks = project_context.get("acceptance_checks") or []
        if isinstance(acceptance_checks, list):
            acceptance.extend(acceptance_checks)

        return BusinessGoals(
            user_intent=user_prompt,
            success_criteria=success,
            constraints=constraints,
            decision_log=decision_log,
            acceptance_checks=acceptance,
        )

    def _build_analysis_insights(self, history_summary: Optional[str]) -> AnalysisInsights:
        if not history_summary:
            return AnalysisInsights()
        observations = [segment.strip() for segment in history_summary.split("\n") if segment.strip()]
        return AnalysisInsights(
            observations=observations,
            rationale="Prior chat summary injected for deterministic replay.",
        )

    def load_context_bundle(
        self,
        envelope: LaboratoryEnvelope,
        freshness_minutes: int = 360,
        project_context: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        return self.store.load_recent_documents(
            session_id=envelope.session_id,
            model_version=envelope.model_version,
            prompt_template_version=envelope.prompt_template_version,
            max_docs=5,
            freshness_minutes=freshness_minutes,
            project_context=project_context,
        )

    @staticmethod
    def _serialize_bundle(bundle: List[Dict[str, Any]]) -> str:
        normalized = []
        for record in bundle:
            normalized.append({
                "request_id": record.get("request_id"),
                "timestamp": record.get("timestamp"),
                "business_goals": record.get("business_goals", {}),
                "analysis_insights": record.get("analysis_insights", {}),
                "workflow_snapshot": [
                    {
                        "step_number": step.get("step_number"),
                        "atom_id": step.get("atom_id"),
                        "decision_rationale": step.get("decision_rationale"),
                    }
                    for step in (record.get("workflow_state", {}) or {}).get("steps", [])
                ],
            })
        return json.dumps(normalized, ensure_ascii=False, sort_keys=True, default=str)

    def merge_context_into_prompt(self, user_prompt: str, bundle: List[Dict[str, Any]]) -> str:
        if not bundle:
            return f"{self.prompt_template}\n\n{user_prompt}"

        bundle_text = self._serialize_bundle(bundle)
        guardrails = (
            "Use the following persisted laboratory context. "
            "Maintain consistency with prior decisions and goals. "
            "If information is missing, ask clarifying questions instead of inventing details."
        )
        return (
            f"{self.prompt_template}\n"
            f"Context Bundle (stable, sorted):\n{bundle_text}\n"
            f"Guardrails: {guardrails}\n"
            f"User Request: {user_prompt}"
        )

    def persist_run(
        self,
        envelope: LaboratoryEnvelope,
        user_prompt: str,
        project_context: Dict[str, Any],
        execution_history: List[Dict[str, Any]],
        history_summary: Optional[str] = None,
    ) -> LaboratoryMemoryDocument:
        workflow_state = self._build_workflow_state(execution_history, envelope)
        business_goals = self._build_business_goals(user_prompt, project_context)
        analysis_insights = self._build_analysis_insights(history_summary)
        document = self.store.build_document(
            envelope=envelope,
            workflow_state=workflow_state,
            business_goals=business_goals,
            analysis_insights=analysis_insights,
        )
        self.store.save_document(document, project_context=project_context)
        logger.info(
            "Laboratory memory persisted with %d steps (session=%s request=%s)",
            len(workflow_state.steps),
            envelope.session_id,
            envelope.request_id,
        )
        return document

    def regression_hash(self, prompt: str, bundle: List[Dict[str, Any]]) -> str:
        payload = {"prompt": prompt, "bundle": bundle}
        return LaboratoryMemoryDocument.compute_hash_for_payload(payload)
