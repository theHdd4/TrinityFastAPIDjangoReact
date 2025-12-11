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



class WorkflowAtomContextMixin:
    """Planning helper mixin extracted from WorkflowPlanningMixin."""
    def _load_atom_mapping(self):
            """Load atom mapping"""
            try:
                self.atom_mapping = ATOM_MAPPING
                logger.info(f"✅ Loaded atom mapping for {len(ATOM_MAPPING)} atoms")
            except Exception as e:
                logger.error(f"❌ Failed to load atom mapping: {e}")
                self.atom_mapping = {}

    def _build_legacy_prompt(
            self,
            user_prompt: str,
            available_files: List[str],
            files_exist: bool,
            prompt_files: List[str],
        ) -> str:
            """Legacy Phase-1 prompt builder used as a fallback."""
            atom_knowledge = self._get_atom_capabilities_for_llm()
            files_str = "\n".join([f"  - {f}" for f in available_files]) if available_files else "  (No files available yet)"

            file_instruction = ""
            if files_exist and available_files:
                file_instruction = f"""
    CRITICAL FILE INFORMATION:
    - The user mentioned files in their request: {', '.join(prompt_files)}
    - These files ALREADY EXIST in the system: {', '.join([f.split('/')[-1] for f in available_files[:3]])}
    - ALWAYS include 'data-upload-validate' as FIRST step when user mentions files - it loads files from MinIO and optionally applies dtype changes
    - Start directly with the data processing step (merge, concat, etc.)
    """

            workflow_rule = (
                "- ⚠️ CRITICAL: Files mentioned in user request exist in MinIO. ALWAYS include 'data-upload-validate' as FIRST step to load the file. If user mentions dtype changes, include them in this step. Otherwise, just load the file and proceed."
                if files_exist
                else "- If user mentions files, ALWAYS include 'data-upload-validate' as the first step to load them"
            )

            return f"""You are a data analysis workflow planner. Your task is to create a step-by-step workflow to accomplish the user's request.

    {atom_knowledge}

    USER REQUEST:
    "{user_prompt}"

    AVAILABLE FILES (already in system):
    {files_str}
    {file_instruction}

    TASK:
    Generate a workflow plan as a JSON array. Each step should have:
    - atom_id: The ID of the atom to use (from the list above)
    - description: Brief description of what this step does (one sentence)

    IMPORTANT RULES:
    {workflow_rule}
    - Workflows can be long (2-10+ steps) - break complex tasks into individual steps
    - Use ONE atom per task for clarity (e.g., one dataframe-operations step for filtering, another for formulas)
    - Put transformations before visualizations
    - Each step should logically follow the previous one
    - For dataframe-operations: Each operation type should be a separate step when workflow is complex

    Respond ONLY with valid JSON array, no other text:
    [
      {{"atom_id": "merge", "description": "Merge the two datasets"}},
      {{"atom_id": "chart-maker", "description": "Visualize the merged data"}}
    ]
    """

    def _get_atom_capabilities_for_llm(self) -> str:
            """
            Get comprehensive atom capabilities and knowledge for LLM.
            Returns formatted string describing all available atoms.
            """
            return """
    AVAILABLE ATOMS AND THEIR CAPABILITIES:

    1. **merge** - Merge/Join Datasets
       - **CAN DO**: Combines two datasets based on common columns (inner, left, right, outer joins)
       - **USE WHEN**: User wants to join, merge, combine, or link two files
       - **REQUIRES**: Two input files with at least one common column
       - **OUTPUT**: Creates a new merged file
       - **KEYWORDS**: merge, join, combine, link, match
       - **EXAMPLE**: "Merge sales.arrow and customer.arrow on CustomerID column"
       - **DO NOT USE**: If you already merged the same two files in a previous step (use the output file instead)
       - **REQUIRED IN PROMPT**: Specify both input files and the join column(s)

    2. **concat** - Concatenate Datasets
       - **CAN DO**: Stacks multiple datasets vertically (append rows, same columns)
       - **USE WHEN**: User wants to append, stack, or combine rows from multiple files
       - **REQUIRES**: Multiple files with compatible column structures
       - **OUTPUT**: Creates a new concatenated file
       - **KEYWORDS**: concat, append, stack, combine vertically
       - **EXAMPLE**: "Concatenate Q1_sales.arrow, Q2_sales.arrow, Q3_sales.arrow, Q4_sales.arrow"
       - **DO NOT USE**: If you already concatenated the same files (use the output file instead)
       - **REQUIRED IN PROMPT**: Specify all input files to concatenate

    3. **groupby-wtg-avg** - Group and Aggregate
       - **CAN DO**: Groups data by columns and calculates aggregations (sum, mean, count, max, min, etc.)
       - **USE WHEN**: User wants to summarize, aggregate, group, or calculate totals
       - **REQUIRES**: One input file with columns to group by and columns to aggregate
       - **OUTPUT**: Creates a new grouped/aggregated file
       - **KEYWORDS**: group, aggregate, sum, average, mean, total, count, summarize, group by
       - **EXAMPLE**: "Group sales.arrow by Region column and calculate sum of Revenue column"
       - **DO NOT USE**: If you already grouped the same file with the same columns (use the output file instead)
       - **REQUIRED IN PROMPT**: Specify the file, group-by column(s), and aggregation column(s) with function (sum, mean, count, etc.)

    4. **dataframe-operations** - Excel-like DataFrame Operations (Powerful Tool)
       - **CAN DO**: Comprehensive DataFrame manipulation:
         * Apply formulas/calculations (PROD, SUM, DIV, IF, etc.)
         * Filter rows based on conditions
         * Sort data by columns
         * Select/drop/rename columns
         * Transform data (case conversion, type conversion, rounding)
         * Insert/delete rows or columns
         * Edit cell values
         * Find and replace values
         * Split or manipulate data like Excel
       - **USE WHEN**: User wants to filter, sort, calculate, transform, or manipulate data
       - **REQUIRES**: One input file
       - **OUTPUT**: Creates a new transformed file
       - **KEYWORDS**: formula, calculate, compute, filter, where, sort, order, select, drop, remove, rename, transform, convert, round, edit, insert, delete, find, replace, split, excel, spreadsheet, manipulate, clean, prepare
       - **EXAMPLE**: "Filter sales.arrow where Revenue > 1000 and sort by Date column", "Apply formula PROD(Price, Volume) to create Sales column"
       - **DO NOT USE**: If you already performed the same operation on the same file (use the output file instead)
       - **REQUIRED IN PROMPT**: Specify the file, exact operation(s), and column names (use ONLY column names from FILE METADATA)

    5. **create-column** - Create Calculated Columns
       - **CAN DO**: Creates new columns using formulas and calculations
       - **USE WHEN**: User wants to add, create, calculate, or derive new columns
       - **REQUIRES**: One input file
       - **OUTPUT**: Creates a new file with the added column
       - **KEYWORDS**: create, add, calculate, compute, derive, new column
       - **EXAMPLE**: "Create Profit column in sales.arrow as Revenue minus Cost"
       - **DO NOT USE**: If you already created the same column (use the output file instead)
       - **REQUIRED IN PROMPT**: Specify the file, new column name, and calculation formula using existing column names

    6. **create-transform** - Create Transformations
       - **CAN DO**: Creates complex transformations and calculated columns
       - **USE WHEN**: User wants complex data transformations
       - **REQUIRES**: One input file
       - **OUTPUT**: Creates a new transformed file
       - **KEYWORDS**: transform, create transform, calculate, derive
       - **EXAMPLE**: "Create transform in sales.arrow to calculate Profit as Revenue - Cost"
       - **DO NOT USE**: If you already created the same transform (use the output file instead)
       - **REQUIRED IN PROMPT**: Specify the file and transformation logic

    7. **chart-maker** - Create Visualizations
       - **CAN DO**: Generates charts and visualizations (bar, line, pie, scatter, etc.)
       - **USE WHEN**: User wants to visualize, plot, chart, or show data graphically
       - **REQUIRES**: One input file with data to visualize
       - **OUTPUT**: Creates a chart visualization
       - **KEYWORDS**: chart, plot, graph, visualize, show, display
       - **EXAMPLE**: "Create bar chart from sales.arrow showing Revenue by Category"
       - **CAN USE MULTIPLE TIMES**: Yes, for different visualizations
       - **REQUIRED IN PROMPT**: Specify the file, chart type, x-axis column, y-axis column (if applicable)
       - **⚠️ CRITICAL FILE SELECTION**: 
         * If previous steps created output files (marked with 📄 in EXECUTION HISTORY), you MUST use the MOST RECENT output file
         * Do NOT use original input files if a processed/transformed file exists from previous steps
         * Example: If Step 1 merged files → Step 2 grouped data → Use the grouped output file for chart, NOT the original files
         * Check EXECUTION HISTORY for output files created by previous steps

    9. **correlation** - Correlation Analysis (EDA Tool)
       - **CAN DO**: 
         * Calculates correlation matrix between numeric columns
         * Analyzes relationships and dependencies between variables
         * Filters data before correlation (by identifiers/measures)
         * Finds highest correlation pairs
         * Time series correlation analysis
         * Comprehensive EDA (Exploratory Data Analysis)
       - **USE WHEN**: 
         * User wants to analyze relationships, correlations, or dependencies
         * User mentions EDA, exploratory data analysis, or finding relationships
         * User wants to understand how variables relate to each other
         * User wants to discover patterns in data
         * User asks "which columns are related" or "how are variables connected"
       - **REQUIRES**: One input file with numeric columns
       - **OUTPUT**: Correlation matrix, correlation coefficients, highest correlation pairs
       - **KEYWORDS**: correlation, correlate, relationship, dependency, associate, related, connection, link, EDA, exploratory data analysis, find relationships, which variables are related
       - **EXAMPLE**: 
         * "Analyze correlation between Price and Sales columns in sales.arrow"
         * "Perform EDA to find relationships in merged_data.arrow"
         * "Find which columns are most correlated in dataset.arrow"
         * "Calculate correlation matrix for all numeric columns"
       - **REQUIRED IN PROMPT**: Specify the file (column names optional - will analyze all numeric columns)
       - **WORKFLOW POSITION**: Early to mid workflow - use after data loading/merging for EDA insights

    10. **data-upload-validate** - Load Data
       - **CAN DO**: Loads and validates data files (CSV, Excel, Arrow) from MinIO
       - **USE WHEN**: Files don't exist yet and need to be uploaded/loaded
       - **REQUIRES**: File name to load
       - **OUTPUT**: Validated file available for next steps
       - **KEYWORDS**: load, upload, import, read
       - **EXAMPLE**: "Load sales.csv file"
       - **DO NOT USE**: If files already exist in available_files! Skip this step.
       - **REQUIRED IN PROMPT**: Specify the file name to load

    CRITICAL RULES FOR ATOM SELECTION:
    1. **Check EXECUTION HISTORY first**: If an atom was already used, do NOT use it again with the same files
    2. **Use output files**: If a previous step created a file, use that file in the next step
    3. **One operation per step**: For clarity, use one atom per step (except chart-maker which can be used multiple times)
    4. **Column names**: Use ONLY column names from FILE METADATA - do NOT invent column names
    5. **File availability**: Only use files that are in AVAILABLE FILES section
    6. **PPG** : PPG meaning is not price  it is promoted price group ( like pack type , variant etc it is also categorical variable in dataframe)

    WORKFLOW PLANNING:
    - **Order**: Load → Transform → Merge/Concat → Group/Aggregate → Visualize
    - **Data loading**: Use data-upload-validate FIRST only if files don't exist
    - **Transformations**: Use dataframe-operations, create-column, create-transform for data preparation
    - **Combining data**: Use merge or concat to combine datasets
    - **Summarization**: Use groupby-wtg-avg for aggregations
    - **Visualization**: **MANDATORY** - Use chart-maker at least once (usually at the end) to show results
    - **⚠️ CRITICAL**: Chart-maker MUST be included in EVERY workflow before completion
    - **Each step builds on previous**: Use output files from previous steps
    - **⚠️ CRITICAL FOR CHART-MAKER**: When planning chart-maker, ALWAYS use the MOST RECENT output file from previous steps (check EXECUTION HISTORY for output files marked with 📄)
    - **Example workflow**: Load → Filter → Apply Formula → Merge → Group → Chart (chart uses the grouped output file, NOT original files)
    - **Completion Rule**: Only set goal_achieved: true AFTER chart-maker has been executed
    """

    def _load_files_with_context(
            self,
            client_name: str = "",
            app_name: str = "",
            project_name: str = ""
        ) -> List[str]:
            """
            Load files from MinIO using FileReader with proper client/project context.
            This ensures we only read files from the specific location, not all files.

            Args:
                client_name: Client name for context
                app_name: App name for context
                project_name: Project name for context

            Returns:
                List of file paths (object names) from MinIO
            """
            try:
                # Import FileReader (same as BaseAgent uses)
                try:
                    from BaseAgent.file_reader import FileReader
                except ImportError:
                    try:
                        from TrinityAgent.BaseAgent.file_reader import FileReader
                    except ImportError:
                        logger.error("❌ BaseAgent.FileReader not available - cannot load files with context")
                        return []

                # Create FileReader instance
                file_reader = FileReader()

                # Load files with proper context (this will set the correct prefix)
                files_with_columns = file_reader.load_files(
                    client_name=client_name,
                    app_name=app_name,
                    project_name=project_name
                )

                # Extract file paths (object names) from the dictionary
                file_paths = list(files_with_columns.keys())

                logger.info(f"✅ Loaded {len(file_paths)} files from MinIO using FileReader with context: {client_name}/{app_name}/{project_name}")
                logger.debug(f"📁 Files loaded: {file_paths[:5]}..." if len(file_paths) > 5 else f"📁 Files loaded: {file_paths}")

                return file_paths

            except Exception as e:
                logger.error(f"❌ Error loading files with context: {e}")
                import traceback
                logger.error(traceback.format_exc())
                return []

    def _extract_file_names_from_prompt(self, user_prompt: str, available_files: Optional[List[str]] = None) -> List[str]:
            """
            Extract file names mentioned in the user prompt.
            Handles formats like: @DO_KHC_UK_Beans.arrow, DO_KHC_UK_Beans.arrow, etc.
            If available_files is provided, validates extracted names against available files.
            """
            import re

            # Patterns to match file names
            patterns = [
                r'@?([A-Za-z0-9_\-]+\.arrow)',  # @filename.arrow or filename.arrow
                r'([A-Za-z0-9_\-]+\.csv)',       # filename.csv
                r'([A-Za-z0-9_\-]+\.xlsx)',      # filename.xlsx
            ]

            found_files: List[str] = []
            for pattern in patterns:
                matches = re.findall(pattern, user_prompt, re.IGNORECASE)
                found_files.extend(matches)

            # Remove duplicates while preserving order and original casing
            unique_files: List[str] = []
            seen = set()
            for file_name in found_files:
                normalized = file_name.lower()
                if normalized not in seen:
                    seen.add(normalized)
                    unique_files.append(file_name)

            # Validate against available files if provided
            if available_files:
                validated_files = self._validate_file_names(unique_files, available_files)
                if len(validated_files) < len(unique_files):
                    logger.warning(f"⚠️ Filtered {len(unique_files) - len(validated_files)} invalid file names. Using only validated: {validated_files}")
                logger.info(f"📂 Extracted and validated files from prompt: {[f.lower() for f in validated_files]}")
                return validated_files

            logger.info(f"📂 Extracted files from prompt: {[f.lower() for f in unique_files]}")
            return unique_files

    def _match_files_with_available(self, prompt_files: List[str], available_files: List[str]) -> bool:
            """
            Check if files mentioned in prompt match available files.
            Returns True if any files match.
            """
            if not prompt_files or not available_files:
                return False

            # Normalize available files (just filename, not full path)
            available_normalized = []
            for af in available_files:
                # Extract just the filename from path
                filename = af.split('/')[-1] if '/' in af else af
                available_normalized.append(filename.lower())

            # Check for matches (case-insensitive)
            matches = []
            for pf in prompt_files:
                pf_key = pf.lower()
                # Check exact match
                if pf_key in available_normalized:
                    matches.append(pf)
                else:
                    # Check partial match (filename contains prompt file)
                    for af in available_normalized:
                        if pf_key in af or af in pf_key:
                            matches.append(pf)
                            break

            if matches:
                logger.info(f"✅ Found {len(matches)} matching files: {matches}")
                return True
            else:
                logger.info(f"⚠️ No matching files found. Prompt files: {prompt_files}, Available: {available_normalized[:3]}...")
                return False

    def _prepare_available_file_context(self, available_files: List[str]) -> Tuple[List[str], Dict[str, List[str]]]:
            """Return display-friendly list of available file names and lookup map."""
            display_names: List[str] = []
            lookup: Dict[str, List[str]] = {}
            for file_path in available_files:
                display = file_path.split('/')[-1] if '/' in file_path else file_path
                display_names.append(display)
                key = display.lower()
                lookup.setdefault(key, []).append(file_path)
            return display_names, lookup

    def _display_file_name(self, path: str) -> str:
            """Return a user-friendly file name from a stored path."""
            if not path:
                return ""
            if "/" in path:
                path = path.split("/")[-1]
            if "\\" in path:
                path = path.split("\\")[-1]
            return path

    def _ensure_list_of_strings(self, candidate: Any) -> List[str]:
            """Coerce planner-provided values (string/dict/list) into a list of strings."""
            if candidate is None:
                return []
            if isinstance(candidate, list):
                result: List[str] = []
                for item in candidate:
                    if item is None:
                        continue
                    if isinstance(item, (list, tuple, set)):
                        result.extend(
                            str(sub_item) for sub_item in item if sub_item is not None
                        )
                    elif isinstance(item, dict):
                        result.extend(
                            str(value)
                            for value in item.values()
                            if value is not None and value != ""
                        )
                    else:
                        result.append(str(item))
                return [value for value in result if value != ""]
            if isinstance(candidate, (tuple, set)):
                return [str(item) for item in candidate if item is not None and item != ""]
            if isinstance(candidate, dict):
                values = [
                    str(value)
                    for value in candidate.values()
                    if value is not None and value != ""
                ]
                if values:
                    return values
                return [str(key) for key in candidate.keys()]
            if isinstance(candidate, str):
                return [candidate]
            return [str(candidate)]

    def _match_prompt_files_to_available(
            self,
            prompt_files: List[str],
            available_lookup: Dict[str, List[str]]
        ) -> List[str]:
            """Map files mentioned by the user to available files when possible."""
            matched: List[str] = []
            for raw_name in prompt_files:
                cleaned = raw_name.lstrip('@')
                key = cleaned.lower()
                actual = None

                if key in available_lookup and available_lookup[key]:
                    actual = available_lookup[key].pop(0)
                else:
                    for lookup_key, names in available_lookup.items():
                        if names and (key in lookup_key or lookup_key in key):
                            actual = names.pop(0)
                            break

                if actual:
                    matched.append(actual)
                else:
                    matched.append(cleaned)

            return matched

    def _atom_produces_dataset(self, atom_id: Optional[str]) -> bool:
            """Return True if the atom is expected to save a new dataset file."""
            return bool(atom_id and atom_id in DATASET_OUTPUT_ATOMS)

    def _atom_prefers_latest_dataset(self, atom_id: Optional[str]) -> bool:
            """
            Return True if the atom should default to using the most recent dataset
            when explicit file references are not provided.
            """
            if not atom_id:
                return False
            return atom_id in PREFERS_LATEST_DATASET_ATOMS or self._atom_produces_dataset(atom_id)

    def _build_enriched_description(self, step: WorkflowStepPlan, available_files: List[str]) -> str:
            """
            Build enriched description with file details for UI display.
            Includes file names, input/output information, and atom-specific details.
            """
            lines = [step.description]

            # Add file information
            if hasattr(step, "files_used") and step.files_used:
                file_display_names = [self._display_file_name(f) for f in step.files_used]
                if len(step.files_used) == 1:
                    lines.append(f"📁 Input file: {file_display_names[0]} ({step.files_used[0]})")
                else:
                    files_str = ", ".join([f"{name} ({path})" for name, path in zip(file_display_names, step.files_used)])
                    lines.append(f"📁 Input files: {files_str}")

            # Add input from previous steps
            if hasattr(step, "inputs") and step.inputs:
                if len(step.inputs) == 1:
                    lines.append(f"🔗 Using output from previous step: {step.inputs[0]}")
                else:
                    inputs_str = ", ".join(step.inputs)
                    lines.append(f"🔗 Using outputs from previous steps: {inputs_str}")

            # Add output alias
            if hasattr(step, "output_alias") and step.output_alias:
                lines.append(f"📤 Output alias: {step.output_alias}")

            # Add atom-specific details from capabilities
            atom_capabilities = self._get_atom_capability_info(step.atom_id)
            if atom_capabilities:
                capabilities = atom_capabilities.get("capabilities", [])
                if capabilities:
                    lines.append(f"⚙️ Capabilities: {', '.join(capabilities[:2])}")

            return " | ".join(lines)

    def _get_atom_capability_info(self, atom_id: str) -> Optional[Dict[str, Any]]:
            """Get atom capability information from JSON file"""
            try:
                capabilities_path = Path(__file__).parent / "rag" / "atom_capabilities.json"
                if capabilities_path.exists():
                    with open(capabilities_path, 'r', encoding='utf-8') as f:
                        capabilities_data = json.load(f)
                        for atom in capabilities_data.get("atoms", []):
                            if atom.get("atom_id") == atom_id:
                                return atom
            except Exception as e:
                logger.warning(f"⚠️ Could not load atom capability for {atom_id}: {e}")
            return None

    def _compose_prompt(
            self,
            atom_id: str,
            description: str,
            guidance: Dict[str, Any],
            files_used: List[str],
            inputs: List[str],
            output_alias: str,
            is_stream_workflow: bool = False
        ) -> str:
            """
            Build a natural language prompt for downstream atom execution.
            Now includes clear file names and detailed instructions based on atom capabilities.

            Args:
                is_stream_workflow: If True, add mandatory file usage restrictions for Stream AI workflow mode
            """
            # Get atom capabilities for better prompt generation
            atom_capabilities = self._get_atom_capability_info(atom_id)

            description_text = description.strip() or guidance.get("purpose", "Perform the requested operation")
            if not description_text.endswith('.'):  # ensure sentence end
                description_text += '.'

            lines: List[str] = []

            # Add Stream AI workflow mode mandatory file usage section at the top
            if is_stream_workflow:
                lines.append("🚨 MANDATORY FILE USAGE - STREAM AI WORKFLOW")
                lines.append("You are being called as part of a Stream AI workflow.")
                lines.append("You MUST use ONLY the file(s) specified below.")
                lines.append("DO NOT use any other files from MinIO, even if they exist.")
                lines.append("Use ONLY the specified file(s).")
                lines.append("")

            # Add atom-specific instructions from capabilities
            if atom_capabilities:
                prompt_reqs = atom_capabilities.get("prompt_requirements", [])
                if prompt_reqs:
                    lines.append(f"**CRITICAL REQUIREMENTS FOR {atom_id.upper()}:**")
                    for req in prompt_reqs[:3]:  # Top 3 requirements
                        lines.append(f"- {req}")
                    lines.append("")  # Empty line for readability

            # Special handling for data-upload-validate
            if atom_id == "data-upload-validate":
                if files_used:
                    target_file = files_used[0]
                    file_name = self._display_file_name(target_file)
                    lines.append(f"**CRITICAL: Load this exact file from MinIO:** `{target_file}`")
                    lines.append(f"- Display name: {file_name}")
                    lines.append(f"- Use the exact file path shown above (case-sensitive, with extension)")
                    lines.append(f"- The file exists in MinIO and must be loaded into the data upload atom")
                elif inputs:
                    target_file = inputs[0]
                    lines.append(f"**CRITICAL: Load this exact file from MinIO:** `{target_file}`")
                    lines.append(f"- Use the exact file path shown above (case-sensitive)")
                else:
                    lines.append("**CRITICAL: File name required**")
                    lines.append("- Extract the exact file name from the user's request")
                    lines.append("- The file must exist in MinIO (check available files list)")
                    lines.append("- Example: If user says 'load sales.csv', use exactly 'sales.csv'")

                # Check for dtype changes in description
                desc_lower = description.lower()
                if any(kw in desc_lower for kw in ["dtype", "type", "convert", "change", "integer", "int", "float", "datetime"]):
                    lines.append("")
                    lines.append("**Dtype changes detected in request:**")
                    lines.append("- Extract which columns need dtype changes")
                    lines.append("- Extract the target dtype for each column")
                    lines.append("- Format: {'ColumnName': 'int64'} or {'ColumnName': {'dtype': 'datetime64', 'format': 'YYYY-MM-DD'}}")
                else:
                    lines.append("")
                    lines.append("**No dtype changes requested** - just load the file")
                    lines.append("- Set dtype_changes to empty object {} in your response")
            elif files_used:
                # Use EXACT file names with full paths
                if is_stream_workflow:
                    if len(files_used) == 1:
                        file_name = self._display_file_name(files_used[0])
                        lines.append(f"**🚨 PRIMARY INPUT FILE (MANDATORY):** Use dataset `{files_used[0]}` (display name: {file_name}) as the primary input.")
                        lines.append(f"**⚠️ CRITICAL:** Reference this file by its exact path: `{files_used[0]}`")
                        lines.append(f"**⚠️ DO NOT USE ANY OTHER FILES.** This is the ONLY file you should use for this workflow step.")
                    else:
                        formatted = ', '.join(f"`{name}`" for name in files_used)
                        display_names = [self._display_file_name(f) for f in files_used]
                        lines.append(f"**🚨 INPUT FILES (MANDATORY):** Use datasets {formatted} as inputs.")
                        lines.append(f"**FILE PATHS:** {', '.join(f'`{f}`' for f in files_used)}")
                        lines.append(f"**DISPLAY NAMES:** {', '.join(display_names)}")
                        lines.append(f"**⚠️ DO NOT USE ANY OTHER FILES.** These are the ONLY files you should use for this workflow step.")
                else:
                    if len(files_used) == 1:
                        file_name = self._display_file_name(files_used[0])
                        lines.append(f"**PRIMARY INPUT FILE:** Use dataset `{files_used[0]}` (display name: {file_name}) as the primary input.")
                        lines.append(f"**IMPORTANT:** Reference this file by its exact path: `{files_used[0]}`")
                    else:
                        formatted = ', '.join(f"`{name}`" for name in files_used)
                        display_names = [self._display_file_name(f) for f in files_used]
                        lines.append(f"**INPUT FILES:** Use datasets {formatted} as inputs.")
                        lines.append(f"**FILE PATHS:** {', '.join(f'`{f}`' for f in files_used)}")
                        lines.append(f"**DISPLAY NAMES:** {', '.join(display_names)}")
            elif inputs:
                if is_stream_workflow:
                    if len(inputs) == 1:
                        lines.append(f"**🚨 INPUT FROM PREVIOUS STEP (MANDATORY):** Use dataset `{inputs[0]}` produced in earlier steps.")
                        lines.append(f"**⚠️ DO NOT USE ANY OTHER FILES.** This is the ONLY file you should use for this workflow step.")
                    else:
                        formatted = ', '.join(f"`{alias}`" for alias in inputs)
                        lines.append(f"**🚨 INPUTS FROM PREVIOUS STEPS (MANDATORY):** Use datasets {formatted} produced in earlier steps.")
                        lines.append(f"**⚠️ DO NOT USE ANY OTHER FILES.** These are the ONLY files you should use for this workflow step.")
                else:
                    if len(inputs) == 1:
                        lines.append(f"**INPUT FROM PREVIOUS STEP:** Use dataset `{inputs[0]}` produced in earlier steps.")
                    else:
                        formatted = ', '.join(f"`{alias}`" for alias in inputs)
                        lines.append(f"**INPUTS FROM PREVIOUS STEPS:** Use datasets {formatted} produced in earlier steps.")
            else:
                if is_stream_workflow:
                    lines.append("**⚠️ CRITICAL WARNING:** No input dataset specified. This is REQUIRED for the workflow step.")
                else:
                    lines.append("**WARNING:** No input dataset specified. Ask the user to provide or confirm the correct dataset before executing this atom.")

            lines.append("")
            lines.append(f"**TASK:** {description_text}")
            lines.append("")

            # Add file validation for Stream AI mode
            if is_stream_workflow:
                lines.append("**🚨 FILE USAGE VALIDATION (STREAM AI WORKFLOW):**")
                lines.append("- The file_name/data_source you use MUST match exactly one of the files specified above.")
                lines.append("- ERROR PREVENTION: If you use any file not explicitly listed, the workflow will fail.")
                lines.append("- WORKFLOW CONTEXT: The file(s) specified above were created/selected by previous workflow steps. Use them.")
                lines.append("")

            lines.append("**COLUMN VALIDATION CHECKLIST:**")
            lines.append("- Use ONLY column names/values that appear in the file metadata & alias map above.")
            lines.append("- If the user uses abbreviations or synonyms, map them to the exact column names before building formulas/filters.")
            lines.append("- If a requested column/value is not found, choose the closest matching column that exists (case-sensitive). Never invent new columns.")

            guidelines = guidance.get("prompt_guidelines", [])
            if guidelines:
                lines.append("Ensure you:")
                for guideline in guidelines:
                    lines.append(f"- {guideline}")

            dynamic_slots = guidance.get("dynamic_slots", {})
            if dynamic_slots:
                lines.append("Capture details for:")
                for key, value in dynamic_slots.items():
                    lines.append(f"- {key}: {value}")

            if output_alias:
                lines.append(f"Return the result as `{output_alias}` for downstream steps.")
            else:
                lines.append("Focus on producing insights/visualizations using the referenced dataset(s) without creating a new output file.")

            return "\n".join(lines)

    def _build_enriched_plan(
            self,
            workflow_steps_raw: List[Dict[str, Any]],
            prompt_files: List[str],
            available_files: List[str],
            start_index: int = 1,
            initial_previous_alias: Optional[str] = None
        ) -> List[WorkflowStepPlan]:
            """Combine raw workflow outline with prompt guidance and file context."""
            display_names, lookup = self._prepare_available_file_context(available_files)
            lookup_for_match = {key: names[:] for key, names in lookup.items()}
            matched_prompt_files = self._match_prompt_files_to_available(prompt_files, lookup_for_match)

            remaining_available: List[str] = []
            for names in lookup_for_match.values():
                remaining_available.extend(names)

            matched_queue = matched_prompt_files.copy()

            enriched_steps: List[WorkflowStepPlan] = []
            last_materialized_alias: Optional[str] = initial_previous_alias

            for idx, raw_step in enumerate(workflow_steps_raw, start_index):
                atom_id = raw_step.get("atom_id", "unknown")
                description = raw_step.get("description", "").strip()
                produces_dataset = self._atom_produces_dataset(atom_id)
                prefers_latest_dataset = self._atom_prefers_latest_dataset(atom_id)
                default_alias = f"{atom_id.replace('-', '_')}_step_{idx}"
                if produces_dataset:
                    output_alias = raw_step.get("output_alias") or default_alias
                else:
                    output_alias = raw_step.get("output_alias") or ""

                guidance = {}
                if self.rag_engine:
                    guidance = self.rag_engine.get_atom_prompt_guidance(atom_id)

                files_used_raw = raw_step.get("files_used") or []
                files_used = self._ensure_list_of_strings(files_used_raw)

                # Validate file names against available files
                if files_used and available_files:
                    validated_files = self._validate_file_names(files_used, available_files)
                    if len(validated_files) < len(files_used):
                        logger.warning(f"⚠️ Step {idx}: Filtered {len(files_used) - len(validated_files)} invalid file names. Using only validated: {validated_files}")
                    files_used = validated_files

                files_required = 0
                if atom_id == "data-upload-validate":
                    files_required = 1
                elif atom_id in {"merge", "concat"}:
                    files_required = 2

                if not files_used and prefers_latest_dataset and last_materialized_alias:
                    files_used = [last_materialized_alias]

                if files_required and len(files_used) < files_required:
                    needed = files_required - len(files_used)
                    for _ in range(needed):
                        next_file = None
                        if matched_queue:
                            next_file = matched_queue.pop(0)
                        elif remaining_available:
                            next_file = remaining_available.pop(0)
                        if next_file and next_file not in files_used:
                            files_used.append(next_file)

                if not files_used and matched_queue:
                    files_used.append(matched_queue.pop(0))
                if not files_used and remaining_available:
                    # For analysis atoms (groupby, chart-maker, etc.) default to first known dataset.
                    files_used.append(remaining_available[0])

                inputs_raw = raw_step.get("inputs") or []
                inputs = self._ensure_list_of_strings(inputs_raw)
                if not inputs:
                    if atom_id in {"merge", "concat"}:
                        inputs = files_used.copy()
                        if last_materialized_alias and last_materialized_alias not in inputs:
                            inputs.insert(0, last_materialized_alias)
                    elif atom_id == "data-upload-validate":
                        inputs = []
                    else:
                        if prefers_latest_dataset and last_materialized_alias:
                            inputs = [last_materialized_alias]
                        elif files_used:
                            inputs = files_used.copy()
                        elif matched_queue:
                            inputs = [matched_queue[0]]
                        elif remaining_available:
                            inputs = [remaining_available[0]]

                # For data-upload-validate, if no output_alias was provided, use the file name (without extension)
                if atom_id == "data-upload-validate" and not raw_step.get("output_alias") and files_used:
                    file_path = files_used[0]
                    # Extract file name without extension
                    file_name = os.path.basename(file_path)
                    # Remove extension (e.g., "D0_MMM.arrow" -> "D0_MMM")
                    if "." in file_name:
                        file_name_without_ext = file_name.rsplit(".", 1)[0]
                    else:
                        file_name_without_ext = file_name
                    output_alias = file_name_without_ext
                    logger.info(f"📝 Data-upload-validate: Using file name '{output_alias}' as output alias (from file: {file_path})")

                prompt_text = raw_step.get("prompt")
                if not prompt_text:
                    prompt_text = self._compose_prompt(atom_id, description, guidance, files_used, inputs, output_alias, is_stream_workflow=True)

                description_for_step = description or guidance.get("purpose", "")
                display_files = [self._display_file_name(file_path) for file_path in files_used if file_path]
                if display_files:
                    files_clause = ", ".join(display_files)
                    if description_for_step:
                        if files_clause not in description_for_step:
                            description_for_step = f"{description_for_step} (files: {files_clause})"
                    else:
                        description_for_step = f"Files used: {files_clause}"

                # Build enriched description with file details
                temp_step = WorkflowStepPlan(
                    step_number=idx,
                    atom_id=atom_id,
                    description=description_for_step,
                    prompt=prompt_text,
                    files_used=files_used,
                    inputs=inputs,
                    output_alias=output_alias
                )
                enriched_description = self._build_enriched_description(temp_step, available_files)

                enriched_steps.append(
                    WorkflowStepPlan(
                        step_number=idx,
                        atom_id=atom_id,
                        description=description_for_step,
                        prompt=prompt_text,
                        files_used=files_used,
                        inputs=inputs,
                        output_alias=output_alias,
                        enriched_description=enriched_description,
                        atom_prompt=prompt_text  # Store the prompt that will be sent to atom
                    )
                )

                if produces_dataset and output_alias:
                    last_materialized_alias = output_alias

            return enriched_steps

    async def _generate_workflow_with_llm(
            self,
            user_prompt: str,
            available_files: List[str],
            priority_files: Optional[List[str]] = None,
        ) -> Tuple[List[Dict[str, Any]], List[str], bool]:
            """
            Use LLM to generate workflow plan based on user prompt and atom capabilities.

            Args:
                user_prompt: User's request
                available_files: List of available file names

            Returns:
                Tuple of (workflow steps, files detected in user prompt, whether existing files matched)
            """
            if aiohttp is None:
                raise RuntimeError("aiohttp is required for LLM workflow generation but is not installed")

            # Extract files mentioned in prompt and merge with tracked context
            prompt_files = self._extract_file_names_from_prompt(user_prompt, available_files)
            prompt_files = self._merge_file_references(prompt_files, priority_files)
            files_exist = self._match_files_with_available(prompt_files, available_files) if available_files else False

            graph_prompt: Optional[GraphRAGPhaseOnePrompt] = None
            try:
                graph_prompt = self.graph_prompt_builder.build_phase_one_prompt(
                    user_prompt=user_prompt,
                    available_files=available_files,
                    files_exist=files_exist,
                    prompt_files=prompt_files,
                    atom_reference=self._get_atom_capabilities_for_llm(),
                )
                llm_prompt = graph_prompt.prompt
                logger.info(
                    "🧠 GraphRAG context sections: %s",
                    list(graph_prompt.context.keys()),
                )
                logger.debug("📎 GraphRAG context detail: %s", graph_prompt.context)
                self._latest_graph_prompt = graph_prompt
            except Exception as exc:
                logger.exception("⚠️ Graph prompt builder failed; falling back to legacy prompt: %s", exc)
                llm_prompt = self._build_legacy_prompt(
                    user_prompt=user_prompt,
                    available_files=available_files,
                    files_exist=files_exist,
                    prompt_files=prompt_files,
                )
                logger.info("🧠 Using legacy workflow prompt assembly")
                self._latest_graph_prompt = None

            logger.info(f"🤖 Calling LLM for workflow generation...")
            logger.info(f"📝 Prompt length: {len(llm_prompt)} chars")

            # Define the LLM call function for retry mechanism
            async def _call_llm_for_workflow() -> List[Dict[str, Any]]:
                """Inner function that makes the LLM call and parses JSON"""
                # Print full prompt to terminal
                print("\n" + "="*80)
                print("🚀 STREAMAI WEBSOCKET WORKFLOW LLM CALL - FULL PROMPT")
                print("="*80)
                print(f"API URL: {self.llm_api_url}")
                print(f"Model: {self.llm_model}")
                print(f"Temperature: 0.3, Max Tokens: 1000")
                print(f"Prompt Length: {len(llm_prompt)} characters")
                print("-"*80)
                print("FULL PROMPT:")
                print("-"*80)
                print(llm_prompt)
                print("="*80 + "\n")

                async with aiohttp.ClientSession() as session:
                    payload = {
                        "model": self.llm_model,
                        "messages": [
                            {"role": "system", "content": "You are a data workflow planner. Respond only with valid JSON."},
                            {"role": "user", "content": llm_prompt}
                        ],
                        "temperature": 0.3,  # Low temperature for consistent results
                        "max_tokens": 1000
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

                        # Get raw response text
                        raw_response_text = await response.text()
                        result = await response.json()

                        # Print raw API response to terminal
                        print("\n" + "="*80)
                        print("📥 STREAMAI WEBSOCKET WORKFLOW LLM - RAW RESPONSE")
                        print("="*80)
                        print(f"Status Code: {response.status}")
                        print("-"*80)
                        print("RAW JSON RESPONSE:")
                        print("-"*80)
                        print(raw_response_text)
                        print("="*80 + "\n")

                        # Extract content from LLM response
                        content = result["choices"][0]["message"]["content"]

                        # Print processed content
                        print("\n" + "="*80)
                        print("✨ STREAMAI WEBSOCKET WORKFLOW LLM - PROCESSED CONTENT")
                        print("="*80)
                        print(f"Content Length: {len(content)} characters")
                        print("-"*80)
                        print("EXTRACTED CONTENT:")
                        print("-"*80)
                        print(content)
                        print("="*80 + "\n")

                        logger.info(f"🤖 LLM response: {content[:200]}...")

                        # Parse JSON from response
                        # Handle case where LLM wraps JSON in markdown code blocks
                        if "```json" in content:
                            content = content.split("```json")[1].split("```")[0].strip()
                        elif "```" in content:
                            content = content.split("```")[1].split("```")[0].strip()

                        workflow_payload = json.loads(content)

                        if isinstance(workflow_payload, dict):
                            if "steps" in workflow_payload and isinstance(workflow_payload["steps"], list):
                                workflow_steps = workflow_payload["steps"]
                            elif "workflow_steps" in workflow_payload and isinstance(workflow_payload["workflow_steps"], list):
                                workflow_steps = workflow_payload["workflow_steps"]
                            else:
                                # Allow dict representing a single step
                                workflow_steps = [workflow_payload]
                        elif isinstance(workflow_payload, list):
                            workflow_steps = workflow_payload
                        else:
                            raise ValueError("LLM response is not a list or object containing steps")

                        normalized_steps: List[Dict[str, Any]] = []
                        for entry in workflow_steps:
                            if isinstance(entry, dict):
                                normalized_steps.append(entry)
                                continue
                            if isinstance(entry, str):
                                try:
                                    parsed_entry = json.loads(entry)
                                    if isinstance(parsed_entry, dict):
                                        normalized_steps.append(parsed_entry)
                                        continue
                                except json.JSONDecodeError:
                                    logger.warning("⚠️ Unable to parse workflow step string into JSON: %s", entry[:200])
                            logger.warning("⚠️ Skipping workflow step with unsupported type: %r", type(entry))

                        if not normalized_steps:
                            raise ValueError("No valid workflow steps extracted from LLM response")

                        return normalized_steps

            # Use retry mechanism for workflow generation
            try:
                workflow_steps = await self._retry_llm_json_generation(
                    llm_call_func=_call_llm_for_workflow,
                    step_name="Workflow Generation",
                    max_attempts=3
                )

                if len(workflow_steps) > self.max_initial_plan_steps:
                    logger.warning(
                        "⚠️ Workflow generation returned %d steps; aborting to avoid an unmanageable plan",
                        len(workflow_steps),
                    )
                    raise RetryableJSONGenerationError(
                        f"Generated plan has {len(workflow_steps)} steps which exceeds the limit of {self.max_initial_plan_steps}",
                        attempts=1,
                        last_error=ValueError("plan_too_long"),
                    )

                # Post-process: Keep data-upload-validate if user mentions files (it will load them)
                # We no longer skip data-upload-validate - it's needed to load files into the atom
                # The atom can load files without dtype changes if user doesn't request them

                logger.info(f"✅ Generated {len(workflow_steps)} steps via LLM")
                for i, step in enumerate(workflow_steps, 1):
                    logger.info(f"   Step {i}: {step.get('atom_id')} - {step.get('description')}")

                return workflow_steps, prompt_files, files_exist

            except RetryableJSONGenerationError as e:
                logger.error(f"❌ Workflow generation failed after all retries: {e}")
                # Return error instead of manual fallback - all workflow generation must use AI
                logger.error("❌ Cannot generate workflow - AI generation failed. Please retry or rephrase your request.")
                return [], [], False
            except Exception as e:
                logger.error(f"❌ LLM workflow generation failed with unexpected error: {e}")
                import traceback
                traceback.print_exc()
                # Return error instead of manual fallback - all workflow generation must use AI
                logger.error("❌ Cannot generate workflow - AI generation failed. Please retry or rephrase your request.")
                return [], [], False
