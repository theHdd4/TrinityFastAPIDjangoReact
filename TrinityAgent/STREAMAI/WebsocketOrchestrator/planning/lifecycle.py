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



class WorkflowLifecycleMixin:
    """Planning helper mixin extracted from WorkflowPlanningMixin."""
    def _is_websocket_connected(self, websocket) -> bool:
            """Check if WebSocket is still connected."""
            try:
                if hasattr(websocket, 'client_state'):
                    return websocket.client_state.name != 'DISCONNECTED'
                if hasattr(websocket, 'application_state'):
                    return websocket.application_state.name != 'DISCONNECTED'
                # If we can't check state, assume connected (will fail on send if not)
                return True
            except Exception:
                return True

    def _cleanup_sequence_state(self, sequence_id: str) -> None:
            """Remove cached data for a sequence after completion."""
            self._step_execution_cache.pop(sequence_id, None)
            self._step_output_files.pop(sequence_id, None)
            self._sequence_available_files.pop(sequence_id, None)
            self._output_alias_registry.pop(sequence_id, None)
            self._chat_file_mentions.pop(sequence_id, None)
            self._sequence_react_state.pop(sequence_id, None)  # Cleanup ReAct state
            self._sequence_step_plans.pop(sequence_id, None)
            self._sequence_replay_counts.pop(sequence_id, None)
            self._react_step_guards.pop(sequence_id, None)
            self._react_stall_watchdogs.pop(sequence_id, None)
