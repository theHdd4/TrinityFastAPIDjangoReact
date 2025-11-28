"""
Base Agent for Trinity AI
Comprehensive base class providing all standard functionality for agents.
"""

import json
import uuid
import logging
import requests
import time
import os
from datetime import datetime
from typing import Dict, Any, Optional, List
from abc import ABC, abstractmethod

from .config import settings
from .interfaces import BaseAgentInterface, AgentContext, AgentResult
from .exceptions import (
    TrinityException,
    FileLoadError,
    JSONExtractionError,
    ValidationError
)
from .json_handler import JSONHandler
from .validator import Validator
from .data_validator import DataValidator
from .memory_storage import MemoryStorage
from .file_reader import FileReader

logger = logging.getLogger("trinity.base_agent")


class BaseAgent(BaseAgentInterface, ABC):
    """
    Comprehensive base class for all Trinity AI agents.
    
    Provides standardized functionality:
    - Configuration management
    - File loading and reading
    - Memory storage
    - JSON extraction and validation
    - LLM integration
    - Session management
    - Error handling
    """
    
    def __init__(
        self,
        api_url: Optional[str] = None,
        model_name: Optional[str] = None,
        bearer_token: Optional[str] = None,
        minio_endpoint: Optional[str] = None,
        access_key: Optional[str] = None,
        secret_key: Optional[str] = None,
        bucket: Optional[str] = None,
        prefix: str = ""
    ):
        """Initialize BaseAgent with configuration."""
        # LLM configuration
        llm_config = settings.get_llm_config()
        self.api_url = api_url or llm_config["api_url"]
        self.model_name = model_name or settings.LLM_MODEL_NAME
        self.bearer_token = bearer_token or settings.LLM_BEARER_TOKEN
        
        # MinIO configuration
        minio_config = settings.get_minio_config()
        self.minio_endpoint = minio_endpoint or minio_config["endpoint"]
        self.minio_access_key = access_key or minio_config["access_key"]
        self.minio_secret_key = secret_key or minio_config["secret_key"]
        self.bucket = bucket or minio_config["bucket"]
        self.prefix = prefix or minio_config["prefix"]
        
        # Initialize standard components
        self.file_reader = FileReader(
            minio_endpoint=self.minio_endpoint,
            access_key=self.minio_access_key,
            secret_key=self.minio_secret_key,
            bucket=self.bucket,
            prefix=self.prefix
        )
        
        self.memory_storage = MemoryStorage(
            minio_endpoint=self.minio_endpoint,
            access_key=self.minio_access_key,
            secret_key=self.minio_secret_key,
            bucket=self.bucket
        )
        
        self.json_handler = JSONHandler()
        self.validator = Validator()
        self.data_validator: Optional[DataValidator] = None  # Initialized after files are loaded
        
        # File state management
        self.files_with_columns: Dict[str, Any] = {}
        self._files_loaded = False
        
        # Session management
        self.sessions: Dict[str, List[Dict[str, Any]]] = {}
        
        logger.info(f"BaseAgent initialized: {self.__class__.__name__}")
    
    # ========================================================================
    # File Management Methods
    # ========================================================================
    
    def set_context(self, client_name: str = "", app_name: str = "", project_name: str = "") -> None:
        """
        Set context for the agent.
        Note: Context is now passed directly to methods that need it (like load_files),
        rather than being stored in environment variables or FileReader.
        """
        # Context is stored for use in other methods, but not set in environment
        # FileReader no longer has set_context - context is passed directly to load_files
        logger.info(f"🔧 Context set: {client_name}/{app_name}/{project_name}")
    
    def _load_files(
        self,
        client_name: str = "",
        app_name: str = "",
        project_name: str = ""
    ) -> None:
        """Load available files using the standardized file reader."""
        try:
            self.files_with_columns = self.file_reader.load_files(
                client_name=client_name,
                app_name=app_name,
                project_name=project_name
            )
            self._files_loaded = True
            logger.info(f"Loaded {len(self.files_with_columns)} files from MinIO")
            
            # Initialize data validator after files are loaded
            try:
                from minio import Minio
                self.data_validator = DataValidator(
                    minio_client=self.file_reader.minio_client,
                    bucket=self.bucket,
                    files_with_columns=self.files_with_columns,
                    prefix=self.file_reader.prefix
                )
                logger.info("✅ DataValidator initialized for robust data validation")
            except Exception as e:
                logger.warning(f"⚠️ Failed to initialize DataValidator: {e}")
                self.data_validator = None
        except Exception as e:
            logger.error(f"Error loading files: {e}")
            self.files_with_columns = {}
            self._files_loaded = False
            raise FileLoadError(f"Failed to load files: {e}")
    
    def _ensure_files_loaded(
        self,
        client_name: str = "",
        app_name: str = "",
        project_name: str = ""
    ) -> None:
        """Ensure files are loaded before processing requests."""
        if not self._files_loaded:
            self._load_files(client_name, app_name, project_name)
    
    # ========================================================================
    # LLM Integration Methods
    # ========================================================================
    
    def _call_llm(self, prompt: str, temperature: float = 0.1, num_predict: int = 4000) -> str:
        """
        Call the LLM API with standardized payload structure.
        
        Args:
            prompt: The prompt to send to the LLM
            temperature: Temperature for LLM (default: 0.1)
            num_predict: Maximum tokens to predict (default: 4000)
        
        Returns:
            The LLM response content as a string
        """
        # Print full prompt to terminal
        print("\n" + "="*80)
        print(f"🚀 BASE AGENT LLM CALL - FULL PROMPT (Agent: {self.__class__.__name__})")
        print("="*80)
        print(f"API URL: {self.api_url}")
        print(f"Model: {self.model_name}")
        print(f"Temperature: {temperature}, Num Predict: {num_predict}")
        print(f"Prompt Length: {len(prompt)} characters")
        print("-"*80)
        print("FULL PROMPT:")
        print("-"*80)
        print(prompt)
        print("="*80 + "\n")
        
        logger.info(f"CALLING LLM: {self.api_url}, Model: {self.model_name}")
        
        payload = {
            "model": self.model_name,
            "messages": [{"role": "user", "content": prompt}],
            "stream": False,
            "options": {
                "temperature": temperature,
                "num_predict": num_predict,
                "top_p": 0.9,
                "repeat_penalty": 1.1
            }
        }
        headers = {
            "Authorization": f"Bearer {self.bearer_token}",
            "Content-Type": "application/json"
        }
        
        try:
            response = requests.post(
                self.api_url,
                json=payload,
                headers=headers,
                timeout=300
            )
            response.raise_for_status()
            
            # Get raw response
            raw_response_text = response.text
            response_data = response.json()
            content = response_data.get('message', {}).get('content', '')
            
            # Print raw API response to terminal
            print("\n" + "="*80)
            print(f"📥 BASE AGENT LLM - RAW RESPONSE (Agent: {self.__class__.__name__})")
            print("="*80)
            print(f"Status Code: {response.status_code}")
            print("-"*80)
            print("RAW JSON RESPONSE:")
            print("-"*80)
            print(raw_response_text)
            print("="*80 + "\n")
            
            # Print processed content
            print("\n" + "="*80)
            print(f"✨ BASE AGENT LLM - PROCESSED CONTENT (Agent: {self.__class__.__name__})")
            print("="*80)
            print(f"Content Length: {len(content)} characters")
            print("-"*80)
            print("EXTRACTED CONTENT:")
            print("-"*80)
            print(content)
            print("="*80 + "\n")
            
            logger.info(f"LLM Response Status: {response.status_code}, Length: {len(content)}")
            
            return content
            
        except Exception as e:
            logger.error(f"Error calling LLM: {e}")
            raise
    
    def _extract_json(self, response: str) -> Optional[Dict[str, Any]]:
        """
        Extract JSON from LLM response using standardized handler.
        
        Args:
            response: The raw LLM response string
        
        Returns:
            Extracted JSON as dictionary, or None if extraction fails
        """
        try:
            return self.json_handler.extract_json(response)
        except JSONExtractionError as e:
            logger.error(f"JSON extraction failed: {e.message}")
            return None
    
    # ========================================================================
    # Session Management Methods
    # ========================================================================
    
    def create_session(self, session_id: Optional[str] = None) -> str:
        """Create a new session if one doesn't exist."""
        if session_id is None:
            session_id = str(uuid.uuid4())
        if session_id not in self.sessions:
            self.sessions[session_id] = []
            logger.info(f"Created new session: {session_id}")
        return session_id
    
    def get_session_history(self, session_id: str) -> List[Dict[str, Any]]:
        """Get session history."""
        return self.sessions.get(session_id, [])
    
    def save_session_to_memory(
        self,
        session_id: str,
        data: Dict[str, Any],
        client_name: str = "",
        app_name: str = "",
        project_name: str = ""
    ) -> bool:
        """Save session data to persistent memory storage."""
        return self.memory_storage.save_session(
            session_id, data, client_name, app_name, project_name
        )
    
    def load_session_from_memory(
        self,
        session_id: str,
        client_name: str = "",
        app_name: str = "",
        project_name: str = ""
    ) -> Optional[Dict[str, Any]]:
        """Load session data from persistent memory storage."""
        return self.memory_storage.load_session(
            session_id, client_name, app_name, project_name
        )
    
    # ========================================================================
    # Context Building Methods
    # ========================================================================
    
    def _build_conversation_context(self, session_id: str) -> str:
        """Build conversational context from session history."""
        history = self.sessions.get(session_id, [])
        if not history:
            return "This is the first interaction."
        
        # Use the last 5 interactions
        context_parts = []
        for interaction in history[-5:]:
            context_parts.append(f"User asked: {interaction.get('user_prompt', '')}")
            context_parts.append(
                f"You responded: {json.dumps(interaction.get('system_response', {}))}"
            )
        
        return "--- CONVERSATION HISTORY ---\n" + "\n".join(context_parts)
    
    def _build_file_context(self) -> str:
        """Build file context string from loaded files."""
        if not self.files_with_columns:
            return "No files are currently loaded."
        
        context = "\n\n--- AVAILABLE FILES AND COLUMNS ---\n"
        context += json.dumps(self.files_with_columns, indent=2)
        return context
    
    # ========================================================================
    # Intent Detection and Routing
    # ========================================================================
    
    def _detect_intent(self, user_prompt: str) -> Dict[str, Any]:
        """
        Detect user intent: workflow (data science) or text_reply (normal question).
        Uses LLM to classify the prompt.
        
        Args:
            user_prompt: User's query/prompt
            
        Returns:
            Dict with intent, confidence, and reasoning
        """
        logger.info(f"🔍 BaseAgent detecting intent for: {user_prompt[:100]}...")
        
        intent_prompt = f"""You are an intelligent intent classifier for Trinity AI.

**USER PROMPT**: "{user_prompt}"

## Your Task:

Classify the user's intent into one of two categories:

1. **"text_reply"**: Simple questions, explanations, general knowledge, or conversational queries that can be answered with text only. Examples:
   - "What is machine learning?"
   - "How does data analysis work?"
   - "Explain regression"
   - "What are the benefits of Python?"
   - General questions that don't require data processing

2. **"workflow"**: Data science tasks, data processing, analysis, transformations, or operations that require:
   - Working with data files
   - Data transformations
   - Data analysis
   - Creating charts/visualizations
   - Data cleaning or processing
   - Statistical operations
   - Machine learning operations
   - Any task that needs to process or analyze data

## Output Format:

Return ONLY a valid JSON object (no other text):

```json
{{
  "intent": "text_reply" or "workflow",
  "confidence": 0.0 to 1.0,
  "reasoning": "Brief explanation of why this classification"
}}
```

Now classify the intent:"""
        
        try:
            response = self._call_llm(intent_prompt, temperature=0.2, num_predict=500)
            
            if not response:
                logger.warning("⚠️ Empty LLM response for intent detection, defaulting to workflow")
                return {
                    "intent": "workflow",
                    "confidence": 0.5,
                    "reasoning": "LLM response was empty, defaulting to workflow"
                }
            
            # Extract JSON from response
            intent_result = self._extract_json(response)
            
            if not intent_result:
                logger.warning("⚠️ Could not parse intent JSON, defaulting to workflow")
                return {
                    "intent": "workflow",
                    "confidence": 0.5,
                    "reasoning": "Could not parse LLM response, defaulting to workflow"
                }
            
            # Validate intent value
            intent = intent_result.get("intent", "workflow")
            if intent not in ["workflow", "text_reply"]:
                logger.warning(f"⚠️ Invalid intent value: {intent}, defaulting to workflow")
                intent = "workflow"
            
            result = {
                "intent": intent,
                "confidence": float(intent_result.get("confidence", 0.5)),
                "reasoning": intent_result.get("reasoning", "No reasoning provided")
            }
            
            logger.info(f"✅ Intent detected: {result['intent']} (confidence: {result['confidence']:.2f})")
            return result
            
        except Exception as e:
            logger.error(f"❌ Error detecting intent: {e}")
            return {
                "intent": "workflow",
                "confidence": 0.5,
                "reasoning": f"Error during intent detection: {str(e)}"
            }
    
    def _call_react_workflow(
        self,
        user_prompt: str,
        session_id: str,
        file_context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Call ReAct workflow orchestrator.
        Since BaseAgent runs in the same service, we call the function directly
        instead of making an HTTP request.
        
        Args:
            user_prompt: User's prompt
            session_id: Session ID
            file_context: Optional file context
            
        Returns:
            Workflow execution result
        """
        try:
            # Import the chat function directly since we're in the same service
            try:
                from STREAMAI.main_app import chat, ChatRequest, ChatResponse
                import asyncio
                
                logger.info(f"🔄 Calling ReAct workflow directly (same process)")
                
                # Create request object
                chat_request = ChatRequest(
                    message=user_prompt,
                    session_id=session_id,
                    file_context=file_context or {}
                )
                
                # Call the async function from sync context
                # Since execute() is synchronous, we need to run the async function
                # Check if we're already in an async context first
                try:
                    # Try to get existing event loop
                    loop = asyncio.get_running_loop()
                    # We're in an async context, can't use asyncio.run()
                    # Fall back to HTTP call immediately
                    logger.warning("⚠️ Already in async context, falling back to HTTP call")
                    return self._call_react_workflow_http(user_prompt, session_id, file_context)
                except RuntimeError as no_loop_err:
                    # No running loop, we can use asyncio.run()
                    # But check if we're in a thread that can't create event loops
                    try:
                        # Try to create a new event loop
                        try:
                            chat_response = asyncio.run(chat(chat_request))
                        except RuntimeError as run_err:
                            # If asyncio.run() fails (e.g., nested event loop, or in thread), fall back to HTTP
                            if "cannot be called from a running event loop" in str(run_err) or "There is no current event loop" in str(run_err):
                                logger.warning(f"⚠️ Cannot create event loop: {run_err}, falling back to HTTP call")
                                return self._call_react_workflow_http(user_prompt, session_id, file_context)
                            else:
                                raise
                    except Exception as async_err:
                        logger.warning(f"⚠️ Error calling async function directly: {async_err}")
                        logger.info("🔄 Falling back to HTTP call")
                        return self._call_react_workflow_http(user_prompt, session_id, file_context)
                
                logger.info(f"✅ ReAct workflow completed: {chat_response.response[:100] if chat_response.response else 'No response'}...")
                
                return {
                    "success": True,
                    "intent": "workflow",
                    "response": chat_response.response or "",
                    "session_id": chat_response.session_id,
                    "data": {
                        "response": chat_response.response,
                        "session_id": chat_response.session_id,
                        "sequence": chat_response.sequence
                    }
                }
                
            except ImportError as import_err:
                logger.warning(f"⚠️ Could not import chat function directly: {import_err}")
                logger.info("🔄 Falling back to HTTP call")
                # Fallback to HTTP call
                return self._call_react_workflow_http(user_prompt, session_id, file_context)
            
        except Exception as e:
            logger.error(f"❌ Error calling ReAct workflow: {e}", exc_info=True)
            # Try HTTP fallback
            try:
                return self._call_react_workflow_http(user_prompt, session_id, file_context)
            except Exception as http_err:
                logger.error(f"❌ HTTP fallback also failed: {http_err}")
                return {
                    "success": False,
                    "intent": "workflow",
                    "error": str(e),
                    "response": f"I encountered an error executing the workflow: {str(e)}"
                }
    
    def _call_react_workflow_http(
        self,
        user_prompt: str,
        session_id: str,
        file_context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Fallback: Call ReAct workflow via HTTP endpoint.
        
        IMPORTANT: Since BaseAgent runs in the same service as the FastAPI app,
        we ALWAYS use localhost with AI_PORT, ignoring FASTAPI_BASE_URL.
        
        Args:
            user_prompt: User's prompt
            session_id: Session ID
            file_context: Optional file context
            
        Returns:
            Workflow execution result
        """
        # CRITICAL: Always use localhost with AI_PORT since we're in the same service
        # Ignore FASTAPI_BASE_URL to avoid port mismatches
        ai_port = os.getenv("AI_PORT", "8002")
        fastapi_base_url = f"http://localhost:{ai_port}"
        
        endpoint = f"{fastapi_base_url}/streamai/chat"
        logger.info(f"🔄 Calling ReAct workflow endpoint via HTTP: {endpoint}")
        logger.info(f"   AI_PORT env: {os.getenv('AI_PORT', 'not set')} (using this port)")
        logger.info(f"   FASTAPI_BASE_URL env: {os.getenv('FASTAPI_BASE_URL', 'not set')} (ignored - using localhost)")
        logger.info(f"   Resolved URL: {fastapi_base_url}")
        
        payload = {
            "message": user_prompt,
            "session_id": session_id,
            "file_context": file_context or {}
        }
        
        try:
            response = requests.post(
                endpoint,
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=600  # 10 minutes timeout for workflows
            )
            response.raise_for_status()
            
            result = response.json()
            logger.info(f"✅ ReAct workflow completed via HTTP: {result.get('response', '')[:100]}...")
            
            return {
                "success": True,
                "intent": "workflow",
                "response": result.get("response", ""),
                "data": result
            }
        except requests.exceptions.ConnectionError as conn_err:
            error_msg = str(conn_err)
            logger.error(f"❌ Connection error calling {endpoint}: {error_msg}")
            
            # Try alternative ports if connection fails (in order: 8002, 8001, 8000)
            alternative_ports = ["8002", "8001", "8000"]
            current_port = ai_port
            if current_port in alternative_ports:
                alternative_ports.remove(current_port)
            # Add current port at the beginning
            alternative_ports.insert(0, current_port)
            
            for alt_port in alternative_ports:
                try:
                    alt_url = f"http://localhost:{alt_port}/streamai/chat"
                    logger.info(f"🔄 Trying port: {alt_url}")
                    response = requests.post(
                        alt_url,
                        json=payload,
                        headers={"Content-Type": "application/json"},
                        timeout=10
                    )
                    response.raise_for_status()
                    result = response.json()
                    logger.info(f"✅ ReAct workflow completed via HTTP on port {alt_port}")
                    return {
                        "success": True,
                        "intent": "workflow",
                        "response": result.get("response", ""),
                        "data": result
                    }
                except Exception as alt_err:
                    logger.debug(f"   Port {alt_port} failed: {alt_err}")
                    continue
            
            # All ports failed
            raise Exception(f"Could not connect to /streamai/chat on any port. Tried: {', '.join([f'localhost:{p}' for p in alternative_ports])}")
    
    # ========================================================================
    # Abstract Methods (to be implemented by subclasses)
    # ========================================================================
    
    @property
    @abstractmethod
    def name(self) -> str:
        """Unique name of the agent (e.g., 'merge')."""
        pass
    
    @property
    @abstractmethod
    def description(self) -> str:
        """Description for the LLM Planner."""
        pass
    
    @abstractmethod
    def _build_prompt(
        self,
        user_prompt: str,
        available_files: Dict[str, Any],
        context: str
    ) -> str:
        """
        Build the LLM prompt for this specific agent.
        Must be implemented by each agent subclass.
        """
        pass
    
    @abstractmethod
    def _validate_json(self, result: Dict[str, Any]) -> bool:
        """
        Validate the extracted JSON result.
        Must be implemented by each agent subclass.
        """
        pass
    
    @abstractmethod
    def _normalize_result(self, result: Dict[str, Any]) -> Dict[str, Any]:
        """
        Normalize the result to ensure consistent format.
        Must be implemented by each agent subclass.
        """
        pass
    
    @abstractmethod
    def _create_fallback_response(self, session_id: str) -> Dict[str, Any]:
        """
        Create a fallback response when JSON extraction fails.
        Must be implemented by each agent subclass.
        """
        pass
    
    # ========================================================================
    # Main Execution Method (implements BaseAgentInterface)
    # ========================================================================
    
    def execute(self, context: AgentContext) -> AgentResult:
        """
        Main execution logic implementing BaseAgentInterface.
        
        Args:
            context: Standard agent context
        
        Returns:
            Standard agent result
        """
        start_time = time.time()
        
        try:
            # Set context
            self.set_context(
                context.client_name,
                context.app_name,
                context.project_name
            )
            
            # Initialize or load session
            if context.session_id not in self.sessions:
                # Try to load from persistent memory first
                session_data = self.load_session_from_memory(
                    context.session_id,
                    context.client_name,
                    context.app_name,
                    context.project_name
                )
                if session_data and "history" in session_data:
                    self.sessions[context.session_id] = session_data["history"]
                    logger.info(f"Loaded session {context.session_id} from memory with {len(session_data['history'])} interactions")
                else:
                    # Create new session
                    self.sessions[context.session_id] = []
                    logger.info(f"Created new session: {context.session_id}")
            
            # Load files
            try:
                self._ensure_files_loaded(
                    context.client_name,
                    context.app_name,
                    context.project_name
                )
            except FileLoadError as e:
                return AgentResult(
                    success=False,
                    data={},
                    message="No data files found in the specified location.",
                    error=str(e),
                    session_id=context.session_id
                )
            
            # ========================================================================
            # NOTE: Intent detection is handled ONCE at the entry point (STREAMAI/main_app.py)
            # Agents should NOT call intent detection - they should just execute their logic
            # If we reach here, it means intent was already detected as "workflow"
            # ========================================================================
            logger.info("ℹ️ Intent already detected at entry point - executing agent logic (no intent detection here)")
            
            # Skip intent detection - assume we're here because intent is "workflow"
            # If text_reply was needed, it would have been handled at the entry point
            intent = "workflow"
            
            # ========================================================================
            # AGENT EXECUTION PATH: Execute agent-specific logic
            # ========================================================================
            logger.info("🔄 Executing agent-specific logic (workflow path)")
            
            # Build file context for agent execution
            file_context = {
                "files": self.files_with_columns,
                "client_name": context.client_name,
                "app_name": context.app_name,
                "project_name": context.project_name
            }
            
            # Build conversation context
            conversation_context = self._build_conversation_context(context.session_id)
            file_context_str = self._build_file_context()
            full_context = f"{conversation_context}\n{file_context_str}"
            
            # Build agent-specific prompt
            prompt = self._build_prompt(
                user_prompt=context.user_prompt,
                available_files=self.files_with_columns,
                context=full_context
            )
            
            # Call LLM with agent-specific prompt (NOT intent detection prompt)
            llm_response = self._call_llm(prompt)
            
            # Extract JSON from agent response
            agent_result = self._extract_json(llm_response)
            
            if not agent_result:
                return AgentResult(
                    success=False,
                    data={},
                    message="Could not parse agent response.",
                    error="JSON extraction failed",
                    session_id=context.session_id
                )
            
            # Validate and normalize agent result
            if hasattr(self, '_validate_json'):
                if not self._validate_json(agent_result):
                    return AgentResult(
                        success=False,
                        data={},
                        message="Agent response validation failed.",
                        error="Invalid response structure",
                        session_id=context.session_id
                    )
            
            # Normalize result if method exists
            if hasattr(self, '_normalize_result'):
                agent_result = self._normalize_result(agent_result)
            
            # Build result
            result = {
                "response": agent_result.get("smart_response", agent_result.get("response", "")),
                "intent": "workflow",
                "agent_data": agent_result,
                "reasoning": agent_result.get("reasoning", "Agent execution completed")
            }
            
            # Normalize result format (always workflow path now)
            if "error" in result:
                normalized_result = {
                    "message": result.get("response", "Agent execution failed"),
                    "error": result.get("error", "Unknown error"),
                    "intent": "workflow",
                    "agent_data": result.get("agent_data", {})
                }
            else:
                normalized_result = {
                    "message": result.get("response", ""),
                    "intent": "workflow",
                    "agent_data": result.get("agent_data", {}),
                    "reasoning": result.get("reasoning", "")
                }
            
            # Store interaction
            interaction = {
                "user_prompt": context.user_prompt,
                "system_response": normalized_result,
                "intent": intent,
                "timestamp": datetime.now().isoformat()
            }
            self.sessions[context.session_id].append(interaction)
            
            # Save to persistent memory
            self.save_session_to_memory(
                context.session_id,
                {"history": self.sessions[context.session_id]},
                context.client_name,
                context.app_name,
                context.project_name
            )
            
            processing_time = time.time() - start_time
            
            # Convert to AgentResult (always workflow path now - intent already detected at entry point)
            if "error" in normalized_result:
                return AgentResult(
                    success=False,
                    data=normalized_result.get("agent_data", {}),
                    message=normalized_result.get("message", "Agent execution failed"),
                    error=normalized_result.get("error", "Unknown error"),
                    artifacts=[],
                    session_id=context.session_id,
                    processing_time=processing_time
                )
            else:
                return AgentResult(
                    success=True,
                    data=normalized_result.get("agent_data", {}),
                    message=normalized_result.get("message", ""),
                    error=None,
                    artifacts=[],
                    session_id=context.session_id,
                    processing_time=processing_time
                )
            
        except Exception as e:
            logger.error(f"Error during execution: {e}", exc_info=True)
            processing_time = time.time() - start_time
            return AgentResult(
                success=False,
                data={},
                message="An error occurred during execution.",
                error=str(e),
                session_id=context.session_id,
                processing_time=processing_time
            )
    
    # ========================================================================
    # Legacy Method (for backward compatibility)
    # ========================================================================
    
    def process_request(
        self,
        user_prompt: str,
        session_id: Optional[str] = None,
        client_name: str = "",
        app_name: str = "",
        project_name: str = ""
    ) -> Dict[str, Any]:
        """
        Legacy method for backward compatibility.
        Converts to new interface and returns legacy format.
        """
        # Create session if needed
        session_id = self.create_session(session_id)
        
        # Create context
        context = AgentContext(
            session_id=session_id,
            user_prompt=user_prompt,
            client_name=client_name,
            app_name=app_name,
            project_name=project_name
        )
        
        # Execute using new interface
        result = self.execute(context)
        
        # Convert to legacy format
        return {
            "success": result.success,
            "data": result.data,
            "message": result.message,
            "error": result.error,
            "artifacts": result.artifacts,
            "session_id": result.session_id
        }

