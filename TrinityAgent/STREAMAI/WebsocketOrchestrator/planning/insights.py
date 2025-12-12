from __future__ import annotations

import asyncio
import contextlib
import copy
import hashlib
import difflib
import json
import logging
import os
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Set, Tuple

from ..common import aiohttp, generate_insights, logger, memory_storage_module, summarize_chat_messages, WebSocketDisconnect
from ..constants import DATASET_OUTPUT_ATOMS, PREFERS_LATEST_DATASET_ATOMS
from ..types import ReActState, RetryableJSONGenerationError, StepEvaluation, WebSocketEvent, WorkflowPlan, WorkflowStepPlan
from STREAMAI.lab_context_builder import LabContextBuilder
from STREAMAI.lab_memory_models import LaboratoryEnvelope, WorkflowStepRecord
from STREAMAI.lab_memory_store import LabMemoryStore
from ...atom_mapping import ATOM_MAPPING
from ...graphrag import GraphRAGWorkspaceConfig
from ...graphrag.client import GraphRAGQueryClient
from ...graphrag.prompt_builder import GraphRAGPromptBuilder, PhaseOnePrompt as GraphRAGPhaseOnePrompt
from STREAMAI.laboratory_retriever import LaboratoryRetrievalPipeline
from STREAMAI.stream_rag_engine import StreamRAGEngine
from STREAMAI.intent_service import IntentService
from STREAMAI.result_extractor import ResultExtractor



class WorkflowInsightsMixin:
    """Planning helper mixin extracted from WorkflowPlanningMixin."""
    def _compose_business_context(
            self,
            step: WorkflowStepPlan,
            atom_prompt: str,
            execution_result: Dict[str, Any],
        ) -> str:
            """Create a business-focused context block for the insight prompt."""

            if not self.laboratory_retriever:
                return ""

            execution_result = execution_result or {}

            query_parts = [
                step.description,
                atom_prompt,
                getattr(step, "atom_prompt", ""),
                getattr(step, "prompt", ""),
            ]
            query = " ".join([part for part in query_parts if part]) or step.atom_id

            try:
                return self.laboratory_retriever.generate_business_insights(
                    atom_id=step.atom_id,
                    query=query,
                    execution_result=execution_result,
                    top_n=3,
                )
            except Exception as business_exc:
                logger.debug("🔇 Business context skipped: %s", business_exc)
                return ""

    def _build_step_insight_prompt(
            self,
            step: WorkflowStepPlan,
            total_steps: int,
            atom_prompt: str,
            parameters: Dict[str, Any],
            execution_result: Dict[str, Any],
            execution_success: bool
        ) -> str:
            """Construct the narrative prompt for the insight LLM."""
            base_prompt = atom_prompt or step.atom_prompt or step.prompt or ""
            if not base_prompt and not execution_result:
                return ""

            params_str = self._safe_json_dumps(parameters or {}, fallback="{}")
            result_preview = self._extract_result_preview(execution_result)
            business_context = self._compose_business_context(step, base_prompt, execution_result)

            status_text = "SUCCESS" if execution_success else "FAILED"
            output_alias = step.output_alias or "not_specified"
            files_used = ", ".join(step.files_used or []) or "none"
            inputs_used = ", ".join(step.inputs or []) or "none"

            return (
                "You are Workstream AI Insights, a narrator that explains each workflow step in plain language.\n"
                "Summarize what the step accomplished, what tangible outputs we now possess, "
                "and how it positions the user for the following step.\n\n"
                "STEP CONTEXT\n"
                f"- Step: {step.step_number} of {total_steps}\n"
                f"- Atom ID: {step.atom_id}\n"
                f"- Planner Description: {step.description}\n"
                f"- Files Referenced: {files_used}\n"
                f"- Inputs: {inputs_used}\n"
                f"- Output Handle: {output_alias}\n"
                f"- Execution Status: {status_text}\n\n"
                "PROMPT SENT TO ATOM\n"
                f"{base_prompt}\n\n"
                "ATOM PARAMETERS\n"
                f"{params_str}\n\n"
                "RESULT SNAPSHOT\n"
                f"{result_preview}\n\n"
                f"BUSINESS CONTEXT\n{business_context}\n\n" if business_context else ""
                "RESPONSE REQUIREMENTS\n"
                "- Keep total response under 120 words.\n"
                "- Use Markdown with three sections in this order:\n"
                "  1. Step Summary – 1-2 sentences describing what happened and outcome.\n"
                "  2. What We Obtained – bullet list (max 3) referencing concrete outputs, mention "
                f"`{output_alias}` when relevant.\n"
                "  3. Ready For Next Step – single sentence explaining how the result can be used next.\n"
                "- Call out blockers or missing data if the step failed.\n"
                "- Do not fabricate metrics; rely only on the supplied snapshot.\n"
            )

    def _extract_result_preview(self, data: Any, max_chars: int = 2000) -> str:
            """Serialize execution result data into a bounded-length snippet."""
            if data is None:
                return "No execution result payload returned."
            try:
                serialized = json.dumps(data, indent=2, default=str)
            except (TypeError, ValueError):
                serialized = str(data)

            if len(serialized) > max_chars:
                return f"{serialized[:max_chars]}... (truncated)"
            return serialized

    def _safe_json_dumps(self, payload: Any, fallback: str = "{}") -> str:
            """Serialize parameters safely for inclusion in prompts."""
            if payload is None:
                return fallback
            try:
                return json.dumps(payload, indent=2, default=str)
            except (TypeError, ValueError):
                return str(payload)

    def _normalize_config_file_value(self, value: Any) -> str:
            """Normalize file value from config to a usable string."""
            if isinstance(value, list):
                value = value[0] if value else ""
            if value is None:
                return ""
            return str(value).strip()

    def _extract_filename(self, value: str) -> str:
            """Normalize stored object names for downstream API calls.

            Keep full object path when provided (e.g. includes sub-directories like
            `concatenated-data/`), but strip leading control characters such as '@'
            and normalise path separators.
            """
            if not value:
                return value

            normalized = str(value).strip()
            if normalized.startswith("@"):
                normalized = normalized[1:]

            normalized = normalized.replace("\\", "/")
            logger.info(f"📁 Normalized file reference: original='{value}' normalized='{normalized}'")
            return normalized

    def _build_auto_save_filename(
            self,
            workflow_step: WorkflowStepPlan,
            default_prefix: str
        ) -> str:
            """Construct deterministic filename for auto-saved outputs."""
            base = workflow_step.output_alias or f"{default_prefix}_step_{workflow_step.step_number}"
            sanitized = self._sanitize_filename(base)
            timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            filename = f"{sanitized}_{timestamp}"
            if not filename.endswith(".arrow"):
                filename += ".arrow"
            return filename

    def _sanitize_filename(self, value: str) -> str:
            """Sanitize filename to include only safe characters."""
            if not value:
                return "stream_step"
            sanitized = re.sub(r'[^A-Za-z0-9_\-]+', "_", value).strip("_")
            return sanitized or "stream_step"

    def _record_step_execution_result(
            self,
            sequence_id: str,
            step_number: int,
            atom_id: str,
            execution_result: Dict[str, Any],
            insight: Optional[str] = None,
            atom_insights: Optional[List[Dict[str, str]]] = None,
        ) -> None:
            """Cache step execution results and generated insights for later use."""
            cache = self._step_execution_cache.setdefault(sequence_id, {})
            cache[step_number] = {
                "atom_id": atom_id,
                "execution_result": execution_result,
                "recorded_at": datetime.utcnow().isoformat(),
                "insight": insight,
                "atom_insights": atom_insights or [],
            }

    def _collect_workflow_step_records(
            self,
            sequence_id: str,
            plan: WorkflowPlan
        ) -> List[Dict[str, Any]]:
            """Prepare structured step records for the workflow insight agent."""
            cache = self._step_execution_cache.get(sequence_id, {})
            if not cache:
                return []

            saved_files = self._step_output_files.get(sequence_id, {}) or {}
            records: List[Dict[str, Any]] = []

            for step in plan.workflow_steps:
                step_cache = cache.get(step.step_number)
                if not step_cache:
                    continue

                execution_result = step_cache.get("execution_result")
                record = {
                    "step_number": step.step_number,
                    "agent": step.atom_id,
                    "description": step.description,
                    "insight": step_cache.get("insight"),
                    "atom_insights": step_cache.get("atom_insights") or [],
                    "result_preview": self._extract_result_preview(execution_result),
                    "output_files": [],
                }

                saved_path = saved_files.get(step.step_number)
                if saved_path:
                    record["output_files"].append(saved_path)

                records.append(record)

            return records

    def _collect_generated_files(self, sequence_id: str) -> List[str]:
            """Return all files auto-saved during the workflow."""
            step_outputs = self._step_output_files.get(sequence_id)
            if not step_outputs:
                return []
            return list(dict.fromkeys(step_outputs.values()))
