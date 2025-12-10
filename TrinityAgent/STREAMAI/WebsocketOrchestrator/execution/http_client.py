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



class WorkflowHttpClientMixin:
    """Execution helper mixin extracted from WorkflowExecutionMixin."""
    async def _get_json(self, url: str) -> Dict[str, Any]:
            """Send GET request and return JSON payload."""
            if aiohttp is None:
                raise RuntimeError("aiohttp is required for auto-save HTTP calls but is not installed")

            logger.info(f"🌐 GET {url}")
            timeout = aiohttp.ClientTimeout(total=180)

            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get(url) as response:
                    text_body = await response.text()
                    if response.status >= 400:
                        raise RuntimeError(f"{url} returned {response.status}: {text_body}")

                    if not text_body:
                        return {}

                    try:
                        return json.loads(text_body)
                    except json.JSONDecodeError:
                        logger.warning(f"⚠️ Non-JSON response from {url}: {text_body[:200]}")
                        return {}

    async def _post_json(self, url: str, payload: Dict[str, Any]) -> Dict[str, Any]:
            """Send POST request and return JSON payload."""
            if aiohttp is None:
                raise RuntimeError("aiohttp is required for auto-save HTTP calls but is not installed")

            logger.info(f"🌐 POST {url} payload keys: {list(payload.keys())}")
            timeout = aiohttp.ClientTimeout(total=180)

            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(url, json=payload) as response:
                    text_body = await response.text()
                    if response.status >= 400:
                        raise RuntimeError(f"{url} returned {response.status}: {text_body}")

                    if not text_body:
                        return {}

                    try:
                        return json.loads(text_body)
                    except json.JSONDecodeError:
                        logger.warning(f"⚠️ Non-JSON response from {url}: {text_body[:200]}")
                        return {}

    async def _post_form(self, url: str, form: "aiohttp.FormData") -> Dict[str, Any]:
            """Send POST request with form data and return JSON payload."""
            if aiohttp is None:
                raise RuntimeError("aiohttp is required for auto-save HTTP calls but is not installed")

            logger.info(f"🌐 POST (form) {url}")
            timeout = aiohttp.ClientTimeout(total=180)

            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(url, data=form) as response:
                    text_body = await response.text()
                    if response.status >= 400:
                        raise RuntimeError(f"{url} returned {response.status}: {text_body}")

                    if not text_body:
                        return {}

                    try:
                        return json.loads(text_body)
                    except json.JSONDecodeError:
                        logger.warning(f"⚠️ Non-JSON response from {url}: {text_body[:200]}")
                        return {}
