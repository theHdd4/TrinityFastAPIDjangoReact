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



class WorkflowJsonGenerationMixin:
    """Planning helper mixin extracted from WorkflowPlanningMixin."""
    async def _retry_llm_json_generation(
            self,
            llm_call_func: Callable,
            step_name: str,
            max_attempts: int = 3,
            status_callback: Optional[Callable[[int, float, bool], Any]] = None,
            attempt_timeout: Optional[float] = None,
            pause_after_timeout: bool = False
        ) -> Any:
            """
            Retry mechanism for LLM JSON generation.

            Args:
                llm_call_func: Async function that calls LLM and returns JSON-parsed result
                step_name: Name of the step (for logging)
                max_attempts: Maximum number of retry attempts (default: 3)

            Returns:
                Parsed JSON result from LLM

            Raises:
                RetryableJSONGenerationError: If all retry attempts fail
            """
            last_error = None
            last_content = None

            for attempt in range(1, max_attempts + 1):
                start_time = datetime.utcnow()
                status_task = None
                try:
                    logger.info(f"🔄 [{step_name}] Attempt {attempt}/{max_attempts}: Calling LLM for JSON generation...")
                    if status_callback:
                        status_task = asyncio.create_task(
                            self._periodic_generation_status(
                                status_callback=status_callback,
                                step_name=step_name,
                                attempt=attempt,
                                start_time=start_time,
                                max_elapsed=attempt_timeout or self.llm_attempt_timeout_seconds,
                            )
                        )

                    if attempt_timeout:
                        result = await asyncio.wait_for(llm_call_func(), timeout=attempt_timeout)
                    else:
                        result = await llm_call_func()
                    logger.info(f"✅ [{step_name}] Attempt {attempt} succeeded: Valid JSON generated")
                    return result
                except asyncio.TimeoutError as e:
                    last_error = e
                    logger.warning(
                        f"⚠️ [{step_name}] Attempt {attempt}/{max_attempts} timed out after {attempt_timeout or self.llm_attempt_timeout_seconds}s"
                    )
                    if status_callback:
                        try:
                            await status_callback(attempt, (datetime.utcnow() - start_time).total_seconds(), True)
                        except Exception:
                            logger.debug("⚠️ Status callback failed after timeout", exc_info=True)
                    if pause_after_timeout:
                        raise
                except json.JSONDecodeError as e:
                    last_error = e
                    logger.warning(f"⚠️ [{step_name}] Attempt {attempt}/{max_attempts} failed: Invalid JSON - {e}")
                    if attempt < max_attempts:
                        logger.info(f"🔄 [{step_name}] Retrying with same prompt...")
                    else:
                        logger.error(f"❌ [{step_name}] All {max_attempts} attempts failed to generate valid JSON")
                except ValueError as e:
                    last_error = e
                    logger.warning(f"⚠️ [{step_name}] Attempt {attempt}/{max_attempts} failed: Validation error - {e}")
                    if attempt < max_attempts:
                        logger.info(f"🔄 [{step_name}] Retrying with same prompt...")
                    else:
                        logger.error(f"❌ [{step_name}] All {max_attempts} attempts failed: {e}")
                except Exception as e:
                    last_error = e
                    logger.warning(f"⚠️ [{step_name}] Attempt {attempt}/{max_attempts} failed: {type(e).__name__} - {e}")
                    if attempt < max_attempts:
                        logger.info(f"🔄 [{step_name}] Retrying with same prompt...")
                    else:
                        logger.error(f"❌ [{step_name}] All {max_attempts} attempts failed: {e}")
                finally:
                    if status_task:
                        status_task.cancel()
                        with contextlib.suppress(Exception):
                            await status_task

            # All attempts failed
            error_msg = (
                f"Failed to generate valid JSON for '{step_name}' after {max_attempts} attempts. "
                f"Please rephrase your query in a clearer way."
            )
            raise RetryableJSONGenerationError(error_msg, max_attempts, last_error)

    async def _periodic_generation_status(
            self,
            status_callback: Callable[[int, float, bool], Any],
            step_name: str,
            attempt: int,
            start_time: datetime,
            max_elapsed: float,
        ) -> None:
            """Emit periodic status updates while waiting on a long LLM call."""
            try:
                while True:
                    await asyncio.sleep(self.llm_status_interval_seconds)
                    elapsed = (datetime.utcnow() - start_time).total_seconds()
                    try:
                        await status_callback(attempt, elapsed, False)
                    except Exception:
                        logger.debug("⚠️ Failed to emit generation heartbeat", exc_info=True)
                    if elapsed >= max_elapsed:
                        return
            except asyncio.CancelledError:
                return
