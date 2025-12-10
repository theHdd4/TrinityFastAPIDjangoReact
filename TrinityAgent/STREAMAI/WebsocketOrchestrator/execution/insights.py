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

# Import workflow_insight_agent - try both paths for Docker and local development
try:  # pragma: no cover
    from Agent_Insight.workflow_insight_agent import get_workflow_insight_agent
except ImportError:  # pragma: no cover
    try:
        from TrinityAgent.Agent_Insight.workflow_insight_agent import get_workflow_insight_agent
    except ImportError:  # pragma: no cover
        # Fallback: define a no-op function
        def get_workflow_insight_agent():
            return None



class WorkflowInsightsMixin:
    """Execution helper mixin extracted from WorkflowExecutionMixin."""
    async def _generate_step_insight(
            self,
            step: WorkflowStepPlan,
            total_steps: int,
            atom_prompt: str,
            parameters: Dict[str, Any],
            execution_result: Dict[str, Any],
            execution_success: bool
        ) -> Optional[str]:
            """Summarize a completed step using a dedicated LLM call."""
            if aiohttp is None:
                logger.debug("🔇 Skipping insight generation (aiohttp not available)")
                return None
            if not self.llm_api_url or not self.llm_model:
                logger.debug("🔇 Skipping insight generation (LLM config missing)")
                return None

            try:
                insight_prompt = self._build_step_insight_prompt(
                    step=step,
                    total_steps=total_steps,
                    atom_prompt=atom_prompt,
                    parameters=parameters,
                    execution_result=execution_result,
                    execution_success=execution_success
                )
                if not insight_prompt:
                    return None
                return await self._call_insight_llm(insight_prompt)
            except Exception as insight_error:
                logger.warning(f"⚠️ Step insight generation failed: {insight_error}")
                return None

    async def _generate_atom_insights(
            self,
            goal: str,
            step: WorkflowStepPlan,
            execution_result: Dict[str, Any],
        ) -> List[Dict[str, str]]:
            """Generate structured business-first insights for an atom output."""

            goal_text = goal or ""
            facts = self._build_atom_facts(step, execution_result)
            data_hash = self._compute_data_hash(facts)

            try:
                loop = asyncio.get_event_loop()
                return await loop.run_in_executor(
                    None,
                    lambda: generate_insights(
                        goal=goal_text,
                        facts=facts,
                        data_hash=data_hash,
                        atom_id=step.atom_id,
                    ),
                )
            except Exception as atom_insight_error:  # noqa: BLE001
                logger.debug(
                    "🔇 Atom insight generation failed for %s: %s",
                    step.atom_id,
                    atom_insight_error,
                    exc_info=True,
                )
                return [
                    {
                        "insight": "No actionable insight",
                        "impact": "Insufficient context from this step.",
                        "risk": "LLM or parsing error encountered.",
                        "next_action": "Review the atom output manually and retry later.",
                    }
                ]

    async def _call_insight_llm(self, prompt: str) -> Optional[str]:
            """Invoke the configured LLM to obtain a step insight."""
            if not prompt.strip():
                return None
            if aiohttp is None:
                return None

            # Print full prompt to terminal
            print("\n" + "="*80)
            print("🚀 STREAMAI WEBSOCKET INSIGHT LLM CALL - FULL PROMPT")
            print("="*80)
            print(f"API URL: {self.llm_api_url}")
            print(f"Model: {self.llm_model}")
            print(f"Temperature: 0.2, Max Tokens: 600")
            print(f"Prompt Length: {len(prompt)} characters")
            print("-"*80)
            print("FULL PROMPT:")
            print("-"*80)
            print(prompt)
            print("="*80 + "\n")

            headers = {"Content-Type": "application/json"}
            if self.bearer_token:
                headers["Authorization"] = f"Bearer {self.bearer_token}"

            payload = {
                "model": self.llm_model,
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "You are Workstream AI Insights, producing concise narratives for each workflow step. "
                            "Follow the requested output structure exactly."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.2,
                "max_tokens": 600,
            }

            try:
                async with aiohttp.ClientSession() as session:
                    async with session.post(
                        self.llm_api_url,
                        json=payload,
                        headers=headers,
                        timeout=aiohttp.ClientTimeout(total=90),
                    ) as response:
                        # Get raw response text
                        raw_response_text = await response.text()

                        # Print raw API response to terminal
                        print("\n" + "="*80)
                        print("📥 STREAMAI WEBSOCKET INSIGHT LLM - RAW RESPONSE")
                        print("="*80)
                        print(f"Status Code: {response.status}")
                        print("-"*80)
                        print("RAW JSON RESPONSE:")
                        print("-"*80)
                        print(raw_response_text)
                        print("="*80 + "\n")

                        if response.status >= 400:
                            error_text = raw_response_text
                            logger.warning(
                                f"⚠️ Insight LLM call failed: HTTP {response.status} {error_text[:200]}"
                            )
                            print(f"\n❌ STREAMAI INSIGHT LLM ERROR: HTTP {response.status} - {error_text[:200]}\n")
                            return None
                        body = await response.json()
            except Exception as req_error:
                logger.warning(f"⚠️ Insight LLM request error: {req_error}")
                print(f"\n❌ STREAMAI INSIGHT LLM REQUEST ERROR: {req_error}\n")
                return None

            content = ""
            if isinstance(body, dict):
                choices = body.get("choices")
                if choices:
                    content = choices[0].get("message", {}).get("content", "")
                elif "message" in body:
                    content = body["message"].get("content", "")

            return content.strip() or None

    async def _emit_workflow_insight(
            self,
            websocket,
            sequence_id: str,
            plan: WorkflowPlan,
            user_prompt: str,
            project_context: Dict[str, Any],
            additional_context: str = ""
        ) -> None:
            """Generate and stream the final workflow-level insight paragraph."""
            try:
                # 🔧 CRITICAL FIX: Check if websocket connection is still alive before proceeding
                try:
                    # Try to check connection state
                    if hasattr(websocket, 'client_state'):
                        if websocket.client_state.name == 'DISCONNECTED':
                            logger.warning(f"⚠️ WebSocket client disconnected, skipping workflow insight for {sequence_id}")
                            return
                    if hasattr(websocket, 'application_state'):
                        if websocket.application_state.name == 'DISCONNECTED':
                            logger.warning(f"⚠️ WebSocket application disconnected, skipping workflow insight for {sequence_id}")
                            return
                except Exception as state_check_error:
                    logger.debug(f"Could not check websocket state: {state_check_error}")
                    # Continue anyway - the send will fail gracefully if disconnected

                step_records = self._collect_workflow_step_records(sequence_id, plan)
                if not step_records:
                    logger.info("Skipped workflow insight emission (no step records)")
                    return

                agent = get_workflow_insight_agent()
                if agent is None:
                    logger.warning("⚠️ Workflow insight agent unavailable; skipping insight generation")
                    return
                payload = {
                    "user_prompt": user_prompt,
                    "step_records": step_records,
                    "session_id": sequence_id,
                    "workflow_id": sequence_id,
                    "available_files": self._sequence_available_files.get(sequence_id, []),
                    "generated_files": self._collect_generated_files(sequence_id),
                    "additional_context": additional_context,
                    "client_name": project_context.get("client_name", ""),
                    "app_name": project_context.get("app_name", ""),
                    "project_name": project_context.get("project_name", ""),
                    "metadata": {"total_steps": plan.total_steps},
                }

                loop = asyncio.get_running_loop()
                result = await loop.run_in_executor(None, lambda: agent.generate_workflow_insight(payload))

                if not result.get("success"):
                    logger.warning("Workflow insight agent returned error: %s", result.get("error"))
                    try:
                        await self._send_event(
                            websocket,
                            WebSocketEvent(
                                "workflow_insight_failed",
                                {
                                    "sequence_id": sequence_id,
                                    "error": result.get("error") or "Insight agent returned unsuccessful response",
                                },
                            ),
                            "workflow_insight_failed event",
                        )
                    except (WebSocketDisconnect, RuntimeError) as send_error:
                        logger.info(f"🔌 Connection closed while sending workflow_insight_failed: {send_error}")
                    return

                # 🔧 CRITICAL FIX: Check connection again before sending insight (connection might have closed during LLM call)
                try:
                    if hasattr(websocket, 'client_state') and websocket.client_state.name == 'DISCONNECTED':
                        logger.warning(f"⚠️ WebSocket disconnected during insight generation, skipping send for {sequence_id}")
                        return
                except Exception:
                    pass  # Continue - send will fail gracefully if disconnected

                # 🔧 CRITICAL FIX: Send insight and ensure it's delivered before any cleanup
                try:
                    await self._send_event(
                        websocket,
                        WebSocketEvent(
                            "workflow_insight",
                            {
                                "sequence_id": sequence_id,
                                "insight": result.get("insight"),
                                "used_steps": result.get("used_steps"),
                                "files_profiled": result.get("files_profiled"),
                            },
                        ),
                        "workflow_insight event",
                    )
                    logger.info("✅ Workflow insight emitted for %s", sequence_id)

                    # 🔧 CRITICAL FIX: Small delay to ensure message is sent before connection might close
                    # Note: asyncio is already imported at the top of the file
                    await asyncio.sleep(0.1)  # 100ms delay to ensure message delivery
                    logger.info("✅ Workflow insight delivery confirmed for %s", sequence_id)
                except WebSocketDisconnect:
                    logger.warning(f"⚠️ Connection closed while sending workflow insight for {sequence_id}")
                    raise
            except WebSocketDisconnect as ws_exc:
                logger.info(f"🔌 WebSocket disconnected during workflow insight generation for {sequence_id}: {ws_exc}")
                # Connection was destroyed - this is expected if client closed connection
            except Exception as exc:  # pragma: no cover - defensive logging
                logger.warning("⚠️ Failed to emit workflow insight: %s", exc, exc_info=True)
                try:
                    await self._send_event(
                        websocket,
                        WebSocketEvent(
                            "workflow_insight_failed",
                            {
                                "sequence_id": sequence_id,
                                "error": str(exc),
                            },
                        ),
                        "workflow_insight_failed event",
                    )
                except (WebSocketDisconnect, RuntimeError) as send_error:
                    logger.debug(f"Unable to notify client about workflow insight failure (connection closed): {send_error}")
                except Exception as send_exc:
                    logger.debug(f"Unable to notify client about workflow insight failure: {send_exc}")
