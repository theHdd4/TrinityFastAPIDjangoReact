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



class WorkflowAtomExecutionMixin:
    """Execution helper mixin extracted from WorkflowExecutionMixin."""
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
