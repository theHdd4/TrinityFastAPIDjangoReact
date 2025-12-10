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


class ReactWorkflowMixin:
    async def _react_step_guard(self, sequence_id: str, step_number: int):
            """Ensure ReAct steps do not overlap for a given sequence."""
            active_guard = self._react_step_guards.get(sequence_id)
            if active_guard:
                message = (
                    f"⚠️ ReAct: Step {active_guard.get('step_number')} still marked"
                    f" as {active_guard.get('status', 'in_progress')} - pausing new step"
                )
                logger.warning(message)
                raise RuntimeError(message)

            guard_token = uuid.uuid4().hex
            self._react_step_guards[sequence_id] = {
                "token": guard_token,
                "step_number": step_number,
                "status": "planning",
                "updated_at": datetime.utcnow().isoformat(),
            }

            try:
                yield guard_token
            finally:
                guard_entry = self._react_step_guards.get(sequence_id)
                if guard_entry and guard_entry.get("token") == guard_token:
                    self._react_step_guards.pop(sequence_id, None)

    def _update_react_step_guard(self, sequence_id: str, guard_token: str, status: str) -> None:
            """Update guardrail status for the current ReAct step if token matches."""
            guard_entry = self._react_step_guards.get(sequence_id)
            if guard_entry and guard_entry.get("token") == guard_token:
                guard_entry["status"] = status
                guard_entry["updated_at"] = datetime.utcnow().isoformat()

    def _description_similarity(text_a: Optional[str], text_b: Optional[str]) -> float:
            """Return similarity score between two descriptions (0-1)."""

            if not text_a or not text_b:
                return 0.0
            return difflib.SequenceMatcher(None, text_a.lower(), text_b.lower()).ratio()

    def _find_repeated_lab_atom(
            self,
            sequence_id: str,
            request_id: Optional[str],
            atom_id: str,
            description: str,
            execution_history: List[Dict[str, Any]],
        ) -> Optional[Dict[str, Any]]:
            """Check recent history and persisted lab snapshots for repeated atoms with similar intent."""

            similarity_threshold = 0.78
            for hist in reversed(execution_history):
                if hist.get("atom_id") != atom_id:
                    continue
                if self._description_similarity(description, hist.get("description")) >= similarity_threshold:
                    return {"source": "memory", "record": hist}

            cached_snapshots = self._lab_atom_snapshot_cache.get(sequence_id)
            if cached_snapshots is None and self.lab_memory_store and request_id:
                project_context = self._sequence_project_context.get(sequence_id, {})
                cached_snapshots = self.lab_memory_store.load_atom_snapshots(
                    session_id=sequence_id,
                    request_id=request_id,
                    limit=25,
                    project_context=project_context,
                )
                self._lab_atom_snapshot_cache[sequence_id] = cached_snapshots

            for snapshot in cached_snapshots or []:
                step = (snapshot.get("step") or {}) if isinstance(snapshot, dict) else {}
                if step.get("atom_id") != atom_id:
                    continue
                if self._description_similarity(description, step.get("description")) >= similarity_threshold:
                    return {"source": "snapshot", "record": step}

            return None

    async def _pause_for_lab_clarification(
            self,
            websocket,
            sequence_id: str,
            react_state: ReActState,
            guard_token: str,
            current_step_number: int,
            repeated_atom: str,
            repeated_context: Dict[str, Any],
        ) -> None:
            """Pause workflow and prompt for clarification when repeat intent detected in lab mode."""

            self._update_react_step_guard(sequence_id, guard_token, "paused_clarification")
            react_state.paused = True
            react_state.awaiting_clarification = True
            react_state.paused_at_step = current_step_number
            react_state.clarification_context = (
                f"Atom '{repeated_atom}' appears to repeat a prior action. Provide clarification or choose a different atom."
            )
            self._paused_sequences.add(sequence_id)

            message = (
                f"Lab-mode guard: Atom '{repeated_atom}' looks similar to a previous step. "
                "Please confirm an alternative approach or provide more detail to proceed."
            )
            try:
                await self._send_event(
                    websocket,
                    WebSocketEvent(
                        "react_clarification_needed",
                        {
                            "sequence_id": sequence_id,
                            "step_number": current_step_number,
                            "repeated_atom": repeated_atom,
                            "message": message,
                            "previous_context": repeated_context,
                        },
                    ),
                    "react_clarification_needed event",
                )
            except (WebSocketDisconnect, Exception):
                logger.debug("⚠️ Unable to send clarification request event", exc_info=True)

    async def execute_react_workflow(
            self,
            user_prompt: str,
            session_id: str,
            websocket,
            file_context: Optional[Dict[str, Any]] = None,
            project_context: Optional[Dict[str, Any]] = None
        ) -> Dict[str, Any]:
            """
            Execute workflow using ReAct orchestrator with WebSocket events.

            Args:
                user_prompt: User's prompt
                session_id: Session identifier
                websocket: WebSocket connection
                file_context: Optional file context
                project_context: Optional project context

            Returns:
                Workflow execution result
            """
            if not self.react_orchestrator:
                logger.warning("⚠️ ReAct orchestrator not available, cannot execute ReAct workflow")
                return {"success": False, "error": "ReAct orchestrator not available"}

            try:
                # Progress callback for WebSocket events
                async def progress_callback(progress: Dict[str, Any]):
                    event_type = progress.get("type", "progress")
                    try:
                        await self._send_event(
                            websocket,
                            WebSocketEvent(f"react_{event_type}", progress),
                            f"ReAct {event_type} event"
                        )
                    except WebSocketDisconnect:
                        raise
                    except Exception as e:
                        logger.debug(f"Could not send ReAct progress event: {e}")

                # Prepare file context with proper context information
                if not file_context and project_context:
                    file_context = {
                        "files": project_context.get("available_files", []),
                        "client_name": project_context.get("client_name", ""),
                        "app_name": project_context.get("app_name", ""),
                        "project_name": project_context.get("project_name", "")
                    }
                elif file_context:
                    # Ensure file_context has context information even if it was provided
                    if not file_context.get("client_name") and project_context:
                        file_context["client_name"] = project_context.get("client_name", "")
                    if not file_context.get("app_name") and project_context:
                        file_context["app_name"] = project_context.get("app_name", "")
                    if not file_context.get("project_name") and project_context:
                        file_context["project_name"] = project_context.get("project_name", "")

                # Execute ReAct workflow
                result = await self.react_orchestrator.execute_workflow(
                    user_prompt=user_prompt,
                    session_id=session_id,
                    file_context=file_context,
                    progress_callback=progress_callback,
                    intent_route=self._sequence_intent_routing.get(session_id),
                )

                # Send final result event
                try:
                    await self._send_event(
                        websocket,
                        WebSocketEvent("react_workflow_complete", {
                            "session_id": session_id,
                            "success": result.get("success", False),
                            "intent": result.get("intent", "workflow"),
                            "final_response": result.get("final_response"),
                            "final_insight": result.get("final_insight")
                        }),
                        "ReAct workflow complete event"
                    )
                except WebSocketDisconnect:
                    raise
                except Exception as e:
                    logger.debug(f"Could not send ReAct complete event: {e}")

                return result

            except WebSocketDisconnect:
                raise
            except Exception as e:
                logger.error(f"❌ Error executing ReAct workflow: {e}", exc_info=True)
                try:
                    await self._send_event(
                        websocket,
                        WebSocketEvent("react_workflow_error", {
                            "session_id": session_id,
                            "error": str(e)
                        }),
                        "ReAct workflow error event"
                    )
                except:
                    pass
                return {"success": False, "error": str(e)}

    async def _generate_next_step_with_react(
            self,
            user_prompt: str,
            execution_history: List[Dict[str, Any]],
            available_files: List[str],
            previous_results: List[Dict[str, Any]],
            sequence_id: str,
            priority_files: Optional[List[str]] = None,
            status_callback: Optional[Callable[[int, float, bool], Any]] = None,
            llm_timeout: Optional[float] = None,
        ) -> Optional[WorkflowStepPlan]:
            """
            Generate the next workflow step using ReAct-style planning.

            Uses Thought-Action pattern:
            - Thought: Analyze current state and what needs to be done
            - Action: Select next tool and generate parameters

            Args:
                user_prompt: Original user request
                execution_history: Previous steps and their results
                available_files: List of available file names
                previous_results: Results from previous steps
                sequence_id: Sequence identifier
                priority_files: Priority files to focus on

            Returns:
                WorkflowStepPlan for the next step, or None if goal is achieved
            """
            if aiohttp is None:
                raise RuntimeError("aiohttp is required for ReAct planning but is not installed")

            # Extract files mentioned in prompt
            prompt_files = self._extract_file_names_from_prompt(user_prompt, available_files)
            prompt_files = self._merge_file_references(prompt_files, priority_files)
            files_exist = self._match_files_with_available(prompt_files, available_files) if available_files else False

            # Build ReAct planning prompt
            react_prompt = self._build_react_planning_prompt(
                user_prompt=user_prompt,
                execution_history=execution_history,
                available_files=available_files,
                previous_results=previous_results,
                prompt_files=prompt_files,
                files_exist=files_exist
            )

            logger.info(f"🤖 ReAct Planning: Generating next step...")
            logger.debug(f"📝 ReAct Prompt length: {len(react_prompt)} chars")

            # Define LLM call function
            async def _call_llm_for_react_step() -> Dict[str, Any]:
                """Inner function that makes the LLM call for ReAct step planning"""
                async with aiohttp.ClientSession() as session:
                    payload = {
                        "model": self.llm_model,
                        "messages": [
                            {
                                "role": "system",
                                "content": "You are a ReAct-style agent that plans data workflow steps. Respond with valid JSON only."
                            },
                            {"role": "user", "content": react_prompt}
                        ],
                        "temperature": 0.3,
                        "max_tokens": 1500
                    }

                    headers = {
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {self.bearer_token}"
                    }

                    async with session.post(
                        self.llm_api_url,
                        json=payload,
                        headers=headers,
                        timeout=aiohttp.ClientTimeout(total=60)
                    ) as response:
                        response.raise_for_status()
                        result = await response.json()

                        content = result["choices"][0]["message"]["content"]
                        logger.debug(f"🤖 ReAct LLM response: {content[:300]}...")

                        # Parse JSON from response
                        if "```json" in content:
                            content = content.split("```json")[1].split("```")[0].strip()
                        elif "```" in content:
                            content = content.split("```")[1].split("```")[0].strip()

                        step_data = json.loads(content)

                        if not isinstance(step_data, dict):
                            raise ValueError("LLM response is not a dictionary")

                        # Check if goal is achieved
                        if step_data.get("goal_achieved", False):
                            logger.info("✅ ReAct: Goal achieved, no more steps needed")
                            return {"goal_achieved": True}

                        return step_data

            try:
                step_data = await self._retry_llm_json_generation(
                    llm_call_func=_call_llm_for_react_step,
                    step_name="ReAct Step Planning",
                    max_attempts=3,
                    status_callback=status_callback,
                    attempt_timeout=llm_timeout or self.llm_attempt_timeout_seconds,
                    pause_after_timeout=True,
                )

                if step_data.get("goal_achieved", False):
                    return None

                # Extract step information
                atom_id = step_data.get("atom_id")
                description = step_data.get("description", "")
                thought = step_data.get("thought", "")

                if not atom_id:
                    # Log the full step_data for debugging
                    logger.error(f"❌ ReAct step planning did not return atom_id")
                    logger.error(f"   Received step_data keys: {list(step_data.keys())}")
                    logger.error(f"   Full step_data: {json.dumps(step_data, indent=2)}")
                    logger.error(f"   Description: {description}")
                    logger.error(f"   Thought: {thought}")

                    # Try to infer atom_id from description if possible
                    description_lower = description.lower() if description else ""
                    inferred_atom_id = None

                    # Check for common atom keywords in description
                    atom_keywords = {
                        "merge": ["merge", "combine", "join"],
                        "concat": ["concat", "concatenate", "append"],
                        "chart-maker": ["chart", "visualize", "graph", "plot"],
                        "explore": ["explore", "analyze", "examine"],
                        "create-column": ["create column", "add column", "transform"],
                        "dataframe-operations": ["dataframe", "filter", "sort"],
                        "groupby-wtg-avg": ["group", "aggregate", "average"],
                        "correlation": ["correlation", "correlate"],
                        "feature-overview": ["feature", "overview", "summary"],
                    }

                    for candidate_atom, keywords in atom_keywords.items():
                        if any(keyword in description_lower for keyword in keywords):
                            if candidate_atom in ATOM_MAPPING:
                                inferred_atom_id = candidate_atom
                                logger.warning(f"⚠️ Inferred atom_id '{inferred_atom_id}' from description: '{description}'")
                                break

                    if inferred_atom_id:
                        atom_id = inferred_atom_id
                        logger.info(f"✅ Using inferred atom_id: {atom_id}")
                    else:
                        # If we can't infer, log detailed error and return None gracefully
                        logger.error(f"❌ Cannot infer atom_id from description. Available atoms: {list(ATOM_MAPPING.keys())}")
                        logger.error(f"   This usually means the LLM response format was incorrect.")
                        logger.error(f"   Expected JSON with 'atom_id' field, but received: {json.dumps(step_data, indent=2)}")
                        logger.error(f"   Stopping workflow gracefully to prevent further errors.")
                        # Return None to gracefully stop the workflow instead of crashing
                        # The calling code will handle None appropriately (mark goal as achieved or stop workflow)
                        return None

                # Store thought in ReAct state
                react_state = self._sequence_react_state.get(sequence_id)
                if react_state:
                    react_state.add_thought(thought)

                # Build enriched step plan
                step_number = len(execution_history) + 1
                files_used = step_data.get("files_used", [])
                inputs = step_data.get("inputs", [])
                output_alias = step_data.get("output_alias", f"step_{step_number}_output")

                # Guardrail: favor the most recent materialized file when chaining
                # so we don't accidentally grab the first uploaded dataset.
                recent_output_file = self._get_latest_materialized_file(
                    sequence_id,
                    execution_history,
                    self._sequence_available_files.get(sequence_id, available_files.copy()),
                )

                prefers_latest_dataset = self._atom_prefers_latest_dataset(atom_id)
                prefers_recent_output = (
                    prefers_latest_dataset
                    or (self._atom_produces_dataset(atom_id) and atom_id not in {"merge", "concat"})
                )

                if prefers_recent_output and recent_output_file:
                    # If no files were provided, default to the newest output
                    if not files_used:
                        files_used = [recent_output_file]
                        step_data["files_used"] = files_used
                        logger.info(
                            "📁 ReAct: Defaulting files_used to latest output %s for atom %s",
                            recent_output_file,
                            atom_id,
                        )
                    # If the LLM picked an older file, re-prioritize the recent output
                    elif recent_output_file not in files_used:
                        logger.info(
                            "📁 ReAct: Reordering files to prioritize latest output %s over %s",
                            recent_output_file,
                            files_used,
                        )
                        files_used = [recent_output_file] + files_used
                        step_data["files_used"] = files_used

                    # Align inputs with the prioritized file to keep downstream atoms in sync
                    if not inputs:
                        inputs = files_used.copy()
                        step_data["inputs"] = inputs
                    elif recent_output_file not in inputs:
                        inputs = [recent_output_file] + inputs
                        step_data["inputs"] = inputs

                # SPECIAL HANDLING FOR CHART-MAKER: Ensure it uses the most recent output file from previous steps
                if atom_id == "chart-maker" and available_files:
                    # Find the most recent output file from execution history
                    most_recent_output_file = None
                    if execution_history:
                        # Look for output files in reverse order (most recent first)
                        for hist in reversed(execution_history):
                            result = hist.get("result", {})
                            saved_path = None
                            hist_atom = hist.get("atom_id", "")

                            # Extract output file from result
                            if hist_atom == "merge" and result.get("merge_json"):
                                saved_path = result.get("merge_json", {}).get("result_file") or result.get("saved_path")
                            elif hist_atom == "concat" and result.get("concat_json"):
                                saved_path = result.get("concat_json", {}).get("result_file") or result.get("saved_path")
                            elif hist_atom in ["create-column", "create-transform", "groupby-wtg-avg", "dataframe-operations"]:
                                saved_path = result.get("output_file") or result.get("saved_path")
                            elif result.get("output_file"):
                                saved_path = result.get("output_file")
                            elif result.get("saved_path"):
                                saved_path = result.get("saved_path")

                            if saved_path and saved_path in available_files:
                                most_recent_output_file = saved_path
                                break

                    # If no output file found in history, use the most recent file from available_files
                    if not most_recent_output_file and available_files:
                        most_recent_output_file = available_files[-1]  # Last file is most recent

                    # If chart-maker doesn't have files or is using old files, update to use most recent output
                    if most_recent_output_file:
                        if not files_used or (files_used and files_used[0] != most_recent_output_file):
                            logger.info(f"📊 ReAct: Chart-maker should use most recent output file: {most_recent_output_file}")
                            logger.info(f"   LLM specified files: {files_used}, updating to use: {most_recent_output_file}")
                            files_used = [most_recent_output_file]
                            # Update the step_data to reflect this change
                            step_data["files_used"] = files_used

                # Get atom guidance
                guidance = ATOM_MAPPING.get(atom_id, {})

                # Build prompt for the step
                prompt_text = self._compose_prompt(
                    atom_id=atom_id,
                    description=description,
                    guidance=guidance,
                    files_used=files_used,
                    inputs=inputs,
                    output_alias=output_alias,
                    is_stream_workflow=True
                )

                # Create WorkflowStepPlan
                step_plan = WorkflowStepPlan(
                    step_number=step_number,
                    atom_id=atom_id,
                    description=description,
                    prompt=prompt_text,
                    files_used=files_used,
                    inputs=inputs,
                    output_alias=output_alias,
                    atom_prompt=prompt_text
                )

                logger.info(f"✅ ReAct: Generated step {step_number}: {atom_id} - {description}")
                return step_plan

            except RetryableJSONGenerationError as e:
                logger.error(f"❌ ReAct step planning failed after all retries: {e}")
                return None
            except Exception as e:
                logger.error(f"❌ ReAct step planning failed with unexpected error: {e}")
                import traceback
                traceback.print_exc()
                return None

    async def _evaluate_step_result(
            self,
            execution_result: Dict[str, Any],
            atom_id: str,
            step_number: int,
            user_prompt: str,
            step_plan: WorkflowStepPlan,
            execution_history: List[Dict[str, Any]],
            sequence_id: str
        ) -> StepEvaluation:
            """
            Evaluate the result of a step execution using LLM.

            Evaluates:
            - Correctness (success, error handling)
            - Quality (meets user goal, data integrity)
            - Next action decision (continue, retry_with_correction, change_approach, complete)

            Args:
                execution_result: Result from atom execution
                atom_id: ID of the atom that was executed
                step_number: Step number
                user_prompt: Original user request
                step_plan: The step plan that was executed
                execution_history: Previous execution history
                sequence_id: Sequence identifier

            Returns:
                StepEvaluation with decision and reasoning
            """
            if aiohttp is None:
                raise RuntimeError("aiohttp is required for step evaluation but is not installed")

            # Build evaluation prompt
            eval_prompt = self._build_react_evaluation_prompt(
                execution_result=execution_result,
                atom_id=atom_id,
                step_number=step_number,
                user_prompt=user_prompt,
                step_plan=step_plan,
                execution_history=execution_history
            )

            logger.info(f"🔍 ReAct: Evaluating step {step_number} result...")
            logger.debug(f"📝 Evaluation prompt length: {len(eval_prompt)} chars")

            # Define LLM call function
            async def _call_llm_for_evaluation() -> Dict[str, Any]:
                """Inner function that makes the LLM call for evaluation"""
                async with aiohttp.ClientSession() as session:
                    payload = {
                        "model": self.llm_model,
                        "messages": [
                            {
                                "role": "system",
                                "content": "You are a ReAct-style agent evaluator. Evaluate step execution results and decide next actions. Respond with valid JSON only."
                            },
                            {"role": "user", "content": eval_prompt}
                        ],
                        "temperature": 0.2,  # Lower temperature for more consistent evaluation
                        "max_tokens": 800  # Reduced for faster evaluation
                    }

                    headers = {
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {self.bearer_token}"
                    }

                    async with session.post(
                        self.llm_api_url,
                        json=payload,
                        headers=headers,
                        timeout=aiohttp.ClientTimeout(total=90)  # Increased timeout for evaluation
                    ) as response:
                        response.raise_for_status()
                        result = await response.json()

                        content = result["choices"][0]["message"]["content"]
                        logger.debug(f"🔍 Evaluation LLM response: {content[:300]}...")

                        # Parse JSON from response
                        if "```json" in content:
                            content = content.split("```json")[1].split("```")[0].strip()
                        elif "```" in content:
                            content = content.split("```")[1].split("```")[0].strip()

                        eval_data = json.loads(content)

                        if not isinstance(eval_data, dict):
                            raise ValueError("Evaluation response is not a dictionary")

                        return eval_data

            try:
                eval_data = await self._retry_llm_json_generation(
                    llm_call_func=_call_llm_for_evaluation,
                    step_name="Step Evaluation",
                    max_attempts=2  # Fewer retries for evaluation
                )

                # Extract evaluation data
                decision = eval_data.get("decision", "continue")
                reasoning = eval_data.get("reasoning", "")
                quality_score = eval_data.get("quality_score")
                correctness = eval_data.get("correctness", True)
                issues = eval_data.get("issues", [])
                corrected_prompt = eval_data.get("corrected_prompt")
                alternative_approach = eval_data.get("alternative_approach")

                # Validate decision
                valid_decisions = ["continue", "retry_with_correction", "change_approach", "complete"]
                if decision not in valid_decisions:
                    logger.warning(f"⚠️ Invalid decision '{decision}', defaulting to 'continue'")
                    decision = "continue"

                evaluation = StepEvaluation(
                    decision=decision,
                    reasoning=reasoning,
                    quality_score=quality_score,
                    correctness=correctness,
                    issues=issues if isinstance(issues, list) else [],
                    corrected_prompt=corrected_prompt,
                    alternative_approach=alternative_approach
                )

                # Store observation in ReAct state
                react_state = self._sequence_react_state.get(sequence_id)
                if react_state:
                    observation = f"Step {step_number} ({atom_id}): {reasoning}"
                    react_state.add_observation(observation)

                logger.info(f"✅ ReAct: Evaluation complete - Decision: {decision}")
                logger.debug(f"   Reasoning: {reasoning[:200]}...")

                return evaluation

            except RetryableJSONGenerationError as e:
                logger.error(f"❌ Step evaluation failed after all retries: {e}")
                # Fallback to simple success/failure check
                success = bool(execution_result.get("success", True))
                return StepEvaluation(
                    decision="continue" if success else "retry_with_correction",
                    reasoning=f"Evaluation failed, using fallback: {'success' if success else 'failure'}",
                    correctness=success,
                    issues=["Evaluation LLM call failed"] if not success else []
                )
            except Exception as e:
                logger.error(f"❌ Step evaluation failed with unexpected error: {e}")
                import traceback
                traceback.print_exc()
                # Fallback
                success = bool(execution_result.get("success", True))
                return StepEvaluation(
                    decision="continue" if success else "retry_with_correction",
                    reasoning=f"Evaluation error: {str(e)}",
                    correctness=success,
                    issues=[f"Evaluation error: {str(e)}"]
                )

    async def _handle_react_decision(
            self,
            evaluation: StepEvaluation,
            step_plan: WorkflowStepPlan,
            sequence_id: str,
            websocket,
            execution_result: Dict[str, Any]
        ) -> Tuple[bool, Optional[WorkflowStepPlan]]:
            """
            Handle the decision from step evaluation.

            Returns:
                Tuple of (should_continue, next_step_plan)
                - should_continue: Whether to continue the workflow
                - next_step_plan: Next step plan if applicable, None if complete or retry
            """
            decision = evaluation.decision
            react_state = self._sequence_react_state.get(sequence_id)

            # Send decision event (with error handling to prevent hangs)
            try:
                await self._send_event(
                    websocket,
                    WebSocketEvent(
                        "react_decision",
                        {
                            "sequence_id": sequence_id,
                            "decision": decision,
                            "reasoning": evaluation.reasoning,
                            "quality_score": evaluation.quality_score,
                            "correctness": evaluation.correctness,
                            "issues": evaluation.issues
                        }
                    ),
                    "react_decision event"
                )
            except WebSocketDisconnect:
                logger.warning(f"⚠️ WebSocket disconnected during react_decision, continuing workflow")
            except Exception as e:
                logger.warning(f"⚠️ Failed to send react_decision event: {e}, continuing workflow")

            if decision == "complete":
                logger.info("✅ ReAct: Goal achieved, workflow complete")
                if react_state:
                    react_state.goal_achieved = True
                return (False, None)

            elif decision == "retry_with_correction":
                if react_state:
                    react_state.retry_count += 1
                    if react_state.retry_count >= react_state.max_retries_per_step:
                        logger.warning(f"⚠️ ReAct: Max retries ({react_state.max_retries_per_step}) reached for step, changing approach")
                        decision = "change_approach"
                    else:
                        logger.info(f"🔄 ReAct: Retrying step with correction (attempt {react_state.retry_count})")
                        # Use corrected prompt if provided
                        if evaluation.corrected_prompt:
                            step_plan.prompt = evaluation.corrected_prompt
                            step_plan.atom_prompt = evaluation.corrected_prompt
                        return (True, step_plan)  # Retry same step

                # If max retries reached, fall through to change_approach

            if decision == "change_approach":
                logger.info("🔄 ReAct: Changing approach for this step")
                if react_state:
                    react_state.retry_count = 0  # Reset retry count for new approach
                # Return None to trigger new step generation with different approach
                return (True, None)

            # Default: continue to next step
            logger.info("➡️ ReAct: Continuing to next step")
            if react_state:
                react_state.retry_count = 0  # Reset retry count
            return (True, None)

