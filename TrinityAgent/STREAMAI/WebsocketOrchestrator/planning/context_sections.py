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
from ..settings import settings
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



class WorkflowContextSectionsMixin:
    """Planning helper mixin extracted from WorkflowPlanningMixin."""
    def _determine_fastapi_base_url(self) -> str:
            """Resolve FastAPI base URL for downstream atom services."""
            base_url = getattr(settings, 'FASTAPI_BASE_URL', None)
            if base_url:
                return base_url.rstrip("/")

            host = getattr(settings, 'FASTAPI_HOST', None) or settings.HOST_IP
            port = str(getattr(settings, 'FASTAPI_PORT', None) or '')

            if host and port:
                return f"http://{host}:{port}".rstrip("/")

            # Heuristic defaults
            default_host = host or "localhost"
            # If running inside docker compose, fastapi service usually on 8001
            default_port = "8001" if getattr(settings, 'RUNNING_IN_DOCKER', None) else "8002"

            return f"http://{default_host}:{port or default_port}".rstrip("/")

    def _build_dataset_section(
            self,
            atom_id: str,
            files_used: List[str],
            inputs: List[str],
            output_alias: Optional[str],
            is_stream_workflow: bool = True
        ) -> str:
            files_used = self._ensure_list_of_strings(files_used)
            inputs = self._ensure_list_of_strings(inputs)

            lines: List[str] = []

            # Get file metadata to include column names
            all_file_paths = list(set(files_used + inputs))
            file_metadata = {}
            if all_file_paths:
                file_metadata = self._get_file_metadata(all_file_paths)

            # Add Stream AI mode warning at the top
            if is_stream_workflow:
                lines.append("🚨 USE ONLY THIS FILE - DO NOT USE ANY OTHER FILES")
                lines.append("The file(s) specified below are MANDATORY for this workflow step.")
                lines.append("")

            # Add comprehensive file metadata with column names, data types, and row counts
            if file_metadata:
                lines.append("**📊 COMPREHENSIVE FILE METADATA (CRITICAL - Use ONLY these details):**")
                lines.append("")
                for file_path in all_file_paths:
                    if file_path in file_metadata:
                        metadata = file_metadata[file_path]
                        columns = metadata.get("columns", [])
                        file_display = self._display_file_name(file_path)

                        lines.append(f"**File Details:**")
                        lines.append(f"- **Full Path:** `{file_path}`")
                        lines.append(f"- **Display Name:** `{file_display}`")

                        # Add row count if available
                        row_count = metadata.get("row_count") or metadata.get("rows") or metadata.get("num_rows")
                        if row_count:
                            lines.append(f"- **Row Count:** {row_count:,} rows")

                        # Add file size if available
                        file_size = metadata.get("file_size") or metadata.get("size")
                        if file_size:
                            lines.append(f"- **File Size:** {file_size}")

                        # Add column details with data types if available
                        if columns:
                            lines.append(f"- **Total Columns:** {len(columns)}")
                            lines.append("")
                            lines.append("**Column Names (Use EXACTLY as shown - case-sensitive):**")

                            # Show all columns with data types if available
                            column_types = metadata.get("column_types", {}) or metadata.get("dtypes", {})
                            if column_types and isinstance(column_types, dict):
                                # Show columns with their data types
                                for col in columns[:20]:  # Show first 20 columns with types
                                    col_type = column_types.get(col, "unknown")
                                    lines.append(f"  - `{col}` (type: {col_type})")
                                if len(columns) > 20:
                                    lines.append(f"  - ... and {len(columns) - 20} more columns")
                                    # Show remaining column names without types
                                    for col in columns[20:30]:
                                        lines.append(f"  - `{col}`")
                                    if len(columns) > 30:
                                        lines.append(f"  - ... and {len(columns) - 30} more columns")
                            else:
                                # Show columns without types
                                lines.append(f"  {', '.join([f'`{col}`' for col in columns[:15]])}")
                            if len(columns) > 15:
                                    lines.append(f"  ... and {len(columns) - 15} more columns: {', '.join([f'`{col}`' for col in columns[15:25]])}")
                                    if len(columns) > 25:
                                        lines.append(f"  ... and {len(columns) - 25} more columns")

                            lines.append("")
                            lines.append("⚠️ **CRITICAL:** Use ONLY the column names listed above. Do NOT invent, guess, or modify column names.")
                            lines.append("⚠️ **CRITICAL:** Column names are case-sensitive. Use exact spelling and capitalization.")
                        else:
                            lines.append("- **Columns:** Column information not available - use file metadata section above")

                        lines.append("")
                lines.append("")

            def append_line(label: str, value: Optional[str]) -> None:
                if value:
                    if is_stream_workflow:
                        lines.append(f"- {label}: `{value}` ⚠️ MANDATORY - Use this file ONLY")
                    else:
                        lines.append(f"- {label}: `{value}`")

            if atom_id == "merge":
                left = files_used[0] if len(files_used) > 0 else (inputs[0] if inputs else None)
                right = files_used[1] if len(files_used) > 1 else (inputs[1] if len(inputs) > 1 else None)
                append_line("Left source", left)
                append_line("Right source", right)
                if not left or not right:
                    if is_stream_workflow:
                        lines.append("- ⚠️ CRITICAL: Source datasets missing. Both left and right inputs are REQUIRED for this workflow step.")
                    else:
                        lines.append("- Source datasets missing: identify both left and right inputs before executing the merge.")
            elif atom_id == "concat":
                if files_used:
                    for idx, source in enumerate(files_used, start=1):
                        append_line(f"Source {idx}", source)
                elif inputs:
                    append_line("Primary source", inputs[0])
            elif atom_id == "data-upload-validate":
                # For data-upload-validate, show the file to load
                target_file = files_used[0] if files_used else (inputs[0] if inputs else None)
                if target_file:
                    append_line("File to load from MinIO", target_file)
                else:
                    if is_stream_workflow:
                        lines.append("- ⚠️ CRITICAL: File name is REQUIRED for this workflow step. Use the file specified in the workflow plan.")
                    else:
                        lines.append("- **CRITICAL:** File name must be extracted from user prompt or available files")
            else:
                primary_input = inputs[0] if inputs else (files_used[0] if files_used else None)
                append_line("Input dataset", primary_input)

            if output_alias:
                append_line("Output alias for downstream steps", output_alias)

            if not lines:
                if is_stream_workflow:
                    lines.append("- ⚠️ CRITICAL: No input dataset specified. This is required for the workflow step.")
                else:
                    lines.append("- Determine the correct input datasets using the workflow context.")

            if is_stream_workflow and (files_used or inputs):
                lines.append("")
                lines.append("⚠️ REMINDER: You MUST use the file(s) listed above. Do not use any other files.")

            section_title = "🚨 Datasets & dependencies (MANDATORY for Stream AI workflow):" if is_stream_workflow else "Datasets & dependencies:"
            return section_title + "\n" + "\n".join(lines)

    def _build_workflow_context_section(
            self,
            sequence_id: str,
            atom_id: str,
            files_used: List[str],
            inputs: List[str],
            is_stream_workflow: bool = True
        ) -> str:
            """
            Build workflow context section showing what previous steps created.
            This helps the atom LLM understand the workflow flow and which files to use.
            """
            lines: List[str] = []

            # Get execution history from ReAct state
            react_state = self._sequence_react_state.get(sequence_id)
            if not react_state:
                return ""  # No ReAct state, no context needed

            # Check if execution_history exists and has items
            execution_history = react_state.execution_history
            if not execution_history or len(execution_history) == 0:
                return ""  # No previous steps, no context needed

            lines.append("## 🔄 WORKFLOW CONTEXT (What Previous Steps Created):")
            lines.append("")
            lines.append("The following steps were executed before this step. Use their output files:")
            lines.append("")

            # Show last 3 steps for context
            recent_steps = execution_history[-3:]
            for idx, hist in enumerate(recent_steps, 1):
                step_num = hist.get("step_number", "?")
                hist_atom = hist.get("atom_id", "?")
                description = hist.get("description", "N/A")  # May not be in ReActState execution_history
                result = hist.get("result", {})

                lines.append(f"**Step {step_num}: {hist_atom}**")
                lines.append(f"  - Description: {description}")

                # Extract output file
                saved_path = None
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

                if saved_path:
                    file_display = self._display_file_name(saved_path)
                    lines.append(f"  - 📄 **Output File Created:** `{saved_path}` (display: {file_display})")

                    # Check if this file is being used in current step
                    if saved_path in files_used or saved_path in inputs:
                        lines.append(f"  - ✅ **This file is being used in the current step**")

                lines.append("")

            # Special emphasis for chart-maker
            if atom_id == "chart-maker":
                lines.append("⚠️ **CRITICAL FOR CHART-MAKER:**")
                if files_used:
                    file_display = self._display_file_name(files_used[0])
                    lines.append(f"- You MUST use the file: `{files_used[0]}` (display: {file_display})")
                    lines.append(f"- This file was created by a previous workflow step (see above)")
                    lines.append(f"- Use this file's columns and data structure for the chart")
                lines.append("")

            return "\n".join(lines)

    def _build_atom_instruction_section(
            self,
            atom_id: str,
            original_prompt: str,
            files_used: List[str],
            inputs: List[str]
        ) -> str:
            if atom_id == "merge":
                return self._build_merge_section(original_prompt, files_used)
            if atom_id == "groupby-wtg-avg":
                return self._build_groupby_section(original_prompt, inputs or files_used)
            if atom_id == "concat":
                return self._build_concat_section(original_prompt, files_used)
            if atom_id == "dataframe-operations":
                return self._build_dataframe_operations_section(original_prompt, inputs or files_used)
            if atom_id == "chart-maker":
                return self._build_chart_section(original_prompt, inputs or files_used)
            if atom_id == "create-column":
                return self._build_create_column_section(original_prompt, inputs or files_used)
            if atom_id == "create-transform":
                return self._build_create_transform_section(original_prompt, inputs or files_used)
            if atom_id == "data-upload-validate":
                return self._build_data_upload_validate_section(original_prompt, files_used, inputs)
            return self._build_generic_section(atom_id, original_prompt)

    def _build_available_files_section(self, available_files: List[str], is_stream_workflow: bool = True) -> str:
            if not available_files:
                if is_stream_workflow:
                    return "🚨 STREAM AI WORKFLOW MODE: No files available. Use ONLY the file(s) specified in the 'Datasets & dependencies' section above."
                return ""

            lines: List[str] = []

            if is_stream_workflow:
                lines.append("🚨 STREAM AI WORKFLOW MODE: You MUST use ONLY the files listed below.")
                lines.append("Do not use any other files from MinIO.")
                lines.append("These are the ONLY valid files for this workflow step:")
                lines.append("")

            max_files = 5
            file_lines = [f"- {path}" for path in available_files[:max_files]]
            if len(available_files) > max_files:
                file_lines.append(f"- (+{len(available_files) - max_files} more)")

            lines.extend(file_lines)

            if is_stream_workflow:
                lines.append("")
                lines.append("⚠️ REMINDER: Use ONLY these files. Any other file usage will cause workflow failure.")

            section_title = "🚨 STREAM AI WORKFLOW - Workspace file inventory:" if is_stream_workflow else "Workspace file inventory:"
            return section_title + "\n" + "\n".join(lines)

    def _build_planner_guidance_section(self, planner_prompt: str) -> str:
            if not planner_prompt:
                return ""
            guidance_lines: List[str] = []
            for raw_line in planner_prompt.strip().splitlines():
                stripped = raw_line.strip()
                if not stripped:
                    continue
                if stripped.startswith(("-", "*")):
                    guidance_lines.append(stripped)
                else:
                    guidance_lines.append(f"- {stripped}")
            if not guidance_lines:
                return ""
            return "Planner guidance:\n" + "\n".join(guidance_lines)

    def _build_merge_section(self, original_prompt: str, files_used: List[str]) -> str:
            join_columns = self._extract_join_columns(original_prompt)
            join_type = self._detect_join_type(original_prompt)
            requires_common = "common column" in original_prompt.lower() or "common key" in original_prompt.lower()

            # Validate join columns against actual file metadata
            validated_join_columns = []
            if join_columns and files_used:
                validated_join_columns = self._validate_column_names(join_columns, files_used)
                if len(validated_join_columns) < len(join_columns):
                    logger.warning(f"⚠️ Filtered {len(join_columns) - len(validated_join_columns)} invalid join columns. Using only validated: {validated_join_columns}")

            lines: List[str] = ["Merge requirements:"]

            if join_type:
                lines.append(f"- Join type: {join_type}")
            else:
                lines.append("- Join type: Determine the most appropriate join type; default to `inner` if the user did not specify.")

            if validated_join_columns:
                formatted = ", ".join(validated_join_columns)
                lines.append(f"- Join columns: {formatted} (VALIDATED - these columns exist in the files)")
            elif join_columns:
                # If validation failed, still mention but warn
                formatted = ", ".join(join_columns)
                lines.append(f"- Join columns: {formatted} (⚠️ WARNING: Validate these columns exist in the files before using)")
            elif requires_common:
                lines.append("- Join columns: Automatically detect the overlapping column names shared by both datasets (user requested common columns). Use ONLY columns that exist in both files.")
            else:
                lines.append("- Join columns: Inspect both datasets and choose matching identifier columns (e.g., customer_id, order_id) when the user does not specify. Use ONLY columns that exist in the files.")

            if files_used and len(files_used) == 1:
                lines.append("- Secondary dataset: Confirm the second dataset to merge since only one source was resolved.")

            lines.append("- Preserve relevant columns and resolve duplicate suffixes according to user intent.")
            return "\n".join(lines)

    def _build_groupby_section(self, original_prompt: str, possible_inputs: List[str]) -> str:
            group_columns = self._extract_group_columns(original_prompt)
            aggregation_details = self._extract_aggregation_details(original_prompt)

            # Validate group columns and aggregation columns against actual file metadata
            validated_group_columns = []
            validated_metrics = []
            if possible_inputs:
                if group_columns:
                    validated_group_columns = self._validate_column_names(group_columns, possible_inputs)
                    if len(validated_group_columns) < len(group_columns):
                        logger.warning(f"⚠️ Filtered {len(group_columns) - len(validated_group_columns)} invalid group columns. Using only validated: {validated_group_columns}")

                # Validate aggregation column names
                if aggregation_details.get("metrics"):
                    agg_column_names = [m["column"] for m in aggregation_details["metrics"]]
                    validated_agg_columns = self._validate_column_names(agg_column_names, possible_inputs)
                    # Rebuild metrics with validated columns
                    for i, metric in enumerate(aggregation_details["metrics"]):
                        if i < len(validated_agg_columns):
                            validated_metrics.append({
                                "aggregation": metric["aggregation"],
                                "column": validated_agg_columns[i]
                            })
                    if len(validated_metrics) < len(aggregation_details["metrics"]):
                        logger.warning(f"⚠️ Filtered {len(aggregation_details['metrics']) - len(validated_metrics)} invalid aggregation columns")
                else:
                    validated_metrics = aggregation_details["metrics"]
            else:
                validated_group_columns = group_columns
                validated_metrics = aggregation_details["metrics"]

            lines: List[str] = ["Aggregation requirements:"]

            if validated_group_columns:
                lines.append(f"- Group columns: {', '.join(validated_group_columns)} (VALIDATED - these columns exist in the file)")
            elif group_columns:
                lines.append(f"- Group columns: {', '.join(group_columns)} (⚠️ WARNING: Validate these columns exist in the file before using)")
            else:
                lines.append("- Group columns: Identify the categorical dimensions that best align with the user's request. Use ONLY columns that exist in the file.")

            if validated_metrics:
                lines.append("- Metrics to compute:")
                for metric in validated_metrics:
                    aggregation = metric["aggregation"]
                    column = metric["column"]
                    detail = f"{aggregation} of {column}"
                    if aggregation == "weighted_avg" and aggregation_details.get("weight_column"):
                        weight_col = aggregation_details["weight_column"]
                        # Validate weight column too
                        validated_weight_cols = self._validate_column_names([weight_col], possible_inputs) if possible_inputs else [weight_col]
                        if validated_weight_cols:
                            detail += f" (weight column `{validated_weight_cols[0]}` - VALIDATED)"
                        else:
                            detail += f" (weight column `{weight_col}` - ⚠️ WARNING: Validate this column exists)"
                    lines.append(f"  * {detail} (VALIDATED)")
            else:
                lines.append("- Metrics to compute: Select meaningful numeric measures (sum, average, count) based on dataset profiling when none are specified. Use ONLY columns that exist in the file.")

            weight_column = aggregation_details.get("weight_column")
            if weight_column and all(metric["aggregation"] != "weighted_avg" for metric in validated_metrics):
                validated_weight_cols = self._validate_column_names([weight_column], possible_inputs) if possible_inputs else []
                if validated_weight_cols:
                    lines.append(f"- Weighting: The user referenced weights; consider `{validated_weight_cols[0]}` (VALIDATED) for weighted averages.")
                else:
                    lines.append(f"- Weighting: The user referenced weights; consider `{weight_column}` (⚠️ WARNING: Validate this column exists) for weighted averages.")
            elif not weight_column and any("weight" in token.lower() for token in original_prompt.split()):
                lines.append("- Weighting: User mentioned weights; detect the correct weight field before computing weighted metrics. Use ONLY columns that exist in the file.")

            if possible_inputs:
                lines.append(f"- Use input dataset: `{possible_inputs[0]}`")

            lines.append("- Ensure the output includes clear column names for each aggregation.")
            return "\n".join(lines)

    def _build_concat_section(self, original_prompt: str, files_used: List[str]) -> str:
            direction = self._detect_concat_direction(original_prompt)

            lines: List[str] = ["Concatenation requirements:"]

            if direction:
                lines.append(f"- Direction: {direction}")
            else:
                lines.append("- Direction: Infer whether to stack rows (vertical) or append columns (horizontal) based on the user's wording; default to vertical stacking.")

            if files_used:
                lines.append("- Maintain consistent column ordering across all sources before concatenation.")
            else:
                lines.append("- Confirm the ordered list of datasets to concatenate.")

            if "duplicate" in original_prompt.lower():
                lines.append("- Post-concat cleanup: Remove duplicate rows as requested by the user.")
            else:
                lines.append("- Post-concat cleanup: Harmonize schemas and remove obvious duplicates if they appear.")

            return "\n".join(lines)

    def _build_dataframe_operations_section(self, original_prompt: str, possible_inputs: List[str]) -> str:
            """
            Build detailed instructions for dataframe-operations atom.
            This atom supports Excel-like operations: formulas, filters, sorts, transformations, etc.
            """
            prompt_lower = original_prompt.lower()
            lines: List[str] = ["DataFrame operations requirements (Excel-like capabilities):"]

            # Detect operation types from prompt
            has_formula = any(kw in prompt_lower for kw in ["formula", "calculate", "compute", "prod", "sum", "div", "if", "average", "multiply", "divide"])
            has_filter = any(kw in prompt_lower for kw in ["filter", "where", "remove", "exclude", "keep only"])
            has_sort = any(kw in prompt_lower for kw in ["sort", "order", "arrange", "ascending", "descending"])
            has_transform = any(kw in prompt_lower for kw in ["transform", "convert", "round", "case", "rename", "edit"])
            has_column_ops = any(kw in prompt_lower for kw in ["column", "select", "drop", "remove column", "add column", "insert column"])
            has_row_ops = any(kw in prompt_lower for kw in ["row", "insert row", "delete row", "remove row"])
            has_find_replace = any(kw in prompt_lower for kw in ["find", "replace", "search"])

            # Formula operations
            if has_formula:
                lines.append("- Formula operations:")
                lines.append("  * Detect formula type: PROD (multiply), SUM (add), DIV (divide), IF (conditional), AVG (average), etc.")
                lines.append("  * Extract column names from prompt and validate against file metadata (use ONLY columns that exist)")
                lines.append("  * Ensure formulas start with '=' prefix (required by backend)")
                lines.append("  * Example: 'PROD(Price, Volume)' → '=PROD(Price, Volume)' (only if Price and Volume exist in file)")
                lines.append("  * Target column: Create new column or overwrite existing based on user intent")
                if possible_inputs:
                    lines.append("  * ⚠️ CRITICAL: Use ONLY column names from the file metadata section above")

            # Filter operations
            if has_filter:
                lines.append("- Filter operations:")
                lines.append("  * Extract filter conditions (e.g., 'revenue > 1000', 'status == active')")
                lines.append("  * Support multiple conditions with AND/OR logic")
                lines.append("  * Handle numeric, string, and date comparisons")

            # Sort operations
            if has_sort:
                lines.append("- Sort operations:")
                lines.append("  * Extract sort column(s) and direction (asc/desc)")
                lines.append("  * Support multi-column sorting if mentioned")

            # Transform operations
            if has_transform:
                lines.append("- Transform operations:")
                lines.append("  * Column renaming: Extract old and new column names")
                lines.append("  * Type conversion: Detect target types (text, number, date)")
                lines.append("  * Case conversion: lower, upper, snake_case, etc.")
                lines.append("  * Rounding: Extract decimal places if mentioned")

            # Column operations
            if has_column_ops:
                lines.append("- Column operations:")
                lines.append("  * Select/drop: Identify columns to keep or remove")
                lines.append("  * Insert: Detect position and default values")
                lines.append("  * Rename: Map old names to new names")

            # Row operations
            if has_row_ops:
                lines.append("- Row operations:")
                lines.append("  * Insert: Detect position (above/below) and default values")
                lines.append("  * Delete: Identify rows to remove (by index or condition)")

            # Find and replace
            if has_find_replace:
                lines.append("- Find and replace:")
                lines.append("  * Extract search text and replacement text")
                lines.append("  * Detect case sensitivity and replace all options")

            # General guidance
            if not (has_formula or has_filter or has_sort or has_transform or has_column_ops or has_row_ops or has_find_replace):
                lines.append("- General operations:")
                lines.append("  * Analyze prompt to determine which DataFrame operations are needed")
                lines.append("  * Support multiple operations in sequence if user requests multiple tasks")
                lines.append("  * Use operations list in dataframe_config to chain operations")

            # Input dataset
            if possible_inputs:
                lines.append(f"- Use input dataset: `{possible_inputs[0]}`")

            # Output guidance
            lines.append("- Output format:")
            lines.append("  * Return dataframe_config with operations array")
            lines.append("  * Each operation should have: operation_name, api_endpoint, method, parameters")
            lines.append("  * Use 'auto_from_previous' for df_id to chain operations")
            lines.append("  * Ensure operations are ordered correctly (load first, then transformations)")

            return "\n".join(lines)

    def _build_chart_section(self, original_prompt: str, possible_inputs: List[str]) -> str:
            """
            Build precise configuration instructions for chart-maker atom.
            Emphasizes returning structured JSON with exact column names.
            """
            prompt_lower = original_prompt.lower()
            chart_type = self._detect_chart_type(prompt_lower)
            focus_columns = self._extract_focus_entities(prompt_lower)
            filters = self._extract_filter_clauses(original_prompt)

            lines: List[str] = ["## 📊 CHART CONFIGURATION (return JSON only):"]
            lines.append("")
            lines.append("**JSON Format:**")
            lines.append("{")
            lines.append('  "chart_type": "<bar|line|pie|scatter|area|combo>",')
            lines.append('  "data_source": "<input dataset name>",')
            lines.append('  "x_column": "<categorical column>",')
            lines.append('  "y_column": "<numeric measure>",')
            lines.append('  "breakdown_columns": ["<optional category columns>"],')
            lines.append('  "filters": [{"column": "<column>", "operator": "==|>|<|contains", "value": "<exact value>"}],')
            lines.append('  "title": "<human friendly title>"')
            lines.append("}")
            lines.append("")
            lines.append("## ⚠️ CRITICAL FILE USAGE (MOST IMPORTANT):")
            lines.append("")
            if possible_inputs:
                file_path = possible_inputs[0]
                file_display = self._display_file_name(file_path)

                # Get file metadata for this file
                file_metadata = self._get_file_metadata([file_path])
                metadata = file_metadata.get(file_path, {}) if file_metadata else {}
                columns = metadata.get("columns", [])
                row_count = metadata.get("row_count") or metadata.get("rows") or metadata.get("num_rows")

                lines.append(f"**📁 PRIMARY DATA SOURCE FILE (MANDATORY):**")
                lines.append(f"- **Full Path:** `{file_path}`")
                lines.append(f"- **Display Name:** `{file_display}`")
                if row_count:
                    lines.append(f"- **Row Count:** {row_count:,} rows")
                lines.append(f"- **⚠️ CRITICAL:** You MUST use this EXACT file path as `data_source` in your JSON response")
                lines.append(f"- **⚠️ CRITICAL:** This file was created/processed by previous workflow steps")
                lines.append(f"- **⚠️ CRITICAL:** Do NOT use any other file - use ONLY `{file_path}`")
                lines.append("")

                if columns:
                    lines.append(f"**📋 AVAILABLE COLUMNS IN THIS FILE ({len(columns)} columns):**")
                    lines.append("")
                    # Show columns with types if available
                    column_types = metadata.get("column_types", {}) or metadata.get("dtypes", {})
                    if column_types and isinstance(column_types, dict):
                        # Categorize columns
                        categorical_cols = []
                        numeric_cols = []
                        other_cols = []

                        for col in columns:
                            col_type = str(column_types.get(col, "unknown")).lower()
                            if any(t in col_type for t in ["object", "string", "category", "bool"]):
                                categorical_cols.append((col, col_type))
                            elif any(t in col_type for t in ["int", "float", "number"]):
                                numeric_cols.append((col, col_type))
                            else:
                                other_cols.append((col, col_type))

                        if categorical_cols:
                            lines.append("**Categorical Columns (use for x_column or breakdown_columns):**")
                            for col, col_type in categorical_cols[:15]:
                                lines.append(f"  - `{col}` (type: {col_type})")
                            if len(categorical_cols) > 15:
                                lines.append(f"  - ... and {len(categorical_cols) - 15} more categorical columns")
                            lines.append("")

                        if numeric_cols:
                            lines.append("**Numeric Columns (use for y_column):**")
                            for col, col_type in numeric_cols[:15]:
                                lines.append(f"  - `{col}` (type: {col_type})")
                            if len(numeric_cols) > 15:
                                lines.append(f"  - ... and {len(numeric_cols) - 15} more numeric columns")
                            lines.append("")

                        if other_cols:
                            lines.append("**Other Columns:**")
                            for col, col_type in other_cols[:10]:
                                lines.append(f"  - `{col}` (type: {col_type})")
                            if len(other_cols) > 10:
                                lines.append(f"  - ... and {len(other_cols) - 10} more columns")
                            lines.append("")
                    else:
                        # Show all columns without types
                        lines.append("**All Columns:**")
                        lines.append(f"  {', '.join([f'`{col}`' for col in columns[:20]])}")
                        if len(columns) > 20:
                            lines.append(f"  ... and {len(columns) - 20} more columns")
                        lines.append("")

                    lines.append("⚠️ **CRITICAL:** Use ONLY the column names listed above. Column names are case-sensitive.")
                    lines.append("⚠️ **CRITICAL:** For x_column, use categorical columns. For y_column, use numeric columns.")
                    lines.append("")
            else:
                lines.append("- **CRITICAL:** Use the file specified in the 'Datasets & dependencies' section above")
                lines.append("- This should be the output file from previous workflow steps")
                lines.append("- Do NOT use original input files if processed files exist")
                lines.append("- Check the FILE METADATA section above for available columns")
            lines.append("")
            lines.append("Rules:")
            lines.append("- Use EXACT column names from dataset metadata (case-sensitive, spaces preserved).")
            lines.append("- If the user used abbreviations (e.g., 'reg', 'rev'), map them to the canonical column names from the file metadata section above before filling the JSON.")
            lines.append("- ⚠️ CRITICAL: Validate all column names against the file metadata. Do NOT use columns that don't exist in the file.")
            lines.append("- Choose chart_type based on user request (default to 'bar' if unspecified).")
            lines.append("- x_column should be a categorical column (e.g., Region, Brand, Month).")
            lines.append("- y_column must be a numeric measure (e.g., Sales, Revenue, Quantity).")
            lines.append("- Filters: capture regions/brands/time ranges mentioned by the user; use equality comparisons unless a range is specified.")
            lines.append("- Title: Summarize the chart purpose (e.g., 'Sales of Brand GERC in Rajasthan').")

            if chart_type:
                lines.append(f"- Detected chart type hint: {chart_type}")
            if focus_columns:
                lines.append(f"- Entities mentioned by user: {', '.join(focus_columns)} (ensure these map to actual columns)")
            if filters:
                lines.append("- Filter hints from prompt:")
                for flt in filters:
                    lines.append(f"  * {flt}")

            lines.append("- Output must be pure JSON (no prose).")
            return "\n".join(lines)

    def _detect_chart_type(self, prompt_lower: str) -> Optional[str]:
            chart_keywords = {
                "bar": ["bar", "column"],
                "line": ["line", "trend"],
                "pie": ["pie", "share", "distribution"],
                "scatter": ["scatter", "correlation", "relationship"],
                "area": ["area"],
                "combo": ["combo", "combined"]
            }
            for chart, keywords in chart_keywords.items():
                if any(keyword in prompt_lower for keyword in keywords):
                    return chart
            return None

    def _extract_focus_entities(self, prompt_lower: str) -> List[str]:
            tokens = re.findall(r"[A-Za-z0-9_]+", prompt_lower)
            common_entities = {"brand", "region", "market", "channel", "product", "country", "customer"}
            entities = [token for token in tokens if token in common_entities]
            return list(dict.fromkeys(entities))

    def _extract_filter_clauses(self, prompt: str) -> List[str]:
            clauses = []
            patterns = [
                r"in\s+(?:the\s+)?([A-Za-z0-9_\s]+)",
                r"for\s+(?:the\s+)?([A-Za-z0-9_\s]+)",
                r"where\s+([A-Za-z0-9_\s><=]+)"
            ]
            for pattern in patterns:
                for match in re.findall(pattern, prompt, flags=re.IGNORECASE):
                    clauses.append(match.strip())
            return clauses

    def _build_data_upload_validate_section(
            self,
            original_prompt: str,
            files_used: List[str],
            inputs: List[str]
        ) -> str:
            """
            Build detailed instructions for data-upload-validate atom.
            This atom loads files from MinIO and optionally applies dtype changes.
            """
            lines = [
                "Data Upload & Validate requirements:",
                "",
                "**CRITICAL: This atom performs a TWO-STEP process:**",
                "1. Load the file from MinIO into the data upload atom",
                "2. Optionally apply dtype changes if the user requests them",
                "",
                "**File Loading:**",
            ]

            # Add file information
            target_file = None
            if files_used:
                target_file = files_used[0]
                lines.append(f"- **MUST load this exact file:** `{target_file}`")
                lines.append(f"- File path: Use the exact path shown above (case-sensitive)")
            elif inputs:
                target_file = inputs[0]
                lines.append(f"- **MUST load this exact file:** `{target_file}`")
            else:
                # Extract file name from prompt
                file_patterns = [
                    r"load\s+([A-Za-z0-9_./-]+\.(?:csv|excel|xlsx|xls|arrow|parquet))",
                    r"upload\s+([A-Za-z0-9_./-]+\.(?:csv|excel|xlsx|xls|arrow|parquet))",
                    r"file\s+([A-Za-z0-9_./-]+\.(?:csv|excel|xlsx|xls|arrow|parquet))",
                    r"([A-Za-z0-9_./-]+\.(?:csv|excel|xlsx|xls|arrow|parquet))"
                ]
                for pattern in file_patterns:
                    match = re.search(pattern, original_prompt, re.IGNORECASE)
                    if match:
                        target_file = match.group(1)
                        lines.append(f"- **Extracted file name from prompt:** `{target_file}`")
                        lines.append(f"- **MUST load this exact file** (use exact name, case-sensitive)")
                        break

                if not target_file:
                    lines.append("- **CRITICAL:** File name not found in prompt or files_used.")
                    lines.append("- **MUST identify the exact file name** from the user's request or available files.")
                    lines.append("- Example: If user says 'load sales.csv', use exactly 'sales.csv'")

            lines.append("")
            lines.append("**Dtype Changes (OPTIONAL):**")

            # Check if user mentioned dtype changes
            prompt_lower = original_prompt.lower()
            dtype_keywords = [
                "change.*dtype", "convert.*type", "change.*type", "dtype.*to",
                "integer", "int", "float", "string", "date", "datetime",
                "change.*to.*int", "convert.*to.*int", "change.*to.*float"
            ]
            has_dtype_request = any(re.search(pattern, prompt_lower) for pattern in dtype_keywords)

            if has_dtype_request:
                lines.append("- **User requested dtype changes** - extract the specific changes:")
                lines.append("  * Identify which columns need dtype changes")
                lines.append("  * Identify the target dtype for each column (int64, float64, datetime64, object, etc.)")
                lines.append("  * Example: 'change volume to integer' → {'Volume': 'int64'}")
                lines.append("  * Example: 'convert date column to datetime' → {'Date': {'dtype': 'datetime64', 'format': 'YYYY-MM-DD'}}")
            else:
                lines.append("- **No dtype changes requested** - just load the file")
                lines.append("- Set dtype_changes to empty object {} in your response")
                lines.append("- The file will be loaded with its current data types")

            lines.append("")
            lines.append("**Response Format:**")
            lines.append("- Return JSON with validate_json containing:")
            lines.append("  * file_name: Exact file name/path to load (MUST match available files)")
            lines.append("  * dtype_changes: Object with column names and target dtypes (can be empty {})")
            lines.append("- If dtype_changes is empty, the atom will just load the file and proceed")
            lines.append("- If dtype_changes has values, the atom will load the file AND apply the conversions")

            lines.append("")
            lines.append("**Important Notes:**")
            lines.append("- The file MUST exist in MinIO (check available files list)")
            lines.append("- Use EXACT file name/path (case-sensitive, with extension)")
            lines.append("- If file name doesn't match exactly, the operation will fail")
            lines.append("- After loading, the file will be available for downstream operations")

            return "\n".join(lines)

    def _build_create_column_section(self, original_prompt: str, possible_inputs: List[str]) -> str:
            """
            Build comprehensive instructions for create-column atom.
            Includes detailed file metadata with column statistics.
            """
            lines: List[str] = []

            lines.append("## 📊 CREATE COLUMN CONFIGURATION:")
            lines.append("")
            lines.append("**Task:** Create a new calculated column based on existing columns.")
            lines.append("")

            if possible_inputs:
                file_path = possible_inputs[0]
                file_display = self._display_file_name(file_path)

                # Get comprehensive file metadata
                file_metadata = self._get_file_metadata([file_path])
                metadata = file_metadata.get(file_path, {}) if file_metadata else {}
                columns = metadata.get("columns", [])
                row_count = metadata.get("row_count") or metadata.get("rows") or metadata.get("num_rows")
                column_stats = metadata.get("column_stats", {}) or metadata.get("statistics", {})
                column_types = metadata.get("column_types", {}) or metadata.get("dtypes", {})

                lines.append("## ⚠️ CRITICAL FILE INFORMATION:")
                lines.append("")
                lines.append(f"**📁 INPUT FILE (MANDATORY):**")
                lines.append(f"- **Full Path:** `{file_path}`")
                lines.append(f"- **Display Name:** `{file_display}`")
                if row_count:
                    lines.append(f"- **Row Count:** {row_count:,} rows")
                lines.append("")

                if columns:
                    lines.append(f"## 📋 COMPREHENSIVE COLUMN DETAILS ({len(columns)} columns):")
                    lines.append("")
                    lines.append("**⚠️ CRITICAL:** Use ONLY these column names (case-sensitive). Do NOT invent column names.")
                    lines.append("")

                    # Categorize columns
                    numeric_cols = []
                    categorical_cols = []
                    other_cols = []

                    for col in columns:
                        col_type = str(column_types.get(col, "unknown")).lower() if column_types else "unknown"
                        if any(t in col_type for t in ["int", "float", "number", "numeric"]):
                            numeric_cols.append(col)
                        elif any(t in col_type for t in ["object", "string", "category", "bool"]):
                            categorical_cols.append(col)
                        else:
                            other_cols.append(col)

                    # Show numeric columns with statistics
                    if numeric_cols:
                        lines.append("**🔢 NUMERIC COLUMNS (with statistics):**")
                        lines.append("")
                        for col in numeric_cols[:30]:  # Show first 30 numeric columns
                            lines.append(f"**Column: `{col}`**")
                            col_type = column_types.get(col, "unknown") if column_types else "unknown"
                            lines.append(f"  - Data Type: {col_type}")

                            # Get statistics for this column
                            col_stats = column_stats.get(col, {}) if column_stats else {}
                            if col_stats:
                                if "count" in col_stats or "non_null_count" in col_stats:
                                    count = col_stats.get("count") or col_stats.get("non_null_count")
                                    lines.append(f"  - Count (non-null): {count:,}")
                                if "mean" in col_stats or "average" in col_stats:
                                    mean = col_stats.get("mean") or col_stats.get("average")
                                    lines.append(f"  - Mean: {mean}")
                                if "min" in col_stats or "minimum" in col_stats:
                                    min_val = col_stats.get("min") or col_stats.get("minimum")
                                    lines.append(f"  - Min: {min_val}")
                                if "max" in col_stats or "maximum" in col_stats:
                                    max_val = col_stats.get("max") or col_stats.get("maximum")
                                    lines.append(f"  - Max: {max_val}")
                                if "std" in col_stats or "stddev" in col_stats or "standard_deviation" in col_stats:
                                    std = col_stats.get("std") or col_stats.get("stddev") or col_stats.get("standard_deviation")
                                    lines.append(f"  - Std Dev: {std}")
                                if "median" in col_stats:
                                    lines.append(f"  - Median: {col_stats.get('median')}")
                                if "null_count" in col_stats or "missing" in col_stats:
                                    null_count = col_stats.get("null_count") or col_stats.get("missing")
                                    lines.append(f"  - Null Count: {null_count}")
                            else:
                                lines.append(f"  - Statistics: Not available")
                            lines.append("")

                        if len(numeric_cols) > 30:
                            lines.append(f"  ... and {len(numeric_cols) - 30} more numeric columns")
                            lines.append("")

                    # Show categorical columns
                    if categorical_cols:
                        lines.append("**📝 CATEGORICAL COLUMNS:**")
                        lines.append("")
                        for col in categorical_cols[:30]:  # Show first 30 categorical columns
                            col_type = column_types.get(col, "unknown") if column_types else "unknown"
                            lines.append(f"  - `{col}` (type: {col_type})")
                            col_stats = column_stats.get(col, {}) if column_stats else {}
                            if col_stats:
                                if "unique_count" in col_stats or "distinct_count" in col_stats:
                                    unique = col_stats.get("unique_count") or col_stats.get("distinct_count")
                                    lines.append(f"    * Unique values: {unique}")
                                if "null_count" in col_stats:
                                    lines.append(f"    * Null count: {col_stats.get('null_count')}")
                        lines.append("")

                        if len(categorical_cols) > 30:
                            lines.append(f"  ... and {len(categorical_cols) - 30} more categorical columns")
                            lines.append("")

                    # Show other columns
                    if other_cols:
                        lines.append("**📌 OTHER COLUMNS:**")
                        for col in other_cols[:20]:
                            col_type = column_types.get(col, "unknown") if column_types else "unknown"
                            lines.append(f"  - `{col}` (type: {col_type})")
                        if len(other_cols) > 20:
                            lines.append(f"  ... and {len(other_cols) - 20} more columns")
                        lines.append("")
                else:
                    lines.append("⚠️ Column information not available - check file metadata section above")
                    lines.append("")

            lines.append("## 📝 INSTRUCTIONS:")
            lines.append("")
            lines.append("1. **Use the file specified above** - this is the input dataset")
            lines.append("2. **Use ONLY column names from the list above** - they are case-sensitive")
            lines.append("3. **For calculations:** Use the statistics (mean, min, max, etc.) to understand the data range")
            lines.append("4. **Create the new column** based on the user's request")
            lines.append("5. **Return JSON** with the column creation configuration")
            lines.append("")
            lines.append("**Example:** If user asks to create 'Profit' as Revenue - Cost:")
            lines.append("- Use the exact column names: `Revenue` and `Cost` (check the list above)")
            lines.append("- Formula: Revenue - Cost")
            lines.append("- Return JSON with column name, formula, and data type")

            return "\n".join(lines)

    def _build_create_transform_section(self, original_prompt: str, possible_inputs: List[str]) -> str:
            """
            Build comprehensive instructions for create-transform atom.
            Includes detailed file metadata with column statistics.
            """
            lines: List[str] = []

            lines.append("## 🔄 CREATE TRANSFORM CONFIGURATION:")
            lines.append("")
            lines.append("**Task:** Create a transformation or calculated column based on existing columns.")
            lines.append("")

            if possible_inputs:
                file_path = possible_inputs[0]
                file_display = self._display_file_name(file_path)

                # Get comprehensive file metadata
                file_metadata = self._get_file_metadata([file_path])
                metadata = file_metadata.get(file_path, {}) if file_metadata else {}
                columns = metadata.get("columns", [])
                row_count = metadata.get("row_count") or metadata.get("rows") or metadata.get("num_rows")
                column_stats = metadata.get("column_stats", {}) or metadata.get("statistics", {})
                column_types = metadata.get("column_types", {}) or metadata.get("dtypes", {})

                lines.append("## ⚠️ CRITICAL FILE INFORMATION:")
                lines.append("")
                lines.append(f"**📁 INPUT FILE (MANDATORY):**")
                lines.append(f"- **Full Path:** `{file_path}`")
                lines.append(f"- **Display Name:** `{file_display}`")
                if row_count:
                    lines.append(f"- **Row Count:** {row_count:,} rows")
                lines.append("")

                if columns:
                    lines.append(f"## 📋 COMPREHENSIVE COLUMN DETAILS ({len(columns)} columns):")
                    lines.append("")
                    lines.append("**⚠️ CRITICAL:** Use ONLY these column names (case-sensitive). Do NOT invent column names.")
                    lines.append("")

                    # Categorize columns
                    numeric_cols = []
                    categorical_cols = []
                    other_cols = []

                    for col in columns:
                        col_type = str(column_types.get(col, "unknown")).lower() if column_types else "unknown"
                        if any(t in col_type for t in ["int", "float", "number", "numeric"]):
                            numeric_cols.append(col)
                        elif any(t in col_type for t in ["object", "string", "category", "bool"]):
                            categorical_cols.append(col)
                        else:
                            other_cols.append(col)

                    # Show numeric columns with statistics
                    if numeric_cols:
                        lines.append("**🔢 NUMERIC COLUMNS (with statistics):**")
                        lines.append("")
                        for col in numeric_cols[:30]:  # Show first 30 numeric columns
                            lines.append(f"**Column: `{col}`**")
                            col_type = column_types.get(col, "unknown") if column_types else "unknown"
                            lines.append(f"  - Data Type: {col_type}")

                            # Get statistics for this column
                            col_stats = column_stats.get(col, {}) if column_stats else {}
                            if col_stats:
                                if "count" in col_stats or "non_null_count" in col_stats:
                                    count = col_stats.get("count") or col_stats.get("non_null_count")
                                    lines.append(f"  - Count (non-null): {count:,}")
                                if "mean" in col_stats or "average" in col_stats:
                                    mean = col_stats.get("mean") or col_stats.get("average")
                                    lines.append(f"  - Mean: {mean}")
                                if "min" in col_stats or "minimum" in col_stats:
                                    min_val = col_stats.get("min") or col_stats.get("minimum")
                                    lines.append(f"  - Min: {min_val}")
                                if "max" in col_stats or "maximum" in col_stats:
                                    max_val = col_stats.get("max") or col_stats.get("maximum")
                                    lines.append(f"  - Max: {max_val}")
                                if "std" in col_stats or "stddev" in col_stats or "standard_deviation" in col_stats:
                                    std = col_stats.get("std") or col_stats.get("stddev") or col_stats.get("standard_deviation")
                                    lines.append(f"  - Std Dev: {std}")
                                if "median" in col_stats:
                                    lines.append(f"  - Median: {col_stats.get('median')}")
                                if "null_count" in col_stats or "missing" in col_stats:
                                    null_count = col_stats.get("null_count") or col_stats.get("missing")
                                    lines.append(f"  - Null Count: {null_count}")
                            else:
                                lines.append(f"  - Statistics: Not available")
                            lines.append("")

                        if len(numeric_cols) > 30:
                            lines.append(f"  ... and {len(numeric_cols) - 30} more numeric columns")
                            lines.append("")

                    # Show categorical columns
                    if categorical_cols:
                        lines.append("**📝 CATEGORICAL COLUMNS:**")
                        lines.append("")
                        for col in categorical_cols[:30]:  # Show first 30 categorical columns
                            col_type = column_types.get(col, "unknown") if column_types else "unknown"
                            lines.append(f"  - `{col}` (type: {col_type})")
                            col_stats = column_stats.get(col, {}) if column_stats else {}
                            if col_stats:
                                if "unique_count" in col_stats or "distinct_count" in col_stats:
                                    unique = col_stats.get("unique_count") or col_stats.get("distinct_count")
                                    lines.append(f"    * Unique values: {unique}")
                                if "null_count" in col_stats:
                                    lines.append(f"    * Null count: {col_stats.get('null_count')}")
                        lines.append("")

                        if len(categorical_cols) > 30:
                            lines.append(f"  ... and {len(categorical_cols) - 30} more categorical columns")
                            lines.append("")

                    # Show other columns
                    if other_cols:
                        lines.append("**📌 OTHER COLUMNS:**")
                        for col in other_cols[:20]:
                            col_type = column_types.get(col, "unknown") if column_types else "unknown"
                            lines.append(f"  - `{col}` (type: {col_type})")
                        if len(other_cols) > 20:
                            lines.append(f"  ... and {len(other_cols) - 20} more columns")
                        lines.append("")
                else:
                    lines.append("⚠️ Column information not available - check file metadata section above")
                    lines.append("")

            lines.append("## 📝 INSTRUCTIONS:")
            lines.append("")
            lines.append("1. **Use the file specified above** - this is the input dataset")
            lines.append("2. **Use ONLY column names from the list above** - they are case-sensitive")
            lines.append("3. **For transformations:** Use the statistics (mean, min, max, etc.) to understand the data range")
            lines.append("4. **Create the transformation** based on the user's request")
            lines.append("5. **Return JSON** with the transformation configuration")
            lines.append("")
            lines.append("**Example:** If user asks to create 'Profit' as Revenue - Cost:")
            lines.append("- Use the exact column names: `Revenue` and `Cost` (check the list above)")
            lines.append("- Formula: Revenue - Cost")
            lines.append("- Return JSON with column name, formula, and data type")

            return "\n".join(lines)

    def _build_generic_section(self, atom_id: str, original_prompt: str) -> str:
            lines = [
                "Execution requirements:",
                "- Translate the user's intent into concrete parameters for this atom.",
                "- Reuse upstream datasets and maintain Quant Matrix AI styling and naming conventions.",
                f"- Ensure the `{atom_id}` atom returns a result ready for the next workflow step."
            ]
            return "\n".join(lines)

    def _extract_join_columns(self, text: str) -> List[str]:
            patterns = [
                r"on\s+([A-Za-z0-9_\s,&/-]+?)(?=\s+(?:using|with|then|where|group|return|compute|calculate|to|for)\b|[.;]|$)",
                r"using\s+(?:the\s+)?(?:same\s+)?(?:column[s]?|key[s]?)?\s*([A-Za-z0-9_\s,&/-]+?)(?=\s+(?:for|to|then|where|group|return|compute|calculate)\b|[.;]|$)",
                r"matching\s+(?:on\s+)?([A-Za-z0-9_\s,&/-]+?)(?=\s+(?:with|and\sthen|then|group|where|return|to)\b|[.;]|$)"
            ]
            columns: List[str] = []
            for pattern in patterns:
                for match in re.finditer(pattern, text, flags=re.IGNORECASE):
                    segment = match.group(1) or ""
                    segment = re.split(r"[.;\n]", segment)[0]
                    columns.extend(self._split_column_candidates(segment))
            return self._dedupe_preserve_order(columns)

    def _detect_join_type(self, text: str) -> Optional[str]:
            lowered = text.lower()
            mapping = [
                ("full outer", "outer"),
                ("outer join", "outer"),
                ("left outer", "left"),
                ("left join", "left"),
                ("left merge", "left"),
                ("right outer", "right"),
                ("right join", "right"),
                ("right merge", "right"),
                ("inner join", "inner"),
                ("inner merge", "inner")
            ]
            for phrase, join_type in mapping:
                if phrase in lowered:
                    return join_type
            return None

    def _extract_group_columns(self, text: str) -> List[str]:
            patterns = [
                r"group\s+by\s+([A-Za-z0-9_\s,&/-]+?)(?=\s+(?:with|having|where|order|then|to|for|return|compute|calculate)\b|[.;]|$)",
                r"aggregate(?:d)?\s+by\s+([A-Za-z0-9_\s,&/-]+?)(?=\s+(?:with|where|then|to|for|return|compute|calculate)\b|[.;]|$)",
                r"by\s+([A-Za-z0-9_\s,&/-]+?)(?=\s+(?:to|for|and\s+compute|and\s+calculate|and\s+get|compute|calculate|return|with|where|then)\b|[.;]|$)"
            ]
            columns: List[str] = []
            for pattern in patterns:
                for match in re.finditer(pattern, text, flags=re.IGNORECASE):
                    segment = match.group(1) or ""
                    segment = re.split(r"[.;\n]", segment)[0]
                    columns.extend(self._split_column_candidates(segment))
            return self._dedupe_preserve_order(columns)

    def _extract_aggregation_details(self, text: str) -> Dict[str, Any]:
            metrics: List[Dict[str, str]] = []
            lowered = text.lower()
            weight_column = None

            agg_pattern = re.compile(
                r"(weighted\s+average|weighted\s+avg|average|avg|mean|sum|total|count|median|min|max|stddev|std|standard deviation)\s+(?:of\s+)?([A-Za-z0-9_\s,&/-]+?)(?=\s+(?:and|,|then|with|where|group|to|for|return|compute|calculate)\b|[.;]|$)",
                re.IGNORECASE
            )

            for match in agg_pattern.finditer(text):
                agg_keyword = match.group(1).lower()
                segment = match.group(2) or ""
                segment = re.split(r"[.;\n]", segment)[0]
                columns = self._split_column_candidates(segment)
                for column in columns:
                    aggregation = self._normalize_aggregation_keyword(agg_keyword)
                    if aggregation == "count" and "distinct" in column.lower():
                        column = column.replace("distinct", "").replace("Distinct", "").strip()
                        aggregation = "count_distinct"
                    if column:
                        metrics.append({"column": column, "aggregation": aggregation})

            weight_match = re.search(r"weighted\s+by\s+([A-Za-z0-9_]+)", text, flags=re.IGNORECASE)
            if weight_match:
                weight_column = weight_match.group(1).strip(" ,.;")
            else:
                via_match = re.search(r"use\s+([A-Za-z0-9_]+)\s+as\s+weight", text, flags=re.IGNORECASE)
                if via_match:
                    weight_column = via_match.group(1).strip(" ,.;")

            metrics = self._dedupe_metric_list(metrics)

            return {
                "metrics": metrics,
                "weight_column": weight_column
            }

    def _detect_concat_direction(self, text: str) -> Optional[str]:
            lowered = text.lower()
            if any(keyword in lowered for keyword in ["horizontal", "side by side", "columns together"]):
                return "horizontal"
            if any(keyword in lowered for keyword in ["vertical", "stack", "append rows", "combine rows", "one below another"]):
                return "vertical"
            return None

    def _normalize_aggregation_keyword(self, keyword: str) -> str:
            normalized = keyword.strip().lower()
            mapping = {
                "average": "avg",
                "avg": "avg",
                "mean": "avg",
                "sum": "sum",
                "total": "sum",
                "count": "count",
                "median": "median",
                "min": "min",
                "max": "max",
                "std": "std",
                "stddev": "std",
                "standard deviation": "std",
                "weighted average": "weighted_avg",
                "weighted avg": "weighted_avg"
            }
            return mapping.get(normalized, normalized.replace(" ", "_"))

    def _split_column_candidates(self, raw: str) -> List[str]:
            if not raw:
                return []

            tokens = re.split(r",|;|/|\band\b|&", raw, flags=re.IGNORECASE)
            columns: List[str] = []
            for token in tokens:
                cleaned = token.strip(" .;:-_")
                if not cleaned:
                    continue
                cleaned = re.sub(r"\b(columns?|keys?|fields?)\b", "", cleaned, flags=re.IGNORECASE).strip()
                cleaned = re.sub(r"\b(common|matching|the|their|all)\b", "", cleaned, flags=re.IGNORECASE).strip()
                cleaned = re.sub(r"\b(to|get|calculate|compute|produce|generate)\b.*$", "", cleaned, flags=re.IGNORECASE).strip()
                cleaned_lower = cleaned.lower()
                aggregator_prefixes = [
                    "sum of ",
                    "average of ",
                    "avg of ",
                    "mean of ",
                    "count of ",
                    "total of ",
                    "median of ",
                    "min of ",
                    "max of ",
                    "std of ",
                    "stddev of ",
                    "standard deviation of "
                ]
                for prefix in aggregator_prefixes:
                    if cleaned_lower.startswith(prefix):
                        cleaned = cleaned[len(prefix):].strip()
                        cleaned_lower = cleaned.lower()
                        break
                if not cleaned:
                    continue
                columns.append(cleaned)
            return columns

    def _dedupe_preserve_order(self, items: List[str]) -> List[str]:
            seen = set()
            ordered: List[str] = []
            for item in items:
                key = item.lower()
                if key not in seen:
                    seen.add(key)
                    ordered.append(item)
            return ordered

    def _dedupe_metric_list(self, metrics: List[Dict[str, str]]) -> List[Dict[str, str]]:
            seen = set()
            deduped: List[Dict[str, str]] = []
            for metric in metrics:
                key = (metric["column"].lower(), metric["aggregation"].lower())
                if key not in seen:
                    seen.add(key)
                    deduped.append(metric)
            return deduped

    def _condense_text(self, text: str) -> str:
            if not text:
                return ""
            return " ".join(text.split())

    def _resolve_project_context_for_files(self, file_paths: List[str]) -> Dict[str, Any]:
            """Resolve the most relevant project context for the given files.

            Prefers the sequence context that lists the files so FileReader can
            refresh its prefix to the correct tenant/app/project location.
            """
            if not file_paths:
                return {}

            # Try to find a sequence that contains any of the provided files
            sequence_id, context = self._resolve_sequence_for_files(file_paths)
            if context:
                return context

            # Fallback to any known project context
            for context in self._sequence_project_context.values():
                if context:
                    return context

            return {}

    def _resolve_sequence_for_files(self, file_paths: List[str]) -> Tuple[Optional[str], Dict[str, Any]]:
            """Return the sequence/context pair associated with any of the files."""

            available_files_by_sequence = getattr(self, "_sequence_available_files", {}) or {}
            project_context_by_sequence = getattr(self, "_sequence_project_context", {}) or {}

            for sequence_id, files in available_files_by_sequence.items():
                if any(path in files for path in file_paths):
                    return sequence_id, project_context_by_sequence.get(sequence_id) or {}

            return None, {}

    def _get_file_metadata(
            self,
            file_paths: List[str],
            sequence_id: Optional[str] = None,
            project_context: Optional[Dict[str, Any]] = None,
            user_prompt: Optional[str] = None,
        ) -> Dict[str, Dict[str, Any]]:
            """
            Retrieve file metadata (including column names) for given file paths.
            Returns a dictionary mapping file paths to their metadata.
            """
            metadata_dict: Dict[str, Dict[str, Any]] = {}

            if not file_paths:
                return metadata_dict

            # Resolve project context so FileReader targets the correct folder
            resolved_context = project_context or {}
            candidate_sequence_id = sequence_id

            if not resolved_context and candidate_sequence_id:
                resolved_context = self._sequence_project_context.get(candidate_sequence_id, {})

            if not candidate_sequence_id or not resolved_context:
                inferred_sequence_id, inferred_context = self._resolve_sequence_for_files(file_paths)
                candidate_sequence_id = candidate_sequence_id or inferred_sequence_id
                if inferred_context and not resolved_context:
                    resolved_context = inferred_context

            if not resolved_context:
                resolved_context = self._resolve_project_context_for_files(file_paths)

            # Preload any stored metadata to avoid re-computation
            atom_ai_store = getattr(self, "atom_ai_context_store", None)
            if atom_ai_store and candidate_sequence_id:
                try:
                    cached_metadata = atom_ai_store.load_metadata(candidate_sequence_id, resolved_context)
                    if cached_metadata:
                        metadata_dict.update(cached_metadata)
                        logger.info("🧠 Loaded %s file metadata entries from Atom AI context", len(cached_metadata))
                except Exception as ctx_exc:
                    logger.debug("⚠️ Could not hydrate Atom AI context: %s", ctx_exc)

            try:
                # Use BaseAgent.FileReader (standardized file handler for all agents)
                try:
                    from BaseAgent.file_reader import FileReader
                except ImportError:
                    try:
                        from TrinityAgent.BaseAgent.file_reader import FileReader
                    except ImportError:
                        logger.error("❌ BaseAgent.FileReader not available - cannot retrieve file metadata")
                        return metadata_dict

                client_name = resolved_context.get("client_name", "") if resolved_context else ""
                app_name = resolved_context.get("app_name", "") if resolved_context else ""
                project_name = resolved_context.get("project_name", "") if resolved_context else ""

                # Extract filenames from paths
                file_names = []
                path_to_filename = {}
                for file_path in file_paths:
                    filename = file_path.split('/')[-1] if '/' in file_path else file_path
                    filename = filename.split('\\')[-1] if '\\' in filename else filename
                    file_names.append(filename)
                    path_to_filename[file_path] = filename

                # Get file details using BaseAgent.FileReader (standardized)
                file_details_dict: Dict[str, Dict[str, Any]] = {}
                if file_names:
                    try:
                        file_reader = FileReader()

                        if client_name and app_name and project_name:
                            try:
                                file_reader._maybe_update_prefix(client_name, app_name, project_name)
                                logger.info(
                                    "📁 File metadata lookup using context: %s/%s/%s",
                                    client_name,
                                    app_name,
                                    project_name,
                                )
                            except Exception as ctx_exc:
                                logger.warning("⚠️ Could not set FileReader context: %s", ctx_exc)

                        for file_path in file_paths:
                            filename = path_to_filename[file_path]
                            for candidate in [file_path, filename]:
                                try:
                                    columns = file_reader.get_file_columns(candidate)
                                    file_details_dict[file_path] = {
                                        "object_name": candidate,
                                        "columns": columns,
                                        "column_count": len(columns) if columns else 0,
                                    }
                                    break
                                except Exception as e:
                                    logger.debug(
                                        "⚠️ Could not get columns for %s (candidate=%s): %s",
                                        file_path,
                                        candidate,
                                        e,
                                    )
                            if file_path not in file_details_dict:
                                file_details_dict[file_path] = {
                                    "object_name": filename,
                                    "columns": [],
                                    "column_count": 0,
                                }

                        if file_details_dict:
                            logger.debug(
                                "✅ Retrieved file metadata for %s files using BaseAgent.FileReader",
                                len(file_details_dict),
                            )
                    except Exception as e:
                        logger.debug(f"⚠️ Failed to get file metadata using FileReader: {e}")
                        file_details_dict = {}

                if file_details_dict:
                    for file_path, metadata in file_details_dict.items():
                        metadata_dict[file_path] = {**metadata_dict.get(file_path, {}), **metadata}

                # Enrich with detailed statistics when FileAnalyzer is available
                file_analyzer = getattr(self, "file_analyzer", None)
                if file_analyzer:
                    try:
                        analysis_results = file_analyzer.analyze_specific_files(file_paths)
                        for file_path in file_paths:
                            basename = os.path.basename(file_path)
                            analysis = analysis_results.get(basename) or analysis_results.get(file_path)
                            if not analysis:
                                continue

                            # Normalize analysis structure for downstream prompts
                            normalized_columns = analysis.get("columns") or {}
                            column_list = list(normalized_columns.keys()) if isinstance(normalized_columns, dict) else []
                            metadata_dict[file_path] = {
                                **metadata_dict.get(file_path, {}),
                                "columns": metadata_dict.get(file_path, {}).get("columns") or column_list,
                                "column_types": analysis.get("data_types") or {},
                                "column_details": normalized_columns if isinstance(normalized_columns, dict) else {},
                                "statistical_summary": analysis.get("statistical_summary") or {},
                                "row_count": analysis.get("total_rows"),
                                "file_size": analysis.get("file_size_bytes"),
                            }
                    except Exception as analysis_exc:
                        logger.warning("⚠️ Failed to analyze files for Atom AI context: %s", analysis_exc)

                if metadata_dict:
                    for file_path, metadata in metadata_dict.items():
                        has_stats = bool(metadata.get("column_stats") or metadata.get("statistics") or metadata.get("statistical_summary"))
                        has_cols = bool(metadata.get("columns"))
                        logger.debug(f"📊 File {file_path}: columns={has_cols}, statistics={has_stats}")

                    logger.info(f"✅ Retrieved metadata for {len(metadata_dict)}/{len(file_paths)} files")
                elif file_names:
                    logger.warning(f"⚠️ Could not retrieve metadata for files: {file_names}")
            except Exception as e:
                logger.debug(f"⚠️ Failed to get file metadata: {e} (non-critical - files accessible via other means)")

            # Persist enriched metadata back to Mongo for deterministic reuse
            if atom_ai_store and candidate_sequence_id and metadata_dict and resolved_context:
                try:
                    atom_ai_store.upsert_metadata(
                        session_id=candidate_sequence_id,
                        project_context=resolved_context,
                        files=metadata_dict,
                        prompt=user_prompt,
                    )
                except Exception as persist_exc:
                    logger.debug("⚠️ Could not persist Atom AI context: %s", persist_exc)

            return metadata_dict

    def _validate_column_names(
            self, 
            column_names: List[str], 
            file_paths: List[str],
            file_metadata: Optional[Dict[str, Dict[str, Any]]] = None
        ) -> List[str]:
            """
            Validate column names against actual file metadata.
            Returns only column names that exist in the files.

            Args:
                column_names: List of column names to validate
                file_paths: List of file paths to check against
                file_metadata: Optional pre-fetched metadata (if None, will fetch)

            Returns:
                List of validated column names that exist in the files
            """
            if not column_names or not file_paths:
                return []

            # Get metadata if not provided
            if file_metadata is None:
                file_metadata = self._get_file_metadata(file_paths)

            if not file_metadata:
                logger.warning(f"⚠️ No metadata available to validate columns: {column_names}")
                return []

            # Collect all valid column names from all files
            valid_columns_set: Set[str] = set()
            for file_path, metadata in file_metadata.items():
                columns = metadata.get("columns", [])
                if isinstance(columns, list):
                    valid_columns_set.update(columns)

            valid_columns_list = list(valid_columns_set)

            # Validate each column name (case-sensitive and case-insensitive matching)
            validated_columns: List[str] = []
            for col_name in column_names:
                if not col_name or not col_name.strip():
                    continue

                col_clean = col_name.strip()

                # First try exact match (case-sensitive)
                if col_clean in valid_columns_set:
                    validated_columns.append(col_clean)
                    continue

                # Then try case-insensitive match
                found = False
                for valid_col in valid_columns_set:
                    if col_clean.lower() == valid_col.lower():
                        validated_columns.append(valid_col)  # Use the actual column name from file
                        found = True
                        break

                if not found:
                    best_match: Optional[str] = None
                    best_score = 0.0
                    for valid_col in valid_columns_list:
                        score = difflib.SequenceMatcher(None, col_clean.lower(), valid_col.lower()).ratio()
                        if score > best_score:
                            best_score = score
                            best_match = valid_col

                    if best_match and best_score >= 0.75:
                        logger.info(
                            "🔎 Fuzzy-matched column '%s' to '%s' (score=%.2f) for dataframe validation",
                            col_clean,
                            best_match,
                            best_score,
                        )
                        validated_columns.append(best_match)
                    else:
                        logger.debug(f"⚠️ Column '{col_clean}' not found in file metadata")

            return validated_columns

    def _extract_required_columns(
            self,
            atom_id: str,
            parameters: Dict[str, Any]
        ) -> List[str]:
            """
            Extract required column names from atom parameters.

            Args:
                atom_id: The atom ID
                parameters: Parameters dictionary

            Returns:
                List of required column names
            """
            required_columns: List[str] = []

            # Extract columns from prompt/parameters based on atom type
            prompt = parameters.get("prompt", "")

            # Common patterns for column extraction
            import re

            # Pattern 1: Column names in quotes or backticks
            quoted_cols = re.findall(r'["\'`]([^"\'`]+)["\'`]', prompt)
            required_columns.extend(quoted_cols)

            # Pattern 2: Column names after keywords like "by", "on", "group by", "join"
            keyword_patterns = [
                r'group\s+by\s+([a-zA-Z_][a-zA-Z0-9_]*)',
                r'join\s+on\s+([a-zA-Z_][a-zA-Z0-9_]*)',
                r'by\s+([a-zA-Z_][a-zA-Z0-9_]*)',
                r'column\s+([a-zA-Z_][a-zA-Z0-9_]*)',
            ]

            for pattern in keyword_patterns:
                matches = re.findall(pattern, prompt, re.IGNORECASE)
                required_columns.extend(matches)

            # Pattern 3: Extract from JSON parameters if available
            if "merge_json" in parameters:
                merge_cfg = parameters.get("merge_json", {})
                join_cols = merge_cfg.get("join_columns", [])
                if isinstance(join_cols, list):
                    required_columns.extend(join_cols)

            if "groupby_json" in parameters:
                groupby_cfg = parameters.get("groupby_json", {})
                group_cols = groupby_cfg.get("group_by", [])
                metric_cols = groupby_cfg.get("metrics", [])
                if isinstance(group_cols, list):
                    required_columns.extend(group_cols)
                if isinstance(metric_cols, list):
                    for metric in metric_cols:
                        if isinstance(metric, dict) and "column" in metric:
                            required_columns.append(metric["column"])

            # Remove duplicates and clean
            required_columns = list(set([col.strip() for col in required_columns if col.strip()]))

            # Filter out common non-column words
            non_column_words = {"the", "a", "an", "and", "or", "by", "on", "in", "at", "to", "for", "with"}
            required_columns = [col for col in required_columns if col.lower() not in non_column_words]

            return required_columns

    def _validate_file_names(
            self, 
            file_names: List[str], 
            available_files: List[str]
        ) -> List[str]:
            """
            Validate file names against available files.
            Returns only file names that exist in available_files.

            Args:
                file_names: List of file names/paths to validate
                available_files: List of available file paths

            Returns:
                List of validated file names that exist in available_files
            """
            if not file_names or not available_files:
                return []

            # Normalize available files for matching
            available_normalized = {}
            for af in available_files:
                # Extract filename from path
                filename = af.split('/')[-1] if '/' in af else af
                filename = filename.split('\\')[-1] if '\\' in filename else filename
                available_normalized[filename.lower()] = af
                available_normalized[af.lower()] = af

            validated_files: List[str] = []
            for file_name in file_names:
                if not file_name or not file_name.strip():
                    continue

                file_clean = file_name.strip()
                filename_only = file_clean.split('/')[-1] if '/' in file_clean else file_clean
                filename_only = filename_only.split('\\')[-1] if '\\' in filename_only else filename_only

                # Try exact match first
                if file_clean in available_files:
                    validated_files.append(file_clean)
                    continue

                # Try filename-only match
                if filename_only.lower() in available_normalized:
                    validated_files.append(available_normalized[filename_only.lower()])
                    continue

                # Try case-insensitive full path match
                file_clean_lower = file_clean.lower()
                if file_clean_lower in available_normalized:
                    validated_files.append(available_normalized[file_clean_lower])
                    continue

                # Try partial match
                found_match = False
                for available_file in available_files:
                    if (file_clean in available_file or 
                        available_file in file_clean or
                        filename_only.lower() in available_file.lower() or
                        available_file.lower().endswith(filename_only.lower())):
                        validated_files.append(available_file)
                        found_match = True
                        break

                if not found_match:
                    logger.warning(f"⚠️ File '{file_clean}' not found in available files")

            if len(validated_files) < len(file_names):
                logger.info(f"✅ Validated files: {len(validated_files)}/{len(file_names)} passed validation")

            return validated_files
