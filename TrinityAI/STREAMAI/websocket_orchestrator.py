"""
WebSocket Orchestrator for Stream AI
=====================================

Handles real-time step-by-step workflow execution with WebSocket events.
Follows the exact SuperAgent pattern for proper card and result handling.
"""

import asyncio
import json
import logging
from typing import Dict, Any, List, Optional
from dataclasses import dataclass
import uuid

logger = logging.getLogger("trinity.streamai.websocket")


@dataclass
class WebSocketEvent:
    """WebSocket event to send to frontend"""
    type: str
    data: Dict[str, Any]
    
    def to_json(self) -> str:
        """Convert to JSON string"""
        return json.dumps({"type": self.type, **self.data})


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
        
        # Get LLM config (same as merge/concat agents)
        import os
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
            import sys
            from pathlib import Path
            sys.path.insert(0, str(Path(__file__).parent.parent))
            from SUPERAGENT.atom_mapping import ATOM_MAPPING
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
        
        found_files = []
        for pattern in patterns:
            matches = re.findall(pattern, user_prompt, re.IGNORECASE)
            found_files.extend(matches)
        
        # Remove duplicates and normalize
        found_files = list(set([f.lower() for f in found_files]))
        logger.info(f"📂 Extracted files from prompt: {found_files}")
        return found_files
    
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
    
    async def _generate_workflow_with_llm(
        self,
        user_prompt: str,
        available_files: List[str]
    ) -> List[Dict[str, Any]]:
        """
        Use LLM to generate workflow plan based on user prompt and atom capabilities.
        
        Args:
            user_prompt: User's request
            available_files: List of available file names
            
        Returns:
            List of workflow steps with atom_id and description
        """
        import aiohttp
        
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
                    
                    return workflow_steps
                    
        except json.JSONDecodeError as e:
            logger.error(f"❌ Failed to parse LLM response as JSON: {e}")
            logger.error(f"   Content: {content}")
            # Fallback to keyword-based
            return self._fallback_to_keywords(user_prompt, available_files)
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
        try:
            # Use frontend session ID if provided, otherwise generate new one
            sequence_id = frontend_session_id or f"seq_{uuid.uuid4().hex[:12]}"
            logger.info(f"🔑 Using session ID: {sequence_id} (Chat ID: {frontend_chat_id})")
            
            # Send connected event
            await websocket.send_text(WebSocketEvent(
                "connected",
                {"message": "Stream AI connected", "sequence_id": sequence_id}
            ).to_json())
            
            logger.info(f"🚀 Starting workflow for sequence: {sequence_id}")
            
            # ================================================================
            # PHASE 1: GENERATE PLAN (Using LLM with atom knowledge)
            # ================================================================
            logger.info("📋 PHASE 1: Generating workflow plan with LLM...")
            
            # Use LLM to generate intelligent workflow
            workflow_steps_raw = await self._generate_workflow_with_llm(
                user_prompt=user_prompt,
                available_files=available_files
            )
            
            # Create plan structure
            from dataclasses import dataclass
            
            @dataclass
            class SimpleStep:
                step_number: int
                atom_id: str
                description: str
            
            @dataclass
            class SimplePlan:
                workflow_steps: List[SimpleStep]
                total_steps: int
                
                def to_dict(self):
                    return {
                        "workflow_steps": [{"step_number": s.step_number, "atom_id": s.atom_id, "description": s.description} for s in self.workflow_steps],
                        "total_steps": self.total_steps
                    }
            
            plan = SimplePlan(
                workflow_steps=[
                    SimpleStep(
                        step_number=idx + 1,
                        atom_id=step.get('atom_id'),
                        description=step.get('description', '')
                    )
                    for idx, step in enumerate(workflow_steps_raw)
                ],
                total_steps=len(workflow_steps_raw)
            )
            
            logger.info(f"✅ Generated workflow with {plan.total_steps} steps")
            for step in plan.workflow_steps:
                logger.info(f"   Step {step.step_number}: {step.atom_id} - {step.description}")
            
            # Send plan_generated event
            await websocket.send_text(WebSocketEvent(
                "plan_generated",
                {
                    "plan": plan.to_dict(),
                    "sequence_id": sequence_id,
                    "total_steps": plan.total_steps
                }
            ).to_json())
            
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
                        await websocket.send_text(WebSocketEvent(
                            "workflow_rejected",
                            {"message": "Workflow rejected by user", "sequence_id": sequence_id}
                        ).to_json())
                        return  # Exit without executing
                    elif approval_msg.get('type') == 'add_info':
                        # User added info before step 1 - regenerate entire workflow
                        additional_info = approval_msg.get('additional_info', '')
                        original_prompt = approval_msg.get('original_prompt', user_prompt)
                        combined_prompt = f"{original_prompt}. Additional requirements: {additional_info}"
                        
                        logger.info(f"➕ Regenerating workflow with additional info: {additional_info}")
                        
                        # Regenerate workflow with combined prompt
                        workflow_steps_raw = await self._generate_workflow_with_llm(
                            user_prompt=combined_prompt,
                            available_files=available_files
                        )
                        
                        # Rebuild plan
                        plan = WorkflowPlan(
                            workflow_steps=[
                                WorkflowStep(
                                    step_number=idx + 1,
                                    atom_id=step.get('atom_id'),
                                    description=step.get('description', '')
                                )
                                for idx, step in enumerate(workflow_steps_raw)
                            ],
                            total_steps=len(workflow_steps_raw)
                        )
                        
                        # Send updated plan
                        await websocket.send_text(WebSocketEvent(
                            "plan_generated",
                            {
                                "plan": plan.to_dict(),
                                "sequence_id": sequence_id,
                                "total_steps": plan.total_steps
                            }
                        ).to_json())
                        
                        logger.info(f"✅ Regenerated workflow with {plan.total_steps} steps")
                        # Continue waiting for approval
                except Exception as e:
                    logger.error(f"❌ Error waiting for approval: {e}")
                    break
            
            if rejected:
                return  # Don't execute if rejected
            
            # ================================================================
            # PHASE 2: EXECUTE STEPS (after approval)
            # ================================================================
            logger.info("🚀 PHASE 2: Starting step-by-step execution...")
            
            await websocket.send_text(WebSocketEvent(
                "workflow_started",
                {
                    "sequence_id": sequence_id,
                    "total_steps": plan.total_steps
                }
            ).to_json())
            
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
                                    step_approved = True
                                    logger.info(f"✅ Step {step.step_number} approved - continuing to next step")
                                else:
                                    logger.warning(f"⚠️ Approval message for wrong step (expected {step.step_number}, got {approval_msg.get('step_number')})")
                            
                            elif approval_msg.get('type') == 'reject_workflow':
                                workflow_rejected = True
                                logger.info(f"❌ Workflow rejected at step {step.step_number}")
                                await websocket.send_text(WebSocketEvent(
                                    "workflow_rejected",
                                    {"message": f"Workflow rejected by user at step {step.step_number}", "sequence_id": sequence_id}
                                ).to_json())
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
                                    new_workflow_steps = await self._generate_workflow_with_llm(
                                        user_prompt=combined_prompt,
                                        available_files=available_files
                                    )
                                    
                                    # Update plan with new remaining steps
                                    new_remaining_steps = [
                                        WorkflowStep(
                                            step_number=idx + step.step_number + 1,
                                            atom_id=s.get('atom_id'),
                                            description=s.get('description', '')
                                        )
                                        for idx, s in enumerate(new_workflow_steps)
                                    ]
                                    
                                    # Replace remaining steps in plan
                                    plan.workflow_steps = plan.workflow_steps[:idx + 1] + new_remaining_steps
                                    plan.total_steps = len(plan.workflow_steps)
                                    
                                    # Send updated plan
                                    await websocket.send_text(WebSocketEvent(
                                        "plan_updated",
                                        {
                                            "plan": plan.to_dict(),
                                            "sequence_id": sequence_id,
                                            "total_steps": plan.total_steps,
                                            "updated_from_step": step.step_number + 1
                                        }
                                    ).to_json())
                                    
                                    logger.info(f"✅ Updated workflow: {len(new_remaining_steps)} new steps from step {step.step_number + 1}")
                                    
                                    # Continue to next step (which is now updated)
                                    step_approved = True
                        except Exception as e:
                            logger.error(f"❌ Error waiting for step approval: {e}")
                            break
                    
                    if workflow_rejected:
                        return
            
            # Send workflow completed
            await websocket.send_text(WebSocketEvent(
                "workflow_completed",
                {
                    "sequence_id": sequence_id,
                    "total_steps": plan.total_steps,
                    "message": "All steps completed successfully!"
                }
            ).to_json())
            
            logger.info(f"✅ Workflow completed: {sequence_id}")
            
        except Exception as e:
            logger.error(f"❌ Workflow execution failed: {e}")
            import traceback
            traceback.print_exc()
            
            # Send error event
            await websocket.send_text(WebSocketEvent(
                "error",
                {
                    "sequence_id": sequence_id,
                    "error": str(e),
                    "message": f"Workflow failed: {str(e)}"
                }
            ).to_json())
    
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
            
            await websocket.send_text(WebSocketEvent(
                "step_started",
                {
                    "step": step_number,
                    "total_steps": plan.total_steps,
                    "atom_id": atom_id,
                    "description": step.description,
                    "sequence_id": sequence_id
                }
            ).to_json())
            
            # ================================================================
            # PHASE A: GENERATE PARAMETERS (Simplified)
            # ================================================================
            logger.info(f"🔧 Generating parameters for {atom_id}...")
            
            # For now, use basic parameters from prompt
            # The atom handlers will process the results properly
            parameters = await self._generate_simple_parameters(
                atom_id=atom_id,
                original_prompt=original_prompt,
                available_files=available_files
            )
            
            logger.info(f"✅ Parameters: {json.dumps(parameters, indent=2)[:150]}...")
            
            # ================================================================
            # PHASE B: CREATE EMPTY CARD (Like SuperAgent)
            # ================================================================
            logger.info(f"🎴 Creating empty card for {atom_id}...")
            
            # Create card via FastAPI
            card_id = f"card-{uuid.uuid4().hex}"
            
            # EVENT 2: CARD_CREATED
            await websocket.send_text(WebSocketEvent(
                "card_created",
                {
                    "step": step_number,
                    "card_id": card_id,
                    "atom_id": atom_id,
                    "sequence_id": sequence_id,
                    "action": "CARD_CREATION"
                }
            ).to_json())
            
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
            
            # ================================================================
            # EVENT 3: AGENT_EXECUTED (Frontend will call atom handler)
            # ================================================================
            await websocket.send_text(WebSocketEvent(
                "agent_executed",
                {
                    "step": step_number,
                    "card_id": card_id,
                    "atom_id": atom_id,
                    "action": "AGENT_EXECUTION",
                    "result": execution_result,  # merge_json, groupby_json, etc.
                    "sequence_id": sequence_id,
                    "summary": f"Executed {atom_id}"
                }
            ).to_json())
            
            # ================================================================
            # EVENT 4: STEP_COMPLETED
            # ================================================================
            await websocket.send_text(WebSocketEvent(
                "step_completed",
                {
                    "step": step_number,
                    "total_steps": plan.total_steps,
                    "atom_id": atom_id,
                    "card_id": card_id,
                    "summary": f"Step {step_number} completed",
                    "sequence_id": sequence_id
                }
            ).to_json())
            
            logger.info(f"✅ Step {step_number} completed")
            
        except Exception as e:
            logger.error(f"❌ Step {step_number} failed: {e}")
            
            await websocket.send_text(WebSocketEvent(
                "step_failed",
                {
                    "step": step_number,
                    "atom_id": atom_id,
                    "error": str(e),
                    "sequence_id": sequence_id
                }
            ).to_json())
    
    async def _generate_simple_parameters(
        self,
        atom_id: str,
        original_prompt: str,
        available_files: List[str]
    ) -> Dict[str, Any]:
        """Generate simple parameters from prompt"""
        # For atoms, just pass the prompt
        # The agent will use its own LLM to generate proper configuration
        return {
            "prompt": original_prompt,
            "available_files": available_files
        }
    
    async def _execute_atom_endpoint(
        self,
        atom_id: str,
        parameters: Dict[str, Any],
        session_id: str
    ) -> Dict[str, Any]:
        """Execute atom endpoint"""
        import aiohttp
        
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

