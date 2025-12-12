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



class WorkflowEventsMixin:
    """Execution helper mixin extracted from WorkflowExecutionMixin."""

    def _get_ws_send_cache(self, websocket) -> dict:
        """Return (and attach) a cache used to dedupe websocket messages."""

            cache = getattr(websocket, "_trinity_sent_messages", None)
            if cache is None:
                cache = {}
                setattr(websocket, "_trinity_sent_messages", cache)
            return cache

    def _normalized_message_signature(self, payload) -> str | None:
        """Return a normalized message-based signature for cross-module dedupe."""

        if not isinstance(payload, dict):
            return None

        message = payload.get("message")
        if not isinstance(message, str):
            return None

        normalized = re.sub(r"\s+", " ", message).strip().lower()
        return f"msg::{normalized}" if normalized else None

    async def _safe_close_websocket(self, websocket, code: int = 1000, reason: str = "") -> None:
            """Close websocket with a status code while swallowing close errors."""
            try:
                if hasattr(websocket, "close_code") and websocket.close_code:
                    return  # Already closing or closed
                await websocket.close(code=code, reason=reason)
            except Exception as close_error:  # pragma: no cover - defensive
                logger.debug(f"WebSocket close failed (code={code}, reason={reason}): {close_error}")

    async def _send_event(
            self,
            websocket,
            event: WebSocketEvent,
            context: str
        ) -> None:
            """Safely send WebSocket event, converting close errors to disconnects."""
            try:
                # Quick check before sending
                if not self._is_websocket_connected(websocket):
                    logger.warning(f"⚠️ WebSocket disconnected, skipping {context}")
                    raise WebSocketDisconnect(code=1006)

                cache = self._get_ws_send_cache(websocket)
                signatures = []

                signature_parts = [event.event_type]
                if isinstance(event.payload, dict):
                    message_value = event.payload.get("message")
                    if message_value:
                        signature_parts.append(str(message_value))
                signatures.append("::".join(signature_parts))

                msg_signature = self._normalized_message_signature(event.payload)
                if msg_signature:
                    signatures.append(msg_signature)

                if any(cache.get(sig) for sig in signatures):
                    logger.debug("Skipping duplicate event %s", " | ".join(signatures))
                    return

                await websocket.send_text(event.to_json())
                for sig in signatures:
                    cache[sig] = True
            except WebSocketDisconnect:
                logger.info(f"🔌 WebSocket disconnected during {context}")
                raise
            except RuntimeError as runtime_error:
                message = str(runtime_error)
                if 'Cannot call "send" once a close message has been sent' in message:
                    logger.info(f"🔌 WebSocket already closed while sending {context}")
                    raise WebSocketDisconnect(code=1006)
                raise
