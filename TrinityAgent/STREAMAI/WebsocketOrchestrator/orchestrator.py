"""
Stream AI WebSocket orchestrator broken into modular mixins for readability.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Set

from .common import aiohttp, generate_insights, logger, memory_storage_module, summarize_chat_messages
from .constants import DATASET_OUTPUT_ATOMS, PREFERS_LATEST_DATASET_ATOMS
from .types import ReActState, WebSocketEvent, WorkflowStepPlan
from .react_mixin import ReactWorkflowMixin
from .planning_mixin import WorkflowPlanningMixin
from .execution_mixin import WorkflowExecutionMixin
from STREAMAI.lab_context_builder import LabContextBuilder
from STREAMAI.lab_memory_store import LabMemoryStore
from ..graphrag import GraphRAGWorkspaceConfig
from ..graphrag.client import GraphRAGQueryClient
from ..graphrag.prompt_builder import GraphRAGPromptBuilder, PhaseOnePrompt as GraphRAGPhaseOnePrompt
from STREAMAI.laboratory_retriever import LaboratoryRetrievalPipeline
from STREAMAI.lab_memory_models import WorkflowStepRecord
from ..atom_mapping import ATOM_MAPPING

# Import workflow_insight_agent - try both paths for Docker and local development
try:  # pragma: no cover
    from Agent_Insight.workflow_insight_agent import get_workflow_insight_agent
except ImportError:  # pragma: no cover
    try:
        from TrinityAgent.Agent_Insight.workflow_insight_agent import get_workflow_insight_agent
    except ImportError:  # pragma: no cover
        # Fallback: define a no-op function
        def get_workflow_insight_agent():
            return None

# Import centralized settings
try:  # pragma: no cover
    from BaseAgent.config import settings
except ImportError:  # pragma: no cover
    try:
        from TrinityAgent.BaseAgent.config import settings
    except ImportError:  # pragma: no cover
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
try:  # pragma: no cover
    from ..react_workflow_orchestrator import get_react_orchestrator
    REACT_AVAILABLE = True
except ImportError:  # pragma: no cover
    try:
        from STREAMAI.react_workflow_orchestrator import get_react_orchestrator
        REACT_AVAILABLE = True
    except ImportError:  # pragma: no cover
        REACT_AVAILABLE = False
        logger.warning("⚠️ ReAct orchestrator not available, using legacy workflow")

        def get_react_orchestrator():
            return None


class StreamWebSocketOrchestrator(WorkflowExecutionMixin, WorkflowPlanningMixin, ReactWorkflowMixin):
    """
    Orchestrates Stream AI workflow execution via WebSocket.
    Sends real-time events to frontend for UI updates.
    """

    def __init__(
        self,
        workflow_planner,
        parameter_generator,
        result_storage,
        rag_engine,
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

        self.lab_memory_store: Optional[LabMemoryStore] = None
        self.lab_context_builder: Optional[LabContextBuilder] = None
        try:
            self.lab_memory_store = LabMemoryStore()
            self.lab_context_builder = LabContextBuilder(self.lab_memory_store)
            logger.info("✅ Laboratory deterministic memory store initialized")
        except Exception as lab_memory_exc:
            logger.warning("⚠️ Laboratory memory store unavailable: %s", lab_memory_exc)
            self.lab_memory_store = None
            self.lab_context_builder = None

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
        self._lab_atom_snapshot_cache: Dict[str, List[Dict[str, Any]]] = {}  # Realtime lab-mode atoms per sequence

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
            except Exception as e:  # pragma: no cover - optional dependency
                logger.warning(f"⚠️ Could not initialize ReAct orchestrator: {e}")

        logger.info("✅ StreamWebSocketOrchestrator initialized")
