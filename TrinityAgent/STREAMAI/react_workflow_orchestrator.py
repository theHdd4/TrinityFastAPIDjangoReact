"""
ReAct Workflow Orchestrator for Stream AI
=========================================

Implements ReAct pattern with:
- Intent detection
- Task decomposition
- Adaptive atom selection
- Iterative execution with refinement
- Result analysis
- Response assembly
"""

import asyncio
import json
import logging
import re
import sys
import aiohttp
import time
import os
from typing import Dict, Any, List, Optional, Callable
from pathlib import Path
from datetime import datetime

logger = logging.getLogger("trinity.trinityai.react")

# Add parent directory to path for imports
PARENT_DIR = Path(__file__).resolve().parent.parent
if str(PARENT_DIR) not in sys.path:
    sys.path.append(str(PARENT_DIR))

# Import centralized settings
try:
    from BaseAgent.config import settings
except ImportError:
    try:
        from TrinityAgent.BaseAgent.config import settings
    except ImportError:
        # Fallback: import from main_api if BaseAgent not available
        from main_api import get_llm_config
        # Create minimal settings wrapper for backward compatibility
        class SettingsWrapper:
            def get_llm_config(self):
                return get_llm_config()
        settings = SettingsWrapper()

# Import all ReAct modules
# Note: Intent detection is now handled by BaseAgent, so we don't import intent_detector
try:
    # Try absolute imports first
    try:
        from STREAMAI.result_extractor import get_result_extractor
        from STREAMAI.result_analyzer import get_result_analyzer
        from STREAMAI.prompt_refiner import get_prompt_refiner
        from STREAMAI.workflow_monitor import get_workflow_monitor
        from STREAMAI.insights_generator import get_insights_generator
        from STREAMAI.stream_rag_engine import get_stream_rag_engine
        REACT_MODULES_AVAILABLE = True
    except ImportError:
        # Try relative imports
        try:
            from .result_extractor import get_result_extractor
            from .result_analyzer import get_result_analyzer
            from .prompt_refiner import get_prompt_refiner
            from .workflow_monitor import get_workflow_monitor
            from .insights_generator import get_insights_generator
            from .stream_rag_engine import get_stream_rag_engine
            REACT_MODULES_AVAILABLE = True
        except ImportError:
            # Try direct imports (if in same directory)
            from result_extractor import get_result_extractor
            from result_analyzer import get_result_analyzer
            from prompt_refiner import get_prompt_refiner
            from workflow_monitor import get_workflow_monitor
            from insights_generator import get_insights_generator
            from stream_rag_engine import get_stream_rag_engine
            REACT_MODULES_AVAILABLE = True
except ImportError as e:
    logger.error(f"❌ Could not import ReAct modules: {e}")
    import traceback
    logger.error(f"Import traceback: {traceback.format_exc()}")
    REACT_MODULES_AVAILABLE = False

# Import orchestrator for atom execution
try:
    from STREAMAI.stream_orchestrator import StreamOrchestrator
    ORCHESTRATOR_AVAILABLE = True
except ImportError:
    ORCHESTRATOR_AVAILABLE = False
    logger.warning("⚠️ StreamOrchestrator not available")


class ReActWorkflowOrchestrator:
    """
    Main ReAct workflow orchestrator implementing iterative refinement pattern.
    """
    
    def __init__(self):
        """Initialize the ReAct orchestrator"""
        if not REACT_MODULES_AVAILABLE:
            raise ImportError("ReAct modules not available")
        
        # Use centralized settings
        self.config = settings.get_llm_config()
        self.api_url = self.config["api_url"]
        self.model_name = self.config["model_name"]
        self.bearer_token = self.config["bearer_token"]
        
        # Initialize components
        # Note: Intent detection is handled by BaseAgent before routing to this orchestrator
        self.result_extractor = get_result_extractor()
        self.result_analyzer = get_result_analyzer()
        self.prompt_refiner = get_prompt_refiner()
        self.workflow_monitor = get_workflow_monitor()
        self.insights_generator = get_insights_generator()
        self.rag_engine = None
        
        try:
            self.rag_engine = get_stream_rag_engine()
        except Exception as e:
            logger.warning(f"⚠️ Could not initialize RAG engine: {e}")
        
        # Initialize atom executor
        self.atom_executor = None
        if ORCHESTRATOR_AVAILABLE:
            try:
                self.atom_executor = StreamOrchestrator()
            except Exception as e:
                logger.warning(f"⚠️ Could not initialize atom executor: {e}")
        
        # Configuration
        self.max_retries_per_step = 3
        self.min_quality_score = 0.7  # Minimum quality score to proceed
        
        logger.info("✅ ReActWorkflowOrchestrator initialized")
    
    async def execute_workflow(
        self,
        user_prompt: str,
        session_id: Optional[str] = None,
        file_context: Optional[Dict[str, Any]] = None,
        progress_callback: Optional[Callable] = None
    ) -> Dict[str, Any]:
        """
        Execute complete ReAct workflow.
        
        Args:
            user_prompt: User's prompt/query
            session_id: Optional session identifier
            file_context: Optional file context
            progress_callback: Optional callback for progress updates
            
        Returns:
            Complete workflow result
        """
        if not session_id:
            session_id = f"react_{int(time.time())}"
        
        logger.info(f"🚀 Starting ReAct workflow for session: {session_id}")
        logger.info(f"📝 User prompt: {user_prompt[:100]}...")
        
        try:
            # Note: Intent detection is handled ONCE at the entry point (main_app.py chat endpoint)
            # All requests reaching here are already confirmed to be workflows (intent="workflow")
            # DO NOT call intent detection here - it was already done at the start
            intent = "workflow"
            
            logger.info("ℹ️ Intent already detected at entry point - proceeding with workflow execution")
            
            # Start workflow monitoring
            self.workflow_monitor.start_workflow(
                session_id=session_id,
                user_prompt=user_prompt,
                intent=intent,
                intent_detection={"intent": "workflow", "confidence": 1.0, "reasoning": "Intent detected at entry point"}
            )
            
            # Step 1: Task Decomposition
            if progress_callback:
                progress_callback({
                    "type": "task_decomposition",
                    "message": "Decomposing task into subtasks..."
                })
            
            subtasks = await self._decompose_task(user_prompt, file_context)
            self.workflow_monitor.record_task_decomposition(session_id, subtasks)
            
            # Step 3: Atom Selection
            if progress_callback:
                progress_callback({
                    "type": "atom_selection",
                    "message": "Selecting atoms for execution..."
                })
            
            selected_atoms = await self._select_atoms(user_prompt, subtasks, file_context)
            self.workflow_monitor.record_atom_selection(session_id, selected_atoms)
            
            # Step 4: Iterative Execution
            if progress_callback:
                progress_callback({
                    "type": "execution_start",
                    "message": f"Executing {len(selected_atoms)} atoms..."
                })
            
            execution_results = await self._execute_atoms_iteratively(
                user_prompt=user_prompt,
                subtasks=subtasks,
                selected_atoms=selected_atoms,
                session_id=session_id,
                file_context=file_context,
                progress_callback=progress_callback
            )
            
            # Step 5: Response Assembly
            if progress_callback:
                progress_callback({
                    "type": "response_assembly",
                    "message": "Assembling final response..."
                })
            
            final_response = self._assemble_response(execution_results, user_prompt)
            self.workflow_monitor.record_final_response(session_id, final_response)
            
            # Step 6: Generate Final Insight
            if progress_callback:
                progress_callback({
                    "type": "insight_generation",
                    "message": "Generating final insight..."
                })
            
            workflow_steps = []
            for step in self.workflow_monitor.get_workflow_record(session_id).get("steps", []):
                workflow_steps.append({
                    "step_number": step.get("step_number"),
                    "atom_id": step.get("atom_id"),
                    "subtask": step.get("subtask"),
                    "reasoning": step.get("reasoning"),
                    "smart_response": step.get("smart_response"),
                    "raw_response": step.get("raw_response"),
                    "success": step.get("success"),
                    "output_files": []
                })
            
            final_insight = await self.insights_generator.generate_final_insight(
                user_prompt=user_prompt,
                session_id=session_id,
                workflow_steps=workflow_steps,
                project_context=file_context
            )
            self.workflow_monitor.record_final_insight(session_id, final_insight)
            
            # Complete workflow
            self.workflow_monitor.complete_workflow(session_id, success=True)
            
            logger.info(f"✅ ReAct workflow completed for session: {session_id}")
            
            return {
                "success": True,
                "session_id": session_id,
                "intent": "workflow",
                "subtasks": subtasks,
                "atoms_executed": selected_atoms,
                "execution_results": execution_results,
                "final_response": final_response,
                "final_insight": final_insight,
                "workflow_record": self.workflow_monitor.get_workflow_record(session_id)
            }
            
        except Exception as e:
            logger.error(f"❌ Error in ReAct workflow: {e}", exc_info=True)
            self.workflow_monitor.complete_workflow(session_id, success=False, error=str(e))
            
            return {
                "success": False,
                "session_id": session_id,
                "error": str(e),
                "workflow_record": self.workflow_monitor.get_workflow_record(session_id)
            }
    
    async def _generate_text_reply(self, user_prompt: str) -> str:
        """
        Generate text reply when intent is text_reply.
        
        Args:
            user_prompt: User's prompt
            
        Returns:
            Text response
        """
        logger.info("💬 Generating text reply")
        
        prompt = f"""You are Trinity AI, an intelligent assistant for data analysis.

**USER QUESTION**: "{user_prompt}"

Provide a clear, helpful, and user-friendly explanation or answer to the user's question.
Be concise but comprehensive. If the question is about data operations, explain how they work.
If it's a general question, provide a helpful answer.

**Response:**"""
        
        response = await self._call_llm(prompt, temperature=0.7)
        return response if response else "I apologize, but I couldn't generate a response. Please try rephrasing your question."
    
    async def _decompose_task(
        self,
        user_prompt: str,
        file_context: Optional[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Decompose user task into atomic subtasks.
        
        Args:
            user_prompt: User's prompt
            file_context: Optional file context
            
        Returns:
            List of subtask dicts
        """
        logger.info("🔨 Decomposing task into subtasks")
        
        # Get RAG context
        rag_context = ""
        if self.rag_engine:
            try:
                rag_context = self.rag_engine.generate_rag_context_for_sequence(user_prompt)
            except Exception as e:
                logger.warning(f"⚠️ Could not get RAG context: {e}")
        
        # Build file context section
        file_section = ""
        if file_context and file_context.get("files"):
            files_data = file_context.get("files", [])
            # Ensure files_data is a list (it might be a dict)
            if isinstance(files_data, dict):
                # If it's a dict, convert to list of values
                files_list = list(files_data.values())
            elif isinstance(files_data, list):
                files_list = files_data
            else:
                # If it's something else, wrap it in a list
                files_list = [files_data] if files_data else []
            
            if files_list:
                file_section = "\n## Available Files:\n"
                # Limit to first 10 files
                for file_info in files_list[:10]:
                    # Handle both dict and string cases
                    if isinstance(file_info, dict):
                        file_name = file_info.get("displayName") or file_info.get("name", "unknown")
                    else:
                        file_name = str(file_info)
                    file_section += f"- {file_name}\n"
        
        prompt = f"""You are a task decomposition expert for Trinity AI data workflows.

**USER REQUEST**: "{user_prompt}"

{file_section}

{rag_context}

## Your Task:

Break down the user's request into atomic subtasks that can be executed sequentially.
Each subtask should be:
- Clear and specific
- Executable by a single atom or a small sequence
- Dependent on previous subtasks if needed
- Focused on one operation

## Output Format:

Return ONLY a valid JSON array (no other text):

```json
[
  {{
    "subtask_number": 1,
    "description": "Clear description of what this subtask does",
    "goal": "Specific goal to achieve",
    "depends_on": [] or [1, 2] if depends on previous subtasks
  }},
  {{
    "subtask_number": 2,
    "description": "...",
    "goal": "...",
    "depends_on": [1]
  }}
]
```

**Example:**
User: "Load sales.csv, filter revenue > 1000, group by region, and create a chart"

Response:
```json
[
  {{
    "subtask_number": 1,
    "description": "Load and validate the sales.csv file",
    "goal": "Load sales.csv into the system",
    "depends_on": []
  }},
  {{
    "subtask_number": 2,
    "description": "Filter rows where revenue is greater than 1000",
    "goal": "Get filtered dataset with revenue > 1000",
    "depends_on": [1]
  }},
  {{
    "subtask_number": 3,
    "description": "Group filtered data by region",
    "goal": "Get aggregated data grouped by region",
    "depends_on": [2]
  }},
  {{
    "subtask_number": 4,
    "description": "Create a visualization chart",
    "goal": "Generate chart showing grouped data",
    "depends_on": [3]
  }}
]
```

Now decompose the user request:"""
        
        response = await self._call_llm(prompt, temperature=0.3)
        
        if not response:
            logger.warning("⚠️ Empty LLM response, using single subtask")
            return [{
                "subtask_number": 1,
                "description": user_prompt,
                "goal": user_prompt,
                "depends_on": []
            }]
        
        # Extract JSON
        subtasks = self._extract_json_from_response(response)
        
        if not subtasks or not isinstance(subtasks, list):
            logger.warning("⚠️ Could not parse subtasks, using single subtask")
            return [{
                "subtask_number": 1,
                "description": user_prompt,
                "goal": user_prompt,
                "depends_on": []
            }]
        
        logger.info(f"✅ Decomposed into {len(subtasks)} subtasks")
        return subtasks
    
    async def _select_atoms(
        self,
        user_prompt: str,
        subtasks: List[Dict[str, Any]],
        file_context: Optional[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Select atoms adaptively for each subtask.
        
        Args:
            user_prompt: User's prompt
            subtasks: List of subtasks
            file_context: Optional file context
            
        Returns:
            List of selected atoms with mappings to subtasks
        """
        logger.info(f"🔍 Selecting atoms for {len(subtasks)} subtasks")
        
        # Get RAG context
        rag_context = ""
        if self.rag_engine:
            try:
                rag_context = self.rag_engine.generate_rag_context_for_sequence(user_prompt)
            except Exception as e:
                logger.warning(f"⚠️ Could not get RAG context: {e}")
        
        # Build subtasks section
        subtasks_section = "\n## Subtasks:\n"
        for subtask in subtasks:
            subtasks_section += f"{subtask['subtask_number']}. {subtask['description']} (Goal: {subtask['goal']})\n"
        
        prompt = f"""You are an atom selection expert for Trinity AI workflows.

**USER REQUEST**: "{user_prompt}"

{subtasks_section}

{rag_context}

## Your Task:

For each subtask, select the most appropriate atom(s) to execute it.
You can select multiple atoms per subtask if needed (adaptive selection, not minimal).
Consider:
- Task complexity
- Available atoms from RAG context
- Dependencies between subtasks
- Best atom for each operation

## Available Atom Types:
- data-upload-validate: Load and validate files
- merge: Merge/join datasets
- concat: Concatenate datasets
- dataframe-operations: Filter, sort, select columns
- groupby-wtg-avg: Group and aggregate
- create-column: Create calculated columns
- chart-maker: Create visualizations
- feature-overview: Data exploration
- correlation: Correlation analysis
- explore: Detailed exploration

## Output Format:

Return ONLY a valid JSON array (no other text):

```json
[
  {{
    "subtask_number": 1,
    "atom_id": "data-upload-validate",
    "purpose": "Why this atom for this subtask",
    "prompt": "Detailed prompt for the atom",
    "parameters": {{}},
    "inputs": [],
    "output_name": "output1"
  }},
  {{
    "subtask_number": 2,
    "atom_id": "dataframe-operations",
    "purpose": "...",
    "prompt": "...",
    "parameters": {{}},
    "inputs": ["output1"],
    "output_name": "output2"
  }}
]
```

Now select atoms for each subtask:"""
        
        response = await self._call_llm(prompt, temperature=0.3)
        
        if not response:
            logger.warning("⚠️ Empty LLM response, using default atom selection")
            return self._default_atom_selection(subtasks)
        
        # Extract JSON
        selected_atoms = self._extract_json_from_response(response)
        
        if not selected_atoms or not isinstance(selected_atoms, list):
            logger.warning("⚠️ Could not parse atom selection, using defaults")
            return self._default_atom_selection(subtasks)
        
        logger.info(f"✅ Selected {len(selected_atoms)} atoms")
        return selected_atoms
    
    def _default_atom_selection(self, subtasks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Default atom selection fallback."""
        atoms = []
        for i, subtask in enumerate(subtasks, 1):
            atoms.append({
                "subtask_number": subtask["subtask_number"],
                "atom_id": "dataframe-operations",
                "purpose": subtask["description"],
                "prompt": subtask["goal"],
                "parameters": {},
                "inputs": [],
                "output_name": f"output_{i}"
            })
        return atoms
    
    async def _execute_atoms_iteratively(
        self,
        user_prompt: str,
        subtasks: List[Dict[str, Any]],
        selected_atoms: List[Dict[str, Any]],
        session_id: str,
        file_context: Optional[Dict[str, Any]],
        progress_callback: Optional[Callable]
    ) -> List[Dict[str, Any]]:
        """
        Execute atoms iteratively with refinement loop.
        
        Args:
            user_prompt: User's prompt
            subtasks: List of subtasks
            selected_atoms: List of selected atoms
            session_id: Session identifier
            file_context: Optional file context
            progress_callback: Optional progress callback
            
        Returns:
            List of execution results
        """
        logger.info(f"🔄 Starting iterative execution of {len(selected_atoms)} atoms")
        
        execution_results = []
        
        for atom_index, atom in enumerate(selected_atoms, 1):
            subtask_num = atom.get("subtask_number", atom_index)
            subtask = next((s for s in subtasks if s["subtask_number"] == subtask_num), None)
            subtask_goal = subtask["goal"] if subtask else atom.get("purpose", "")
            
            atom_id = atom.get("atom_id", "unknown")
            
            if progress_callback:
                progress_callback({
                    "type": "atom_start",
                    "atom_index": atom_index,
                    "total_atoms": len(selected_atoms),
                    "atom_id": atom_id,
                    "subtask": subtask_goal
                })
            
            # Start step monitoring
            self.workflow_monitor.start_step(
                session_id=session_id,
                step_number=atom_index,
                subtask=subtask_goal,
                atom_id=atom_id
            )
            
            # Initial prompt
            original_prompt = atom.get("prompt", subtask_goal)
            current_prompt = original_prompt
            
            # Execute with retry loop
            step_success = False
            final_result = None
            final_extracted = None
            
            for retry in range(self.max_retries_per_step):
                if retry > 0:
                    logger.info(f"🔄 Retry {retry}/{self.max_retries_per_step - 1} for atom {atom_id}")
                
                # Record prompt
                self.workflow_monitor.record_prompt(session_id, atom_index, current_prompt)
                
                # Execute atom
                execution_result = await self._execute_single_atom(
                    atom=atom,
                    prompt=current_prompt,
                    session_id=session_id
                )
                
                # Record execution
                self.workflow_monitor.record_execution(session_id, atom_index, execution_result)
                
                # Extract result fields
                extracted = self.result_extractor.extract(execution_result)
                final_extracted = extracted
                
                # Analyze result
                analysis = await self.result_analyzer.analyze_result(
                    atom_result=execution_result,
                    original_intent=user_prompt,
                    subtask_goal=subtask_goal,
                    atom_id=atom_id
                )
                
                # Record analysis
                self.workflow_monitor.record_analysis(session_id, atom_index, analysis)
                
                # Check if sufficient
                if analysis.get("sufficient", False) and analysis.get("quality_score", 0) >= self.min_quality_score:
                    step_success = True
                    final_result = execution_result
                    logger.info(f"✅ Step {atom_index} completed successfully")
                    break
                else:
                    # Refine prompt for retry
                    if retry < self.max_retries_per_step - 1:
                        current_prompt = self.prompt_refiner.refine_prompt(
                            original_prompt=original_prompt,
                            analysis_result=analysis,
                            atom_id=atom_id,
                            previous_result={"extracted": extracted},
                            user_intent=user_prompt
                        )
                        logger.info(f"🔧 Refined prompt for retry")
                    else:
                        logger.warning(f"⚠️ Step {atom_index} failed after {self.max_retries_per_step} attempts")
                        final_result = execution_result
            
            # Complete step
            self.workflow_monitor.complete_step(
                session_id=session_id,
                step_number=atom_index,
                final_result=final_result or {},
                extracted=final_extracted or {},
                success=step_success
            )
            
            # Generate step summary
            step_summary = await self.insights_generator.generate_step_summary(
                step_number=atom_index,
                atom_id=atom_id,
                subtask=subtask_goal,
                extracted_result=final_extracted or {},
                analysis_result=analysis if 'analysis' in locals() else None
            )
            
            execution_results.append({
                "step_number": atom_index,
                "atom_id": atom_id,
                "subtask": subtask_goal,
                "success": step_success,
                "result": final_result,
                "extracted": final_extracted,
                "analysis": analysis if 'analysis' in locals() else None,
                "summary": step_summary
            })
            
            if progress_callback:
                progress_callback({
                    "type": "atom_complete",
                    "atom_index": atom_index,
                    "total_atoms": len(selected_atoms),
                    "success": step_success,
                    "summary": step_summary
                })
        
        return execution_results
    
    async def _execute_single_atom(
        self,
        atom: Dict[str, Any],
        prompt: str,
        session_id: str
    ) -> Dict[str, Any]:
        """
        Execute a single atom.
        
        Args:
            atom: Atom configuration
            prompt: Prompt to use
            session_id: Session identifier
            
        Returns:
            Execution result
        """
        if not self.atom_executor:
            # Fallback: direct API call
            return await self._execute_atom_direct(atom, prompt)
        
        # Use orchestrator's execution method
        try:
            # Build atom dict for orchestrator
            atom_config = {
                "atom_id": atom.get("atom_id"),
                "prompt": prompt,
                "parameters": atom.get("parameters", {}),
                "output_name": atom.get("output_name", "output")
            }
            
            # Execute using orchestrator's 3-step pattern
            result = await self.atom_executor._execute_atom_3_steps(
                atom=atom_config,
                session_id=session_id,
                atom_index=1,
                total_atoms=1,
                progress_callback=None
            )
            
            return result.get("data", result) if result.get("success") else {
                "success": False,
                "error": result.get("error", "Unknown error")
            }
            
        except Exception as e:
            logger.error(f"❌ Error executing atom via orchestrator: {e}")
            return await self._execute_atom_direct(atom, prompt)
    
    async def _execute_atom_direct(
        self,
        atom: Dict[str, Any],
        prompt: str
    ) -> Dict[str, Any]:
        """
        Execute atom via direct API call (fallback).
        
        Args:
            atom: Atom configuration
            prompt: Prompt to use
            
        Returns:
            Execution result
        """
        try:
            atom_id = atom.get("atom_id", "unknown")
            endpoint = f"/trinityai/{atom_id}"
            fastapi_base = getattr(settings, 'FASTAPI_BASE_URL', None) or 'http://fastapi:8001'
            url = f"{fastapi_base}{endpoint}"
            
            payload = {
                "message": prompt,
                "prompt": prompt,
                "session_id": f"react_{int(time.time())}"
            }
            
            # Add parameters
            if "parameters" in atom:
                payload.update(atom["parameters"])
            
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    url,
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=120)
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        return {
                            "success": True,
                            "data": data
                        }
                    else:
                        error_text = await response.text()
                        return {
                            "success": False,
                            "error": f"HTTP {response.status}: {error_text[:200]}"
                        }
        except Exception as e:
            logger.error(f"❌ Error in direct atom execution: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def _assemble_response(
        self,
        execution_results: List[Dict[str, Any]],
        user_prompt: str
    ) -> Dict[str, Any]:
        """
        Assemble final response from execution results.
        
        Args:
            execution_results: List of execution results
            user_prompt: Original user prompt
            
        Returns:
            Assembled response
        """
        logger.info("📦 Assembling final response")
        
        successful_steps = [r for r in execution_results if r.get("success")]
        failed_steps = [r for r in execution_results if not r.get("success")]
        
        response = {
            "user_prompt": user_prompt,
            "total_steps": len(execution_results),
            "successful_steps": len(successful_steps),
            "failed_steps": len(failed_steps),
            "steps": []
        }
        
        for result in execution_results:
            step_info = {
                "step_number": result.get("step_number"),
                "atom_id": result.get("atom_id"),
                "subtask": result.get("subtask"),
                "success": result.get("success"),
                "summary": result.get("summary", ""),
                "reasoning": result.get("extracted", {}).get("reasoning", ""),
                "smart_response": result.get("extracted", {}).get("smart_response", ""),
                "raw_response": result.get("extracted", {}).get("raw_response", {})
            }
            response["steps"].append(step_info)
        
        return response
    
    async def _call_llm(self, prompt: str, temperature: float = 0.3) -> str:
        """Call LLM with prompt."""
        try:
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.bearer_token}"
            }
            
            payload = {
                "model": self.model_name,
                "messages": [{"role": "user", "content": prompt}],
                "stream": False,
                "options": {
                    "temperature": temperature,
                    "num_predict": 2000
                }
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self.api_url,
                    json=payload,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=120)
                ) as response:
                    response.raise_for_status()
                    result = await response.json()
                    return result.get("message", {}).get("content", "")
        except Exception as e:
            logger.error(f"❌ Error calling LLM: {e}")
            return ""
    
    def _extract_json_from_response(self, response: str) -> Optional[Any]:
        """Extract JSON from LLM response."""
        try:
            json_match = re.search(r'\{[\s\S]*\}|\[[\s\S]*\]', response)
            if json_match:
                json_str = json_match.group(0)
                return json.loads(json_str)
            return json.loads(response)
        except json.JSONDecodeError as e:
            logger.error(f"❌ Failed to parse JSON: {e}")
            return None


# Global instance
_react_orchestrator: Optional[ReActWorkflowOrchestrator] = None


def get_react_orchestrator() -> ReActWorkflowOrchestrator:
    """
    Get singleton ReAct orchestrator instance.
    
    Returns:
        ReActWorkflowOrchestrator instance
    """
    global _react_orchestrator
    if _react_orchestrator is None:
        _react_orchestrator = ReActWorkflowOrchestrator()
        logger.info("✅ Global ReActWorkflowOrchestrator instance created")
    return _react_orchestrator

