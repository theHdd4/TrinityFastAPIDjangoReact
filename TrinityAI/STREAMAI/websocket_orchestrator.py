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
from typing import Dict, Any, List, Optional, Tuple
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

try:
    import aiohttp  # type: ignore
except ImportError:  # pragma: no cover
    aiohttp = None  # type: ignore

logger = logging.getLogger("trinity.trinityai.websocket")


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

    def to_dict(self) -> Dict[str, Any]:
        return {
            "step_number": self.step_number,
            "atom_id": self.atom_id,
            "description": self.description,
            "prompt": self.prompt,
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

        # In-memory caches for step execution data and outputs
        self._step_execution_cache: Dict[str, Dict[int, Dict[str, Any]]] = {}
        self._step_output_files: Dict[str, Dict[int, str]] = {}
        self._sequence_available_files: Dict[str, List[str]] = {}

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
        
        logger.info("✅ StreamWebSocketOrchestrator initialized")
    
    def _load_atom_mapping(self):
        """Load atom mapping"""
        try:
            self.atom_mapping = ATOM_MAPPING
            logger.info(f"✅ Loaded atom mapping for {len(ATOM_MAPPING)} atoms")
        except Exception as e:
            logger.error(f"❌ Failed to load atom mapping: {e}")
            self.atom_mapping = {}
    
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

4. **dataframe-operations** - Filter, Sort, Select
   - Capability: Filters rows, sorts data, selects/drops columns
   - Use when: User wants to filter, sort, select, remove, or drop data
   - Keywords: filter, where, sort, select, drop, remove, keep, only
   - Output: dataframe_config with operations list
   - Example: "Filter sales where revenue > 1000 and sort by date"

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

8. **explore** / **feature-overview** - Data Exploration
   - Capability: Provides statistical overview and data profiling
   - Use when: User wants to explore, understand, or get overview of data
   - Keywords: explore, overview, summary, statistics, analyze, understand
   - Output: exploration_config with analysis settings
   - Example: "Explore the sales dataset and show statistics"

9. **data-upload-validate** - Load Data
   - Capability: Loads and validates data files (CSV, Excel, Arrow)
   - Use when: Files don't exist yet and need to be uploaded
   - Keywords: load, upload, import, read
   - Output: File validation results
   - Example: "Load sales.csv file"
   - NOTE: Skip this if files already exist in available_files!

WORKFLOW PLANNING RULES:
- Put data loading (data-upload-validate) FIRST only if files don't exist
- Put data transformations (merge, concat, filter, groupby) BEFORE visualization
- Put chart-maker or visualization atoms LAST
- Each step should build on previous steps
- Keep workflows simple and focused (2-4 steps is ideal)
- Consider data dependencies between steps
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
        
        # Check for matches
        matches = []
        for pf in prompt_files:
            # Check exact match
            if pf in available_normalized:
                matches.append(pf)
            else:
                # Check partial match (filename contains prompt file)
                for af in available_normalized:
                    if pf in af or af in pf:
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
            lookup.setdefault(key, []).append(display)
        return display_names, lookup

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

    def _compose_prompt(
        self,
        atom_id: str,
        description: str,
        guidance: Dict[str, Any],
        files_used: List[str],
        inputs: List[str],
        output_alias: str
    ) -> str:
        """Build a natural language prompt for downstream atom execution."""
        description_text = description.strip() or guidance.get("purpose", "Perform the requested operation")
        if not description_text.endswith('.'):  # ensure sentence end
            description_text += '.'

        lines: List[str] = []

        if files_used:
            if len(files_used) == 1:
                lines.append(f"Use dataset `{files_used[0]}` as the primary input.")
            else:
                formatted = ', '.join(f"`{name}`" for name in files_used)
                lines.append(f"Use datasets {formatted} as inputs.")
        elif inputs:
            if len(inputs) == 1:
                lines.append(f"Use dataset `{inputs[0]}` produced in earlier steps.")
            else:
                formatted = ', '.join(f"`{alias}`" for alias in inputs)
                lines.append(f"Use datasets {formatted} produced in earlier steps.")
        else:
            lines.append("Ask the user to provide or confirm the correct dataset before executing this atom.")

        lines.append(description_text)

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

        lines.append(f"Return the result as `{output_alias}` for downstream steps.")

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
        previous_alias: Optional[str] = initial_previous_alias

        for idx, raw_step in enumerate(workflow_steps_raw, start_index):
            atom_id = raw_step.get("atom_id", "unknown")
            description = raw_step.get("description", "").strip()
            output_alias = f"{atom_id.replace('-', '_')}_step_{idx}"

            guidance = {}
            if self.rag_engine:
                guidance = self.rag_engine.get_atom_prompt_guidance(atom_id)

            files_required = 0
            if atom_id == "data-upload-validate":
                files_required = 1
            elif atom_id in {"merge", "concat"}:
                files_required = 2

            files_used: List[str] = []
            for _ in range(files_required):
                if matched_queue:
                    files_used.append(matched_queue.pop(0))
                elif remaining_available:
                    files_used.append(remaining_available.pop(0))

            inputs: List[str] = []
            if atom_id in {"merge", "concat"}:
                inputs = files_used.copy()
                if len(inputs) < files_required and previous_alias:
                    inputs.append(previous_alias)
            elif atom_id == "data-upload-validate":
                inputs = []
            else:
                if previous_alias:
                    inputs = [previous_alias]
                elif files_used:
                    inputs = files_used.copy()

            prompt_text = self._compose_prompt(atom_id, description, guidance, files_used, inputs, output_alias)

            enriched_steps.append(
                WorkflowStepPlan(
                    step_number=idx,
                    atom_id=atom_id,
                    description=description or guidance.get("purpose", ""),
                    prompt=prompt_text,
                    files_used=files_used,
                    inputs=inputs,
                    output_alias=output_alias
                )
            )

            previous_alias = output_alias

        return enriched_steps

    async def _generate_workflow_with_llm(
        self,
        user_prompt: str,
        available_files: List[str]
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
        
        # Extract files mentioned in prompt
        prompt_files = self._extract_file_names_from_prompt(user_prompt)
        files_exist = self._match_files_with_available(prompt_files, available_files) if available_files else False
        
        # Get atom capabilities
        atom_knowledge = self._get_atom_capabilities_for_llm()
        
        # Build LLM prompt
        files_str = "\n".join([f"  - {f}" for f in available_files]) if available_files else "  (No files available yet)"
        
        # Enhanced prompt with file matching information
        file_instruction = ""
        if files_exist and available_files:
            file_instruction = f"""
CRITICAL FILE INFORMATION:
- The user mentioned files in their request: {', '.join(prompt_files)}
- These files ALREADY EXIST in the system: {', '.join([f.split('/')[-1] for f in available_files[:3]])}
- DO NOT include 'data-upload-validate' steps - files are already uploaded!
- Start directly with the data processing step (merge, concat, etc.)
"""
        
        llm_prompt = f"""You are a data analysis workflow planner. Your task is to create a step-by-step workflow to accomplish the user's request.

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
{"- ⚠️ CRITICAL: Files mentioned in user request already exist in available_files. DO NOT include 'data-upload-validate' steps. Start directly with data processing!" if files_exist else "- If files don't exist, include 'data-upload-validate' as the first step"}
- Keep workflow simple (2-4 steps)
- Put transformations before visualizations
- Each step should logically follow the previous one

Respond ONLY with valid JSON array, no other text:
[
  {{"atom_id": "merge", "description": "Merge the two datasets"}},
  {{"atom_id": "chart-maker", "description": "Visualize the merged data"}}
]
"""
        
        logger.info(f"🤖 Calling LLM for workflow generation...")
        logger.info(f"📝 Prompt length: {len(llm_prompt)} chars")
        
        try:
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
                    
                    workflow_steps = json.loads(content)
                    
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
                    
        except json.JSONDecodeError as e:
            logger.error(f"❌ Failed to parse LLM response as JSON: {e}")
            logger.error(f"   Content: {content}")
            # Fallback to keyword-based
            return self._fallback_to_keywords(user_prompt, available_files), prompt_files, files_exist
        except Exception as e:
            logger.error(f"❌ LLM workflow generation failed: {e}")
            import traceback
            traceback.print_exc()
            # Fallback to keyword-based
            return self._fallback_to_keywords(user_prompt, available_files)
    
    def _fallback_to_keywords(self, user_prompt: str, available_files: List[str]) -> List[Dict[str, Any]]:
        """Fallback to simple keyword-based workflow generation"""
        logger.info("⚠️ Falling back to keyword-based workflow generation")
        query_lower = user_prompt.lower()
        steps = []
        
        # Extract files from prompt and check if they exist
        prompt_files = self._extract_file_names_from_prompt(user_prompt)
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
        
        if any(kw in query_lower for kw in ["filter", "sort", "select"]):
            steps.append({"atom_id": "dataframe-operations", "description": "Filter and transform data"})
        
        if any(kw in query_lower for kw in ["group", "aggregate", "sum", "mean"]):
            steps.append({"atom_id": "groupby-wtg-avg", "description": "Group and aggregate data"})
        
        if any(kw in query_lower for kw in ["chart", "plot", "graph", "visualize"]):
            steps.append({"atom_id": "chart-maker", "description": "Create visualization"})
        
        if not steps:
            # Default to explore if no keywords matched
            steps.append({"atom_id": "explore", "description": "Explore the data"})
        
        return steps
    
    async def execute_workflow_with_websocket(
        self,
        websocket,
        user_prompt: str,
        available_files: List[str],
        project_context: Dict[str, Any],
        user_id: str,
        frontend_session_id: Optional[str] = None,
        frontend_chat_id: Optional[str] = None
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
            
            # Use LLM to generate intelligent workflow
            workflow_steps_raw, prompt_files, files_exist = await self._generate_workflow_with_llm(
                user_prompt=user_prompt,
                available_files=available_files
            )
            
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
                        
                        logger.info(f"➕ Regenerating workflow with additional info: {additional_info}")
                        
                        # Regenerate workflow with combined prompt
                        workflow_steps_raw, prompt_files, files_exist = await self._generate_workflow_with_llm(
                            user_prompt=combined_prompt,
                            available_files=available_files
                        )
                        
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
            
            for idx, step in enumerate(plan.workflow_steps):
                await self._execute_step_with_events(
                    websocket=websocket,
                    step=step,
                    plan=plan,
                    sequence_id=sequence_id,
                    original_prompt=user_prompt,
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
                                    
                                    # Regenerate workflow and filter to remaining steps
                                    new_workflow_steps, prompt_files, files_exist = await self._generate_workflow_with_llm(
                                        user_prompt=combined_prompt,
                                        available_files=available_files
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
            # EVENT 1: STEP_STARTED
            # ================================================================
            logger.info(f"📍 Step {step_number}/{plan.total_steps}: {atom_id}")
            
            await self._send_event(
                websocket,
                WebSocketEvent(
                    "step_started",
                    {
                        "step": step_number,
                        "total_steps": plan.total_steps,
                        "atom_id": atom_id,
                        "description": step.description,
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
            parameters = await self._generate_simple_parameters(
                atom_id=atom_id,
                original_prompt=original_prompt,
                available_files=available_files,
                step_prompt=getattr(step, "prompt", None)
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
            
            execution_result = await self._execute_atom_endpoint(
                atom_id=atom_id,
                parameters=parameters,
                session_id=sequence_id
            )
            
            logger.info(f"✅ Atom executed: {json.dumps(execution_result, indent=2)[:150]}...")
            self._record_step_execution_result(
                sequence_id=sequence_id,
                step_number=step_number,
                atom_id=atom_id,
                execution_result=execution_result
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
                        "summary": f"Executed {atom_id}"
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
                        "sequence_id": sequence_id
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
        else:
            logger.info(f"ℹ️ Auto-save skipped for atom '{atom_id}' (no auto-save logic implemented)")
            return

        if not saved_path:
            raise ValueError(f"Auto-save did not return a saved file path for step {step_number}")

        # Track saved output
        self._step_output_files.setdefault(sequence_id, {})[step_number] = saved_path
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
                    "saved_at": step_cache["auto_saved_at"]
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
        """Extract filename component from possible path."""
        if not value:
            return value
        if "/" in value:
            value = value.split("/")[-1]
        if "\\" in value:
            value = value.split("\\")[-1]
        return value

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
        execution_result: Dict[str, Any]
    ) -> None:
        """Cache step execution results for later auto-save and lineage tracking."""
        cache = self._step_execution_cache.setdefault(sequence_id, {})
        cache[step_number] = {
            "atom_id": atom_id,
            "execution_result": execution_result,
            "recorded_at": datetime.utcnow().isoformat()
        }

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
        step_prompt: Optional[str] = None
    ) -> Dict[str, Any]:
        """Generate simple parameters from prompt"""
        # For atoms, just pass the prompt
        # The agent will use its own LLM to generate proper configuration
        return {
            "prompt": step_prompt or original_prompt,
            "available_files": available_files
        }
    
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

