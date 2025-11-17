"""
WebSocket Orchestrator for Trinity AI
=====================================

Handles real-time step-by-step workflow execution with WebSocket events.
Implements the Trinity AI streaming pattern for card and result handling.
"""

import asyncio
import json
import logging
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple, Callable, Set
from dataclasses import dataclass
import uuid

try:
    from starlette.websockets import WebSocketDisconnect  # type: ignore
except ImportError:  # pragma: no cover
    class WebSocketDisconnect(Exception):  # type: ignore
        """Fallback WebSocketDisconnect for environments without starlette."""

        def __init__(self, code: int = 1000, reason: str = "") -> None:
            self.code = code
            self.reason = reason
            super().__init__(code, reason)

from .atom_mapping import ATOM_MAPPING
from .graphrag import GraphRAGWorkspaceConfig
from .graphrag.client import GraphRAGQueryClient
from .graphrag.prompt_builder import GraphRAGPromptBuilder, PhaseOnePrompt as GraphRAGPhaseOnePrompt
from Agent_insight.workflow_insight_agent import get_workflow_insight_agent

try:
    import aiohttp  # type: ignore
except ImportError:  # pragma: no cover
    aiohttp = None  # type: ignore

try:
    from memory_service import storage as memory_storage_module  # type: ignore
    from memory_service.summarizer import summarize_messages as summarize_chat_messages  # type: ignore
except Exception:  # pragma: no cover - memory service optional
    memory_storage_module = None
    summarize_chat_messages = None

logger = logging.getLogger("trinity.trinityai.websocket")

# Atom capability metadata for file/alias handling
DATASET_OUTPUT_ATOMS = {
    "data-upload-validate",
    "dataframe-operations",
    "groupby-wtg-avg",
    "create-column",
    "create-transform",
    "merge",
    "concat",
    "pivot-table",
}

# Atoms that should default to using the latest produced dataset when inputs aren't explicit
PREFERS_LATEST_DATASET_ATOMS = {
    "dataframe-operations",
    "groupby-wtg-avg",
    "create-column",
    "create-transform",
    "chart-maker",
}


@dataclass
class WebSocketEvent:
    """WebSocket event to send to frontend"""
    type: str
    data: Dict[str, Any]
    
    def to_json(self) -> str:
        """Convert to JSON string"""
        return json.dumps({"type": self.type, **self.data})


@dataclass
class WorkflowStepPlan:
    """Represents a single workflow step with prompt metadata."""
    step_number: int
    atom_id: str
    description: str
    prompt: str
    files_used: List[str]
    inputs: List[str]
    output_alias: str
    enriched_description: Optional[str] = None  # Enriched description with file details for UI
    atom_prompt: Optional[str] = None  # Full prompt that will be sent to atom LLM

    def to_dict(self) -> Dict[str, Any]:
        return {
            "step_number": self.step_number,
            "atom_id": self.atom_id,
            "description": self.description,
            "enriched_description": self.enriched_description or self.description,
            "prompt": self.prompt,
            "atom_prompt": self.atom_prompt,  # Include full prompt for UI display
            "files_used": self.files_used,
            "inputs": self.inputs,
            "output_alias": self.output_alias
        }


@dataclass
class WorkflowPlan:
    """Plan containing ordered workflow steps."""
    workflow_steps: List[WorkflowStepPlan]
    total_steps: int

    def to_dict(self) -> Dict[str, Any]:
        return {
            "workflow_steps": [step.to_dict() for step in self.workflow_steps],
            "total_steps": self.total_steps
        }


class RetryableJSONGenerationError(Exception):
    """Exception raised when JSON generation fails after all retries"""
    def __init__(self, message: str, attempts: int, last_error: Exception):
        super().__init__(message)
        self.attempts = attempts
        self.last_error = last_error


class StreamWebSocketOrchestrator:
    """
    Orchestrates Stream AI workflow execution via WebSocket.
    Sends real-time events to frontend for UI updates.
    """
    
    def __init__(
        self,
        workflow_planner,
        parameter_generator,
        result_storage,
        rag_engine
    ):
        """Initialize WebSocket orchestrator"""
        self.workflow_planner = workflow_planner  # Can be None, we'll use RAG directly
        self.parameter_generator = parameter_generator
        self.result_storage = result_storage
        self.rag_engine = rag_engine
        self._cancelled_sequences: Set[str] = set()

        # GraphRAG integration
        self.graph_workspace_config = GraphRAGWorkspaceConfig()
        self.graph_rag_client = GraphRAGQueryClient(self.graph_workspace_config)
        self.graph_prompt_builder = GraphRAGPromptBuilder(self.graph_rag_client)
        self._latest_graph_prompt: Optional[GraphRAGPhaseOnePrompt] = None

        # In-memory caches for step execution data and outputs
        self._step_execution_cache: Dict[str, Dict[int, Dict[str, Any]]] = {}
        self._step_output_files: Dict[str, Dict[int, str]] = {}
        self._sequence_available_files: Dict[str, List[str]] = {}
        self._output_alias_registry: Dict[str, Dict[str, str]] = {}
        self._chat_file_mentions: Dict[str, List[str]] = {}

        # Determine FastAPI base for downstream atom services (merge, concat, etc.)
        self.fastapi_base_url = self._determine_fastapi_base_url()
        self.merge_save_endpoint = f"{self.fastapi_base_url}/api/merge/save"
        self.concat_save_endpoint = f"{self.fastapi_base_url}/api/concat/save"
        self.merge_perform_endpoint = f"{self.fastapi_base_url}/api/merge/perform"
        self.concat_perform_endpoint = f"{self.fastapi_base_url}/api/concat/perform"
        logger.info(f"🔗 FastAPI base URL for auto-save: {self.fastapi_base_url}")

        # Get LLM config (same as merge/concat agents)
        ollama_ip = os.getenv("OLLAMA_IP", os.getenv("HOST_IP", "127.0.0.1"))
        llm_port = os.getenv("OLLAMA_PORT", "11434")
        # Use OpenAI-compatible endpoint for workflow generation
        self.llm_api_url = f"http://{ollama_ip}:{llm_port}/v1/chat/completions"
        self.llm_model = os.getenv("LLM_MODEL_NAME", "deepseek-r1:32b")
        self.bearer_token = os.getenv("LLM_BEARER_TOKEN", "aakash_api_key")
        
        logger.info(f"🔗 LLM Config: {self.llm_api_url} | Model: {self.llm_model}")
        
        # Load atom mapping for endpoints
        self._load_atom_mapping()

        # Atom execution retry configuration
        self.atom_retry_attempts = max(
            1, int(os.getenv("STREAM_AI_ATOM_RETRY_ATTEMPTS", "3"))
        )
        self.atom_retry_delay = max(
            0.0, float(os.getenv("STREAM_AI_ATOM_RETRY_DELAY_SECONDS", "2"))
        )
        logger.info(
            "🔁 Atom retry configuration | attempts=%s delay=%ss",
            self.atom_retry_attempts,
            self.atom_retry_delay,
        )

        self._memory_storage = memory_storage_module
        self._memory_summarizer = summarize_chat_messages
        if self._memory_storage and self._memory_summarizer:
            logger.info("🧠 Chat memory summaries enabled via MinIO storage")
        else:
            logger.info("ℹ️ Chat memory summaries disabled (memory service unavailable)")
        
        logger.info("✅ StreamWebSocketOrchestrator initialized")
    
    async def _retry_llm_json_generation(
        self,
        llm_call_func: Callable,
        step_name: str,
        max_attempts: int = 3
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
            try:
                logger.info(f"🔄 [{step_name}] Attempt {attempt}/{max_attempts}: Calling LLM for JSON generation...")
                result = await llm_call_func()
                logger.info(f"✅ [{step_name}] Attempt {attempt} succeeded: Valid JSON generated")
                return result
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
        
        # All attempts failed
        error_msg = (
            f"Failed to generate valid JSON for '{step_name}' after {max_attempts} attempts. "
            f"Please rephrase your query in a clearer way."
        )
        raise RetryableJSONGenerationError(error_msg, max_attempts, last_error)
    
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
- DO NOT include 'data-upload-validate' steps - files are already uploaded!
- Start directly with the data processing step (merge, concat, etc.)
"""

        workflow_rule = (
            "- ⚠️ CRITICAL: Files mentioned in user request already exist in available_files. DO NOT include 'data-upload-validate' steps. Start directly with data processing!"
            if files_exist
            else "- If files don't exist, include 'data-upload-validate' as the first step"
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
   - Capability: Combines two datasets based on common columns
   - Use when: User wants to join, merge, combine, or link two files
   - Keywords: merge, join, combine, link, match
   - Output: merge_json with file paths and join configuration
   - Example: "Merge sales and customer data on CustomerID"

2. **concat** - Concatenate Datasets
   - Capability: Stacks multiple datasets vertically (append rows)
   - Use when: User wants to append, stack, or combine rows from multiple files
   - Keywords: concat, append, stack, combine vertically
   - Output: concat_json with file list and concat configuration
   - Example: "Concatenate Q1, Q2, Q3, Q4 sales data"

3. **groupby-wtg-avg** - Group and Aggregate
   - Capability: Groups data and calculates aggregations (sum, mean, count, etc.)
   - Use when: User wants to summarize, aggregate, group, or calculate totals
   - Keywords: group, aggregate, sum, average, mean, total, count, summarize
   - Output: groupby_json with groupby columns and aggregation functions
   - Example: "Group sales by region and calculate total revenue"

4. **dataframe-operations** - Excel-like DataFrame Operations (Powerful Tool)
   - Capability: Comprehensive DataFrame manipulation like Excel - formulas, filters, sorts, transformations, column operations
   - Use when: User wants to:
     * Apply formulas/calculations (PROD, SUM, DIV, IF, etc.)
     * Filter rows based on conditions
     * Sort data by columns
     * Select/drop/rename columns
     * Transform data (case conversion, type conversion, rounding)
     * Insert/delete rows or columns
     * Edit cell values
     * Find and replace values
     * Split or manipulate data like Excel
   - Keywords: formula, calculate, compute, filter, where, sort, order, select, drop, remove, rename, transform, convert, round, edit, insert, delete, find, replace, split, excel, spreadsheet, manipulate, clean, prepare
   - Output: dataframe_config with operations list (can include multiple operations in sequence)
   - Example: "Apply formula PROD(Price, Volume) to Sales column", "Filter rows where revenue > 1000 and sort by date", "Rename column A to Revenue"
   - IMPORTANT: This atom can handle multiple operations in one step, but for complex workflows, use ONE atom per task for clarity

5. **create-column** - Create Calculated Columns
   - Capability: Creates new columns using formulas and calculations
   - Use when: User wants to add, create, calculate, or derive new columns
   - Keywords: create, add, calculate, compute, derive, new column
   - Output: json with column creation logic
   - Example: "Create profit column as revenue minus cost"

6. **chart-maker** - Create Visualizations
   - Capability: Generates charts and visualizations (bar, line, pie, scatter, etc.)
   - Use when: User wants to visualize, plot, chart, or show data graphically
   - Keywords: chart, plot, graph, visualize, show, display
   - Output: chart_json with chart type and configuration
   - Example: "Create bar chart showing sales by category"

7. **correlation** - Correlation Analysis
   - Capability: Calculates correlation matrix between numeric columns
   - Use when: User wants to analyze relationships, correlations, or dependencies
   - Keywords: correlation, relationship, dependency, associate
   - Output: correlation configuration
   - Example: "Analyze correlation between price and sales"

8. **data-upload-validate** - Load Data
   - Capability: Loads and validates data files (CSV, Excel, Arrow)
   - Use when: Files don't exist yet and need to be uploaded
   - Keywords: load, upload, import, read
   - Output: File validation results
   - Example: "Load sales.csv file"
   - NOTE: Skip this if files already exist in available_files!

WORKFLOW PLANNING RULES:
- Put data loading (data-upload-validate) FIRST only if files don't exist
- Put data transformations (merge, concat, filter, groupby, dataframe-operations) BEFORE visualization
- Put chart-maker or visualization atoms LAST
- Each step should build on previous steps
- For dataframe-operations: Use ONE atom per task for clarity (e.g., one for filtering, one for formulas, one for sorting)
- Workflows can be long (5-10+ steps) - break complex tasks into individual steps
- Consider data dependencies between steps
- Example long workflow: Load → Filter → Apply Formula → Sort → Group → Visualize
"""
    
    def _extract_file_names_from_prompt(self, user_prompt: str) -> List[str]:
        """
        Extract file names mentioned in the user prompt.
        Handles formats like: @DO_KHC_UK_Beans.arrow, DO_KHC_UK_Beans.arrow, etc.
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

    @staticmethod
    def _display_file_name(path: str) -> str:
        """Return a user-friendly file name from a stored path."""
        if not path:
            return ""
        if "/" in path:
            path = path.split("/")[-1]
        if "\\" in path:
            path = path.split("\\")[-1]
        return path

    @staticmethod
    def _ensure_list_of_strings(candidate: Any) -> List[str]:
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
        output_alias: str
    ) -> str:
        """
        Build a natural language prompt for downstream atom execution.
        Now includes clear file names and detailed instructions based on atom capabilities.
        """
        # Get atom capabilities for better prompt generation
        atom_capabilities = self._get_atom_capability_info(atom_id)
        
        description_text = description.strip() or guidance.get("purpose", "Perform the requested operation")
        if not description_text.endswith('.'):  # ensure sentence end
            description_text += '.'

        lines: List[str] = []
        
        # Add atom-specific instructions from capabilities
        if atom_capabilities:
            prompt_reqs = atom_capabilities.get("prompt_requirements", [])
            if prompt_reqs:
                lines.append(f"**CRITICAL REQUIREMENTS FOR {atom_id.upper()}:**")
                for req in prompt_reqs[:3]:  # Top 3 requirements
                    lines.append(f"- {req}")
                lines.append("")  # Empty line for readability

        if files_used:
            # Use EXACT file names with full paths
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
            if len(inputs) == 1:
                lines.append(f"**INPUT FROM PREVIOUS STEP:** Use dataset `{inputs[0]}` produced in earlier steps.")
            else:
                formatted = ', '.join(f"`{alias}`" for alias in inputs)
                lines.append(f"**INPUTS FROM PREVIOUS STEPS:** Use datasets {formatted} produced in earlier steps.")
        else:
            lines.append("**WARNING:** No input dataset specified. Ask the user to provide or confirm the correct dataset before executing this atom.")

        lines.append("")
        lines.append(f"**TASK:** {description_text}")
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

            prompt_text = raw_step.get("prompt")
            if not prompt_text:
                prompt_text = self._compose_prompt(atom_id, description, guidance, files_used, inputs, output_alias)

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
        prompt_files = self._extract_file_names_from_prompt(user_prompt)
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
                    result = await response.json()
                    
                    # Extract content from LLM response
                    content = result["choices"][0]["message"]["content"]
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
            
            # Post-process: Remove data-upload-validate if files already exist
            if files_exist:
                original_count = len(workflow_steps)
                workflow_steps = [s for s in workflow_steps if s.get('atom_id') != 'data-upload-validate']
                if len(workflow_steps) < original_count:
                    logger.info(f"🔧 Removed {original_count - len(workflow_steps)} data-upload-validate step(s) - files already exist")
                    # Renumber steps
                    for i, step in enumerate(workflow_steps, 1):
                        step['step_number'] = i
            
            logger.info(f"✅ Generated {len(workflow_steps)} steps via LLM")
            for i, step in enumerate(workflow_steps, 1):
                logger.info(f"   Step {i}: {step.get('atom_id')} - {step.get('description')}")
            
            return workflow_steps, prompt_files, files_exist
            
        except RetryableJSONGenerationError as e:
            logger.error(f"❌ Workflow generation failed after all retries: {e}")
            # Fallback to keyword-based
            logger.info("🔄 Falling back to keyword-based workflow generation")
            return self._fallback_to_keywords(user_prompt, available_files, priority_files)
        except Exception as e:
            logger.error(f"❌ LLM workflow generation failed with unexpected error: {e}")
            import traceback
            traceback.print_exc()
            # Fallback to keyword-based
            return self._fallback_to_keywords(user_prompt, available_files, priority_files)
    
    def _fallback_to_keywords(
        self,
        user_prompt: str,
        available_files: List[str],
        priority_files: Optional[List[str]] = None,
    ) -> Tuple[List[Dict[str, Any]], List[str], bool]:
        """Fallback to simple keyword-based workflow generation"""
        logger.info("⚠️ Falling back to keyword-based workflow generation")
        query_lower = user_prompt.lower()
        steps = []
        
        # Extract files from prompt and check if they exist
        prompt_files = self._extract_file_names_from_prompt(user_prompt)
        prompt_files = self._merge_file_references(prompt_files, priority_files)
        files_exist = self._match_files_with_available(prompt_files, available_files) if available_files else False
        
        # Skip data-upload-validate if files already exist
        if not files_exist and not available_files and any(kw in query_lower for kw in ["load", "upload", "file"]):
            steps.append({"atom_id": "data-upload-validate", "description": "Load and validate data files"})
        elif files_exist:
            logger.info("✅ Files exist, skipping data-upload-validate in fallback")
        
        if any(kw in query_lower for kw in ["merge", "join", "combine"]):
            steps.append({"atom_id": "merge", "description": "Merge datasets"})
        
        if any(kw in query_lower for kw in ["concat", "append", "stack"]):
            steps.append({"atom_id": "concat", "description": "Concatenate datasets"})
        
        # Expanded keywords for dataframe-operations (Excel-like operations)
        dataframe_ops_keywords = [
            "filter", "where", "sort", "order", "select", "drop", "remove", "rename",
            "formula", "calculate", "compute", "prod", "sum", "div", "if", "average",
            "transform", "convert", "round", "edit", "insert", "delete", "find", "replace",
            "split", "excel", "spreadsheet", "manipulate", "clean", "prepare", "column", "row"
        ]
        if any(kw in query_lower for kw in dataframe_ops_keywords):
            steps.append({"atom_id": "dataframe-operations", "description": "Perform DataFrame operations (filter, formula, transform, etc.)"})
        
        if any(kw in query_lower for kw in ["group", "aggregate", "sum", "mean"]):
            steps.append({"atom_id": "groupby-wtg-avg", "description": "Group and aggregate data"})
        
        if any(kw in query_lower for kw in ["chart", "plot", "graph", "visualize"]):
            steps.append({"atom_id": "chart-maker", "description": "Create visualization"})
        
        if not steps:
            # Default to dataframe-operations if no keywords matched
            steps.append({"atom_id": "dataframe-operations", "description": "Perform general dataframe operations"})
        
        return steps, prompt_files, files_exist
    
    async def execute_workflow_with_websocket(
        self,
        websocket,
        user_prompt: str,
        available_files: List[str],
        project_context: Dict[str, Any],
        user_id: str,
        frontend_session_id: Optional[str] = None,
        frontend_chat_id: Optional[str] = None,
        history_override: Optional[str] = None,
        chat_file_names: Optional[List[str]] = None,
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
        sequence_id = frontend_session_id or f"seq_{uuid.uuid4().hex[:12]}"
        logger.info(f"🔑 Using session ID: {sequence_id} (Chat ID: {frontend_chat_id})")
        available_files = list(available_files or [])
        self._sequence_available_files[sequence_id] = available_files

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
            history_files = self._extract_file_names_from_prompt(history_summary)
            file_focus = self._merge_file_references(file_focus, history_files)
        if file_focus:
            self._chat_file_mentions[sequence_id] = file_focus
            effective_user_prompt = self._append_file_focus_note(effective_user_prompt, file_focus)
            logger.info("📁 Tracking %d file references from chat context", len(file_focus))

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
            
            logger.info(f"🚀 Starting workflow for sequence: {sequence_id}")
            
            # ================================================================
            # PHASE 1: GENERATE PLAN (Using LLM with atom knowledge)
            # ================================================================
            logger.info("📋 PHASE 1: Generating workflow plan with LLM...")
            
            # Use LLM to generate intelligent workflow with retry mechanism
            try:
                workflow_steps_raw, prompt_files, files_exist = await self._generate_workflow_with_llm(
                    user_prompt=effective_user_prompt,
                    available_files=available_files,
                    priority_files=file_focus
                )
            except RetryableJSONGenerationError as e:
                logger.error(f"❌ Workflow generation failed after all retries: {e}")
                # Send error event asking user to rephrase
                await self._send_event(
                    websocket,
                    WebSocketEvent(
                        "workflow_generation_failed",
                        {
                            "sequence_id": sequence_id,
                            "error": str(e),
                            "message": (
                                "Failed to generate workflow plan after 3 attempts. "
                                "Please rephrase your query in a clearer way."
                            ),
                            "suggestion": "Try being more specific about what operations you want to perform."
                        }
                    ),
                    "workflow_generation_failed event"
                )
                return  # Stop workflow execution
            
            # Create plan structure
            enriched_steps = self._build_enriched_plan(
                workflow_steps_raw=workflow_steps_raw,
                prompt_files=prompt_files,
                available_files=available_files
            )

            plan = WorkflowPlan(
                workflow_steps=enriched_steps,
                total_steps=len(enriched_steps)
            )
            
            logger.info(f"✅ Generated workflow with {plan.total_steps} steps")
            for step in plan.workflow_steps:
                logger.info(f"   Step {step.step_number}: {step.atom_id} - {step.description}")
            
            # Send plan_generated event
            await self._send_event(
                websocket,
                WebSocketEvent(
                    "plan_generated",
                    {
                        "plan": plan.to_dict(),
                        "sequence_id": sequence_id,
                        "total_steps": plan.total_steps
                    }
                ),
                "plan_generated event"
            )
            
            logger.info(f"✅ Plan generated with {plan.total_steps} steps")
            
            # ================================================================
            # WAIT FOR USER APPROVAL
            # ================================================================
            logger.info("⏸️ Waiting for user approval (approve_plan or reject_plan)...")
            
            # Wait for approval message from frontend
            approval_received = False
            rejected = False
            
            while not approval_received and not rejected:
                try:
                    # Wait for message from client
                    message_data = await websocket.receive_text()
                    approval_msg = json.loads(message_data)
                    
                    logger.info(f"📨 Received approval message: {approval_msg}")
                    
                    if approval_msg.get('type') == 'approve_plan':
                        approval_received = True
                        logger.info("✅ User approved workflow - proceeding with execution")
                    elif approval_msg.get('type') == 'reject_plan':
                        rejected = True
                        logger.info("❌ User rejected workflow - stopping")
                        await self._send_event(
                            websocket,
                            WebSocketEvent(
                                "workflow_rejected",
                                {"message": "Workflow rejected by user", "sequence_id": sequence_id}
                            ),
                            "workflow_rejected plan phase"
                        )
                        return  # Exit without executing
                    elif approval_msg.get('type') == 'add_info':
                        # User added info before step 1 - regenerate entire workflow
                        additional_info = approval_msg.get('additional_info', '')
                        original_prompt = approval_msg.get('original_prompt', user_prompt)
                        combined_prompt = f"{original_prompt}. Additional requirements: {additional_info}"
                        combined_with_history = self._apply_history_context(combined_prompt, history_summary)
                        
                        logger.info(f"➕ Regenerating workflow with additional info: {additional_info}")

                        updated_focus = self._merge_file_references(
                            self._chat_file_mentions.get(sequence_id),
                            self._extract_file_names_from_prompt(additional_info),
                        )
                        if updated_focus:
                            self._chat_file_mentions[sequence_id] = updated_focus
                            combined_with_history = self._append_file_focus_note(combined_with_history, updated_focus)
                        
                        # Regenerate workflow with combined prompt (with retry mechanism)
                        try:
                            workflow_steps_raw, prompt_files, files_exist = await self._generate_workflow_with_llm(
                                user_prompt=combined_with_history,
                                available_files=available_files,
                                priority_files=updated_focus
                            )
                        except RetryableJSONGenerationError as e:
                            logger.error(f"❌ Workflow regeneration failed after all retries: {e}")
                            # Send error event asking user to rephrase
                            await self._send_event(
                                websocket,
                                WebSocketEvent(
                                    "workflow_generation_failed",
                                    {
                                        "sequence_id": sequence_id,
                                        "error": str(e),
                                        "message": (
                                            "Failed to regenerate workflow plan after 3 attempts. "
                                            "Please rephrase your query in a clearer way."
                                        ),
                                        "suggestion": "Try being more specific about what operations you want to perform."
                                    }
                                ),
                                "workflow_generation_failed event (regeneration)"
                            )
                            return  # Stop workflow execution
                        
                        enriched_steps = self._build_enriched_plan(
                            workflow_steps_raw=workflow_steps_raw,
                            prompt_files=prompt_files,
                            available_files=available_files
                        )

                        plan = WorkflowPlan(
                            workflow_steps=enriched_steps,
                            total_steps=len(enriched_steps)
                        )
                        
                        # Send updated plan
                        await self._send_event(
                            websocket,
                            WebSocketEvent(
                                "plan_generated",
                                {
                                    "plan": plan.to_dict(),
                                    "sequence_id": sequence_id,
                                    "total_steps": plan.total_steps
                                }
                            ),
                            "plan_generated event (update)"
                        )
                        
                        logger.info(f"✅ Regenerated workflow with {plan.total_steps} steps")
                        # Continue waiting for approval
                    elif approval_msg.get('type') == 'stop_workflow':
                        logger.info("🛑 User stopped workflow before execution")
                        self._cancelled_sequences.add(sequence_id)
                        await self._send_event(
                            websocket,
                            WebSocketEvent(
                                "workflow_stopped",
                                {
                                    "message": "Workflow stopped by user before execution",
                                    "sequence_id": sequence_id
                                }
                            ),
                            "workflow_stopped (plan phase)"
                        )
                        return
                except WebSocketDisconnect:
                    logger.info("🔌 WebSocket disconnected while waiting for initial approval")
                    return
                except Exception as e:
                    logger.error(f"❌ Error waiting for approval: {e}")
                    break
            
            if rejected:
                return  # Don't execute if rejected
            
            # ================================================================
            # PHASE 2: EXECUTE STEPS (after approval)
            # ================================================================
            logger.info("🚀 PHASE 2: Starting step-by-step execution...")
            
            await self._send_event(
                websocket,
                WebSocketEvent(
                    "workflow_started",
                    {
                        "sequence_id": sequence_id,
                        "total_steps": plan.total_steps
                    }
                ),
                "workflow_started event"
            )
            
            if sequence_id in self._cancelled_sequences:
                logger.info(f"🛑 Workflow {sequence_id} marked as cancelled before execution start")
                self._cancelled_sequences.discard(sequence_id)
                return

            for idx, step in enumerate(plan.workflow_steps):
                if sequence_id in self._cancelled_sequences:
                    logger.info(f"🛑 Workflow {sequence_id} cancelled before executing step {step.step_number}")
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
                        "workflow_stopped (pre-step)"
                    )
                    return

                await self._execute_step_with_events(
                    websocket=websocket,
                    step=step,
                    plan=plan,
                    sequence_id=sequence_id,
                    original_prompt=effective_user_prompt,
                    project_context=project_context,
                    user_id=user_id,
                    available_files=available_files
                )
                
                # Wait for user approval between steps (if not last step)
                if idx < len(plan.workflow_steps) - 1:
                    logger.info(f"⏸️ Waiting for approval before step {step.step_number + 1}...")
                    
                    step_approved = False
                    workflow_rejected = False
                    
                    while not step_approved and not workflow_rejected:
                        try:
                            message_data = await websocket.receive_text()
                            approval_msg = json.loads(message_data)
                            
                            logger.info(f"📨 Received step approval message: {approval_msg}")
                            
                            if approval_msg.get('type') == 'approve_step':
                                if approval_msg.get('step_number') == step.step_number:
                                    try:
                                        await self._auto_save_step(
                                            sequence_id=sequence_id,
                                            step_number=step.step_number,
                                            workflow_step=step,
                                            available_files=available_files
                                        )
                                    except Exception as save_error:
                                        logger.error(f"❌ Auto-save failed for step {step.step_number}: {save_error}")
                                        await self._send_event(
                                            websocket,
                                            WebSocketEvent(
                                                "error",
                                                {
                                                    "sequence_id": sequence_id,
                                                    "error": str(save_error),
                                                    "message": f"Auto-save failed for step {step.step_number}: {save_error}"
                                                }
                                            ),
                                            "auto-save error event"
                                        )
                                        workflow_rejected = True
                                        break

                                    step_approved = True
                                    logger.info(f"✅ Step {step.step_number} approved - continuing to next step")
                                else:
                                    logger.warning(f"⚠️ Approval message for wrong step (expected {step.step_number}, got {approval_msg.get('step_number')})")
                            
                            elif approval_msg.get('type') == 'reject_workflow':
                                workflow_rejected = True
                                logger.info(f"❌ Workflow rejected at step {step.step_number}")
                                await self._send_event(
                                    websocket,
                                    WebSocketEvent(
                                        "workflow_rejected",
                                        {"message": f"Workflow rejected by user at step {step.step_number}", "sequence_id": sequence_id}
                                    ),
                                    "workflow_rejected step phase"
                                )
                                return
                            
                            elif approval_msg.get('type') == 'add_info':
                                # User added info between steps - regenerate remaining steps
                                additional_info = approval_msg.get('additional_info', '')
                                original_prompt = approval_msg.get('original_prompt', user_prompt)
                                
                                logger.info(f"➕ User added info at step {step.step_number}: {additional_info}")
                                
                                # Get previous results
                                previous_results = self.result_storage.get_sequence_results(sequence_id)
                                
                                # Regenerate remaining steps with additional info
                                remaining_steps = plan.workflow_steps[idx + 1:]
                                if remaining_steps:
                                    # Combine original prompt with additional info for remaining steps
                                    combined_prompt = f"{original_prompt}. Additional requirements for remaining steps: {additional_info}"
                                    combined_with_history = self._apply_history_context(combined_prompt, history_summary)
                                    updated_focus = self._merge_file_references(
                                        self._chat_file_mentions.get(sequence_id),
                                        self._extract_file_names_from_prompt(additional_info),
                                    )
                                    if updated_focus:
                                        self._chat_file_mentions[sequence_id] = updated_focus
                                        combined_with_history = self._append_file_focus_note(combined_with_history, updated_focus)
                                    
                                    # Regenerate workflow and filter to remaining steps
                                    new_workflow_steps, prompt_files, files_exist = await self._generate_workflow_with_llm(
                                        user_prompt=combined_with_history,
                                        available_files=available_files,
                                        priority_files=updated_focus
                                    )
                                    
                                    # Update plan with new remaining steps enriched with prompts
                                    new_remaining_steps = self._build_enriched_plan(
                                        workflow_steps_raw=new_workflow_steps,
                                        prompt_files=prompt_files,
                                        available_files=available_files,
                                        start_index=step.step_number + 1,
                                        initial_previous_alias=step.output_alias
                                    )

                                    # Replace remaining steps in plan
                                    plan.workflow_steps = plan.workflow_steps[:idx + 1] + new_remaining_steps
                                    plan.total_steps = len(plan.workflow_steps)
                                    
                                    # Send updated plan
                                    await self._send_event(
                                        websocket,
                                        WebSocketEvent(
                                            "plan_updated",
                                            {
                                                "plan": plan.to_dict(),
                                                "sequence_id": sequence_id,
                                                "total_steps": plan.total_steps,
                                                "updated_from_step": step.step_number + 1
                                            }
                                        ),
                                        "plan_updated event"
                                    )
                                    
                                    logger.info(f"✅ Updated workflow: {len(new_remaining_steps)} new steps from step {step.step_number + 1}")
                                    
                                    # Continue to next step (which is now updated)
                                    step_approved = True
                            elif approval_msg.get('type') == 'stop_workflow':
                                logger.info(f"🛑 Workflow {sequence_id} stopped by user at step {step.step_number}")
                                self._cancelled_sequences.add(sequence_id)
                                await self._send_event(
                                    websocket,
                                    WebSocketEvent(
                                        "workflow_stopped",
                                        {
                                            "message": f"Workflow stopped by user at step {step.step_number}",
                                            "sequence_id": sequence_id
                                        }
                                    ),
                                    "workflow_stopped (step phase)"
                                )
                                return
                        except WebSocketDisconnect:
                            logger.info("🔌 WebSocket disconnected while waiting for step approval")
                            return
                        except Exception as e:
                            logger.error(f"❌ Error waiting for step approval: {e}")
                            break
                    
                    if workflow_rejected:
                        return
            
            # Send workflow completed
            await self._send_event(
                websocket,
                WebSocketEvent(
                    "workflow_completed",
                    {
                        "sequence_id": sequence_id,
                        "total_steps": plan.total_steps,
                        "message": "All steps completed successfully!"
                    }
                ),
                "workflow_completed event"
            )
            
            logger.info(f"✅ Workflow completed: {sequence_id}")

            await self._emit_workflow_insight(
                websocket=websocket,
                sequence_id=sequence_id,
                plan=plan,
                user_prompt=user_prompt,
                project_context=project_context,
                additional_context=history_summary or "",
            )
            
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
        finally:
            self._cleanup_sequence_state(sequence_id)
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
        available_files: List[str]
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
                    workflow_step=step
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
            
            # ================================================================
            # PHASE B: CREATE EMPTY CARD (Like SuperAgent)
            # ================================================================
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
                f"card_created event (step {step_number})"
            )
            
            logger.info(f"✅ Card created: {card_id}")
            
            # ================================================================
            # PHASE C: EXECUTE ATOM TO GET RESULTS
            # ================================================================
            logger.info(f"⚙️ Executing atom {atom_id}...")
            
            execution_result = await self._execute_atom_with_retry(
                atom_id=atom_id,
                parameters=parameters,
                session_id=sequence_id,
                step_number=step_number,
                sequence_id=sequence_id,
                websocket=websocket,
            )

            execution_success = bool(execution_result.get("success", True))
            insight_text = await self._generate_step_insight(
                step=step,
                total_steps=plan.total_steps,
                atom_prompt=atom_prompt,
                parameters=parameters,
                execution_result=execution_result,
                execution_success=execution_success
            )
            
            logger.info(f"✅ Atom executed: {json.dumps(execution_result, indent=2)[:150]}...")
            self._record_step_execution_result(
                sequence_id=sequence_id,
                step_number=step_number,
                atom_id=atom_id,
                execution_result=execution_result,
                insight=insight_text
            )
            # ================================================================
            # EVENT 3: AGENT_EXECUTED (Frontend will call atom handler)
            # ================================================================
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
                        "insight": insight_text
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
                        "insight": insight_text
                    }
                ),
                f"step_completed event (step {step_number})"
            )
            
            logger.info(f"✅ Step {step_number} completed")
            
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
    
    def _resolve_step_dependencies(self, sequence_id: str, step: WorkflowStepPlan) -> None:
        """Replace alias placeholders with the actual file paths produced earlier."""
        alias_map = self._output_alias_registry.get(sequence_id)
        if not alias_map:
            return

        def resolve_list(values: Optional[List[str]]) -> Optional[List[str]]:
            if not values:
                return values
            updated: List[str] = []
            changed = False
            for entry in values:
                resolved = self._resolve_alias_value(sequence_id, entry)
                if resolved != entry:
                    changed = True
                updated.append(resolved)
            return updated if changed else values

        resolved_inputs = resolve_list(step.inputs)
        if resolved_inputs is not step.inputs:
            step.inputs = resolved_inputs or []

        resolved_files = resolve_list(step.files_used)
        if resolved_files is not step.files_used:
            step.files_used = resolved_files or []

        if not step.files_used and step.inputs:
            step.files_used = step.inputs.copy()

    def _register_output_alias(self, sequence_id: str, alias: Optional[str], file_path: Optional[str]) -> None:
        """Track which file path was produced for a given output alias."""
        if not alias or not file_path:
            return
        alias_map = self._output_alias_registry.setdefault(sequence_id, {})
        normalized = self._normalize_alias_token(alias)
        alias_map[alias.strip()] = file_path
        alias_map[normalized] = file_path

    def _resolve_alias_value(self, sequence_id: str, token: Optional[str]) -> Optional[str]:
        """Resolve an alias token to the stored file path if available."""
        if not token:
            return token
        alias_map = self._output_alias_registry.get(sequence_id)
        if not alias_map:
            return token
        stripped = token.strip()
        normalized = self._normalize_alias_token(stripped)
        return alias_map.get(stripped) or alias_map.get(normalized) or token

    def _normalize_alias_token(self, alias: str) -> str:
        """Normalize alias references (strip braces, spaces, lowercase)."""
        return re.sub(r"\s+", "", alias.strip("{} ").lower())
    
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

    def _build_step_insight_prompt(
        self,
        step: WorkflowStepPlan,
        total_steps: int,
        atom_prompt: str,
        parameters: Dict[str, Any],
        execution_result: Dict[str, Any],
        execution_success: bool
    ) -> str:
        """Construct the narrative prompt for the insight LLM."""
        base_prompt = atom_prompt or step.atom_prompt or step.prompt or ""
        if not base_prompt and not execution_result:
            return ""

        params_str = self._safe_json_dumps(parameters or {}, fallback="{}")
        result_preview = self._extract_result_preview(execution_result)

        status_text = "SUCCESS" if execution_success else "FAILED"
        output_alias = step.output_alias or "not_specified"
        files_used = ", ".join(step.files_used or []) or "none"
        inputs_used = ", ".join(step.inputs or []) or "none"

        return (
            "You are Workstream AI Insights, a narrator that explains each workflow step in plain language.\n"
            "Summarize what the step accomplished, what tangible outputs we now possess, "
            "and how it positions the user for the following step.\n\n"
            "STEP CONTEXT\n"
            f"- Step: {step.step_number} of {total_steps}\n"
            f"- Atom ID: {step.atom_id}\n"
            f"- Planner Description: {step.description}\n"
            f"- Files Referenced: {files_used}\n"
            f"- Inputs: {inputs_used}\n"
            f"- Output Handle: {output_alias}\n"
            f"- Execution Status: {status_text}\n\n"
            "PROMPT SENT TO ATOM\n"
            f"{base_prompt}\n\n"
            "ATOM PARAMETERS\n"
            f"{params_str}\n\n"
            "RESULT SNAPSHOT\n"
            f"{result_preview}\n\n"
            "RESPONSE REQUIREMENTS\n"
            "- Keep total response under 120 words.\n"
            "- Use Markdown with three sections in this order:\n"
            "  1. Step Summary – 1-2 sentences describing what happened and outcome.\n"
            "  2. What We Obtained – bullet list (max 3) referencing concrete outputs, mention "
            f"`{output_alias}` when relevant.\n"
            "  3. Ready For Next Step – single sentence explaining how the result can be used next.\n"
            "- Call out blockers or missing data if the step failed.\n"
            "- Do not fabricate metrics; rely only on the supplied snapshot.\n"
        )

    async def _call_insight_llm(self, prompt: str) -> Optional[str]:
        """Invoke the configured LLM to obtain a step insight."""
        if not prompt.strip():
            return None
        if aiohttp is None:
            return None

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
                    if response.status >= 400:
                        error_text = await response.text()
                        logger.warning(
                            f"⚠️ Insight LLM call failed: HTTP {response.status} {error_text[:200]}"
                        )
                        return None
                    body = await response.json()
        except Exception as req_error:
            logger.warning(f"⚠️ Insight LLM request error: {req_error}")
            return None

        content = ""
        if isinstance(body, dict):
            choices = body.get("choices")
            if choices:
                content = choices[0].get("message", {}).get("content", "")
            elif "message" in body:
                content = body["message"].get("content", "")

        return content.strip() or None

    def _extract_result_preview(self, data: Any, max_chars: int = 2000) -> str:
        """Serialize execution result data into a bounded-length snippet."""
        if data is None:
            return "No execution result payload returned."
        try:
            serialized = json.dumps(data, indent=2, default=str)
        except (TypeError, ValueError):
            serialized = str(data)

        if len(serialized) > max_chars:
            return f"{serialized[:max_chars]}... (truncated)"
        return serialized

    def _safe_json_dumps(self, payload: Any, fallback: str = "{}") -> str:
        """Serialize parameters safely for inclusion in prompts."""
        if payload is None:
            return fallback
        try:
            return json.dumps(payload, indent=2, default=str)
        except (TypeError, ValueError):
            return str(payload)

    async def _auto_save_step(
        self,
        sequence_id: str,
        step_number: int,
        workflow_step: WorkflowStepPlan,
        available_files: List[str]
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
                step_cache=step_cache
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

    async def _auto_save_create_transform(
        self,
        workflow_step: WorkflowStepPlan,
        execution_result: Dict[str, Any],
        step_cache: Dict[str, Any]
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
                    cached_url = f"{self.fastapi_base_url}/api/create-column/cached_dataframe?object_name={file_ref}"
                    response = await self._get_json(cached_url)
                    csv_data = response.get("data")
                    logger.info(f"✅ Retrieved CSV data from cached_dataframe endpoint")
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

    def _normalize_config_file_value(self, value: Any) -> str:
        """Normalize file value from config to a usable string."""
        if isinstance(value, list):
            value = value[0] if value else ""
        if value is None:
            return ""
        return str(value).strip()

    def _extract_filename(self, value: str) -> str:
        """Normalize stored object names for downstream API calls.

        Keep full object path when provided (e.g. includes sub-directories like
        `concatenated-data/`), but strip leading control characters such as '@'
        and normalise path separators.
        """
        if not value:
            return value

        normalized = str(value).strip()
        if normalized.startswith("@"):
            normalized = normalized[1:]

        normalized = normalized.replace("\\", "/")
        logger.info(f"📁 Normalized file reference: original='{value}' normalized='{normalized}'")
        return normalized

    def _build_auto_save_filename(
        self,
        workflow_step: WorkflowStepPlan,
        default_prefix: str
    ) -> str:
        """Construct deterministic filename for auto-saved outputs."""
        base = workflow_step.output_alias or f"{default_prefix}_step_{workflow_step.step_number}"
        sanitized = self._sanitize_filename(base)
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        filename = f"{sanitized}_{timestamp}"
        if not filename.endswith(".arrow"):
            filename += ".arrow"
        return filename

    def _sanitize_filename(self, value: str) -> str:
        """Sanitize filename to include only safe characters."""
        if not value:
            return "stream_step"
        sanitized = re.sub(r'[^A-Za-z0-9_\-]+', "_", value).strip("_")
        return sanitized or "stream_step"

    def _record_step_execution_result(
        self,
        sequence_id: str,
        step_number: int,
        atom_id: str,
        execution_result: Dict[str, Any],
        insight: Optional[str] = None
    ) -> None:
        """Cache step execution results and generated insights for later use."""
        cache = self._step_execution_cache.setdefault(sequence_id, {})
        cache[step_number] = {
            "atom_id": atom_id,
            "execution_result": execution_result,
            "recorded_at": datetime.utcnow().isoformat(),
            "insight": insight
        }

    def _collect_workflow_step_records(
        self,
        sequence_id: str,
        plan: WorkflowPlan
    ) -> List[Dict[str, Any]]:
        """Prepare structured step records for the workflow insight agent."""
        cache = self._step_execution_cache.get(sequence_id, {})
        if not cache:
            return []

        saved_files = self._step_output_files.get(sequence_id, {}) or {}
        records: List[Dict[str, Any]] = []

        for step in plan.workflow_steps:
            step_cache = cache.get(step.step_number)
            if not step_cache:
                continue

            execution_result = step_cache.get("execution_result")
            record = {
                "step_number": step.step_number,
                "agent": step.atom_id,
                "description": step.description,
                "insight": step_cache.get("insight"),
                "result_preview": self._extract_result_preview(execution_result),
                "output_files": [],
            }

            saved_path = saved_files.get(step.step_number)
            if saved_path:
                record["output_files"].append(saved_path)

            records.append(record)

        return records

    def _collect_generated_files(self, sequence_id: str) -> List[str]:
        """Return all files auto-saved during the workflow."""
        step_outputs = self._step_output_files.get(sequence_id)
        if not step_outputs:
            return []
        return list(dict.fromkeys(step_outputs.values()))

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
                return

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
        except Exception as exc:  # pragma: no cover - defensive logging
            logger.warning("⚠️ Failed to emit workflow insight: %s", exc)
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
            except Exception:
                logger.debug("Unable to notify client about workflow insight failure")

    async def _send_event(
        self,
        websocket,
        event: WebSocketEvent,
        context: str
    ) -> None:
        """Safely send WebSocket event, converting close errors to disconnects."""
        try:
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

    def _cleanup_sequence_state(self, sequence_id: str) -> None:
        """Remove cached data for a sequence after completion."""
        self._step_execution_cache.pop(sequence_id, None)
        self._step_output_files.pop(sequence_id, None)
        self._sequence_available_files.pop(sequence_id, None)
        self._output_alias_registry.pop(sequence_id, None)
        self._chat_file_mentions.pop(sequence_id, None)

    def _load_persisted_chat_summary(
        self,
        chat_id: Optional[str],
        project_context: Optional[Dict[str, Any]],
    ) -> Optional[str]:
        if not chat_id or not self._memory_storage:
            return None

        context = project_context or {}
        client_name = context.get("client_name")
        app_name = context.get("app_name")
        project_name = context.get("project_name")

        try:
            record = self._memory_storage.load_chat(
                chat_id,
                client_name=client_name,
                app_name=app_name,
                project_name=project_name,
            )
        except Exception as exc:  # pragma: no cover - defensive logging
            logger.warning("⚠️ Failed to load persisted chat %s: %s", chat_id, exc)
            return None

        if not record:
            return None

        messages = record.get("messages") or []
        if not messages:
            return None

        if self._memory_summarizer:
            return self._memory_summarizer(messages)
        return self._fallback_history_summary(messages)

    def _fallback_history_summary(
        self,
        messages: List[Dict[str, Any]],
        limit: int = 6,
    ) -> str:
        lines: List[str] = []
        for msg in messages[-limit:]:
            sender_raw = str(msg.get("sender") or msg.get("role") or "assistant").strip()
            sender = sender_raw.capitalize() or "Assistant"
            content = self._condense_text(str(msg.get("content") or ""))
            if not content:
                continue
            if len(content) > 180:
                content = content[:177].rstrip() + "..."
            lines.append(f"{sender}: {content}")
        return "\n".join(lines)

    def _apply_history_context(self, latest_prompt: str, history_summary: Optional[str]) -> str:
        if not history_summary:
            return latest_prompt
        summary = history_summary.strip()
        if not summary:
            return latest_prompt
        latest = latest_prompt.strip()
        combined = (
            "Previous conversation summary (use it for continuity, avoid repeating completed work):\n"
            f"{summary}\n\n"
            "Latest user request:\n"
            f"{latest}"
        )
        return combined.strip()

    def _combine_history_sources(
        self,
        frontend_summary: Optional[str],
        persisted_summary: Optional[str],
    ) -> Optional[str]:
        parts: List[str] = []
        for source in (frontend_summary, persisted_summary):
            if source and source.strip():
                parts.append(source.strip())
        if not parts:
            return None
        if len(parts) == 1:
            return parts[0]
        return "\n\n".join(parts)

    def _append_file_focus_note(self, prompt: str, files: Optional[List[str]]) -> str:
        if not files:
            return prompt
        sanitized = [f for f in files if isinstance(f, str) and f.strip()]
        if not sanitized:
            return prompt
        file_lines = "\n".join(f"- {entry.strip()}" for entry in sanitized[:10])
        note = (
            "\n\nFiles referenced in this chat (preserve these exact names and prioritize their usage):\n"
            f"{file_lines}"
        )
        return f"{prompt}{note}"

    def _normalize_file_reference(self, value: Optional[str]) -> Optional[str]:
        if not value or not isinstance(value, str):
            return None
        cleaned = value.strip()
        return cleaned or None

    def _merge_file_references(
        self,
        existing: Optional[List[str]],
        new_refs: Optional[List[str]],
    ) -> List[str]:
        merged: List[str] = []
        seen: Set[str] = set()

        def _add(values: Optional[List[str]]) -> None:
            if not values:
                return
            for entry in values:
                if not isinstance(entry, str):
                    continue
                cleaned = self._normalize_file_reference(entry)
                if not cleaned:
                    continue
                key = cleaned.lower()
                if key in seen:
                    continue
                seen.add(key)
                merged.append(cleaned)

        _add(existing)
        _add(new_refs)
        return merged

    def _determine_fastapi_base_url(self) -> str:
        """Resolve FastAPI base URL for downstream atom services."""
        base_url = os.getenv("FASTAPI_BASE_URL")
        if base_url:
            return base_url.rstrip("/")

        host = os.getenv("FASTAPI_HOST") or os.getenv("HOST_IP")
        port = os.getenv("FASTAPI_PORT")

        if host and port:
            return f"http://{host}:{port}".rstrip("/")

        # Heuristic defaults
        default_host = host or "localhost"
        # If running inside docker compose, fastapi service usually on 8001
        default_port = "8001" if os.getenv("RUNNING_IN_DOCKER") else "8002"

        return f"http://{default_host}:{port or default_port}".rstrip("/")

    async def _generate_simple_parameters(
        self,
        atom_id: str,
        original_prompt: str,
        available_files: List[str],
        step_prompt: Optional[str] = None,
        workflow_step: Optional[WorkflowStepPlan] = None
    ) -> Dict[str, Any]:
        """
        Generate an enriched natural-language prompt for downstream atom execution.
        Ensures we pass explicit dataset references and slot details so the atom LLM
        can produce a precise configuration without re-deriving context.
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

        user_summary = self._condense_text(original_prompt)
        description_summary = self._condense_text(step_description)

        header_lines: List[str] = [
            f"Atom: `{atom_id}`",
            f"User goal: {user_summary}"
        ]
        if description_summary:
            header_lines.append(f"Step goal: {description_summary}")
        header_lines.append("Respond with configuration details only – no filler text.")

        header_section = "\n".join(header_lines)
        dataset_section = self._build_dataset_section(atom_id, files_used, inputs, output_alias)
        atom_section = self._build_atom_instruction_section(atom_id, original_prompt, files_used, inputs)
        available_section = self._build_available_files_section(available_files)
        planner_section = self._build_planner_guidance_section(planner_prompt)

        prompt_sections = [
            header_section,
            dataset_section,
            atom_section,
            available_section,
            planner_section
        ]

        final_prompt = "\n\n".join(section for section in prompt_sections if section and section.strip())

        return {
            "prompt": final_prompt,
            "available_files": available_files
        }

    def _build_dataset_section(
        self,
        atom_id: str,
        files_used: List[str],
        inputs: List[str],
        output_alias: Optional[str]
    ) -> str:
        files_used = self._ensure_list_of_strings(files_used)
        inputs = self._ensure_list_of_strings(inputs)

        lines: List[str] = []

        def append_line(label: str, value: Optional[str]) -> None:
            if value:
                lines.append(f"- {label}: `{value}`")

        if atom_id == "merge":
            left = files_used[0] if len(files_used) > 0 else (inputs[0] if inputs else None)
            right = files_used[1] if len(files_used) > 1 else (inputs[1] if len(inputs) > 1 else None)
            append_line("Left source", left)
            append_line("Right source", right)
            if not left or not right:
                lines.append("- Source datasets missing: identify both left and right inputs before executing the merge.")
        elif atom_id == "concat":
            if files_used:
                for idx, source in enumerate(files_used, start=1):
                    append_line(f"Source {idx}", source)
            elif inputs:
                append_line("Primary source", inputs[0])
        else:
            primary_input = inputs[0] if inputs else (files_used[0] if files_used else None)
            append_line("Input dataset", primary_input)

        if output_alias:
            append_line("Output alias for downstream steps", output_alias)

        if not lines:
            lines.append("- Determine the correct input datasets using the workflow context.")

        return "Datasets & dependencies:\n" + "\n".join(lines)

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
        return self._build_generic_section(atom_id, original_prompt)

    def _build_available_files_section(self, available_files: List[str]) -> str:
        if not available_files:
            return ""
        max_files = 5
        lines = [f"- {path}" for path in available_files[:max_files]]
        if len(available_files) > max_files:
            lines.append(f"- (+{len(available_files) - max_files} more)")
        return "Workspace file inventory:\n" + "\n".join(lines)

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

        lines: List[str] = ["Merge requirements:"]

        if join_type:
            lines.append(f"- Join type: {join_type}")
        else:
            lines.append("- Join type: Determine the most appropriate join type; default to `inner` if the user did not specify.")

        if join_columns:
            formatted = ", ".join(join_columns)
            lines.append(f"- Join columns: {formatted}")
        elif requires_common:
            lines.append("- Join columns: Automatically detect the overlapping column names shared by both datasets (user requested common columns).")
        else:
            lines.append("- Join columns: Inspect both datasets and choose matching identifier columns (e.g., customer_id, order_id) when the user does not specify.")

        if files_used and len(files_used) == 1:
            lines.append("- Secondary dataset: Confirm the second dataset to merge since only one source was resolved.")

        lines.append("- Preserve relevant columns and resolve duplicate suffixes according to user intent.")
        return "\n".join(lines)

    def _build_groupby_section(self, original_prompt: str, possible_inputs: List[str]) -> str:
        group_columns = self._extract_group_columns(original_prompt)
        aggregation_details = self._extract_aggregation_details(original_prompt)

        lines: List[str] = ["Aggregation requirements:"]

        if group_columns:
            lines.append(f"- Group columns: {', '.join(group_columns)}")
        else:
            lines.append("- Group columns: Identify the categorical dimensions that best align with the user's request.")

        if aggregation_details["metrics"]:
            lines.append("- Metrics to compute:")
            for metric in aggregation_details["metrics"]:
                aggregation = metric["aggregation"]
                column = metric["column"]
                detail = f"{aggregation} of {column}"
                if aggregation == "weighted_avg" and aggregation_details.get("weight_column"):
                    detail += f" (weight column `{aggregation_details['weight_column']}`)"
                lines.append(f"  * {detail}")
        else:
            lines.append("- Metrics to compute: Select meaningful numeric measures (sum, average, count) based on dataset profiling when none are specified.")

        weight_column = aggregation_details.get("weight_column")
        if weight_column and all(metric["aggregation"] != "weighted_avg" for metric in aggregation_details["metrics"]):
            lines.append(f"- Weighting: The user referenced weights; consider `{weight_column}` for weighted averages.")
        elif not weight_column and any("weight" in token.lower() for token in original_prompt.split()):
            lines.append("- Weighting: User mentioned weights; detect the correct weight field before computing weighted metrics.")

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
            lines.append("  * Extract column names from prompt (case-insensitive matching)")
            lines.append("  * Ensure formulas start with '=' prefix (required by backend)")
            lines.append("  * Example: 'PROD(Price, Volume)' → '=PROD(Price, Volume)'")
            lines.append("  * Target column: Create new column or overwrite existing based on user intent")
        
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

        lines: List[str] = ["Chart configuration (return JSON only):"]
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
        lines.append("Rules:")
        lines.append("- Use EXACT column names from dataset metadata (case-sensitive, spaces preserved).")
        lines.append("- If the user used abbreviations (e.g., 'reg', 'rev'), map them to the canonical column names before filling the JSON.")
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

        if possible_inputs:
            lines.append(f"- Use dataset: `{possible_inputs[0]}` as data_source.")

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
    
    async def _execute_atom_with_retry(
        self,
        *,
        atom_id: str,
        parameters: Dict[str, Any],
        session_id: str,
        step_number: int,
        sequence_id: str,
        websocket
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
        session_id: str
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

