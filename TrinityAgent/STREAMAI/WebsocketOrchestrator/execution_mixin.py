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

from .common import aiohttp, generate_insights, logger, memory_storage_module, summarize_chat_messages, WebSocketDisconnect
from .constants import DATASET_OUTPUT_ATOMS, PREFERS_LATEST_DATASET_ATOMS
from .types import ReActState, RetryableJSONGenerationError, StepEvaluation, WebSocketEvent, WorkflowPlan, WorkflowStepPlan
from STREAMAI.lab_context_builder import LabContextBuilder
from STREAMAI.lab_memory_models import LaboratoryEnvelope, WorkflowStepRecord
from STREAMAI.lab_memory_store import LabMemoryStore
from ..atom_mapping import ATOM_MAPPING
from ..graphrag import GraphRAGWorkspaceConfig
from ..graphrag.client import GraphRAGQueryClient
from ..graphrag.prompt_builder import GraphRAGPromptBuilder, PhaseOnePrompt as GraphRAGPhaseOnePrompt
from STREAMAI.laboratory_retriever import LaboratoryRetrievalPipeline
from STREAMAI.stream_rag_engine import StreamRAGEngine
from STREAMAI.intent_service import IntentService
from STREAMAI.result_extractor import ResultExtractor


class WorkflowExecutionMixin:
    async def execute_workflow_with_websocket(
            self,
            websocket,
            user_prompt: str,
            available_files: List[str],
            project_context: Dict[str, Any],
            user_id: str,
            frontend_session_id: Optional[str] = None,
            frontend_chat_id: Optional[str] = None,
            websocket_session_id: Optional[str] = None,
            history_override: Optional[str] = None,
            chat_file_names: Optional[List[str]] = None,
            intent_route: Optional[Dict[str, Any]] = None,
        ):
            """
            Execute complete workflow with WebSocket events.

            Uses frontend session ID for proper context isolation between chats.

            Sends events:
            - connected: WebSocket connected
            - plan_generated: Workflow plan ready
            - workflow_started: Execution began
            - card_created: Card created via FastAPI
            - step_started: Step execution started
            - step_completed: Step finished with results
            - workflow_completed: All steps done
            - error: Error occurred
            """
            sequence_id = websocket_session_id or frontend_session_id or f"seq_{uuid.uuid4().hex[:12]}"
            logger.info(
                "🔑 Using session ID: %s (Chat ID: %s, WebSocket Session: %s)",
                sequence_id,
                frontend_chat_id,
                websocket_session_id,
            )
            request_id = uuid.uuid4().hex
            laboratory_mode = (project_context.get("mode") or "laboratory").lower() == "laboratory"
            lab_envelope = None
            lab_bundle: List[Dict[str, Any]] = []
            available_files = list(available_files or [])
            existing_files = self._sequence_available_files.get(sequence_id)
            if existing_files:
                available_files = existing_files
            self._sequence_available_files[sequence_id] = available_files
            # Store project_context for this sequence (needed for dataframe-operations and other agents)
            self._sequence_project_context[sequence_id] = project_context or {}
            if self.lab_memory_store:
                try:
                    self.lab_memory_store.apply_context(project_context)
                    request_id = self.lab_memory_store.get_or_create_request_id(
                        session_id=sequence_id,
                        incoming_request_id=request_id,
                        project_context=project_context,
                    )
                except Exception as ctx_exc:
                    logger.warning("⚠️ Failed to apply project context to lab memory store: %s", ctx_exc)
            if intent_route:
                self._sequence_intent_routing[sequence_id] = intent_route
            logger.info(f"🔧 Stored project context for sequence {sequence_id}: client={project_context.get('client_name', 'N/A')}, app={project_context.get('app_name', 'N/A')}, project={project_context.get('project_name', 'N/A')}")

            resume_mode = False
            react_state: Optional[ReActState] = self._sequence_react_state.get(sequence_id)
            if react_state and react_state.paused:
                resume_mode = True
                react_state.paused = False
                logger.info(
                    "⏯️ Resuming paused ReAct workflow %s from step %s",
                    sequence_id,
                    react_state.paused_at_step or react_state.current_step_number,
                )
                if react_state.awaiting_clarification:
                    logger.info(
                        "🧭 Resuming after clarification for %s; clearing clarification guard",
                        sequence_id,
                    )
                    react_state.awaiting_clarification = False
                    react_state.clarification_context = None

            persisted_history = self._load_persisted_chat_summary(frontend_chat_id, project_context)
            if persisted_history:
                logger.info(
                    "🧠 Loaded persisted chat summary for %s (%d chars)",
                    frontend_chat_id,
                    len(persisted_history),
                )
            else:
                logger.info("ℹ️ No persisted chat summary found for %s", frontend_chat_id)

            history_summary = self._combine_history_sources(history_override, persisted_history)
            if history_override:
                logger.info(
                    "🧠 Received %d chars of history context from frontend payload",
                    len(history_override),
                )

            effective_user_prompt = self._apply_history_context(user_prompt, history_summary)

            file_focus = self._merge_file_references(chat_file_names, None)
            if history_summary:
                history_files = self._extract_file_names_from_prompt(history_summary, available_files)
                file_focus = self._merge_file_references(file_focus, history_files)
            if file_focus:
                self._chat_file_mentions[sequence_id] = file_focus
                effective_user_prompt = self._append_file_focus_note(effective_user_prompt, file_focus)
                logger.info("📁 Tracking %d file references from chat context", len(file_focus))

            if laboratory_mode and self.lab_context_builder:
                lab_envelope = self.lab_context_builder.build_envelope(
                    request_id=request_id,
                    session_id=sequence_id,
                    user_id=user_id,
                    model_version=self.llm_model,
                    feature_flags=project_context.get("feature_flags"),
                    prompt_template=self.lab_context_builder.prompt_template,
                    prompt_template_version=self.lab_context_builder.prompt_template_version,
                    raw_inputs={
                        "user_prompt": user_prompt,
                        "project_context": project_context,
                        "history_summary": history_summary,
                    },
                )
                lab_bundle = self.lab_context_builder.load_context_bundle(
                    lab_envelope,
                    project_context=project_context,
                )
                effective_user_prompt = self.lab_context_builder.merge_context_into_prompt(
                    effective_user_prompt,
                    lab_bundle,
                )
                regression_hash = self.lab_context_builder.regression_hash(effective_user_prompt, lab_bundle)
                logger.info(
                    "🧪 Laboratory context prepared | template_hash=%s input_hash=%s bundle_docs=%s regression_hash=%s",
                    lab_envelope.prompt_template_hash,
                    lab_envelope.input_hash,
                    len(lab_bundle),
                    regression_hash,
                )

            try:
                # Send connected event
                await self._send_event(
                    websocket,
                    WebSocketEvent(
                        "connected",
                        {"message": "Trinity AI connected", "sequence_id": sequence_id}
                    ),
                    "connected event"
                )

                logger.info(f"🚀 Starting ReAct workflow for sequence: {sequence_id}")

                # ================================================================
                # INITIALIZE REACT STATE
                # ================================================================
                if resume_mode and react_state:
                    logger.info("🧠 ReAct: Using existing paused agent state")
                else:
                    react_state = ReActState(
                        sequence_id=sequence_id,
                        user_prompt=effective_user_prompt
                    )
                    self._sequence_react_state[sequence_id] = react_state
                    logger.info("🧠 ReAct: Initialized agent state")

                # ================================================================
                # REACT LOOP: Thought → Action → Observation → Thought...
                # ================================================================
                logger.info("🔄 ReAct: Starting step-wise execution loop...")

                await self._send_event(
                    websocket,
                    WebSocketEvent(
                        "workflow_started",
                        {
                            "sequence_id": sequence_id,
                            "mode": "react",
                            "message": "ReAct agent started",
                            "loading": True  # UI loading state
                        }
                    ),
                    "workflow_started event (ReAct)"
                )

                # Send initial progress event
                try:
                    await self._send_event(
                        websocket,
                        WebSocketEvent(
                            "workflow_progress",
                            {
                                "sequence_id": sequence_id,
                                "current_step": 0,
                                "total_steps": "?",
                                "progress_percent": 0,
                                "status": "starting",
                                "loading": True
                            }
                        ),
                        "workflow_progress event (initial)"
                    )
                except (WebSocketDisconnect, Exception) as e:
                    logger.warning(f"⚠️ Failed to send initial progress event: {e}")

                max_steps = 20  # Prevent infinite loops
                if resume_mode and react_state:
                    current_step_number = max((react_state.paused_at_step or react_state.current_step_number) - 1, 0)
                    execution_history = list(react_state.execution_history)
                    previous_results = [entry.get("result", {}) for entry in react_state.execution_history]
                    try:
                        await self._send_event(
                            websocket,
                            WebSocketEvent(
                                "workflow_resumed",
                                {
                                    "sequence_id": sequence_id,
                                    "resuming_from_step": react_state.paused_at_step or react_state.current_step_number,
                                    "message": "Resuming from last paused step",
                                },
                            ),
                            "workflow_resumed event",
                        )
                    except (WebSocketDisconnect, Exception):
                        logger.debug("⚠️ Failed to send workflow_resumed event", exc_info=True)
                else:
                    current_step_number = 0
                    execution_history = []
                    previous_results = []
                abort_due_complexity = False

                while not react_state.goal_achieved and current_step_number < max_steps:
                    # Watchdog: if we keep looping without adding to execution history, stop to avoid runaway planning
                    watchdog = self._react_stall_watchdogs.setdefault(
                        sequence_id,
                        {"last_history_len": len(execution_history), "stalled_attempts": 0},
                    )
                    current_history_len = len(execution_history)
                    if current_history_len > watchdog["last_history_len"]:
                        watchdog["last_history_len"] = current_history_len
                        watchdog["stalled_attempts"] = 0
                    else:
                        watchdog["stalled_attempts"] += 1
                        if watchdog["stalled_attempts"] >= self.max_stalled_react_attempts:
                            logger.warning(
                                "⚠️ ReAct: Detected stalled loop (no new atom executions after %s attempts)",
                                watchdog["stalled_attempts"],
                            )
                            try:
                                await self._send_event(
                                    websocket,
                                    WebSocketEvent(
                                        "react_stalled",
                                        {
                                            "sequence_id": sequence_id,
                                            "attempts": watchdog["stalled_attempts"],
                                            "message": "Workflow stalled without new atoms executing; stopping to prevent a loop.",
                                        },
                                    ),
                                    "react_stalled event",
                                )
                            except (WebSocketDisconnect, Exception) as e:
                                logger.debug("⚠️ Failed to send react_stalled event: %s", e, exc_info=True)

                            react_state.goal_achieved = True
                            break

                    if sequence_id in self._cancelled_sequences:
                        logger.info(f"🛑 Workflow {sequence_id} cancelled during ReAct loop")
                        self._cancelled_sequences.discard(sequence_id)
                        await self._send_event(
                            websocket,
                            WebSocketEvent(
                                "workflow_stopped",
                                {
                                    "message": "Workflow stopped by user",
                                    "sequence_id": sequence_id
                                }
                            ),
                            "workflow_stopped (ReAct loop)"
                        )
                        break

                    if current_step_number >= self.max_react_operations:
                        abort_due_complexity = True
                        logger.warning(
                            "🛑 ReAct: Aborting workflow after %d operations to prevent runaway plans",
                            current_step_number,
                        )
                        try:
                            await self._send_event(
                                websocket,
                                WebSocketEvent(
                                    "react_abort_complexity",
                                    {
                                        "sequence_id": sequence_id,
                                        "step_number": current_step_number,
                                        "message": "Workflow stopped: too many sequential operations; replan with a smaller set of actions.",
                                    },
                                ),
                                "react_abort_complexity event",
                            )
                        except (WebSocketDisconnect, Exception) as e:
                            logger.warning(f"⚠️ Failed to send complexity abort event: {e}")
                        break

                    current_step_number += 1
                    logger.info(f"🔄 ReAct Cycle {current_step_number}: Starting...")

                    active_guard = self._react_step_guards.get(sequence_id)
                    if active_guard:
                        logger.warning(
                            "⚠️ ReAct: Previous step %s still marked %s - waiting before starting new step",
                            active_guard.get("step_number"),
                            active_guard.get("status", "in_progress"),
                        )
                        current_step_number -= 1
                        await asyncio.sleep(0.5)
                        continue

                    guard_token = uuid.uuid4().hex
                    self._react_step_guards[sequence_id] = {
                        "token": guard_token,
                        "step_number": current_step_number,
                        "status": "planning",
                        "updated_at": datetime.utcnow().isoformat(),
                    }

                    try:

                        # Send progress update
                        try:
                            progress_percent = min(int((current_step_number / max_steps) * 100), 99)  # Cap at 99% until complete
                            await self._send_event(
                                websocket,
                                WebSocketEvent(
                                    "workflow_progress",
                                    {
                                        "sequence_id": sequence_id,
                                        "current_step": current_step_number,
                                        "total_steps": "?",
                                        "progress_percent": progress_percent,
                                        "status": "in_progress",
                                        "loading": True,
                                        "message": f"Processing step {current_step_number}..."
                                    }
                                ),
                                "workflow_progress event"
                            )
                        except (WebSocketDisconnect, Exception) as e:
                            logger.warning(f"⚠️ Failed to send progress event: {e}")

                        # ============================================================
                        # THOUGHT: Generate next step
                        # ============================================================
                        logger.info(f"💭 ReAct: THOUGHT - Planning next step...")
                        # Send thought event (with error handling)
                        try:
                            await self._send_event(
                                websocket,
                                WebSocketEvent(
                                    "react_thought",
                                    {
                                        "sequence_id": sequence_id,
                                        "step_number": current_step_number,
                                        "message": "Analyzing current state and planning next action...",
                                        "loading": True
                                    }
                                ),
                                "react_thought event",
                            )
                        except (WebSocketDisconnect, Exception) as e:
                            logger.warning(f"⚠️ Failed to send react_thought event: {e}, continuing...")

                        # Generate next step with timeout protection
                        # IMPORTANT: Always get the latest available_files that includes newly created files from previous steps
                        self._update_react_step_guard(sequence_id, guard_token, "planning_next_step")
                        current_available_files = self._sequence_available_files.get(sequence_id, available_files.copy())
                        logger.info(f"📁 ReAct: Using {len(current_available_files)} available files for step {current_step_number} planning")
                        if current_available_files:
                            logger.debug(f"   Latest files: {current_available_files[-3:]}")  # Show last 3 files

                        # Check for loop: same atom repeated multiple times
                        if len(execution_history) >= 2:
                            recent_atoms = [h.get("atom_id") for h in execution_history[-3:]]
                            if len(set(recent_atoms)) == 1 and len(recent_atoms) >= 2:
                                repeated_atom = recent_atoms[0]
                                logger.warning(f"⚠️ ReAct: Detected loop - same atom '{repeated_atom}' repeated {len(recent_atoms)} times")
                                # Add warning to prompt context
                                effective_user_prompt_with_warning = f"{effective_user_prompt}\n\n⚠️ WARNING: The atom '{repeated_atom}' has been executed {len(recent_atoms)} times in a row. You MUST choose a DIFFERENT atom or set goal_achieved: true if the task is complete."
                            else:
                                effective_user_prompt_with_warning = effective_user_prompt
                        else:
                            effective_user_prompt_with_warning = effective_user_prompt

                        async def _react_generation_status(attempt: int, elapsed: float, timed_out: bool) -> None:
                            message = (
                                f"Still planning step {current_step_number} (attempt {attempt}) after {int(elapsed)}s."
                            )
                            if timed_out:
                                message = (
                                    f"Step {current_step_number} planning timed out after {int(elapsed)}s."
                                )
                            try:
                                await self._send_event(
                                    websocket,
                                    WebSocketEvent(
                                        "react_generation_status",
                                        {
                                            "sequence_id": sequence_id,
                                            "step_number": current_step_number,
                                            "attempt": attempt,
                                            "elapsed_seconds": int(elapsed),
                                            "timed_out": timed_out,
                                            "message": message,
                                        },
                                    ),
                                    "react_generation_status event",
                                )
                            except (WebSocketDisconnect, Exception):
                                logger.debug("⚠️ Unable to send generation status update", exc_info=True)

                        try:
                            next_step = await asyncio.wait_for(
                                self._generate_next_step_with_react(
                                    user_prompt=effective_user_prompt_with_warning,
                                    execution_history=execution_history,
                                    available_files=current_available_files,  # Use updated file list with newly created files
                                    previous_results=previous_results,
                                    sequence_id=sequence_id,
                                    priority_files=file_focus,
                                    status_callback=_react_generation_status,
                                    llm_timeout=self.llm_attempt_timeout_seconds,
                                ),
                                timeout=90.0  # 90 second timeout for step generation
                            )
                        except asyncio.TimeoutError:
                            logger.error(f"❌ ReAct: Step generation timed out after 90s, stopping workflow")
                            react_state.goal_achieved = True
                            react_state.paused = True
                            react_state.paused_at_step = current_step_number
                            react_state.current_step_number = current_step_number
                            self._paused_sequences.add(sequence_id)
                            try:
                                await self._send_event(
                                    websocket,
                                    WebSocketEvent(
                                        "react_generation_timeout",
                                        {
                                            "sequence_id": sequence_id,
                                            "step_number": current_step_number,
                                            "message": "Planning timed out. Please retry to resume from this step.",
                                        },
                                    ),
                                    "react_generation_timeout event",
                                )
                            except (WebSocketDisconnect, Exception):
                                logger.debug("⚠️ Unable to send generation timeout event", exc_info=True)
                            break
                        except Exception as e:
                            logger.error(f"❌ ReAct: Step generation failed: {e}, stopping workflow")
                            react_state.goal_achieved = True
                            react_state.paused = True
                            react_state.paused_at_step = current_step_number
                            react_state.current_step_number = current_step_number
                            self._paused_sequences.add(sequence_id)
                            try:
                                await self._send_event(
                                    websocket,
                                    WebSocketEvent(
                                        "react_generation_failed",
                                        {
                                            "sequence_id": sequence_id,
                                            "step_number": current_step_number,
                                            "message": "Planning encountered an error. Please retry to continue from this step.",
                                        },
                                    ),
                                    "react_generation_failed event",
                                )
                            except (WebSocketDisconnect, Exception):
                                logger.debug("⚠️ Unable to send generation failure event", exc_info=True)
                            break

                        if next_step is None:
                            # Check if chart-maker has been used before marking goal as achieved
                            chart_maker_used = any(h.get("atom_id") == "chart-maker" for h in execution_history)
                            if not chart_maker_used and execution_history:
                                logger.info("📊 ReAct: Goal marked as achieved but chart-maker not used - forcing chart-maker step")
                                # Force chart-maker as the final step
                                current_available_files = self._sequence_available_files.get(sequence_id, available_files.copy())
                                most_recent_file = current_available_files[-1] if current_available_files else None

                                if most_recent_file:
                                    # Create a forced chart-maker step
                                    next_step = WorkflowStepPlan(
                                        step_number=current_step_number,
                                        atom_id="chart-maker",
                                        description=f"Create visualization of the final results from {self._display_file_name(most_recent_file)}",
                                        prompt="",
                                        files_used=[most_recent_file],
                                        inputs=[most_recent_file],
                                        output_alias="final_visualization"
                                    )
                                    logger.info(f"📊 ReAct: Forced chart-maker step using {most_recent_file}")
                                else:
                                    logger.warning("⚠️ ReAct: No files available for forced chart-maker, marking goal as achieved")
                                    react_state.goal_achieved = True
                                    break
                            else:
                                logger.info("✅ ReAct: Goal achieved, no more steps needed")
                                react_state.goal_achieved = True
                                break

                        # Update step number from generated step
                        next_step.step_number = current_step_number
                        self._update_react_step_guard(sequence_id, guard_token, "plan_ready")

                        # Cache the generated plan for potential replays/recovery
                        self._sequence_step_plans.setdefault(sequence_id, {})[current_step_number] = copy.deepcopy(next_step)

                        # ENHANCED LOOP DETECTION: Check if we're repeating the same atom with same files
                        if execution_history:
                            last_step = execution_history[-1]
                            last_atom = last_step.get("atom_id")
                            current_atom = next_step.atom_id

                            # Check for exact match: same atom + same files
                            if last_atom == current_atom:
                                # Check if files are the same too
                                last_files = set(last_step.get("files_used", []))  # Get from execution_history
                                current_files = set(next_step.files_used or [])

                                if last_files and current_files and last_files == current_files:
                                    logger.warning(f"⚠️ ReAct: LOOP DETECTED - Same atom '{current_atom}' with same files being repeated!")
                                    logger.warning(f"   Last step files: {last_files}")
                                    logger.warning(f"   Current step files: {current_files}")
                                    logger.warning(f"   Last step description: {last_step.get('description', 'N/A')}")
                                    logger.warning(f"   Current step description: {next_step.description}")

                                    # Force goal achieved to stop the loop
                                    logger.info("🛑 ReAct: Stopping workflow to prevent infinite loop")
                                    react_state.goal_achieved = True

                                    # Send loop detection event
                                    try:
                                        await self._send_event(
                                            websocket,
                                            WebSocketEvent(
                                                "react_loop_detected",
                                                {
                                                    "sequence_id": sequence_id,
                                                    "step_number": current_step_number,
                                                    "repeated_atom": current_atom,
                                                    "message": f"Loop detected: {current_atom} repeated with same files. Stopping workflow."
                                                }
                                            ),
                                            "react_loop_detected event"
                                        )
                                    except (WebSocketDisconnect, Exception) as e:
                                        logger.warning(f"⚠️ Failed to send loop detection event: {e}")

                                    break
                                else:
                                    logger.info(f"ℹ️ ReAct: Same atom '{current_atom}' but different files - allowing")
                                    logger.debug(f"   Last files: {last_files}, Current files: {current_files}")
                            else:
                                logger.info(f"ℹ️ ReAct: Different atom - {last_atom} -> {current_atom}")

                            # Additional check: If same atom was used 2+ times in last 3 steps, warn
                            if len(execution_history) >= 2:
                                recent_atoms = [h.get("atom_id") for h in execution_history[-3:]]
                                atom_count = recent_atoms.count(current_atom)
                                if atom_count >= 2:
                                    logger.warning(f"⚠️ ReAct: Atom '{current_atom}' used {atom_count} times in last 3 steps - potential loop risk")
                                    # Don't stop, but log warning for evaluation to catch

                        if laboratory_mode and lab_envelope:
                            repeated_context = self._find_repeated_lab_atom(
                                sequence_id=sequence_id,
                                request_id=lab_envelope.request_id,
                                atom_id=next_step.atom_id,
                                description=next_step.description,
                                execution_history=execution_history,
                            )
                            if repeated_context:
                                logger.warning(
                                    "⚠️ Lab-mode guard: Atom %s appears to repeat previous intent (%s)",
                                    next_step.atom_id,
                                    repeated_context.get("source"),
                                )
                                await self._pause_for_lab_clarification(
                                    websocket=websocket,
                                    sequence_id=sequence_id,
                                    react_state=react_state,
                                    guard_token=guard_token,
                                    current_step_number=current_step_number,
                                    repeated_atom=next_step.atom_id,
                                    repeated_context=repeated_context.get("record", {}),
                                )
                                break

                        # ============================================================
                        # ACTION: Execute the step
                        # ============================================================
                        logger.info(f"⚡ ReAct: ACTION - Executing step {current_step_number} ({next_step.atom_id})...")

                        # Validate that the previous step produced sensible outputs before chaining
                        self._update_react_step_guard(sequence_id, guard_token, "validating_dependencies")
                        validation_passed, validation_reason = self._validate_chain_for_next_step(
                            sequence_id=sequence_id,
                            execution_history=execution_history,
                            next_step=next_step,
                        )
                        if not validation_passed:
                            self._update_react_step_guard(sequence_id, guard_token, "blocked_validation")
                            logger.warning(
                                "⚠️ ReAct: Blocking step %s due to failed dependency validation: %s",
                                next_step.atom_id,
                                validation_reason,
                            )
                            try:
                                await self._send_event(
                                    websocket,
                                    WebSocketEvent(
                                        "react_validation_blocked",
                                        {
                                            "sequence_id": sequence_id,
                                            "step_number": current_step_number,
                                            "atom_id": next_step.atom_id,
                                            "message": validation_reason,
                                        },
                                    ),
                                    "react_validation_blocked event",
                                )
                            except (WebSocketDisconnect, Exception) as e:
                              logger.warning(f"⚠️ Failed to send validation_blocked event: {e}")

                            # Attempt to replay the previous step to materialize the needed output when missing
                            replayed_previous = False
                            dependency_tokens: List[str] = []
                            if next_step.files_used:
                                dependency_tokens.extend(next_step.files_used)
                            if next_step.inputs:
                                dependency_tokens.extend(next_step.inputs)
                            if "No materialized output from prior step" in validation_reason:
                                replayed_previous = await self._replay_previous_step_for_output(
                                    websocket=websocket,
                                    sequence_id=sequence_id,
                                    execution_history=execution_history,
                                    project_context=project_context,
                                    user_id=user_id,
                                    original_prompt=effective_user_prompt,
                                    available_files=available_files,
                                    frontend_chat_id=frontend_chat_id,
                                    react_state=react_state,
                                    lab_envelope=lab_envelope,
                                    lab_request_id=lab_envelope.request_id if lab_envelope else None,
                                    dependency_tokens=dependency_tokens,
                                )
                                if replayed_previous:
                                    logger.info("🔄 ReAct: Previous step re-executed to produce materialized output; retrying current step plan")

                            # Re-plan without advancing the step counter
                            current_step_number = max(0, current_step_number - 1)
                            react_state.retry_count = 0
                            continue

                        self._update_react_step_guard(sequence_id, guard_token, "executing_atom")

                        # Send action event (with error handling)
                        try:
                            await self._send_event(
                                websocket,
                                WebSocketEvent(
                                    "react_action",
                                    {
                                        "sequence_id": sequence_id,
                                        "step_number": current_step_number,
                                        "atom_id": next_step.atom_id,
                                        "description": next_step.description,
                                        "message": f"Executing {next_step.atom_id}..."
                                    }
                                ),
                                "react_action event"
                            )
                        except (WebSocketDisconnect, Exception) as e:
                            logger.warning(f"⚠️ Failed to send react_action event: {e}, continuing...")

                        # Create a minimal plan for execution compatibility
                        plan = WorkflowPlan(
                            workflow_steps=[next_step],
                            total_steps=1
                        )

                        # Execute the step
                        # IMPORTANT: Always get the latest available_files that includes newly created files from previous steps
                        current_available_files_for_exec = self._sequence_available_files.get(sequence_id, available_files.copy())
                        logger.info(f"📁 ReAct: Using {len(current_available_files_for_exec)} available files for step {current_step_number} execution")
                        try:
                            execution_result = await self._execute_step_with_events(
                                  websocket=websocket,
                                  step=next_step,
                                  plan=plan,
                                  sequence_id=sequence_id,
                                  original_prompt=effective_user_prompt,
                                  project_context=project_context,
                                  user_id=user_id,
                                  available_files=current_available_files_for_exec,  # Use updated file list with newly created files
                                  frontend_chat_id=frontend_chat_id,  # Pass chat_id for cache isolation
                                  lab_envelope=lab_envelope,
                                  lab_request_id=lab_envelope.request_id if lab_envelope else None,
                              )
                        except Exception as e:
                            logger.error(f"❌ ReAct: Step execution failed: {e}")
                            execution_result = {
                                "success": False,
                                "error": str(e),
                                "message": f"Step execution failed: {str(e)}"
                            }

                        # ============================================================
                        # OBSERVATION: Evaluate the result
                        # ============================================================
                        logger.info(f"👁️ ReAct: OBSERVATION - Evaluating step {current_step_number} result...")
                        self._update_react_step_guard(sequence_id, guard_token, "evaluating_result")

                        # Send observation event (with error handling)
                        try:
                            await self._send_event(
                                websocket,
                                WebSocketEvent(
                                    "react_observation",
                                    {
                                        "sequence_id": sequence_id,
                                        "step_number": current_step_number,
                                        "message": "Evaluating execution result..."
                                    }
                                ),
                                "react_observation event"
                            )
                        except (WebSocketDisconnect, Exception) as e:
                            logger.warning(f"⚠️ Failed to send react_observation event: {e}, continuing...")

                        # Evaluate with timeout protection
                        try:
                            evaluation = await asyncio.wait_for(
                                self._evaluate_step_result(
                                    execution_result=execution_result,
                                  atom_id=next_step.atom_id,
                                  step_number=current_step_number,
                                  user_prompt=effective_user_prompt,
                                  step_plan=next_step,
                                  execution_history=execution_history,
                                  sequence_id=sequence_id
                              ),
                              timeout=120.0  # 2 minute timeout for evaluation
                          )
                        except asyncio.TimeoutError:
                            logger.error(f"❌ ReAct: Evaluation timed out after 120s, using fallback")
                            # Fallback evaluation
                            success = bool(execution_result.get("success", True))
                            evaluation = StepEvaluation(
                                decision="continue" if success else "retry_with_correction",
                                reasoning="Evaluation timed out, using fallback based on success flag",
                                correctness=success,
                                issues=["Evaluation timeout"] if not success else []
                            )
                        except Exception as e:
                            logger.error(f"❌ ReAct: Evaluation failed: {e}, using fallback")
                            # Fallback evaluation
                            success = bool(execution_result.get("success", True))
                            evaluation = StepEvaluation(
                                decision="continue" if success else "retry_with_correction",
                                reasoning=f"Evaluation error: {str(e)}, using fallback",
                                correctness=success,
                                issues=[f"Evaluation error: {str(e)}"]
                            )

                        self._update_react_step_guard(sequence_id, guard_token, "decision_ready")

                        # ============================================================
                        # AUTO-SAVE: Save step output immediately for next steps
                        # ============================================================
                        if execution_result.get("success", True):
                            try:
                                logger.info(f"💾 ReAct: Auto-saving step {current_step_number} output...")
                                # Get current available files list (will be updated by _auto_save_step)
                                files_before_save = len(self._sequence_available_files.get(sequence_id, []))

                                await self._auto_save_step(
                                    sequence_id=sequence_id,
                                    step_number=current_step_number,
                                    workflow_step=next_step,
                                    available_files=available_files,  # This will be updated with new file
                                    frontend_chat_id=frontend_chat_id  # Pass chat_id for cache isolation
                                )

                                # Verify file was added
                                files_after_save = len(self._sequence_available_files.get(sequence_id, []))
                                logger.info(f"✅ ReAct: Step {current_step_number} output saved. Files: {files_before_save} -> {files_after_save}")

                                # Send file_created event for UI
                                try:
                                    saved_path = self._step_output_files.get(sequence_id, {}).get(current_step_number)
                                    if saved_path:
                                        logger.info(f"📄 ReAct: New file available for next steps: {saved_path}")
                                        await self._send_event(
                                            websocket,
                                            WebSocketEvent(
                                                "file_created",
                                                {
                                                    "sequence_id": sequence_id,
                                                    "step_number": current_step_number,
                                                    "file_path": saved_path,
                                                    "output_alias": next_step.output_alias,
                                                    "message": f"File created: {saved_path}",
                                                    "available_for_next_steps": True
                                                }
                                            ),
                                            "file_created event"
                                        )
                                except (WebSocketDisconnect, Exception) as e:
                                    logger.warning(f"⚠️ Failed to send file_created event: {e}")
                            except Exception as save_error:
                                logger.error(f"❌ ReAct: Auto-save failed for step {current_step_number}: {save_error}")
                                # Continue anyway - file might still be usable

                        # Add to execution history (include files_used for loop detection)
                        execution_history.append({
                            "step_number": current_step_number,
                            "atom_id": next_step.atom_id,
                            "files_used": next_step.files_used or [],  # Track files for loop detection
                            "description": next_step.description,  # Track description for context
                            "output_alias": next_step.output_alias,
                            "result": execution_result,
                            "evaluation": evaluation.__dict__
                        })
                        if laboratory_mode and self.lab_memory_store and lab_envelope:
                            try:
                                step_record = WorkflowStepRecord(
                                    step_number=current_step_number,
                                    atom_id=next_step.atom_id,
                                    inputs={"files": next_step.files_used or [], "raw_inputs": next_step.inputs},
                                    outputs=execution_result,
                                    tool_calls=execution_result.get("tool_calls") or [],
                                    decision_rationale=next_step.description,
                                    edge_cases=evaluation.issues or [],
                                )
                                available_snapshot_files = self._sequence_available_files.get(sequence_id, [])
                                self.lab_memory_store.save_atom_snapshot(
                                    envelope=lab_envelope,
                                    step_record=step_record,
                                    project_context=project_context,
                                    available_files=available_snapshot_files,
                                )
                                self._lab_atom_snapshot_cache.setdefault(sequence_id, []).append(
                                    {
                                        "step": step_record.model_dump(mode="python", exclude_none=True),
                                        "available_files": available_snapshot_files,
                                    }
                                )
                            except Exception as lab_snapshot_exc:
                                logger.warning("⚠️ Failed to persist real-time lab atom snapshot: %s", lab_snapshot_exc)
                        # Reset stall watchdog now that we have material progress
                        stall_guard = self._react_stall_watchdogs.get(sequence_id)
                        if stall_guard is not None:
                            stall_guard["last_history_len"] = len(execution_history)
                            stall_guard["stalled_attempts"] = 0
                        previous_results.append(execution_result)

                        # Record in ReAct state (include description and files_used for workflow context)
                        react_state.add_execution(
                            step_number=current_step_number,
                            atom_id=next_step.atom_id,
                            result=execution_result,
                            evaluation=evaluation,
                            description=next_step.description,
                            files_used=next_step.files_used or []
                        )
                        react_state.current_step_number = current_step_number

                        # ============================================================
                        # DECISION: Handle evaluation decision
                        # ============================================================
                        try:
                            should_continue, retry_step = await asyncio.wait_for(
                                self._handle_react_decision(
                                    evaluation=evaluation,
                                    step_plan=next_step,
                                    sequence_id=sequence_id,
                                    websocket=websocket,
                                    execution_result=execution_result
                                ),
                                timeout=10.0  # 10 second timeout for decision handling
                            )
                        except asyncio.TimeoutError:
                            logger.error(f"❌ ReAct: Decision handling timed out, defaulting to continue")
                            should_continue = True
                            retry_step = None
                        except Exception as e:
                            logger.error(f"❌ ReAct: Decision handling failed: {e}, defaulting to continue")
                            should_continue = True
                            retry_step = None

                        if not should_continue:
                            # Goal achieved or workflow complete - but check if chart-maker was used
                            chart_maker_used = any(h.get("atom_id") == "chart-maker" for h in execution_history)
                            if not chart_maker_used and execution_history:
                                logger.info("📊 ReAct: Goal marked as achieved but chart-maker not used - forcing chart-maker step")
                                # Force chart-maker as the final step
                                current_available_files = self._sequence_available_files.get(sequence_id, available_files.copy())
                                most_recent_file = current_available_files[-1] if current_available_files else None

                                if most_recent_file:
                                    # Create a forced chart-maker step
                                    forced_chart_step = WorkflowStepPlan(
                                        step_number=current_step_number + 1,
                                        atom_id="chart-maker",
                                        description=f"Create visualization of the final results from {self._display_file_name(most_recent_file)}",
                                        prompt="",
                                        files_used=[most_recent_file],
                                        inputs=[most_recent_file],
                                        output_alias="final_visualization"
                                    )
                                    logger.info(f"📊 ReAct: Forced chart-maker step using {most_recent_file}")
                                    # Set next_step to the forced chart step and continue
                                    next_step = forced_chart_step
                                    should_continue = True
                                    react_state.goal_achieved = False
                                    # Continue the loop to execute the forced chart-maker step
                                    # Skip the retry check since we're forcing a new step
                                    continue
                                else:
                                    logger.warning("⚠️ ReAct: No files available for forced chart-maker, marking goal as achieved")
                                    react_state.goal_achieved = True
                                    break
                            else:
                                # Goal achieved and chart-maker used (or no execution history)
                                react_state.goal_achieved = True
                                break

                        if retry_step is not None:
                            # Retry the same step with corrections
                            logger.info(f"🔄 ReAct: Retrying step {current_step_number} with corrections...")

                            # Send correction event (with error handling)
                            try:
                                await self._send_event(
                                    websocket,
                                    WebSocketEvent(
                                        "react_correction",
                                        {
                                            "sequence_id": sequence_id,
                                            "step_number": current_step_number,
                                            "reasoning": evaluation.reasoning,
                                            "corrected_prompt": evaluation.corrected_prompt,
                                            "message": "Retrying step with corrections..."
                                        }
                                    ),
                                    "react_correction event"
                                )
                            except (WebSocketDisconnect, Exception) as e:
                                logger.warning(f"⚠️ Failed to send react_correction event: {e}, continuing...")

                            # Don't increment step number, retry same step
                            current_step_number -= 1
                            continue

                        # Continue to next step
                        logger.info(f"➡️ ReAct: Continuing to next step...")

                        # Additional loop prevention: If we've done many steps with same pattern, check for completion
                        if current_step_number >= 5 and len(execution_history) >= 5:
                            # Check if last few steps are all successful
                            recent_successes = [h.get("result", {}).get("success", False) for h in execution_history[-5:]]
                            if all(recent_successes):
                                logger.info(f"ℹ️ ReAct: Last 5 steps all successful - checking if goal might be achieved")
                                # Check if same atom repeated
                                recent_atoms = [h.get("atom_id") for h in execution_history[-3:]]
                                if len(set(recent_atoms)) == 1:
                                    logger.warning(f"⚠️ ReAct: Same atom '{recent_atoms[0]}' repeated 3+ times with success - goal may be achieved")
                                    # Force evaluation to consider completion
                                    if evaluation.decision != "complete":
                                        logger.warning(f"⚠️ ReAct: Evaluation didn't mark as complete, but pattern suggests it should be")
                                        # Don't force it, but log the warning

                    finally:
                        guard_entry = self._react_step_guards.get(sequence_id)
                        if guard_entry and guard_entry.get("token") == guard_token:
                            self._react_step_guards.pop(sequence_id, None)

                # ================================================================
                # ============================================================
                # WORKFLOW COMPLETE
                # ============================================================
                if abort_due_complexity:
                    logger.warning(
                        f"⚠️ ReAct: Workflow stopped early after {current_step_number} steps due to complexity guard",
                    )
                    final_status = "aborted"
                    final_message = "Workflow stopped: too many operations; please simplify or ask for a smaller plan."
                elif react_state.goal_achieved:
                    logger.info(f"✅ ReAct: Workflow completed successfully after {current_step_number} steps")
                    final_status = "completed"
                    final_message = "ReAct workflow completed!"
                elif current_step_number >= max_steps:
                    logger.warning(f"⚠️ ReAct: Reached max steps ({max_steps}), stopping workflow")
                    final_status = "stopped"
                    final_message = "Reached maximum step limit; consider simplifying the request."
                else:
                    final_status = "stopped"
                    final_message = "Workflow stopped."

                # Send final progress update
                try:
                    await self._send_event(
                        websocket,
                        WebSocketEvent(
                            "workflow_progress",
                            {
                                "sequence_id": sequence_id,
                                "current_step": current_step_number,
                                "total_steps": current_step_number,
                                "progress_percent": 100,
                                "status": final_status,
                                "loading": False,  # Turn off loading
                                "message": final_message,
                            }
                        ),
                        "workflow_progress event (final)",
                    )
                except (WebSocketDisconnect, Exception) as e:
                    logger.warning(f"⚠️ Failed to send final progress event: {e}")

                await self._send_event(
                    websocket,
                    WebSocketEvent(
                        "workflow_completed",
                        {
                            "sequence_id": sequence_id,
                            "total_steps": current_step_number,
                            "goal_achieved": react_state.goal_achieved,
                            "message": final_message,
                            "loading": False  # Turn off loading
                        }
                    ),
                    "workflow_completed event (ReAct)",
                )

                # Emit workflow insight if websocket is still connected
                try:
                    # Check connection state before emitting workflow insight
                    if hasattr(websocket, 'client_state') and websocket.client_state.name == 'DISCONNECTED':
                        logger.warning(f"⚠️ WebSocket already disconnected, skipping workflow insight for {sequence_id}")
                    elif hasattr(websocket, 'application_state') and websocket.application_state.name == 'DISCONNECTED':
                        logger.warning(f"⚠️ WebSocket application state disconnected, skipping workflow insight for {sequence_id}")
                    else:
                        # Create a plan summary for insight from execution history
                        workflow_steps_summary = []
                        for hist in execution_history:
                            step_num = hist.get("step_number", 0)
                            atom_id = hist.get("atom_id", "unknown")
                            workflow_steps_summary.append(
                                WorkflowStepPlan(
                                    step_number=step_num,
                                    atom_id=atom_id,
                                    description=f"Step {step_num}: {atom_id}",
                                    prompt="",
                                    files_used=[],
                                    inputs=[],
                                    output_alias=""
                                )
                            )
                        plan_summary = WorkflowPlan(
                            workflow_steps=workflow_steps_summary,
                            total_steps=len(execution_history)
                        )
                        await self._emit_workflow_insight(
                            websocket=websocket,
                            sequence_id=sequence_id,
                            plan=plan_summary,
                            user_prompt=user_prompt,
                            project_context=project_context,
                            additional_context=history_summary or "",
                        )
                except WebSocketDisconnect:
                    logger.info(f"🔌 WebSocket disconnected before workflow insight could be emitted for {sequence_id}")
                except Exception as insight_error:
                    logger.warning(f"⚠️ Failed to emit workflow insight (connection may be closed): {insight_error}")
                    # Don't fail the entire workflow if insight emission fails

                if laboratory_mode and self.lab_context_builder and lab_envelope:
                    self.lab_context_builder.persist_run(
                        envelope=lab_envelope,
                        user_prompt=user_prompt,
                        project_context=project_context,
                        execution_history=execution_history,
                        history_summary=history_summary,
                    )

                # ReAct loop handles all execution - old loop code removed

            except WebSocketDisconnect:
                logger.info(f"🔌 WebSocket disconnected during workflow {sequence_id}")
            except Exception as e:
                logger.error(f"❌ Workflow execution failed: {e}")
                import traceback
                traceback.print_exc()

                # Send error event
                try:
                    await self._send_event(
                        websocket,
                        WebSocketEvent(
                            "error",
                            {
                                "sequence_id": sequence_id,
                                "error": str(e),
                                "message": f"Workflow failed: {str(e)}"
                            }
                        ),
                        "workflow error event"
                    )
                except WebSocketDisconnect:
                    logger.info("🔌 WebSocket disconnected before error event could be delivered")
                # Ensure we send a close frame with an explicit error code/reason to avoid client-side 1005 closures
                await self._safe_close_websocket(
                    websocket,
                    code=1011,
                    reason=str(e)[:120] or "workflow_failed",
                )
            finally:
                react_state_final = self._sequence_react_state.get(sequence_id)
                if react_state_final and react_state_final.paused:
                    logger.info(
                        "⏸️ Preserving state for sequence %s to allow resume at step %s",
                        sequence_id,
                        react_state_final.paused_at_step or react_state_final.current_step_number,
                    )
                else:
                    self._cleanup_sequence_state(sequence_id)
                    self._paused_sequences.discard(sequence_id)
                self._cancelled_sequences.discard(sequence_id)

    async def _execute_step_with_events(
            self,
            websocket,
            step,
            plan,
            sequence_id: str,
            original_prompt: str,
            project_context: Dict[str, Any],
            user_id: str,
            available_files: List[str],
            frontend_chat_id: Optional[str] = None,
            lab_envelope: Optional[LaboratoryEnvelope] = None,
            lab_request_id: Optional[str] = None,
        ):
            """
            Execute a single step with WebSocket events (SuperAgent pattern).

            Events sent:
            1. step_started
            2. card_created
            3. atom_added (implicit - card has atom)
            4. agent_executed (with results for atom handler)
            5. step_completed
            """
            step_number = step.step_number
            atom_id = step.atom_id

            try:
                # ================================================================
                # EVENT 1: STEP_STARTED (with enriched description)
                # ================================================================
                logger.info(f"📍 Step {step_number}/{plan.total_steps}: {atom_id}")

                # Ensure downstream steps reference freshly saved files instead of aliases
                self._resolve_step_dependencies(sequence_id, step)

                # Build enriched description with file details
                enriched_description = self._build_enriched_description(step, available_files)

                await self._send_event(
                    websocket,
                    WebSocketEvent(
                        "step_started",
                        {
                            "step": step_number,
                            "total_steps": plan.total_steps,
                            "atom_id": atom_id,
                            "description": step.description,
                            "enriched_description": enriched_description,
                            "files_used": step.files_used if hasattr(step, "files_used") else [],
                            "inputs": step.inputs if hasattr(step, "inputs") else [],
                            "output_alias": step.output_alias if hasattr(step, "output_alias") else "",
                            "sequence_id": sequence_id
                        }
                    ),
                    f"step_started event (step {step_number})"
                )

                # ================================================================
                # PHASE A: GENERATE PARAMETERS (Simplified)
                # ================================================================
                logger.info(f"🔧 Generating parameters for {atom_id}...")

                # For now, use basic parameters from prompt
                # The atom handlers will process the results properly
                try:
                    parameters = await self._generate_simple_parameters(
                        atom_id=atom_id,
                        original_prompt=original_prompt,
                        available_files=available_files,
                        step_prompt=getattr(step, "prompt", None),
                        workflow_step=step,
                        is_stream_workflow=True,  # This is always a Stream AI workflow call
                        sequence_id=sequence_id
                    )
                except Exception as parameter_error:
                    logger.exception(
                        "❌ Failed to generate parameters for step %s (%s)",
                        step_number,
                        atom_id,
                    )
                    raise

                # Extract the prompt that will be sent to the atom
                atom_prompt = parameters.get("prompt", step.prompt if hasattr(step, "prompt") else "")

                # 🔧 NEW: Log and send prompt to UI for visibility
                logger.info(f"📝 PROMPT FOR STEP {step_number} ({atom_id}):")
                logger.info("="*80)
                logger.info(atom_prompt)
                logger.info("="*80)

                # Send prompt to UI via WebSocket event BEFORE execution
                await self._send_event(
                    websocket,
                    WebSocketEvent(
                        "atom_prompt",
                        {
                            "step": step_number,
                            "atom_id": atom_id,
                            "prompt": atom_prompt,
                            "full_prompt": atom_prompt,  # Full prompt text for UI display
                            "parameters": parameters,
                            "sequence_id": sequence_id,
                            "message": f"📝 Prompt being sent to {atom_id} at step {step_number}",
                            "description": step.description,
                            "enriched_description": enriched_description
                        }
                    ),
                    f"atom_prompt event (step {step_number})"
                )

                logger.info(f"✅ Parameters: {json.dumps(parameters, indent=2)[:150]}...")

                reuse_entry = None
                try:
                    reuse_entry = self._find_reusable_atom_metadata(
                        sequence_id=sequence_id,
                        request_id=lab_request_id,
                        step=step,
                        parameters=parameters,
                        project_context=project_context,
                    )
                except Exception as reuse_exc:
                    logger.warning("⚠️ Failed to check atom_execution_metadata reuse: %s", reuse_exc)

                execution_result: Dict[str, Any] = {}
                atom_insights: List[Dict[str, str]] = []

                # ================================================================
                # PHASE B: CREATE EMPTY CARD (Like SuperAgent)
                # ================================================================
                if reuse_entry:
                    card_id = reuse_entry.get("outputs", {}).get("card_id") or step.output_alias or f"card-reuse-{step_number}"
                    logger.info(
                        "♻️ Reusing atom_execution_metadata for step %s (atom=%s); skipping duplicate execution",
                        step_number,
                        atom_id,
                    )
                    await self._send_event(
                        websocket,
                        WebSocketEvent(
                            "atom_reused",
                            {
                                "step": step_number,
                                "atom_id": atom_id,
                                "sequence_id": sequence_id,
                                "message": "Atom execution reused from persisted history; no duplicate run.",
                            },
                        ),
                        f"atom_reused event (step {step_number})",
                    )
                    execution_result = reuse_entry.get("outputs") or {"success": True}
                    execution_result.setdefault("success", True)
                    execution_result["reused"] = True
                    execution_result.setdefault(
                        "message",
                        "Reused prior atom execution based on atom_execution_metadata.",
                    )
                else:
                    logger.info(f"🎴 Creating empty card for {atom_id}...")

                    # Create card via FastAPI
                    card_id = f"card-{uuid.uuid4().hex}"

                    # EVENT 2: CARD_CREATED
                    await self._send_event(
                        websocket,
                        WebSocketEvent(
                            "card_created",
                            {
                                "step": step_number,
                                "card_id": card_id,
                                "atom_id": atom_id,
                                "sequence_id": sequence_id,
                                "action": "CARD_CREATION"
                            }
                        ),
                        f"card_created event (step {step_number})",
                    )

                    logger.info(f"✅ Card created: {card_id}")

                    # ================================================================
                    # PHASE C: EXECUTE ATOM TO GET RESULTS
                    # ================================================================
                    logger.info(f"⚙️ Executing atom {atom_id}...")

                    self._enforce_dataframe_guard(atom_id, parameters, sequence_id)

                    execution_result = await self._execute_atom_with_retry(
                        atom_id=atom_id,
                        parameters=parameters,
                        session_id=sequence_id,
                        step_number=step_number,
                        sequence_id=sequence_id,
                        websocket=websocket,
                        frontend_chat_id=frontend_chat_id
                    )

                # Log atom result details for debugging
                logger.info(f"📊 Atom {atom_id} execution result keys: {list(execution_result.keys())}")
                logger.info(f"📊 Atom {atom_id} success status: {execution_result.get('success', 'not_found')}")
                logger.info(f"📊 Atom {atom_id} full result (first 500 chars): {json.dumps(execution_result, indent=2)[:500]}...")

                # Check if result has the expected structure for this atom
                # RESTORED FROM 18_NOV - Simple validation like the working version
                if atom_id == "merge" and "merge_json" not in execution_result:
                    logger.warning(f"⚠️ Merge atom result missing 'merge_json' key. Available keys: {list(execution_result.keys())}")
                elif atom_id == "concat" and "concat_json" not in execution_result:
                    logger.warning(f"⚠️ Concat atom result missing 'concat_json' key. Available keys: {list(execution_result.keys())}")
                elif atom_id == "groupby-wtg-avg" and "groupby_json" not in execution_result:
                    logger.warning(f"⚠️ Groupby atom result missing 'groupby_json' key. Available keys: {list(execution_result.keys())}")
                elif atom_id == "chart-maker" and "chart_json" not in execution_result:
                    logger.warning(f"⚠️ Chart-maker atom result missing 'chart_json' key. Available keys: {list(execution_result.keys())}")

                execution_success = bool(execution_result.get("success", True))
                insight_text = await self._generate_step_insight(
                    step=step,
                    total_steps=plan.total_steps,
                    atom_prompt=atom_prompt,
                    parameters=parameters,
                    execution_result=execution_result,
                    execution_success=execution_success
                )

                atom_insights = await self._generate_atom_insights(
                    goal=original_prompt,
                    step=step,
                    execution_result=execution_result,
                )

                if lab_envelope and self.lab_memory_store:
                    try:
                        step_record = WorkflowStepRecord(
                            step_number=step_number,
                            atom_id=atom_id,
                            inputs=parameters or {},
                            outputs=execution_result or {},
                            tool_calls=execution_result.get("tool_calls")
                            if isinstance(execution_result.get("tool_calls"), list)
                            else [],
                            decision_rationale=step.description,
                        )
                        self.lab_memory_store.append_atom_execution_metadata(
                            envelope=lab_envelope,
                            step_record=step_record,
                            project_context=project_context,
                        )
                    except Exception as meta_exc:
                        logger.warning("⚠️ Failed to append atom execution metadata: %s", meta_exc)

                logger.info(f"✅ Atom executed: {json.dumps(execution_result, indent=2)[:150]}...")
                self._record_step_execution_result(
                    sequence_id=sequence_id,
                    step_number=step_number,
                    atom_id=atom_id,
                    execution_result=execution_result,
                    insight=insight_text,
                    atom_insights=atom_insights,
                )
                # ================================================================
                # EVENT 3: AGENT_EXECUTED (Frontend will call atom handler)
                # ================================================================
                # RESTORED FROM 18_NOV - Simple event sending like the working version
                await self._send_event(
                    websocket,
                    WebSocketEvent(
                        "agent_executed",
                        {
                            "step": step_number,
                            "card_id": card_id,
                            "atom_id": atom_id,
                            "action": "AGENT_EXECUTION",
                            "result": execution_result,  # merge_json, groupby_json, etc.
                            "sequence_id": sequence_id,
                            "output_alias": step.output_alias,
                            "summary": f"Executed {atom_id}",
                            "insight": insight_text,
                            "atom_insights": atom_insights,
                        }
                    ),
                    f"agent_executed event (step {step_number})"
                )

                # ================================================================
                # EVENT 4: STEP_COMPLETED
                # ================================================================
                await self._send_event(
                    websocket,
                    WebSocketEvent(
                        "step_completed",
                        {
                            "step": step_number,
                            "total_steps": plan.total_steps,
                            "atom_id": atom_id,
                            "card_id": card_id,
                            "summary": f"Step {step_number} completed",
                            "sequence_id": sequence_id,
                            "insight": insight_text,
                            "atom_insights": atom_insights,
                        }
                    ),
                    f"step_completed event (step {step_number})"
                )

                logger.info(f"✅ Step {step_number} completed")

                # Return execution result for ReAct evaluation
                return execution_result

            except WebSocketDisconnect:
                logger.info(f"🔌 WebSocket disconnected during step {step_number}")
                raise
            except Exception as e:
                logger.error(f"❌ Step {step_number} failed: {e}")

                await self._send_event(
                    websocket,
                    WebSocketEvent(
                        "step_failed",
                        {
                            "step": step_number,
                            "atom_id": atom_id,
                            "error": str(e),
                            "sequence_id": sequence_id
                        }
                    ),
                    f"step_failed event (step {step_number})"
                )

                # Return error result for ReAct evaluation
                return {
                    "success": False,
                    "error": str(e),
                    "message": f"Step execution failed: {str(e)}"
                }

    async def _replay_previous_step_for_output(
            self,
            websocket,
            sequence_id: str,
            execution_history: List[Dict[str, Any]],
            project_context: Dict[str, Any],
            user_id: str,
            original_prompt: str,
            available_files: List[str],
            frontend_chat_id: Optional[str],
            react_state: Optional[ReActState],
            dependency_tokens: Optional[List[str]] = None,
            lab_envelope: Optional[LaboratoryEnvelope] = None,
            lab_request_id: Optional[str] = None,
        ) -> bool:
            """Re-execute the prior step when chaining fails due to missing materialized output."""

            replay_count = self._sequence_replay_counts.get(sequence_id, 0)
            if replay_count >= self.max_replay_attempts:
                logger.warning(
                    "⚠️ ReAct: Replay budget exhausted (%s attempts); prompting user to retry",
                    self.max_replay_attempts,
                )
                try:
                    await self._send_event(
                        websocket,
                        WebSocketEvent(
                            "workflow_progress",
                            {
                                "sequence_id": sequence_id,
                                "current_step": None,
                                "total_steps": "?",
                                "progress_percent": 100,
                                "status": "retry_required",
                                "loading": False,
                                "message": (
                                    "Unable to recover missing output automatically. "
                                    "Please retry the workflow or adjust the configuration."
                                ),
                            },
                        ),
                        "workflow_progress replay exhausted",
                    )
                except (WebSocketDisconnect, Exception):
                    logger.debug("⚠️ Failed to send replay exhaustion notice", exc_info=True)
                return False

            self._sequence_replay_counts[sequence_id] = replay_count + 1

            if not execution_history:
                logger.warning("⚠️ ReAct: Cannot replay previous step because there is no execution history")
                return False

            last_entry = execution_history[-1]
            step_number = last_entry.get("step_number")
            if step_number is None:
                logger.warning("⚠️ ReAct: Cannot replay previous step because the last entry has no step number")
                return False

            plan_lookup = self._sequence_step_plans.get(sequence_id, {})
            step_plan = plan_lookup.get(step_number)
            if not step_plan:
                logger.warning(
                    "⚠️ ReAct: Cannot replay previous step %s because no cached plan exists for sequence %s",
                    step_number,
                    sequence_id,
                )
                return False

            logger.info("🔁 ReAct: Replaying step %s (%s) to materialize output", step_number, step_plan.atom_id)

            try:
                await self._send_event(
                    websocket,
                    WebSocketEvent(
                        "workflow_progress",
                        {
                            "sequence_id": sequence_id,
                            "current_step": step_number,
                            "total_steps": "?",
                            "progress_percent": 0,
                            "status": "retrying",
                            "loading": True,
                            "message": f"Replaying step {step_number} to obtain materialized output...",
                        },
                    ),
                    "workflow_progress replay notice",
                )
            except (WebSocketDisconnect, Exception) as e:
                logger.debug(f"⚠️ Failed to send replay progress event: {e}")

            current_available_files = self._sequence_available_files.get(sequence_id, available_files.copy())
            bound_plan = self._bind_operands_for_replay(
                sequence_id=sequence_id,
                step_plan=step_plan,
                dependency_tokens=dependency_tokens or [],
                available_files=current_available_files,
            )
            plan = WorkflowPlan(workflow_steps=[bound_plan], total_steps=1)

            try:
                execution_result = await self._execute_step_with_events(
                    websocket=websocket,
                    step=bound_plan,
                    plan=plan,
                    sequence_id=sequence_id,
                    original_prompt=original_prompt,
                    project_context=project_context,
                    user_id=user_id,
                    available_files=current_available_files,
                    frontend_chat_id=frontend_chat_id,
                    lab_envelope=lab_envelope,
                    lab_request_id=lab_request_id,
                )
            except Exception as exec_exc:
                logger.error(f"❌ ReAct: Replay of step {step_number} failed: {exec_exc}")
                return False

            if not execution_result.get("success", True):
                logger.warning(
                    "⚠️ ReAct: Replay of step %s did not succeed; cannot materialize output automatically", step_number
                )
                return False

            try:
                await self._auto_save_step(
                    sequence_id=sequence_id,
                    step_number=step_number,
                    workflow_step=bound_plan,
                    available_files=current_available_files,
                    frontend_chat_id=frontend_chat_id,
                )

                saved_path = self._step_output_files.get(sequence_id, {}).get(step_number)
                if saved_path:
                    await self._send_event(
                        websocket,
                                WebSocketEvent(
                                    "file_created",
                                    {
                                        "sequence_id": sequence_id,
                                        "step_number": step_number,
                                        "file_path": saved_path,
                                        "output_alias": bound_plan.output_alias,
                                        "message": f"Replayed output available: {saved_path}",
                                        "available_for_next_steps": True,
                                    },
                                ),
                                "file_created replay event",
                    )
            except Exception as save_exc:
                logger.warning(f"⚠️ ReAct: Failed to auto-save replayed output for step {step_number}: {save_exc}")

            last_entry["result"] = execution_result
            last_entry["output_alias"] = bound_plan.output_alias
            last_entry["files_used"] = bound_plan.files_used or []

            if react_state:
                react_state.execution_history = execution_history

            return True

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

    async def _auto_save_step(
            self,
            sequence_id: str,
            step_number: int,
            workflow_step: WorkflowStepPlan,
            available_files: List[str],
            frontend_chat_id: Optional[str] = None
        ) -> None:
            """
            Persist step output automatically before moving to the next step.

            Args:
                sequence_id: Unique identifier for the workflow run
                step_number: Step to auto-save
                workflow_step: Step metadata (atom_id, output alias, etc.)
                available_files: Mutable list of known files for this workflow (will be updated)
            """
            cache_for_sequence = self._step_execution_cache.get(sequence_id, {})
            step_cache = cache_for_sequence.get(step_number)

            if not step_cache:
                raise ValueError(f"No execution result cached for step {step_number}")

            atom_id = workflow_step.atom_id
            execution_result = step_cache.get("execution_result") or {}

            logger.info(f"💾 Auto-saving step {step_number} ({atom_id}) for sequence {sequence_id}")

            saved_path: Optional[str] = None
            auto_save_response: Optional[Dict[str, Any]] = None

            if atom_id == "merge":
                saved_path, auto_save_response = await self._auto_save_merge(
                    workflow_step=workflow_step,
                    execution_result=execution_result,
                    step_cache=step_cache
                )
            elif atom_id == "concat":
                saved_path, auto_save_response = await self._auto_save_concat(
                    workflow_step=workflow_step,
                    execution_result=execution_result,
                    step_cache=step_cache
                )
            elif atom_id in ["create-column", "create-transform"]:
                saved_path, auto_save_response = await self._auto_save_create_transform(
                    workflow_step=workflow_step,
                    execution_result=execution_result,
                    step_cache=step_cache,
                    frontend_chat_id=frontend_chat_id,
                    sequence_id=sequence_id
                )
            elif atom_id == "data-upload-validate":
                # 🔧 CRITICAL FIX: data-upload-validate doesn't create new files, it loads existing ones
                # We need to preserve the original file name for downstream steps
                saved_path, auto_save_response = await self._auto_save_data_upload_validate(
                    workflow_step=workflow_step,
                    execution_result=execution_result,
                    step_cache=step_cache,
                    available_files=available_files
                )
            else:
                logger.info(f"ℹ️ Auto-save skipped for atom '{atom_id}' (no auto-save logic implemented)")
                return

            if not saved_path:
                raise ValueError(f"Auto-save did not return a saved file path for step {step_number}")

            # Track saved output
            self._step_output_files.setdefault(sequence_id, {})[step_number] = saved_path
            self._register_output_alias(sequence_id, workflow_step.output_alias, saved_path)
            step_cache["saved_path"] = saved_path
            step_cache["auto_saved_at"] = datetime.utcnow().isoformat()
            step_cache["auto_save_response"] = auto_save_response

            # Update shared available file list for downstream steps
            if saved_path not in available_files:
                available_files.append(saved_path)

            seq_files = self._sequence_available_files.get(sequence_id)
            if seq_files is not None and saved_path not in seq_files:
                seq_files.append(saved_path)

            # Persist metadata in result storage for downstream consumers
            if self.result_storage:
                try:
                    self.result_storage.create_session(sequence_id)
                    result_name = workflow_step.output_alias or f"step_{step_number}_output"
                    metadata = {
                        "step_number": step_number,
                        "atom_id": atom_id,
                        "auto_saved": True,
                        "output_file": saved_path,
                        "saved_at": step_cache["auto_saved_at"],
                        "insight": step_cache.get("insight")
                    }
                    self.result_storage.store_result(
                        sequence_id=sequence_id,
                        result_name=result_name,
                        result_data={
                            "output_file": saved_path,
                            "auto_save_response": auto_save_response
                        },
                        result_type="auto_saved_file",
                        metadata=metadata
                    )
                except Exception as storage_error:
                    logger.warning(f"⚠️ Failed to store auto-save metadata for step {step_number}: {storage_error}")

            logger.info(f"✅ Auto-saved step {step_number} output to {saved_path}")

    async def _auto_save_merge(
            self,
            workflow_step: WorkflowStepPlan,
            execution_result: Dict[str, Any],
            step_cache: Dict[str, Any]
        ) -> Tuple[str, Dict[str, Any]]:
            """Auto-save helper for merge atom outputs."""
            merge_cfg = execution_result.get("merge_json") or execution_result.get("merge_config") or {}
            if not merge_cfg:
                raise ValueError("Merge execution result did not include 'merge_json' for auto-save")

            file1 = self._normalize_config_file_value(merge_cfg.get("file1"))
            file2 = self._normalize_config_file_value(merge_cfg.get("file2"))
            join_columns = merge_cfg.get("join_columns") or []
            join_type = merge_cfg.get("join_type", "inner")
            bucket_name = merge_cfg.get("bucket_name", "trinity")

            if not file1 or not file2:
                raise ValueError(f"Merge configuration missing file references: file1={file1}, file2={file2}")

            if not isinstance(join_columns, list) or not join_columns:
                raise ValueError(f"Merge configuration missing join columns: {join_columns}")

            csv_data = execution_result.get("data") or execution_result.get("csv_data")
            perform_response: Optional[Dict[str, Any]] = None

            if not csv_data:
                perform_response = await self._perform_merge_operation(
                    file1=file1,
                    file2=file2,
                    bucket_name=bucket_name,
                    join_columns=join_columns,
                    join_type=join_type
                )
                csv_data = perform_response.get("data") or perform_response.get("csv_data")

            if not csv_data:
                raise ValueError("Merge auto-save could not obtain CSV data from perform endpoint")

            filename = self._build_auto_save_filename(workflow_step, default_prefix="merge")
            payload = {
                "csv_data": csv_data,
                "filename": filename
            }

            response = await self._post_json(self.merge_save_endpoint, payload)
            saved_path = (
                response.get("result_file")
                or response.get("object_name")
                or response.get("path")
                or response.get("filename")
                or filename
            )

            if perform_response:
                step_cache["perform_response"] = perform_response

            return saved_path, response

    async def _perform_merge_operation(
            self,
            file1: str,
            file2: str,
            bucket_name: str,
            join_columns: List[str],
            join_type: str
        ) -> Dict[str, Any]:
            """Invoke merge perform endpoint to get merged CSV."""
            if aiohttp is None:
                raise RuntimeError("aiohttp is required for merge perform calls but is not installed")

            form = aiohttp.FormData()
            form.add_field("file1", self._extract_filename(file1))
            form.add_field("file2", self._extract_filename(file2))
            form.add_field("bucket_name", bucket_name)
            form.add_field("join_columns", json.dumps(join_columns))
            form.add_field("join_type", join_type)

            logger.info(
                f"🧪 Calling merge perform endpoint {self.merge_perform_endpoint} with "
                f"file1={file1}, file2={file2}, join_columns={join_columns}, join_type={join_type}"
            )

            return await self._post_form(self.merge_perform_endpoint, form)

    async def _perform_concat_operation(
            self,
            file1: str,
            file2: str,
            concat_direction: str
        ) -> Dict[str, Any]:
            """Invoke concat perform endpoint to get concatenated CSV."""
            payload = {
                "file1": self._extract_filename(file1),
                "file2": self._extract_filename(file2),
                "concat_direction": concat_direction or "vertical"
            }

            logger.info(
                f"🧪 Calling concat perform endpoint {self.concat_perform_endpoint} "
                f"with payload {payload}"
            )

            return await self._post_json(self.concat_perform_endpoint, payload)

    async def _auto_save_concat(
            self,
            workflow_step: WorkflowStepPlan,
            execution_result: Dict[str, Any],
            step_cache: Dict[str, Any]
        ) -> Tuple[str, Dict[str, Any]]:
            """Auto-save helper for concat atom outputs."""
            concat_cfg = execution_result.get("concat_json") or execution_result.get("concat_config") or {}
            if not concat_cfg:
                raise ValueError("Concat execution result did not include 'concat_json' for auto-save")

            file1 = self._normalize_config_file_value(concat_cfg.get("file1"))
            file2 = self._normalize_config_file_value(concat_cfg.get("file2"))
            direction = concat_cfg.get("concat_direction", "vertical")

            if not file1 or not file2:
                raise ValueError(f"Concat configuration missing file references: file1={file1}, file2={file2}")

            csv_data = execution_result.get("data") or execution_result.get("csv_data")
            perform_response: Optional[Dict[str, Any]] = None

            if not csv_data:
                perform_response = await self._perform_concat_operation(
                    file1=file1,
                    file2=file2,
                    concat_direction=direction
                )
                csv_data = perform_response.get("data") or perform_response.get("csv_data")

            if not csv_data:
                raise ValueError("Concat auto-save could not obtain CSV data from perform endpoint")

            filename = self._build_auto_save_filename(workflow_step, default_prefix="concat")
            payload = {
                "csv_data": csv_data,
                "filename": filename
            }

            response = await self._post_json(self.concat_save_endpoint, payload)
            saved_path = (
                response.get("result_file")
                or response.get("object_name")
                or response.get("path")
                or response.get("filename")
                or filename
            )

            if perform_response:
                step_cache["perform_response"] = perform_response

            return saved_path, response

    async def _auto_save_data_upload_validate(
            self,
            workflow_step: WorkflowStepPlan,
            execution_result: Dict[str, Any],
            step_cache: Dict[str, Any],
            available_files: List[str]
        ) -> Tuple[str, Dict[str, Any]]:
            """
            Auto-save helper for data-upload-validate atom.

            CRITICAL: data-upload-validate doesn't create new files - it loads existing ones.
            We preserve the original file name for downstream steps instead of renaming.
            """
            # Extract the file name from the execution result
            validate_cfg = execution_result.get("validate_json") or execution_result.get("validate_config") or {}
            file_name = validate_cfg.get("file_name", "")

            if not file_name:
                raise ValueError("Data-upload-validate execution result did not include 'file_name' for auto-save")

            # Find the full path of the original file in available_files
            # The file_name might be just the filename or the full path
            original_file_path = None

            # Try exact match first
            if file_name in available_files:
                original_file_path = file_name
            else:
                # Try to find by filename (last part of path)
                file_name_only = file_name.split("/")[-1] if "/" in file_name else file_name
                for available_file in available_files:
                    if available_file.endswith(file_name_only) or available_file.endswith(f"/{file_name_only}"):
                        original_file_path = available_file
                        break

            # If still not found, check if file_name is already a full path
            if not original_file_path:
                # Check if any available file contains the file_name
                for available_file in available_files:
                    if file_name in available_file or available_file.endswith(file_name):
                        original_file_path = available_file
                        break

            # If still not found, use the file_name as-is (it might already be a full path)
            if not original_file_path:
                original_file_path = file_name
                logger.warning(f"⚠️ Could not find original file path for '{file_name}' in available_files, using as-is")

            logger.info(f"✅ Data-upload-validate preserving original file name: {original_file_path}")
            logger.info(f"📝 Registering output alias '{workflow_step.output_alias}' with original file: {original_file_path}")

            return original_file_path, {
                "result_file": original_file_path,
                "status": "preserved_original",
                "original_file_name": file_name,
                "message": f"Preserved original file name '{original_file_path}' for downstream steps"
            }

    async def _auto_save_create_transform(
            self,
            workflow_step: WorkflowStepPlan,
            execution_result: Dict[str, Any],
            step_cache: Dict[str, Any],
            frontend_chat_id: Optional[str] = None,
            sequence_id: Optional[str] = None
        ) -> Tuple[str, Dict[str, Any]]:
            """Auto-save helper for create-transform atom outputs."""
            # Get result file from execution result (perform endpoint already saved it)
            result_file = (
                execution_result.get("result_file") 
                or execution_result.get("createResults", {}).get("result_file")
                or execution_result.get("createColumnResults", {}).get("result_file")
            )

            if result_file:
                # File already saved by perform endpoint, just return the path
                logger.info(f"✅ Create-transform result already saved by perform endpoint: {result_file}")
                return result_file, {"result_file": result_file, "status": "already_saved"}

            # If no result_file, the perform endpoint didn't save it, so we need to save it
            # This should rarely happen, but handle it gracefully
            logger.warning(f"⚠️ Create-transform perform endpoint did not return result_file, attempting to save manually")

            csv_data = execution_result.get("data") or execution_result.get("csv_data")

            if not csv_data:
                # Try to get results from cached_dataframe endpoint if we have a file reference
                file_ref = execution_result.get("file") or execution_result.get("object_name")
                if file_ref:
                    try:
                        # Include chat_id and sequence_id in cache key to prevent cache leakage between chats
                        cache_key_params = []
                        if frontend_chat_id:
                            cache_key_params.append(f"chat_id={frontend_chat_id}")
                        if sequence_id:
                            cache_key_params.append(f"session_id={sequence_id}")

                        cached_url = f"{self.fastapi_base_url}/api/create-column/cached_dataframe?object_name={file_ref}"
                        if cache_key_params:
                            cached_url += "&" + "&".join(cache_key_params)

                        logger.info(f"🔑 Fetching cached data with isolation: chat_id={frontend_chat_id}, session_id={sequence_id}")
                        response = await self._get_json(cached_url)
                        csv_data = response.get("data")
                        logger.info(f"✅ Retrieved CSV data from cached_dataframe endpoint (isolated by chat/session)")
                    except Exception as e:
                        logger.warning(f"⚠️ Could not fetch cached results: {e}")

            if not csv_data:
                # If we still don't have CSV data, log warning but don't fail
                # The file might already be saved by the perform endpoint
                logger.warning(f"⚠️ Create-transform auto-save: No CSV data available and no result_file found")
                logger.warning(f"⚠️ Execution result keys: {list(execution_result.keys())}")
                # Return a placeholder path - the file should already be saved
                filename = self._build_auto_save_filename(workflow_step, default_prefix="create_transform")
                return filename, {"result_file": filename, "status": "skipped_no_data"}

            filename = self._build_auto_save_filename(workflow_step, default_prefix="create_transform")
            payload = {
                "csv_data": csv_data,
                "filename": filename
            }

            create_save_endpoint = f"{self.fastapi_base_url}/api/create-column/save"
            response = await self._post_json(create_save_endpoint, payload)
            saved_path = (
                response.get("result_file")
                or response.get("object_name")
                or response.get("path")
                or response.get("filename")
                or filename
            )

            return saved_path, response

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

                await websocket.send_text(event.to_json())
            except WebSocketDisconnect:
                logger.info(f"🔌 WebSocket disconnected during {context}")
                raise
            except RuntimeError as runtime_error:
                message = str(runtime_error)
                if 'Cannot call "send" once a close message has been sent' in message:
                    logger.info(f"🔌 WebSocket already closed while sending {context}")
                    raise WebSocketDisconnect(code=1006)
                raise

    async def _generate_simple_parameters(
            self,
            atom_id: str,
            original_prompt: str,
            available_files: List[str],
            step_prompt: Optional[str] = None,
            workflow_step: Optional[WorkflowStepPlan] = None,
            is_stream_workflow: bool = True,
            sequence_id: Optional[str] = None
        ) -> Dict[str, Any]:
            """
            Generate an enriched natural-language prompt for downstream atom execution.
            Ensures we pass explicit dataset references and slot details so the atom LLM
            can produce a precise configuration without re-deriving context.

            Args:
                is_stream_workflow: If True, filter available_files to only include workflow-relevant files
                sequence_id: Workflow sequence ID for tracking files created in previous steps
            """
            files_used: List[str] = []
            inputs: List[str] = []
            output_alias: Optional[str] = None
            step_description: str = ""
            planner_prompt = step_prompt or ""

            if workflow_step:
                files_used = workflow_step.files_used or []
                inputs = workflow_step.inputs or []
                output_alias = workflow_step.output_alias
                step_description = workflow_step.description or ""
                if not planner_prompt:
                    planner_prompt = workflow_step.prompt

            # Filter available_files for Stream AI workflow mode
            filtered_available_files = available_files.copy()
            if is_stream_workflow and sequence_id:
                # Only include workflow-relevant files:
                # 1. Files specified in files_used for current step
                # 2. Output aliases from previous steps (mapped to file paths)
                # 3. Files created in earlier steps of this workflow
                workflow_relevant_files: List[str] = []

                # Add files from files_used
                workflow_relevant_files.extend(files_used)

                # Add files from inputs (previous step outputs)
                workflow_relevant_files.extend(inputs)

                # Add files created in previous steps of this workflow
                step_output_files = self._step_output_files.get(sequence_id, {})
                for step_num, file_path in step_output_files.items():
                    if file_path not in workflow_relevant_files:
                        workflow_relevant_files.append(file_path)

                # Add files from output alias registry
                alias_registry = self._output_alias_registry.get(sequence_id, {})
                for alias, file_path in alias_registry.items():
                    if file_path not in workflow_relevant_files:
                        workflow_relevant_files.append(file_path)

                # Filter to only include files that exist in available_files
                filtered_available_files = [
                    f for f in workflow_relevant_files 
                    if f in available_files
                ]

                # If no workflow-relevant files found, fall back to files_used and inputs
                if not filtered_available_files:
                    filtered_available_files = list(set(files_used + inputs))

                logger.info(
                    f"🔧 Stream AI workflow mode: Filtered {len(available_files)} files to {len(filtered_available_files)} "
                    f"workflow-relevant files for step {workflow_step.step_number if workflow_step else 'N/A'}"
                )

            user_summary = self._condense_text(original_prompt)
            description_summary = self._condense_text(step_description)

            header_lines: List[str] = []

            # Add Stream AI workflow mode warning at the top
            if is_stream_workflow:
                header_lines.append("🚨 MANDATORY FILE USAGE - STREAM AI WORKFLOW")
                header_lines.append("You are being called as part of a Stream AI workflow.")
                header_lines.append("You MUST use ONLY the file(s) specified in the 'Datasets & dependencies' section below.")
                header_lines.append("DO NOT use any other files from MinIO, even if they exist.")
                header_lines.append("Use ONLY the specified file(s).")
                header_lines.append("")

            header_lines.extend([
                f"Atom: `{atom_id}`",
                f"User goal: {user_summary}"
            ])
            if description_summary:
                header_lines.append(f"Step goal: {description_summary}")
            header_lines.append("Respond with configuration details only – no filler text.")

            header_section = "\n".join(header_lines)

            # Build workflow context section showing what previous steps created
            workflow_context_section = self._build_workflow_context_section(
                sequence_id, atom_id, files_used, inputs, is_stream_workflow
            ) if is_stream_workflow and sequence_id else ""

            dataset_section = self._build_dataset_section(atom_id, files_used, inputs, output_alias, is_stream_workflow)
            atom_section = self._build_atom_instruction_section(atom_id, original_prompt, files_used, inputs)
            available_section = self._build_available_files_section(filtered_available_files, is_stream_workflow)
            planner_section = self._build_planner_guidance_section(planner_prompt)

            # Add validation section for Stream AI mode
            validation_section = ""
            if is_stream_workflow:
                validation_lines = [
                    "",
                    "🚨 FILE USAGE VALIDATION:",
                    "- The file_name/data_source you use MUST match exactly one of the files in the 'Datasets & dependencies' section above.",
                    "- ERROR PREVENTION: If you use any file not explicitly listed, the workflow will fail.",
                    "- WORKFLOW CONTEXT: The file(s) specified above were created/selected by previous workflow steps. Use them."
                ]
                validation_section = "\n".join(validation_lines)

            prompt_sections = [
                header_section,
                workflow_context_section,  # Add workflow context before dataset section
                dataset_section,
                atom_section,
                available_section,
                planner_section,
                validation_section
            ]

            final_prompt = "\n\n".join(section for section in prompt_sections if section and section.strip())

            return {
                "prompt": final_prompt,
                "available_files": filtered_available_files if is_stream_workflow else available_files
            }

    async def _validate_required_columns(
            self,
            atom_id: str,
            parameters: Dict[str, Any],
            data_source: str,
            sequence_id: str
        ) -> List[str]:
            """
            Validate that all required columns exist in the DataFrame before executing a step.
            Returns list of missing columns that need to be created.

            Args:
                atom_id: The atom being executed
                parameters: Parameters for the atom (may contain column references)
                data_source: Path to the DataFrame file
                sequence_id: Sequence ID for context

            Returns:
                List of missing column names that need to be created
            """
            missing_columns: List[str] = []

            # Get current DataFrame schema
            file_metadata = self._get_file_metadata([data_source], sequence_id=sequence_id)
            if not file_metadata or data_source not in file_metadata:
                logger.warning(f"⚠️ Could not get metadata for {data_source} - skipping column validation")
                return missing_columns

            current_columns = file_metadata[data_source].get("columns", [])
            if not current_columns:
                logger.warning(f"⚠️ No columns found in metadata for {data_source} - skipping validation")
                return missing_columns

            logger.info(f"📊 Current DataFrame has {len(current_columns)} columns: {current_columns[:10]}...")

            # Extract required columns based on atom type
            required_columns = self._extract_required_columns(atom_id, parameters)

            if not required_columns:
                logger.debug(f"✅ No specific columns required for {atom_id}")
                return missing_columns

            logger.info(f"🔍 Checking required columns for {atom_id}: {required_columns}")

            # Check which columns are missing
            for col in required_columns:
                col_clean = col.strip()
                # Check exact match
                if col_clean not in current_columns:
                    # Check case-insensitive match
                    found = False
                    for existing_col in current_columns:
                        if col_clean.lower() == existing_col.lower():
                            found = True
                            break

                    if not found:
                        missing_columns.append(col_clean)
                        logger.warning(f"⚠️ Missing column: '{col_clean}'")

            if missing_columns:
                logger.warning(f"⚠️ Found {len(missing_columns)} missing columns: {missing_columns}")
            else:
                logger.info(f"✅ All required columns exist in DataFrame")

            return missing_columns

    async def _execute_atom_with_retry(
            self,
            *,
            atom_id: str,
            parameters: Dict[str, Any],
            session_id: str,
            step_number: int,
            sequence_id: str,
            websocket,
            frontend_chat_id: Optional[str] = None
        ) -> Dict[str, Any]:
            """
            Execute atom endpoint with retry support when success=False or request fails.
            """
            last_result: Dict[str, Any] = {}
            last_error: Optional[Exception] = None

            for attempt in range(1, self.atom_retry_attempts + 1):
                try:
                    result = await self._execute_atom_endpoint(
                        atom_id=atom_id,
                        parameters=parameters,
                        session_id=session_id,
                        frontend_chat_id=frontend_chat_id
                    )
                except Exception as exec_error:
                    last_error = exec_error

                    logger.warning(
                        "⚠️ Atom %s execution attempt %s/%s failed with exception: %s",
                        atom_id,
                        attempt,
                        self.atom_retry_attempts,
                        exec_error,
                    )
                    if attempt >= self.atom_retry_attempts:
                        raise
                    await self._notify_atom_retry(
                        websocket,
                        atom_id=atom_id,
                        step_number=step_number,
                        sequence_id=sequence_id,
                        attempt=attempt,
                        reason=str(exec_error),
                    )
                    if self.atom_retry_delay:
                        await asyncio.sleep(self.atom_retry_delay)
                    continue

                success = bool(result.get("success", True))
                if success:
                    if attempt > 1:
                        logger.info(
                            "✅ Atom %s succeeded after %s attempts",
                            atom_id,
                            attempt,
                        )
                    return result

                last_result = result
                reason = (
                    result.get("error")
                    or result.get("message")
                    or "Atom returned success=false"
                )

                logger.warning(
                    "⚠️ Atom %s returned success=False on attempt %s/%s: %s",
                    atom_id,
                    attempt,
                    self.atom_retry_attempts,
                    reason,
                )
                if attempt >= self.atom_retry_attempts:
                    break

                await self._notify_atom_retry(
                    websocket,
                    atom_id=atom_id,
                    step_number=step_number,
                    sequence_id=sequence_id,
                    attempt=attempt,
                    reason=reason,
                )
                if self.atom_retry_delay:
                    await asyncio.sleep(self.atom_retry_delay)

            if last_result:
                return last_result
            if last_error:
                raise last_error
            return {}

    async def _notify_atom_retry(
            self,
            websocket,
            *,
            atom_id: str,
            step_number: int,
            sequence_id: str,
            attempt: int,
            reason: str,
        ) -> None:
            """Notify frontend that an atom attempt failed and a retry is scheduled."""
            reason_text = self._condense_text(str(reason))[:400]
            payload = {
                "sequence_id": sequence_id,
                "step": step_number,
                "atom_id": atom_id,
                "attempt": attempt,
                "max_attempts": self.atom_retry_attempts,
                "reason": reason_text,
            }
            try:
                await self._send_event(
                    websocket,
                    WebSocketEvent("atom_retry", payload),
                    f"atom_retry event (step {step_number})",
                )
            except WebSocketDisconnect:
                raise
            except Exception as notify_error:
                logger.debug(
                    "Unable to notify client about atom retry (step %s): %s",
                    step_number,
                    notify_error,
                )

    async def _execute_atom_endpoint(
            self,
            atom_id: str,
            parameters: Dict[str, Any],
            session_id: str,
            frontend_chat_id: Optional[str] = None
        ) -> Dict[str, Any]:
            """Execute atom endpoint"""
            if aiohttp is None:
                raise RuntimeError("aiohttp is required for atom execution but is not installed")

            atom_info = self.atom_mapping.get(atom_id, {})
            endpoint = atom_info.get("endpoint", f"/trinityai/{atom_id}")
            base_url = "http://localhost:8002"
            full_url = f"{base_url}{endpoint}"

            payload = {
                "prompt": parameters.get("prompt", ""),
                "session_id": session_id
            }

            # Add chat_id for Redis cache isolation between chats
            if frontend_chat_id:
                payload["chat_id"] = frontend_chat_id
                logger.info(f"🔑 Including chat_id in payload for cache isolation: {frontend_chat_id}")

            # 🔧 CRITICAL FIX: Include client_name, app_name, project_name for atoms that need MinIO access
            # These are required for the agent to find files in MinIO using the correct prefix
            # All atoms that work with data files need this context to access files correctly
            atoms_needing_context = {
                "dataframe-operations",
                "data-upload-validate",
                "merge",
                "concat",
                "groupby-wtg-avg",
                "groupby",
                "create-column",
                "chart-maker",
                "correlation"  # Added correlation for EDA workflows - needs file access
            }

            if atom_id in atoms_needing_context:
                project_context = self._sequence_project_context.get(session_id, {})
                client_name = project_context.get("client_name", "")
                app_name = project_context.get("app_name", "")
                project_name = project_context.get("project_name", "")

                # Only add if we have valid context (not empty strings)
                if client_name or app_name or project_name:
                    payload["client_name"] = client_name
                    payload["app_name"] = app_name
                    payload["project_name"] = project_name

                    logger.info(f"🔧 Added project context for {atom_id}: client={client_name}, app={app_name}, project={project_name}")
                else:
                    logger.warning(f"⚠️ No project context available for {atom_id} (session_id={session_id}). Available contexts: {list(self._sequence_project_context.keys())}")
                    # Fallback: try to fetch from database/Redis using main_api helper
                    try:
                        from main_api import _fetch_names_from_db
                        client_db, app_db, project_db, _ = _fetch_names_from_db()
                        client_name = client_db or ""
                        app_name = app_db or ""
                        project_name = project_db or ""

                        if client_name and app_name and project_name:
                            payload["client_name"] = client_name
                            payload["app_name"] = app_name
                            payload["project_name"] = project_name
                            # Store in context for future use
                            self._sequence_project_context[session_id] = {
                                "client_name": client_name,
                                "app_name": app_name,
                                "project_name": project_name
                            }
                            logger.info(f"🔧 Fetched project context from database for {atom_id}: client={client_name}, app={app_name}, project={project_name}")
                        else:
                            logger.warning(f"⚠️ Could not fetch project context from database for {atom_id}")
                            payload["client_name"] = ""
                            payload["app_name"] = ""
                            payload["project_name"] = ""
                    except Exception as e:
                        logger.error(f"❌ Error fetching project context from database: {e}")
                        payload["client_name"] = ""
                        payload["app_name"] = ""
                        payload["project_name"] = ""

            logger.info(f"📡 Calling {full_url}")
            logger.info(f"📦 Payload: {payload}")

            try:
                async with aiohttp.ClientSession() as session:
                    async with session.post(
                        full_url,
                        json=payload,
                        timeout=aiohttp.ClientTimeout(total=300)
                    ) as response:
                        response.raise_for_status()
                        result = await response.json()
                        logger.info(f"✅ Result: {json.dumps(result, indent=2)[:200]}...")
                        return result
            except Exception as e:
                logger.error(f"❌ Atom execution failed: {e}")
                raise

