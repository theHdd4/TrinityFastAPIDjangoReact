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



class WorkflowHistoryMixin:
    """Planning helper mixin extracted from WorkflowPlanningMixin."""
    def _load_persisted_chat_summary(
            self,
            chat_id: Optional[str],
            project_context: Optional[Dict[str, Any]],
        ) -> Optional[str]:
            if not chat_id or not self._memory_storage:
                return None

            context = project_context or {}
            client_name = context.get("client_name")
            app_name = context.get("app_name")
            project_name = context.get("project_name")

            try:
                record = self._memory_storage.load_chat(
                    chat_id,
                    client_name=client_name,
                    app_name=app_name,
                    project_name=project_name,
                )
            except Exception as exc:  # pragma: no cover - defensive logging
                logger.warning("⚠️ Failed to load persisted chat %s: %s", chat_id, exc)
                return None

            if not record:
                return None

            messages = record.get("messages") or []
            if not messages:
                return None

            if self._memory_summarizer:
                return self._memory_summarizer(messages)
            return self._fallback_history_summary(messages)

    def _fallback_history_summary(
            self,
            messages: List[Dict[str, Any]],
            limit: int = 6,
        ) -> str:
            lines: List[str] = []
            for msg in messages[-limit:]:
                sender_raw = str(msg.get("sender") or msg.get("role") or "assistant").strip()
                sender = sender_raw.capitalize() or "Assistant"
                content = self._condense_text(str(msg.get("content") or ""))
                if not content:
                    continue
                if len(content) > 180:
                    content = content[:177].rstrip() + "..."
                lines.append(f"{sender}: {content}")
            return "\n".join(lines)

    def _apply_history_context(self, latest_prompt: str, history_summary: Optional[str]) -> str:
            if not history_summary:
                return latest_prompt
            summary = history_summary.strip()
            if not summary:
                return latest_prompt
            latest = latest_prompt.strip()
            combined = (
                "Previous conversation summary (use it for continuity, avoid repeating completed work):\n"
                f"{summary}\n\n"
                "Latest user request:\n"
                f"{latest}"
            )
            return combined.strip()

    def _combine_history_sources(
            self,
            frontend_summary: Optional[str],
            persisted_summary: Optional[str],
        ) -> Optional[str]:
            parts: List[str] = []
            for source in (frontend_summary, persisted_summary):
                if source and source.strip():
                    parts.append(source.strip())
            if not parts:
                return None
            if len(parts) == 1:
                return parts[0]
            return "\n\n".join(parts)

    def _append_file_focus_note(self, prompt: str, files: Optional[List[str]]) -> str:
            if not files:
                return prompt
            sanitized = [f for f in files if isinstance(f, str) and f.strip()]
            if not sanitized:
                return prompt
            file_lines = "\n".join(f"- {entry.strip()}" for entry in sanitized[:10])
            note = (
                "\n\nFiles referenced in this chat (preserve these exact names and prioritize their usage):\n"
                f"{file_lines}"
            )
            return f"{prompt}{note}"

    def _normalize_file_reference(self, value: Optional[str]) -> Optional[str]:
            if not value or not isinstance(value, str):
                return None
            cleaned = value.strip()
            return cleaned or None

    def _merge_file_references(
            self,
            existing: Optional[List[str]],
            new_refs: Optional[List[str]],
        ) -> List[str]:
            merged: List[str] = []
            seen: Set[str] = set()

            def _add(values: Optional[List[str]]) -> None:
                if not values:
                    return
                for entry in values:
                    if not isinstance(entry, str):
                        continue
                    cleaned = self._normalize_file_reference(entry)
                    if not cleaned:
                        continue
                    key = cleaned.lower()
                    if key in seen:
                        continue
                    seen.add(key)
                    merged.append(cleaned)

            _add(existing)
            _add(new_refs)
            return merged
