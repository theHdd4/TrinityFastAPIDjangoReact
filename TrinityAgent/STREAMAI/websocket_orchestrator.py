"""
WebSocket Orchestrator for Trinity AI
=====================================

Handles real-time step-by-step workflow execution with WebSocket events.
Implements the Trinity AI streaming pattern for card and result handling.
"""

import asyncio
import contextlib
import copy
import hashlib
import json
import logging
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple, Callable, Set
from dataclasses import dataclass
import uuid

logger = logging.getLogger("trinity.trinityai.websocket")

# Import atom insights with fallbacks for environments where the package path differs
try:
    from TrinityAgent.atoms.insights import generate_insights
except ImportError:
    try:
        from atoms.insights import generate_insights  # type: ignore
    except ImportError:  # pragma: no cover - insights unavailable
        logger.warning("Atom insights unavailable; TrinityAgent package not on PYTHONPATH")

        def generate_insights(*args, **kwargs):
            return []

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
from .laboratory_retriever import LaboratoryRetrievalPipeline
# Import workflow_insight_agent - try both paths for Docker and local development
try:
    from Agent_Insight.workflow_insight_agent import get_workflow_insight_agent
except ImportError:
    try:
        from TrinityAgent.Agent_Insight.workflow_insight_agent import get_workflow_insight_agent
    except ImportError:
        # Fallback: define a no-op function
        def get_workflow_insight_agent():
            return None
# Import centralized settings
try:
    from BaseAgent.config import settings
except ImportError:
    try:
        from TrinityAgent.BaseAgent.config import settings
    except ImportError:
        # Fallback: create minimal settings wrapper if BaseAgent not available
        class SettingsWrapper:
            OLLAMA_IP = None
            OLLAMA_PORT = "11434"
            HOST_IP = "127.0.0.1"
            LLM_API_URL = None
            LLM_MODEL_NAME = "deepseek-r1:32b"
            LLM_BEARER_TOKEN = "aakash_api_key"
            FASTAPI_BASE_URL = None
            FASTAPI_HOST = None
            FASTAPI_PORT = "8001"
            CLIENT_NAME = None
            APP_NAME = None
            PROJECT_NAME = None
            STREAM_AI_ATOM_RETRY_ATTEMPTS = 3
            STREAM_AI_ATOM_RETRY_DELAY_SECONDS = 2.0
            RUNNING_IN_DOCKER = None
        settings = SettingsWrapper()

# Import ReAct orchestrator - try both paths
try:
    from .react_workflow_orchestrator import get_react_orchestrator
    REACT_AVAILABLE = True
except ImportError:
    try:
        from STREAMAI.react_workflow_orchestrator import get_react_orchestrator
        REACT_AVAILABLE = True
    except ImportError:
        REACT_AVAILABLE = False
        logger.warning("⚠️ ReAct orchestrator not available, using legacy workflow")
        def get_react_orchestrator():
            return None

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


@dataclass
class StepEvaluation:
    """Evaluation result for a workflow step execution."""
    decision: str  # "continue", "retry_with_correction", "change_approach", "complete"
    reasoning: str
    quality_score: Optional[float] = None  # 0.0 to 1.0
    correctness: bool = True
    issues: List[str] = None
    corrected_prompt: Optional[str] = None  # For retry_with_correction
    alternative_approach: Optional[str] = None  # For change_approach
    
    def __post_init__(self):
        if self.issues is None:
            self.issues = []


@dataclass
class ReActState:
    """ReAct agent state for a workflow sequence."""
    sequence_id: str
    user_prompt: str
    goal_achieved: bool = False
    current_step_number: int = 0
    paused: bool = False  # Indicates whether the loop was paused mid-generation
    paused_at_step: int = 0  # The step where generation paused
    execution_history: List[Dict[str, Any]] = None  # Previous steps and results
    thoughts: List[str] = None  # Reasoning history
    observations: List[str] = None  # Observation history
    retry_count: int = 0  # Current step retry count
    max_retries_per_step: int = 2
    
    def __post_init__(self):
        if self.execution_history is None:
            self.execution_history = []
        if self.thoughts is None:
            self.thoughts = []
        if self.observations is None:
            self.observations = []
    
    def add_thought(self, thought: str):
        """Add a reasoning thought to history."""
        self.thoughts.append(thought)
    
    def add_observation(self, observation: str):
        """Add an observation to history."""
        self.observations.append(observation)
    
    def add_execution(
        self, 
        step_number: int, 
        atom_id: str, 
        result: Dict[str, Any], 
        evaluation: Optional[StepEvaluation] = None,
        description: Optional[str] = None,
        files_used: Optional[List[str]] = None
    ):
        """Add execution result to history."""
        self.execution_history.append({
            "step_number": step_number,
            "atom_id": atom_id,
            "result": result,
            "evaluation": evaluation.__dict__ if evaluation else None,
            "description": description,
            "files_used": files_used or []
        })
        self.current_step_number = step_number


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

        try:
            self.laboratory_retriever = LaboratoryRetrievalPipeline()
            logger.info("✅ Laboratory retrieval pipeline initialized for Lab Mode insights")
        except Exception as lab_exc:
            logger.warning("⚠️ Laboratory retrieval pipeline unavailable: %s", lab_exc)
            self.laboratory_retriever = None

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
        self._sequence_project_context: Dict[str, Dict[str, Any]] = {}  # Store project_context per sequence
        self._sequence_intent_routing: Dict[str, Dict[str, Any]] = {}
        self._sequence_react_state: Dict[str, ReActState] = {}  # ReAct state per sequence
        self._sequence_step_plans: Dict[str, Dict[int, WorkflowStepPlan]] = {}  # Track executed step plans per sequence
        self._sequence_replay_counts: Dict[str, int] = {}
        self._paused_sequences: Set[str] = set()
        self._react_step_guards: Dict[str, Dict[str, Any]] = {}  # Prevent overlapping ReAct steps
        self._react_stall_watchdogs: Dict[str, Dict[str, Any]] = {}  # Detect stalled ReAct loops without progress

        # Safety guards
        self.max_initial_plan_steps: int = 8  # Abort overly long upfront plans
        self.max_react_operations: int = 12  # Stop runaway execution loops
        self.max_stalled_react_attempts: int = 4  # Prevent tight loops when no new atoms are executed
        self.llm_attempt_timeout_seconds: float = 60.0  # Guardrail for individual LLM attempts
        self.llm_status_interval_seconds: float = 10.0  # Periodic heartbeat interval

        # Determine FastAPI base for downstream atom services (merge, concat, etc.)
        self.fastapi_base_url = self._determine_fastapi_base_url()
        self.merge_save_endpoint = f"{self.fastapi_base_url}/api/merge/save"
        self.concat_save_endpoint = f"{self.fastapi_base_url}/api/concat/save"
        self.merge_perform_endpoint = f"{self.fastapi_base_url}/api/merge/perform"
        self.concat_perform_endpoint = f"{self.fastapi_base_url}/api/concat/perform"
        logger.info(f"🔗 FastAPI base URL for auto-save: {self.fastapi_base_url}")

        # Get LLM config from centralized settings
        ollama_ip = settings.OLLAMA_IP or settings.HOST_IP
        llm_port = settings.OLLAMA_PORT
        # Use OpenAI-compatible endpoint for workflow generation
        if settings.LLM_API_URL:
            self.llm_api_url = settings.LLM_API_URL.replace("/api/chat", "/v1/chat/completions")
        else:
            self.llm_api_url = f"http://{ollama_ip}:{llm_port}/v1/chat/completions"
        self.llm_model = settings.LLM_MODEL_NAME
        self.bearer_token = settings.LLM_BEARER_TOKEN
        
        logger.info(f"🔗 LLM Config: {self.llm_api_url} | Model: {self.llm_model}")
        
        # Load atom mapping for endpoints
        self._load_atom_mapping()

        # Atom execution retry configuration
        self.atom_retry_attempts = max(
            1, settings.STREAM_AI_ATOM_RETRY_ATTEMPTS
        )
        self.atom_retry_delay = max(
            0.0, float(settings.STREAM_AI_ATOM_RETRY_DELAY_SECONDS)
        )
        logger.info(
            "🔁 Atom retry configuration | attempts=%s delay=%ss",
            self.atom_retry_attempts,
            self.atom_retry_delay,
        )

        self.max_replay_attempts = 7

        self._memory_storage = memory_storage_module
        self._memory_summarizer = summarize_chat_messages
        if self._memory_storage and self._memory_summarizer:
            logger.info("🧠 Chat memory summaries enabled via MinIO storage")
        else:
            logger.info("ℹ️ Chat memory summaries disabled (memory service unavailable)")
        
        # Initialize ReAct orchestrator if available
        self.react_orchestrator = None
        if REACT_AVAILABLE:
            try:
                self.react_orchestrator = get_react_orchestrator()
                logger.info("✅ ReAct orchestrator initialized for WebSocket")
            except Exception as e:
                logger.warning(f"⚠️ Could not initialize ReAct orchestrator: {e}")
        
        logger.info("✅ StreamWebSocketOrchestrator initialized")

    @contextlib.asynccontextmanager
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
    
    async def _retry_llm_json_generation(
        self,
        llm_call_func: Callable,
        step_name: str,
        max_attempts: int = 3,
        status_callback: Optional[Callable[[int, float, bool], Any]] = None,
        attempt_timeout: Optional[float] = None,
        pause_after_timeout: bool = False
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
            start_time = datetime.utcnow()
            status_task = None
            try:
                logger.info(f"🔄 [{step_name}] Attempt {attempt}/{max_attempts}: Calling LLM for JSON generation...")
                if status_callback:
                    status_task = asyncio.create_task(
                        self._periodic_generation_status(
                            status_callback=status_callback,
                            step_name=step_name,
                            attempt=attempt,
                            start_time=start_time,
                            max_elapsed=attempt_timeout or self.llm_attempt_timeout_seconds,
                        )
                    )

                if attempt_timeout:
                    result = await asyncio.wait_for(llm_call_func(), timeout=attempt_timeout)
                else:
                    result = await llm_call_func()
                logger.info(f"✅ [{step_name}] Attempt {attempt} succeeded: Valid JSON generated")
                return result
            except asyncio.TimeoutError as e:
                last_error = e
                logger.warning(
                    f"⚠️ [{step_name}] Attempt {attempt}/{max_attempts} timed out after {attempt_timeout or self.llm_attempt_timeout_seconds}s"
                )
                if status_callback:
                    try:
                        await status_callback(attempt, (datetime.utcnow() - start_time).total_seconds(), True)
                    except Exception:
                        logger.debug("⚠️ Status callback failed after timeout", exc_info=True)
                if pause_after_timeout:
                    raise
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
            finally:
                if status_task:
                    status_task.cancel()
                    with contextlib.suppress(Exception):
                        await status_task
        
        # All attempts failed
        error_msg = (
            f"Failed to generate valid JSON for '{step_name}' after {max_attempts} attempts. "
            f"Please rephrase your query in a clearer way."
        )
        raise RetryableJSONGenerationError(error_msg, max_attempts, last_error)

    async def _periodic_generation_status(
        self,
        status_callback: Callable[[int, float, bool], Any],
        step_name: str,
        attempt: int,
        start_time: datetime,
        max_elapsed: float,
    ) -> None:
        """Emit periodic status updates while waiting on a long LLM call."""
        try:
            while True:
                await asyncio.sleep(self.llm_status_interval_seconds)
                elapsed = (datetime.utcnow() - start_time).total_seconds()
                try:
                    await status_callback(attempt, elapsed, False)
                except Exception:
                    logger.debug("⚠️ Failed to emit generation heartbeat", exc_info=True)
                if elapsed >= max_elapsed:
                    return
        except asyncio.CancelledError:
            return
    
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

8. **correlation** - Correlation Analysis (EDA Tool)
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

9. **data-upload-validate** - Load Data
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
    
    def _build_react_planning_prompt(
        self,
        user_prompt: str,
        execution_history: List[Dict[str, Any]],
        available_files: List[str],
        previous_results: List[Dict[str, Any]],
        prompt_files: List[str],
        files_exist: bool
    ) -> str:
        """
        Build ReAct-style planning prompt for next step generation.
        
        Uses Thought-Action pattern.
        """
        lines: List[str] = []
        
        # Detect if user is asking for something new
        user_request_keywords = ["chart", "graph", "visualize", "plot", "redo", "redo it", "modify", "change", 
                                 "create", "generate", "make", "show", "display", "analyze", "do", "now", 
                                 "also", "and", "then", "next", "please", "can you", "i want", "i need"]
        user_asking_for_something = any(keyword.lower() in user_prompt.lower() for keyword in user_request_keywords)
        
        lines.append("You are a ReAct-style agent planning the next step in a data workflow.")
        lines.append("")
        lines.append("## ⚠️ CRITICAL: ALWAYS HONOR USER REQUESTS")
        lines.append("**MOST IMPORTANT RULE**: If the user asks for something, you MUST do it. Never refuse, never say 'no need', never ignore user requests.")
        lines.append("- If user asks for 'chart' → Generate a chart (even if one exists, user may want different type)")
        lines.append("- If user asks for 'redo' → Redo the operation")
        lines.append("- If user asks for 'modify' → Modify as requested")
        lines.append("- If user asks for ANY operation → Execute it with goal_achieved: false")
        lines.append("- Only set goal_achieved: true if user's request is COMPLETELY done AND user is NOT asking for more")
        lines.append("")
        lines.append("## USER REQUEST")
        lines.append(user_prompt)
        lines.append("")
        
        if user_asking_for_something:
            lines.append("**⚠️ USER IS ASKING FOR SOMETHING - YOU MUST EXECUTE IT:**")
            lines.append("- The user request contains keywords indicating they want an operation performed")
            lines.append("- You MUST set goal_achieved: false and plan the requested step")
            lines.append("- Do NOT refuse or say the work is already done")
            lines.append("- Do NOT set goal_achieved: true when user is asking for something")
            lines.append("")
        else:
            lines.append("**Analyze the user request above:**")
            lines.append("- Is the user asking for something specific? (chart, redo, modify, analyze, etc.)")
            lines.append("- If YES: You MUST execute it. Set goal_achieved: false and plan the step.")
            lines.append("- If user is asking for something NEW, the goal is NOT achieved yet.")
            lines.append("")
        
        if execution_history:
            # Check if chart-maker has been used
            chart_maker_used = any(h.get("atom_id") == "chart-maker" for h in execution_history)
            
            lines.append("## EXECUTION HISTORY (ALREADY COMPLETED - DO NOT REPEAT)")
            lines.append("⚠️ CRITICAL: These steps have ALREADY been executed. DO NOT repeat them!")
            lines.append("")
            
            # Add warning if chart-maker hasn't been used
            if not chart_maker_used:
                lines.append("⚠️ **CHART-MAKER NOT YET USED**: Chart-maker has NOT been executed yet.")
                lines.append("   - You MUST plan to use chart-maker before setting goal_achieved: true")
                lines.append("   - Chart-maker should visualize the final results from the most recent step")
                lines.append("   - Use the most recent output file (marked with 📄 below) for the chart")
                lines.append("")
            for idx, hist in enumerate(execution_history, 1):
                step_num = hist.get("step_number", "?")
                atom_id = hist.get("atom_id", "?")
                description = hist.get("description", "N/A")
                files_used = hist.get("files_used", [])
                result = hist.get("result", {})
                success = result.get("success", True)
                evaluation = hist.get("evaluation", {})
                decision = evaluation.get("decision", "continue") if evaluation else "continue"
                
                lines.append(f"**Step {step_num}: {atom_id}** - {'✅ Success' if success else '❌ Failed'}")
                lines.append(f"  Description: {description}")
                if files_used:
                    files_display = [self._display_file_name(f) for f in files_used]
                    lines.append(f"  Files used: {', '.join(files_display)}")
                
                # Show output file if available
                saved_path = None
                if isinstance(result, dict):
                    # Try to extract output file from result
                    if atom_id == "merge" and result.get("merge_json"):
                        saved_path = result.get("merge_json", {}).get("result_file") or result.get("saved_path")
                    elif atom_id == "concat" and result.get("concat_json"):
                        saved_path = result.get("concat_json", {}).get("result_file") or result.get("saved_path")
                    elif atom_id in ["create-column", "create-transform"] and result.get("create_transform_json"):
                        saved_path = result.get("create_transform_json", {}).get("result_file") or result.get("saved_path")
                    elif result.get("output_file"):
                        saved_path = result.get("output_file")
                    elif result.get("saved_path"):
                        saved_path = result.get("saved_path")
                
                if saved_path:
                    file_display = self._display_file_name(saved_path)
                    lines.append(f"  📄 **OUTPUT FILE CREATED: {file_display} ({saved_path})**")
                    lines.append(f"     ⚠️ **YOU MUST USE THIS FILE in the next step - DO NOT repeat {atom_id}**")
                
                if not success:
                    error = result.get("error") or result.get("message", "Unknown error")
                    lines.append(f"  ❌ Error: {error}")
                elif decision == "complete":
                    lines.append(f"  ✅ Goal achieved - workflow should be complete")
                
                lines.append("")  # Blank line between steps
            
            lines.append("⚠️ **CRITICAL REMINDERS:**")
            lines.append("1. DO NOT repeat any of the above steps with the same atom_id")
            lines.append("2. DO NOT use the same files that were already processed")
            lines.append("3. USE the output files created by previous steps (marked with 📄)")
            lines.append("4. If a step created a file, that file is now available in AVAILABLE FILES section above")
            lines.append("5. If all required operations are done, set goal_achieved: true")
            lines.append("")
        else:
            lines.append("## EXECUTION HISTORY")
            lines.append("No previous steps executed yet.")
            lines.append("")
        
        lines.append("## AVAILABLE FILES")
        lines.append("These files are available for use. Files created by previous steps are marked with ⭐")
        if available_files:
            # Get file metadata to show column names
            file_metadata = self._get_file_metadata(available_files)
            
            # Show recently created files first (last in list are newest)
            recent_files = available_files[-10:] if len(available_files) > 10 else available_files
            older_files = available_files[:-10] if len(available_files) > 10 else []
            
            if recent_files:
                lines.append("")
                lines.append("⭐ RECENTLY CREATED FILES (from previous steps - USE THESE FIRST):")
                for f in recent_files:
                    file_display = self._display_file_name(f)
                    lines.append(f"  ⭐ {file_display} ({f})")
                    # Show column names if available
                    if f in file_metadata:
                        columns = file_metadata[f].get("columns", [])
                        if columns:
                            lines.append(f"     Columns: {', '.join(columns[:10])}")
                            if len(columns) > 10:
                                lines.append(f"     ... and {len(columns) - 10} more columns")
            
            if older_files:
                lines.append("")
                lines.append("Other available files:")
                for f in older_files[:15]:  # Limit older files
                    file_display = self._display_file_name(f)
                    lines.append(f"  - {file_display} ({f})")
                    # Show column names if available
                    if f in file_metadata:
                        columns = file_metadata[f].get("columns", [])
                        if columns:
                            lines.append(f"    Columns: {', '.join(columns[:8])}")
                            if len(columns) > 8:
                                lines.append(f"    ... and {len(columns) - 8} more")
                if len(older_files) > 15:
                    lines.append(f"  ... and {len(older_files) - 15} more files")
        else:
            lines.append("No files available")
        lines.append("")
        lines.append("⚠️ CRITICAL FILE USAGE RULES:")
        lines.append("1. If a previous step created a file, you MUST use that file in the next step")
        lines.append("2. Do NOT repeat the same operation that created the file")
        lines.append("3. Use ONLY the column names shown above - do NOT invent or guess column names")
        lines.append("4. Files marked with ⭐ are the most recent outputs - prefer these for next steps")
        lines.append("")
        
        if prompt_files:
            lines.append("## PRIORITY FILES (mentioned in user request)")
            for f in prompt_files:
                lines.append(f"- {f}")
            lines.append("")
        
        lines.append("## AVAILABLE TOOLS (atoms)")
        atom_capabilities = self._get_atom_capabilities_for_llm()
        lines.append(atom_capabilities)
        lines.append("")
        
        lines.append("## YOUR TASK")
        lines.append("Analyze the current state and plan the NEXT SINGLE STEP.")
        lines.append("")
        lines.append("Follow this structure:")
        lines.append("")
        lines.append("**THOUGHT (REQUIRED - Be detailed and explicit):**")
        lines.append("1. **Review EXECUTION HISTORY**: What steps have been completed? What files were created?")
        lines.append("2. **Review USER REQUEST**: What did the user ask for? What still needs to be done?")
        lines.append("3. **Review AVAILABLE FILES**: Which files are available? Which is the most recent output?")
        lines.append("4. **Determine NEXT ACTION**: What specific operation needs to be done next?")
        lines.append("5. **Check CHART REQUIREMENT**: Has chart-maker been used? If not, plan to use it (usually at the end)")
        lines.append("6. **Select APPROPRIATE TOOL**: Which atom_id matches the next action?")
        lines.append("7. **Verify FILE SELECTION**: Which file(s) should be used? Use the most recent output file if available.")
        lines.append("")
        lines.append("**ACTION (REQUIRED - Be specific):**")
        lines.append("- Select the next tool (atom_id) - must match one of the available atoms")
        lines.append("- Generate CLEAR step description that explains what this step will do")
        lines.append("- Specify EXACT files to use (use file paths from AVAILABLE FILES section)")
        lines.append("- Provide descriptive output alias for the result")
        lines.append("")
        lines.append("Respond with JSON in this format:")
        lines.append("{")
        lines.append('  "thought": "Your reasoning about what to do next",')
        lines.append('  "atom_id": "merge|concat|chart-maker|groupby-wtg-avg|...",')
        lines.append('  "description": "Clear description of this step",')
        lines.append('  "files_used": ["file1.arrow", "file2.arrow"],')
        lines.append('  "inputs": ["input1", "input2"],')
        lines.append('  "output_alias": "descriptive_output_name",')
        lines.append('  "goal_achieved": false')
        lines.append("}")
        lines.append("")
        lines.append("## CRITICAL RULES (MUST FOLLOW):")
        lines.append("1. ⚠️ **ALWAYS LISTEN TO THE USER** - If the user asks for something, you MUST do it. Never refuse or say 'no need'")
        lines.append("2. ⚠️ **DO NOT repeat any step** that has already been executed (check EXECUTION HISTORY above)")
        lines.append("3. ⚠️ **If a previous step created a file, USE THAT FILE** in the next step - do NOT recreate it")
        lines.append("4. ⚠️ **Only set goal_achieved: true if the user's request is COMPLETELY done AND user is not asking for more**")
        lines.append("5. ⚠️ **If user asks for something NEW (chart, redo, modify, etc.), set goal_achieved: false** and continue")
        lines.append("6. ⚠️ **Only plan ONE step at a time** - do not plan multiple steps")
        lines.append("7. ⚠️ **Choose a DIFFERENT tool/operation** than what was already done (unless user explicitly asks to redo)")
        lines.append("8. ⚠️ **Use files marked with ⭐** (recently created) when possible")
        lines.append("9. ⚠️ **Use ONLY column names** shown in FILE METADATA above - do NOT invent column names")
        lines.append("10. ⚠️ **User requests take priority** - If user asks for chart, redo, or any operation, you MUST execute it")
        lines.append("")
        lines.append("## ⚠️ CRITICAL: CHART-MAKER MUST ALWAYS BE INCLUDED")
        lines.append("**MANDATORY RULE**: Chart-maker MUST be used in EVERY workflow:")
        lines.append("1. **If chart-maker has NOT been used yet**: You MUST plan to use it (usually as the last step)")
        lines.append("2. **If data transformations are done**: Use chart-maker to visualize the results")
        lines.append("3. **If user's main request is complete**: Add chart-maker to show the final results visually")
        lines.append("4. **ONLY set goal_achieved: true AFTER chart-maker has been executed** (unless user explicitly doesn't want visualization)")
        lines.append("")
        lines.append("**When planning chart-maker:**")
        lines.append("- **Check EXECUTION HISTORY** for output files created by previous steps (marked with 📄)")
        lines.append("- **USE THE MOST RECENT OUTPUT FILE** from previous steps (usually the last file in AVAILABLE FILES marked with ⭐)")
        lines.append("- **Do NOT use original input files** if a processed/transformed file exists from previous steps")
        lines.append("- **Example**: If Step 1: merge created merged_data.arrow → Step 2: groupby created grouped_data.arrow → Use grouped_data.arrow for chart, NOT the original files")
        lines.append("- **The chart should visualize the RESULT of previous transformations**, not the raw input data")
        lines.append("")
        lines.append("## LOOP PREVENTION (CRITICAL):")
        lines.append("Before planning your step, check:")
        lines.append("")
        lines.append("1. **Check EXECUTION HISTORY**: Has the atom_id you're planning already been used?")
        lines.append("   - If YES: You MUST use a DIFFERENT atom_id OR use a DIFFERENT file")
        lines.append("   - Example: If Step 1 used 'groupby-wtg-avg' on file A, do NOT use 'groupby-wtg-avg' on file A again")
        lines.append("")
        lines.append("2. **Check FILES USED**: Are you planning to use the same files as a previous step?")
        lines.append("   - If YES and same atom_id: This is a LOOP - choose a different atom_id or different files")
        lines.append("   - Example: If Step 1 used 'merge' on files [A, B], do NOT use 'merge' on [A, B] again")
        lines.append("")
        lines.append("3. **Check OUTPUT FILES**: Did a previous step create a file you should use?")
        lines.append("   - If YES: Use that output file instead of repeating the operation")
        lines.append("   - Example: If Step 1 created 'merged_data.arrow', use 'merged_data.arrow' in Step 2, not the original files")
        lines.append("")
        lines.append("4. **Check GOAL STATUS**: Is the user's request fully satisfied?")
        lines.append("   - **CRITICAL**: Only set goal_achieved: true if:")
        lines.append("     * The user is NOT asking for anything more")
        lines.append("     * ALL required operations are complete")
        lines.append("     * **Chart-maker has been executed** (visualization is shown)")
        lines.append("   - If chart-maker has NOT been used yet, set goal_achieved: false and plan chart-maker as next step")
        lines.append("   - If user asks for 'chart', 'redo', 'modify', or any new operation, set goal_achieved: false and continue")
        lines.append("   - Example: If user asked for 'merge and chart', and merge is done but chart-maker not used, set goal_achieved: false and plan chart-maker")
        lines.append("   - Example: If user asked for 'merge and chart', both are done, and user says 'thanks' or nothing, then set goal_achieved: true")
        lines.append("   - **ALWAYS honor user requests** - Never refuse or say 'no need to do'")
        lines.append("")
        lines.append("**ANTI-LOOP EXAMPLES:**")
        lines.append("- ❌ BAD: Step 1: groupby on file A → Step 2: groupby on file A (SAME operation, SAME file)")
        lines.append("- ✅ GOOD: Step 1: groupby on file A → Step 2: chart-maker on output_file (DIFFERENT operation, uses output)")
        lines.append("- ❌ BAD: Step 1: merge files [A, B] → Step 2: merge files [A, B] (REPEATED)")
        lines.append("- ✅ GOOD: Step 1: merge files [A, B] → Step 2: groupby on merged_output (USES OUTPUT)")
        lines.append("")
        lines.append("## 📚 DETAILED WORKFLOW EXAMPLES (Learn from these):")
        lines.append("")
        lines.append("### Example 1: Compute Annual Sales of Product/Brand/SKU Over Years Across Markets")
        lines.append("")
        lines.append("**User Request**: 'How to compute annual sales of a particular product or SKU or brand over the last few years across markets or regions?'")
        lines.append("")
        lines.append("**Step-by-Step Workflow:**")
        lines.append("1. **Check Date/Year Column**: Check if 'Year' column exists. If not, check if 'date' column exists.")
        lines.append("2. **Handle Date DataType** (if needed): If 'date' exists but is in object form:")
        lines.append("   - Use data-upload-validate atom to load the file")
        lines.append("   - Change datatype of 'date' column to 'datetime' using dtype_changes")
        lines.append("   - Save the dataframe")
        lines.append("3. **Create Year Column** (if needed):")
        lines.append("   - Use dataframe-operations atom")
        lines.append("   - Create a new column called 'Year' using the formula 'Year' (extracts year from date column)")
        lines.append("   - Save the dataframe")
        lines.append("4. **Group and Aggregate Sales**:")
        lines.append("   - Use groupby-wtg-avg atom")
        lines.append("   - Group by: product/brand/SKU, market/region, Year")
        lines.append("   - For volume and value sales: aggregate using 'sum'")
        lines.append("   - For price and distribution: aggregate using 'weighted_avg' (weighted mean of volume)")
        lines.append("   - Save this new dataframe")
        lines.append("5. **Visualize Results**:")
        lines.append("   - Use chart-maker atom")
        lines.append("   - Chart type: bar chart")
        lines.append("   - X-axis: 'Year'")
        lines.append("   - Y-axis: 'Annual sales' (or aggregated sales column)")
        lines.append("   - Use the output file from step 4")
        lines.append("")
        lines.append("### Example 2: Compute Market Share of Products Across Markets for Specific Time")
        lines.append("")
        lines.append("**User Request**: 'How will you compute market share of different products across markets for a specific time?'")
        lines.append("")
        lines.append("**Step-by-Step Workflow:**")
        lines.append("1. **Check Date/Year Column**: Check if 'Year' column exists. If not, check if 'date' column exists.")
        lines.append("2. **Handle Date DataType** (if needed): If 'date' exists but is in object form:")
        lines.append("   - Use data-upload-validate atom to load the file")
        lines.append("   - Change datatype of 'date' column to 'datetime' using dtype_changes")
        lines.append("   - Save the dataframe")
        lines.append("3. **Create Time Period Column**:")
        lines.append("   - Use dataframe-operations atom")
        lines.append("   - Create a new column for the specific time period (Year, Month, or Quarter)")
        lines.append("   - Use formula 'Year', 'Month', or 'Quarter' as appropriate")
        lines.append("   - Save the dataframe")
        lines.append("4. **Check for Market Share Column**:")
        lines.append("   - If 'Market Share' column already exists:")
        lines.append("     → Go to Step 5 (Visualize)")
        lines.append("   - If 'Market Share' column does NOT exist:")
        lines.append("     → Continue to Step 4a")
        lines.append("4a. **Calculate Category Sales**:")
        lines.append("   - Use groupby-wtg-avg atom")
        lines.append("   - Group by: market, date (or time period column)")
        lines.append("   - For volume and value sales: aggregate using 'sum'")
        lines.append("   - For price and distribution: aggregate using 'weighted_avg'")
        lines.append("   - Rename aggregated column to 'Category Sales'")
        lines.append("   - Save this dataframe as 'Category Sales'")
        lines.append("4b. **Merge with Original Data**:")
        lines.append("   - Use merge atom")
        lines.append("   - Left join: original dataframe with 'Category Sales' dataframe")
        lines.append("   - Join on: 'Market' and 'date' (or time period column)")
        lines.append("   - Save merged dataframe as 'Merged_Brand_Cat'")
        lines.append("4c. **Calculate Market Share**:")
        lines.append("   - Use dataframe-operations atom")
        lines.append("   - Select 'Merged_Brand_Cat' file")
        lines.append("   - Create new column called 'Market Share'")
        lines.append("   - Formula: Sales value / Category Sales (DIV operation)")
        lines.append("   - Save the dataframe")
        lines.append("5. **Visualize Market Share**:")
        lines.append("   - Use chart-maker atom")
        lines.append("   - Chart type: pie chart")
        lines.append("   - X-axis: 'brand' or 'product'")
        lines.append("   - Y-axis: 'Market Share'")
        lines.append("   - Filters: Add 'market' and time period as filters")
        lines.append("   - Use the output file from step 4c (or step 3 if market share already existed)")
        lines.append("")
        lines.append("**Key Learnings from Examples:**")
        lines.append("- Always check for required columns (Year, date, Market Share) before using them")
        lines.append("- Handle data types properly (object → datetime conversion)")
        lines.append("- Create derived columns when needed (Year, Market Share)")
        lines.append("- Use groupby for aggregations (sum for sales, weighted_avg for price/distribution)")
        lines.append("- Use merge to combine dataframes when calculating ratios (market share = brand sales / category sales)")
        lines.append("- Always end with chart-maker to visualize results")
        lines.append("- Use output files from previous steps, not original files")
        lines.append("")
        
        return "\n".join(lines)
    
    def _build_react_evaluation_prompt(
        self,
        execution_result: Dict[str, Any],
        atom_id: str,
        step_number: int,
        user_prompt: str,
        step_plan: WorkflowStepPlan,
        execution_history: List[Dict[str, Any]]
    ) -> str:
        """
        Build ReAct-style evaluation prompt for step result assessment.
        """
        lines: List[str] = []
        
        # Detect if user is asking for something new
        user_request_keywords = ["chart", "graph", "visualize", "plot", "redo", "redo it", "modify", "change", 
                                 "create", "generate", "make", "show", "display", "analyze", "do", "now", 
                                 "also", "and", "then", "next", "please", "can you", "i want", "i need"]
        user_asking_for_something = any(keyword.lower() in user_prompt.lower() for keyword in user_request_keywords)
        
        lines.append("You are a ReAct-style agent evaluator. Evaluate the execution result of a workflow step.")
        lines.append("")
        lines.append("## ⚠️ CRITICAL: ALWAYS HONOR USER REQUESTS")
        lines.append("**MOST IMPORTANT RULE**: If the user asks for something, you MUST continue. Never refuse, never say 'no need', never set decision='complete' when user is asking for more.")
        lines.append("")
        lines.append("## USER REQUEST")
        lines.append(user_prompt)
        lines.append("")
        
        if user_asking_for_something:
            lines.append("**⚠️ USER IS ASKING FOR SOMETHING - YOU MUST CONTINUE:**")
            lines.append("- The user request contains keywords indicating they want an operation performed")
            lines.append("- You MUST set decision='continue' (NOT 'complete')")
            lines.append("- Do NOT refuse or say the work is already done")
            lines.append("- Do NOT set decision='complete' when user is asking for something")
            lines.append("")
        
        lines.append("## STEP THAT WAS EXECUTED")
        lines.append(f"Step {step_number}: {atom_id}")
        lines.append(f"Description: {step_plan.description}")
        lines.append(f"Files used: {', '.join(step_plan.files_used) if step_plan.files_used else 'None'}")
        lines.append("")
        
        lines.append("## EXECUTION RESULT")
        # Format result for readability - truncate large results to prevent timeout
        result_str = json.dumps(execution_result, indent=2)
        # Truncate if too long (keep it concise for faster evaluation)
        max_result_length = 1500  # Reduced from 2000 for faster processing
        if len(result_str) > max_result_length:
            result_str = result_str[:max_result_length] + "\n... (truncated - result too large)"
        lines.append(result_str)
        lines.append("")
        
        # Add summary of result size
        if len(json.dumps(execution_result)) > max_result_length:
            lines.append(f"Note: Full result is {len(json.dumps(execution_result))} chars, showing summary above")
            lines.append("")
        
        success = bool(execution_result.get("success", True))
        error = execution_result.get("error") or execution_result.get("message", "")
        
        lines.append("## EXECUTION STATUS")
        lines.append(f"Success: {success}")
        if error and not success:
            lines.append(f"Error: {error}")
        lines.append("")
        
        if execution_history:
            lines.append("## PREVIOUS STEPS")
            for hist in execution_history[-3:]:  # Last 3 steps
                step_num = hist.get("step_number", "?")
                atom_id_hist = hist.get("atom_id", "?")
                result_hist = hist.get("result", {})
                success_hist = result_hist.get("success", True)
                lines.append(f"Step {step_num}: {atom_id_hist} - {'✅' if success_hist else '❌'}")
            lines.append("")
        
        lines.append("## YOUR TASK")
        lines.append("Evaluate this step execution and decide what to do next.")
        lines.append("")
        lines.append("**EVALUATION CHECKLIST (Be thorough):**")
        lines.append("1. **Correctness**: Was the execution successful? Any errors? Check the execution_result for success status.")
        lines.append("2. **Result Quality**: Does the result meet the user's goal? Is the data correct? Check if output files were created.")
        lines.append("3. **Issues**: Are there any problems or anomalies in the result?")
        lines.append("4. **Chart Requirement**: Has chart-maker been used in this workflow? If NOT, you MUST set decision='continue' to plan chart-maker next.")
        lines.append("5. **Next Action**: What should happen next? If chart-maker not used, plan it. If all done including chart, set decision='complete'.")
        lines.append("")
        lines.append("Respond with JSON in this format:")
        lines.append("{")
        lines.append('  "decision": "continue|retry_with_correction|change_approach|complete",')
        lines.append('  "reasoning": "Your detailed reasoning about the result and decision",')
        lines.append('  "quality_score": 0.85,  // Optional: 0.0 to 1.0')
        lines.append('  "correctness": true,  // Was execution successful?')
        lines.append('  "issues": ["issue1", "issue2"],  // List any problems found')
        lines.append('  "corrected_prompt": "...",  // Only if decision is retry_with_correction')
        lines.append('  "alternative_approach": "..."  // Only if decision is change_approach')
        lines.append("}")
        lines.append("")
        lines.append("DECISION GUIDE:")
        lines.append("- **continue**: Step succeeded and we should proceed to next step")
        lines.append("- **retry_with_correction**: Step failed or has issues, retry with corrected parameters")
        lines.append("- **change_approach**: Current approach won't work, try different tool/strategy")
        lines.append("- **complete**: User's goal is fully achieved, workflow is done")
        lines.append("")
        lines.append("⚠️ CRITICAL: When to set decision='complete':")
        lines.append("- **ONLY** if the user's original request has been fully satisfied AND user is NOT asking for more")
        lines.append("- If all required data transformations are done AND user has not requested additional work")
        lines.append("- If the final output (chart, report, etc.) has been created AND user is satisfied")
        lines.append("- **DO NOT set 'complete' if:**")
        lines.append("  * User asks for a chart (even if one exists, user may want a different type)")
        lines.append("  * User asks to 'redo' or 'modify' something")
        lines.append("  * User asks for additional analysis or operations")
        lines.append("  * User makes ANY new request - always honor it with decision='continue'")
        lines.append("- **ALWAYS LISTEN TO THE USER** - If user asks for something, set decision='continue' and do it")
        lines.append("- DO NOT set 'complete' if more work is clearly needed or if user is asking for something")
        lines.append("")
        lines.append("⚠️ REDUNDANCY CHECK (CRITICAL):")
        lines.append("Before deciding, check if this step is redundant:")
        lines.append("")
        lines.append("1. **Same atom, same files**: If this step used the same atom_id and same files as a previous step:")
        lines.append("   - This is REDUNDANT - set decision='complete' if goal is achieved, or 'change_approach' if not")
        lines.append("   - Example: Step 1 used 'groupby' on file A → Step 2 used 'groupby' on file A = REDUNDANT")
        lines.append("")
        lines.append("2. **Same operation, different files**: If this step did the same operation but on different files:")
        lines.append("   - This might be intentional (e.g., grouping multiple files separately)")
        lines.append("   - Check if the user's goal requires this, or if it's redundant")
        lines.append("")
        lines.append("3. **Output file created**: If this step created an output file:")
        lines.append("   - Check if that output file should be used in the next step")
        lines.append("   - If the next step would repeat this operation, set decision='complete' or 'change_approach'")
        lines.append("")
        lines.append("4. **Goal completion check**: Review the user's original request:")
        lines.append("   - Have all required operations been completed?")
        lines.append("   - **CRITICAL**: Has chart-maker been executed? If NOT, set decision='continue' to plan chart-maker")
        lines.append("   - Has a visualization been created? Chart-maker MUST be used before completion")
        lines.append("   - **CRITICAL**: Is the user asking for something NEW or additional work?")
        lines.append("   - If user asks for chart, redo, modify, or any new operation → set decision='continue' (NOT 'complete')")
        lines.append("   - Only set decision='complete' if:")
        lines.append("     * ALL operations are done")
        lines.append("     * Chart-maker has been executed (visualization shown)")
        lines.append("     * User is NOT asking for more")
        lines.append("   - **ALWAYS honor user requests** - Never refuse or say the work is already done")
        lines.append("")
        lines.append("⚠️ LOOP PREVENTION:")
        lines.append("- If this step is similar to a previous step, consider if goal is achieved")
        lines.append("- If the same operation keeps succeeding, the goal might be complete")
        lines.append("- If you see a pattern of repetition, set decision='complete' or 'change_approach'")
        lines.append("- Check if user's request has been fully addressed")
        lines.append("")
        lines.append("**EVALUATION EXAMPLES:**")
        lines.append("- ✅ GOOD: Step succeeded, created output file, goal not yet achieved → decision='continue'")
        lines.append("- ✅ GOOD: Step succeeded, user asks for chart → decision='continue' (ALWAYS honor user requests)")
        lines.append("- ✅ GOOD: Step succeeded, user asks to redo → decision='continue' (ALWAYS honor user requests)")
        lines.append("- ✅ GOOD: Step succeeded, all operations done, chart created, user says 'thanks' → decision='complete'")
        lines.append("- ❌ BAD: Step succeeded, user asks for chart, but you set decision='complete' → WRONG! Should be 'continue'")
        lines.append("- ❌ BAD: Step succeeded but same as previous step → decision='complete' (if goal achieved) or 'change_approach'")
        lines.append("- ❌ BAD: Step failed due to wrong column names → decision='retry_with_correction'")
        lines.append("- ❌ BAD: Refusing user request or saying 'no need' → NEVER do this! Always honor user requests")
        lines.append("")
        lines.append("Be thorough in your evaluation and provide clear reasoning.")
        
        return "\n".join(lines)
    
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
        available_files = list(available_files or [])
        existing_files = self._sequence_available_files.get(sequence_id)
        if existing_files:
            available_files = existing_files
        self._sequence_available_files[sequence_id] = available_files
        # Store project_context for this sequence (needed for dataframe-operations and other agents)
        self._sequence_project_context[sequence_id] = project_context or {}
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
                            frontend_chat_id=frontend_chat_id  # Pass chat_id for cache isolation
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
        frontend_chat_id: Optional[str] = None
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

    def _register_output_alias(
        self, sequence_id: str, alias: Optional[str], file_path: Optional[str]
    ) -> None:
        """Track which file path was produced for a given output alias."""
        if not alias or not file_path or not isinstance(alias, str):
            return
        alias_map = self._output_alias_registry.setdefault(sequence_id, {})
        normalized = self._normalize_alias_token(alias)
        alias_map[alias.strip()] = file_path
        alias_map[normalized] = file_path

    def _resolve_alias_value(self, sequence_id: str, token: Optional[str]) -> Optional[str]:
        """Resolve an alias token to the stored file path if available."""
        if not token or not isinstance(token, str):
            return token
        alias_map = self._output_alias_registry.get(sequence_id)
        if not alias_map:
            return token
        stripped = token.strip()
        normalized = self._normalize_alias_token(stripped)
        return alias_map.get(stripped) or alias_map.get(normalized) or token

    def _extract_output_file_from_history(
        self,
        sequence_id: str,
        history_entry: Dict[str, Any],
    ) -> Optional[str]:
        """Infer the materialized output file path from a previous execution entry."""
        step_number = history_entry.get("step_number")
        saved_outputs = self._step_output_files.get(sequence_id, {})
        if step_number in saved_outputs:
            return saved_outputs[step_number]

        atom_id = history_entry.get("atom_id", "")
        result = history_entry.get("result", {}) or {}

        if atom_id == "merge" and isinstance(result.get("merge_json"), dict):
            return result.get("merge_json", {}).get("result_file") or result.get("saved_path")
        if atom_id == "concat" and isinstance(result.get("concat_json"), dict):
            return result.get("concat_json", {}).get("result_file") or result.get("saved_path")
        if atom_id in {"create-column", "create-transform", "groupby-wtg-avg", "dataframe-operations"}:
            return result.get("output_file") or result.get("saved_path")

        return result.get("output_file") or result.get("saved_path")

    def _extract_row_count(self, result: Dict[str, Any]) -> Optional[float]:
        """Return a simple row-count metric from flat or nested result payloads."""
        row_keys = ("row_count", "rowcount", "rows", "count", "record_count")
        for key in row_keys:
            value = result.get(key)
            if isinstance(value, (int, float)):
                return float(value)

        nested_keys = ("merge_json", "concat_json", "groupby_json", "dataframe_result", "result")
        for nested_key in nested_keys:
            nested = result.get(nested_key)
            if isinstance(nested, dict):
                for key in row_keys:
                    value = nested.get(key)
                    if isinstance(value, (int, float)):
                        return float(value)
        return None

    def _validate_chain_for_next_step(
        self,
        sequence_id: str,
        execution_history: List[Dict[str, Any]],
        next_step: WorkflowStepPlan,
    ) -> Tuple[bool, str]:
        """
        Run sanity checks on the previous step before chaining into the next atom.

        Ensures we don't cascade failures or empty datasets into follow-up operations.
        """
        if not execution_history:
            return True, ""

        last_entry = execution_history[-1]
        last_result = last_entry.get("result", {}) or {}
        if not bool(last_result.get("success", True)):
            return False, "Previous atom failed; re-plan before continuing."

        produced_file = self._extract_output_file_from_history(sequence_id, last_entry)
        available_files = set(self._sequence_available_files.get(sequence_id, []) or [])

        requires_previous_output = False
        dependency_tokens: List[str] = []
        if next_step.files_used:
            dependency_tokens.extend(next_step.files_used)
        if next_step.inputs:
            dependency_tokens.extend(next_step.inputs)

        for value in dependency_tokens:
            normalized = self._resolve_alias_value(sequence_id, value)
            if normalized in {produced_file, last_entry.get("output_alias"), "auto_from_previous"}:
                requires_previous_output = True
            if normalized in available_files:
                requires_previous_output = True

        if requires_previous_output and not produced_file:
            return False, "No materialized output from prior step; cannot chain safely."

        if produced_file and requires_previous_output and produced_file not in available_files:
            return False, f"Expected previous output {produced_file} to be available but it is not registered."

        row_count = self._extract_row_count(last_result)
        if requires_previous_output and row_count is not None and row_count <= 0:
            return False, "Previous atom produced an empty dataset; review before continuing."

        return True, ""

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

    def _bind_operands_for_replay(
        self,
        sequence_id: str,
        step_plan: WorkflowStepPlan,
        dependency_tokens: List[str],
        available_files: List[str],
    ) -> WorkflowStepPlan:
        """Rebind a cached step plan to the latest operands before replaying."""

        bound_plan = copy.deepcopy(step_plan)
        resolved_operands: List[str] = []

        def _append_if_available(token: str) -> None:
            normalized = self._resolve_alias_value(sequence_id, token)
            if normalized in available_files and normalized not in resolved_operands:
                resolved_operands.append(normalized)

        for token in dependency_tokens:
            _append_if_available(token)

        if not resolved_operands:
            for token in bound_plan.files_used or []:
                _append_if_available(token)
            for token in bound_plan.inputs or []:
                _append_if_available(token)

        if not resolved_operands and available_files:
            resolved_operands.append(available_files[-1])

        if resolved_operands:
            if bound_plan.files_used != resolved_operands:
                logger.info(
                    "🔧 ReAct: Rebinding replay operands for step %s -> %s",
                    bound_plan.step_number,
                    resolved_operands,
                )
            bound_plan.files_used = resolved_operands
            bound_plan.inputs = resolved_operands

        return bound_plan

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

    def _build_atom_facts(
        self, step: WorkflowStepPlan, execution_result: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Summarize execution payload into facts for business insight prompts."""

        execution_result = execution_result or {}
        facts: Dict[str, Any] = {
            "atom_id": step.atom_id,
            "description": step.description,
            "result_keys": list(execution_result.keys()),
            "result_preview": self._extract_result_preview(execution_result, max_chars=600),
        }

        for meta_key in ("schema", "columns", "chart_json", "metadata", "summary", "stats"):
            if meta_key in execution_result:
                facts[meta_key] = execution_result.get(meta_key)

        tabular_rows = self._extract_tabular_rows(execution_result)
        if tabular_rows:
            facts["rows"] = tabular_rows[:50]
            facts["row_count"] = len(tabular_rows)

        return facts

    def _extract_tabular_rows(self, execution_result: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Find tabular payloads from known atom result shapes."""

        for candidate in (
            "table_json",
            "merge_json",
            "groupby_json",
            "concat_json",
            "rows",
            "data",
            "preview",
        ):
            value = execution_result.get(candidate)
            if isinstance(value, list):
                return value
            if isinstance(value, dict):
                if isinstance(value.get("data"), list):
                    return value.get("data")  # type: ignore
                if isinstance(value.get("rows"), list):
                    return value.get("rows")  # type: ignore

        return []

    def _compute_data_hash(self, facts: Dict[str, Any]) -> str:
        """Create a stable hash for caching atom-level insights."""

        serialized = self._safe_json_dumps(facts, fallback="")
        return hashlib.sha256(serialized.encode("utf-8")).hexdigest()

    def _compose_business_context(
        self,
        step: WorkflowStepPlan,
        atom_prompt: str,
        execution_result: Dict[str, Any],
    ) -> str:
        """Create a business-focused context block for the insight prompt."""

        if not self.laboratory_retriever:
            return ""

        execution_result = execution_result or {}

        query_parts = [
            step.description,
            atom_prompt,
            getattr(step, "atom_prompt", ""),
            getattr(step, "prompt", ""),
        ]
        query = " ".join([part for part in query_parts if part]) or step.atom_id

        try:
            return self.laboratory_retriever.generate_business_insights(
                atom_id=step.atom_id,
                query=query,
                execution_result=execution_result,
                top_n=3,
            )
        except Exception as business_exc:
            logger.debug("🔇 Business context skipped: %s", business_exc)
            return ""

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
        business_context = self._compose_business_context(step, base_prompt, execution_result)

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
            f"BUSINESS CONTEXT\n{business_context}\n\n" if business_context else ""
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
        insight: Optional[str] = None,
        atom_insights: Optional[List[Dict[str, str]]] = None,
    ) -> None:
        """Cache step execution results and generated insights for later use."""
        cache = self._step_execution_cache.setdefault(sequence_id, {})
        cache[step_number] = {
            "atom_id": atom_id,
            "execution_result": execution_result,
            "recorded_at": datetime.utcnow().isoformat(),
            "insight": insight,
            "atom_insights": atom_insights or [],
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
                "atom_insights": step_cache.get("atom_insights") or [],
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

    def _is_websocket_connected(self, websocket) -> bool:
        """Check if WebSocket is still connected."""
        try:
            if hasattr(websocket, 'client_state'):
                return websocket.client_state.name != 'DISCONNECTED'
            if hasattr(websocket, 'application_state'):
                return websocket.application_state.name != 'DISCONNECTED'
            # If we can't check state, assume connected (will fail on send if not)
            return True
        except Exception:
            return True  # Assume connected if check fails

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

    def _cleanup_sequence_state(self, sequence_id: str) -> None:
        """Remove cached data for a sequence after completion."""
        self._step_execution_cache.pop(sequence_id, None)
        self._step_output_files.pop(sequence_id, None)
        self._sequence_available_files.pop(sequence_id, None)
        self._output_alias_registry.pop(sequence_id, None)
        self._chat_file_mentions.pop(sequence_id, None)
        self._sequence_react_state.pop(sequence_id, None)  # Cleanup ReAct state
        self._sequence_step_plans.pop(sequence_id, None)
        self._sequence_replay_counts.pop(sequence_id, None)
        self._react_step_guards.pop(sequence_id, None)
        self._react_stall_watchdogs.pop(sequence_id, None)

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
        for sequence_id, files in self._sequence_available_files.items():
            if any(path in files for path in file_paths):
                context = self._sequence_project_context.get(sequence_id) or {}
                if context:
                    return context

        # Fallback to any known project context
        for context in self._sequence_project_context.values():
            if context:
                return context

        return {}

    def _get_file_metadata(
        self,
        file_paths: List[str],
        sequence_id: Optional[str] = None,
        project_context: Optional[Dict[str, Any]] = None,
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
        if not resolved_context and sequence_id:
            resolved_context = self._sequence_project_context.get(sequence_id, {})
        if not resolved_context:
            resolved_context = self._resolve_project_context_for_files(file_paths)
        
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
                # Extract filename from path
                filename = file_path.split('/')[-1] if '/' in file_path else file_path
                filename = filename.split('\\')[-1] if '\\' in filename else filename
                file_names.append(filename)
                path_to_filename[file_path] = filename
            
            # Get file details using BaseAgent.FileReader (standardized)
            if file_names:
                file_details_dict = {}
                try:
                    file_reader = FileReader()

                    # Update prefix using the resolved project context to avoid
                    # falling back to the MinIO root between atoms/steps
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
                        # Try full path first (keeps folder context), then fallback to filename
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
                    # Map back to original file paths
                    for file_path, metadata in file_details_dict.items():
                        metadata_dict[file_path] = metadata
                    
                    # Log what metadata was retrieved
                    for file_path, metadata in metadata_dict.items():
                        has_stats = bool(metadata.get("column_stats") or metadata.get("statistics"))
                        has_cols = bool(metadata.get("columns"))
                        logger.debug(f"📊 File {file_path}: columns={has_cols}, statistics={has_stats}")
                    
                    logger.info(f"✅ Retrieved metadata for {len(metadata_dict)}/{len(file_paths)} files")
                else:
                    logger.warning(f"⚠️ Could not retrieve metadata for files: {file_names}")
        except Exception as e:
            # Log as debug since this is non-critical (files can still be accessed via FileReader)
            logger.debug(f"⚠️ Failed to get file metadata: {e} (non-critical - files accessible via other means)")
        
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
            found_match = False
            for valid_col in valid_columns_set:
                if col_clean.lower() == valid_col.lower():
                    validated_columns.append(valid_col)  # Use the actual column name from metadata
                    found_match = True
                    break
            
            if not found_match:
                logger.warning(f"⚠️ Column '{col_clean}' not found in file metadata. Valid columns: {list(valid_columns_set)[:10]}...")
        
        if len(validated_columns) < len(column_names):
            logger.info(f"✅ Validated columns: {len(validated_columns)}/{len(column_names)} passed validation")
        
        return validated_columns
    
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

