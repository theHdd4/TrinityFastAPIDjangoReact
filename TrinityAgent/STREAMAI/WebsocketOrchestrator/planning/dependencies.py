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



class WorkflowDependenciesMixin:
    """Planning helper mixin extracted from WorkflowPlanningMixin."""
    def _resolve_step_dependencies(self, sequence_id: str, step: WorkflowStepPlan) -> None:
            """Replace alias placeholders with the actual file paths produced earlier."""
            alias_map = self._output_alias_registry.get(sequence_id)
            if not alias_map:
                return

            def resolve_list(values: Optional[List[str]]) -> Optional[List[str]]:
                if not values:
                    return values
                updated: List[str] = []
                changed = False
                for entry in values:
                    resolved = self._resolve_alias_value(sequence_id, entry)
                    if resolved != entry:
                        changed = True
                    updated.append(resolved)
                return updated if changed else values

            resolved_inputs = resolve_list(step.inputs)
            if resolved_inputs is not step.inputs:
                step.inputs = resolved_inputs or []

            resolved_files = resolve_list(step.files_used)
            if resolved_files is not step.files_used:
                step.files_used = resolved_files or []

            if not step.files_used and step.inputs:
                step.files_used = step.inputs.copy()

    def _register_output_alias(
            self, sequence_id: str, alias: Optional[str], file_path: Optional[str]
        ) -> None:
            """Track which file path was produced for a given output alias."""
            if not alias or not file_path or not isinstance(alias, str):
                return
            alias_map = self._output_alias_registry.setdefault(sequence_id, {})
            normalized = self._normalize_alias_token(alias)
            alias_map[alias.strip()] = file_path
            alias_map[normalized] = file_path

    def _resolve_alias_value(self, sequence_id: str, token: Optional[str]) -> Optional[str]:
            """Resolve an alias token to the stored file path if available."""
            if not token or not isinstance(token, str):
                return token
            alias_map = self._output_alias_registry.get(sequence_id)
            if not alias_map:
                return token
            stripped = token.strip()
            normalized = self._normalize_alias_token(stripped)
            return alias_map.get(stripped) or alias_map.get(normalized) or token

    def _extract_output_file_from_history(
            self,
            sequence_id: str,
            history_entry: Dict[str, Any],
        ) -> Optional[str]:
            """Infer the materialized output file path from a previous execution entry."""
            step_number = history_entry.get("step_number")
            saved_outputs = self._step_output_files.get(sequence_id, {})
            if step_number in saved_outputs:
                return saved_outputs[step_number]

            atom_id = history_entry.get("atom_id", "")
            result = history_entry.get("result", {}) or {}

            if atom_id == "merge" and isinstance(result.get("merge_json"), dict):
                return result.get("merge_json", {}).get("result_file") or result.get("saved_path")
            if atom_id == "concat" and isinstance(result.get("concat_json"), dict):
                return result.get("concat_json", {}).get("result_file") or result.get("saved_path")
            if atom_id in {"create-column", "create-transform", "groupby-wtg-avg", "dataframe-operations"}:
                return result.get("output_file") or result.get("saved_path")

            return result.get("output_file") or result.get("saved_path")

    def _get_latest_materialized_file(
            self,
            sequence_id: str,
            execution_history: List[Dict[str, Any]],
            available_files: List[str],
        ) -> Optional[str]:
            """
            Return the most recent materialized file path for a sequence.

            Preference order:
            1) The newest saved output from execution_history (reverse search)
            2) The latest entry in the sequence's available_files list

            This prevents the planner from accidentally grabbing the oldest
            uploaded file when an intermediate atom has already produced the
            correct dataset for chaining.
            """

            # Look for the latest saved output by walking history backwards
            for hist in reversed(execution_history):
                materialized = self._extract_output_file_from_history(sequence_id, hist)
                if materialized:
                    return materialized

            # Fallback to the tail of the available files list (latest append)
            if available_files:
                return available_files[-1]

            return None

    def _extract_row_count(self, result: Dict[str, Any]) -> Optional[float]:
            """Return a simple row-count metric from flat or nested result payloads."""
            row_keys = ("row_count", "rowcount", "rows", "count", "record_count")
            for key in row_keys:
                value = result.get(key)
                if isinstance(value, (int, float)):
                    return float(value)

            nested_keys = ("merge_json", "concat_json", "groupby_json", "dataframe_result", "result")
            for nested_key in nested_keys:
                nested = result.get(nested_key)
                if isinstance(nested, dict):
                    for key in row_keys:
                        value = nested.get(key)
                        if isinstance(value, (int, float)):
                            return float(value)
            return None

    def _validate_chain_for_next_step(
            self,
            sequence_id: str,
            execution_history: List[Dict[str, Any]],
            next_step: WorkflowStepPlan,
        ) -> Tuple[bool, str]:
            """
            Run sanity checks on the previous step before chaining into the next atom.

            Ensures we don't cascade failures or empty datasets into follow-up operations.
            """
            if not execution_history:
                return True, ""

            last_entry = execution_history[-1]
            last_result = last_entry.get("result", {}) or {}
            if not bool(last_result.get("success", True)):
                return False, "Previous atom failed; re-plan before continuing."

            produced_file = self._extract_output_file_from_history(sequence_id, last_entry)
            available_files = set(self._sequence_available_files.get(sequence_id, []) or [])

            requires_previous_output = False
            dependency_tokens: List[str] = []
            if next_step.files_used:
                dependency_tokens.extend(next_step.files_used)
            if next_step.inputs:
                dependency_tokens.extend(next_step.inputs)

            for value in dependency_tokens:
                normalized = self._resolve_alias_value(sequence_id, value)
                if normalized in {produced_file, last_entry.get("output_alias"), "auto_from_previous"}:
                    requires_previous_output = True
                if normalized in available_files:
                    requires_previous_output = True

            if requires_previous_output and not produced_file:
                return False, "No materialized output from prior step; cannot chain safely."

            if produced_file and requires_previous_output and produced_file not in available_files:
                return False, f"Expected previous output {produced_file} to be available but it is not registered."

            row_count = self._extract_row_count(last_result)
            if requires_previous_output and row_count is not None and row_count <= 0:
                return False, "Previous atom produced an empty dataset; review before continuing."

            return True, ""

    def _normalize_inputs_for_compare(inputs: Any) -> Any:
            if not isinstance(inputs, dict):
                return inputs
            return {key: value for key, value in inputs.items() if key != "prompt"}

    def _find_reusable_atom_metadata(
            self,
            *,
            sequence_id: str,
            request_id: Optional[str],
            step: WorkflowStepPlan,
            parameters: Dict[str, Any],
            project_context: Dict[str, Any],
        ) -> Optional[Dict[str, Any]]:
            """Return matching metadata entry if this atom/input was already executed."""

            if not self.lab_memory_store or not request_id:
                return None

            history = self.lab_memory_store.get_atom_execution_metadata(
                session_id=sequence_id,
                request_id=request_id,
                project_context=project_context,
            )
            normalized_parameters = self._normalize_inputs_for_compare(parameters)

            for entry in history:
                if entry.get("atom_id") != step.atom_id:
                    continue

                if entry.get("step_number") == step.step_number:
                    return entry

                normalized_entry_inputs = self._normalize_inputs_for_compare(entry.get("inputs"))
                if normalized_entry_inputs and normalized_entry_inputs == normalized_parameters:
                    return entry

            return None

    def _enforce_dataframe_guard(
            self, atom_id: str, parameters: Dict[str, Any], session_id: str
        ) -> None:
            """Ensure a prepared dataframe exists before executing dataframe atoms."""

            dataframe_atoms = {
                "dataframe-operations",
                "create-column",
                "create-transform",
                "merge",
                "concat",
                "groupby-wtg-avg",
                "pivot-table",
            }

            if atom_id not in dataframe_atoms:
                return

            available_files = self._sequence_available_files.get(session_id, []) or []
            explicit_files: List[str] = []
            for key in ("file", "file_path", "input_file", "output_file", "result_file", "base_file"):
                value = parameters.get(key)
                if isinstance(value, str):
                    resolved, fuzzy = self._resolve_dataframe_reference(value, available_files)
                    if resolved:
                        explicit_files.append(resolved)
                        if fuzzy:
                            parameters[key] = resolved
                            logger.info(
                                "🔎 Fuzzy-matched dataframe reference '%s' → '%s' for atom %s",
                                value,
                                resolved,
                                atom_id,
                            )
                    else:
                        explicit_files.append(value)

            dataframe_config = parameters.get("dataframe_config")
            if isinstance(dataframe_config, dict):
                operations = dataframe_config.get("operations") or []
                if not operations:
                    raise RuntimeError(
                        "dataframe_config.operations is empty; run df_ops/filters to prepare the dataset before executing atoms."
                    )

            if not available_files and not explicit_files:
                raise RuntimeError(
                    "No dataframe available for execution; ensure df_ops/filters prepared the correct dataset before running this atom."
                )

            if available_files and explicit_files:
                for path in explicit_files:
                    if path not in available_files:
                        raise RuntimeError(
                            f"Requested dataframe '{path}' is not in the prepared set; refresh df_ops context before executing {atom_id}."
                        )

    def _resolve_dataframe_reference(
            self, requested_path: str, available_files: List[str]
        ) -> Tuple[Optional[str], bool]:
            """
            Resolve a dataframe path using fuzzy matching when an exact match is unavailable.

            Returns a tuple of (resolved_path, used_fuzzy_match).
            """

            if not requested_path:
                return None, False

            if requested_path in available_files:
                return requested_path, False

            if not available_files:
                return None, False

            best_match: Optional[str] = None
            best_score = 0.0
            for candidate in available_files:
                score = difflib.SequenceMatcher(None, requested_path.lower(), candidate.lower()).ratio()
                if score > best_score:
                    best_score = score
                    best_match = candidate

            if best_match and best_score >= 0.74:
                return best_match, True

            return None, False

    def _bind_operands_for_replay(
            self,
            sequence_id: str,
            step_plan: WorkflowStepPlan,
            dependency_tokens: List[str],
            available_files: List[str],
        ) -> WorkflowStepPlan:
            """Rebind a cached step plan to the latest operands before replaying."""

            bound_plan = copy.deepcopy(step_plan)
            resolved_operands: List[str] = []

            def _append_if_available(token: str) -> None:
                normalized = self._resolve_alias_value(sequence_id, token)
                if normalized in available_files and normalized not in resolved_operands:
                    resolved_operands.append(normalized)

            for token in dependency_tokens:
                _append_if_available(token)

            if not resolved_operands:
                for token in bound_plan.files_used or []:
                    _append_if_available(token)
                for token in bound_plan.inputs or []:
                    _append_if_available(token)

            if not resolved_operands and available_files:
                resolved_operands.append(available_files[-1])

            if resolved_operands:
                if bound_plan.files_used != resolved_operands:
                    logger.info(
                        "🔧 ReAct: Rebinding replay operands for step %s -> %s",
                        bound_plan.step_number,
                        resolved_operands,
                    )
                bound_plan.files_used = resolved_operands
                bound_plan.inputs = resolved_operands

            return bound_plan

    def _normalize_alias_token(self, alias: str) -> str:
            """Normalize alias references (strip braces, spaces, lowercase)."""
            return re.sub(r"\s+", "", alias.strip("{} ").lower())

    def _build_atom_facts(
            self, step: WorkflowStepPlan, execution_result: Dict[str, Any]
        ) -> Dict[str, Any]:
            """Summarize execution payload into facts for business insight prompts."""

            execution_result = execution_result or {}
            facts: Dict[str, Any] = {
                "atom_id": step.atom_id,
                "description": step.description,
                "result_keys": list(execution_result.keys()),
                "result_preview": self._extract_result_preview(execution_result, max_chars=600),
            }

            for meta_key in ("schema", "columns", "chart_json", "metadata", "summary", "stats"):
                if meta_key in execution_result:
                    facts[meta_key] = execution_result.get(meta_key)

            tabular_rows = self._extract_tabular_rows(execution_result)
            if tabular_rows:
                facts["rows"] = tabular_rows[:50]
                facts["row_count"] = len(tabular_rows)

            return facts

    def _extract_tabular_rows(self, execution_result: Dict[str, Any]) -> List[Dict[str, Any]]:
            """Find tabular payloads from known atom result shapes."""

            for candidate in (
                "table_json",
                "merge_json",
                "groupby_json",
                "concat_json",
                "rows",
                "data",
                "preview",
            ):
                value = execution_result.get(candidate)
                if isinstance(value, list):
                    return value
                if isinstance(value, dict):
                    if isinstance(value.get("data"), list):
                        return value.get("data")  # type: ignore
                    if isinstance(value.get("rows"), list):
                        return value.get("rows")  # type: ignore

            return []

    def _compute_data_hash(self, facts: Dict[str, Any]) -> str:
            """Create a stable hash for caching atom-level insights."""

            serialized = self._safe_json_dumps(facts, fallback="")
            return hashlib.sha256(serialized.encode("utf-8")).hexdigest()
