"""
Base Agent for Trinity AI
Comprehensive base class providing all standard functionality for agents.
"""

import os
import json
import uuid
import logging
import requests
import time
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
        """Set environment context for dynamic path resolution."""
        self.file_reader.set_context(client_name, app_name, project_name)
        if client_name:
            os.environ["CLIENT_NAME"] = client_name
        if app_name:
            os.environ["APP_NAME"] = app_name
        if project_name:
            os.environ["PROJECT_NAME"] = project_name
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
            
            response_data = response.json()
            content = response_data.get('message', {}).get('content', '')
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
            
            # Build context
            conversation_context = self._build_conversation_context(context.session_id)
            file_context = self._build_file_context()
            full_context = f"{conversation_context}\n{file_context}"
            
            # Build prompt
            prompt = self._build_prompt(
                user_prompt=context.user_prompt,
                available_files=self.files_with_columns,
                context=full_context
            )
            
            # Call LLM
            llm_response = self._call_llm(prompt)
            
            # Extract JSON
            result = self._extract_json(llm_response)
            
            if not result:
                logger.warning("JSON extraction failed, using fallback")
                result = self._create_fallback_response(context.session_id)
            else:
                # Validate JSON
                if not self._validate_json(result):
                    logger.warning("JSON validation failed, using fallback")
                    result = self._create_fallback_response(context.session_id)
                else:
                    # Normalize result
                    result = self._normalize_result(result)
            
            # Store interaction
            interaction = {
                "user_prompt": context.user_prompt,
                "system_response": result,
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
            
            # Convert to AgentResult
            return AgentResult(
                success=result.get("success", True),
                data=result.get("data", result),
                message=result.get("message", ""),
                error=result.get("error"),
                artifacts=result.get("artifacts", []),
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

