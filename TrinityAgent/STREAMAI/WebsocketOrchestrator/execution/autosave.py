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



class WorkflowAutosaveMixin:
    """Execution helper mixin extracted from WorkflowExecutionMixin."""
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
