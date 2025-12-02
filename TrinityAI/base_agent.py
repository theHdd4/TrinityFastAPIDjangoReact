"""
BaseAgent - Comprehensive base class for all Trinity AI agents.
Encapsulates all common functionality to eliminate code duplication.
"""

import os
import json
import re
import uuid
import logging
import requests
from datetime import datetime
from typing import Dict, Any, Optional, List
from abc import ABC, abstractmethod

from file_loader import FileLoader
from file_analyzer import FileAnalyzer
from file_context_resolver import FileContextResolver, FileContextResult
from TrinityAI.config import settings
from TrinityAI.exceptions import (
    TrinityException,
    FileLoadError,
    JSONExtractionError,
    ValidationError
)
from TrinityAI.interfaces import AgentContext, AgentResult

logger = logging.getLogger("trinity.base_agent")


class BaseAgent(ABC):
    """
    Comprehensive base class for all Trinity AI agents.
    Encapsulates all common functionality:
    - File loading and context resolution
    - Dynamic path resolution
    - LLM prompt building and JSON extraction
    - Session management and memory
    - JSON validation and normalization
    - Backend API connections
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
        # LLM configuration (use settings if not provided)
        self.api_url = api_url or settings.get_llm_config()["api_url"]
        self.model_name = model_name or settings.LLM_MODEL_NAME
        self.bearer_token = bearer_token or settings.LLM_BEARER_TOKEN
        
        # MinIO configuration (use settings if not provided)
        minio_config = settings.get_minio_config()
        self.minio_endpoint = minio_endpoint or minio_config["endpoint"]
        self.minio_access_key = access_key or minio_config["access_key"]
        self.minio_secret_key = secret_key or minio_config["secret_key"]
        self.bucket = bucket or minio_config["bucket"]
        self.prefix = prefix or minio_config["prefix"]
        
        # Initialize FileLoader for standardized file handling
        self.file_loader = FileLoader(
            minio_endpoint=self.minio_endpoint,
            minio_access_key=self.minio_access_key,
            minio_secret_key=self.minio_secret_key,
            minio_bucket=self.bucket,
            object_prefix=self.prefix
        )
        
        # Initialize FileAnalyzer for file analysis
        self.file_analyzer = FileAnalyzer(
            minio_endpoint=self.minio_endpoint,
            access_key=self.minio_access_key,
            secret_key=self.minio_secret_key,
            bucket=self.bucket,
            prefix=self.prefix,
            secure=False
        )
        
        # Initialize FileContextResolver for intelligent file selection
        self.file_context_resolver = FileContextResolver(
            file_loader=self.file_loader,
            file_analyzer=self.file_analyzer
        )
        
        # File state management
        self.files_with_columns: Dict[str, Any] = {}
        self.files_metadata: Dict[str, Dict[str, Any]] = {}
        self._raw_files_with_columns: Dict[str, Any] = {}
        self._last_context_selection: Optional[FileContextResult] = None
        self._files_loaded = False
        
        # Session management
        self.sessions: Dict[str, List[Dict[str, Any]]] = {}
        
        logger.info(f"BaseAgent initialized: {self.__class__.__name__}")
    
    # ========================================================================
    # File Management Methods
    # ========================================================================
    
    def set_context(self, client_name: str = "", app_name: str = "", project_name: str = "") -> None:
        """
        Set environment context for dynamic path resolution.
        This ensures the API call will fetch the correct path for the current project.
        """
        if client_name or app_name or project_name:
            if client_name:
                os.environ["CLIENT_NAME"] = client_name
            if app_name:
                os.environ["APP_NAME"] = app_name
            if project_name:
                os.environ["PROJECT_NAME"] = project_name
            logger.info(
                f"🔧 Environment context set for dynamic path resolution: "
                f"{client_name}/{app_name}/{project_name}"
            )
        else:
            logger.info("🔧 Using existing environment context for dynamic path resolution")
    
    def _maybe_update_prefix(
        self,
        client_name: str = "",
        app_name: str = "",
        project_name: str = ""
    ) -> None:
        """
        Dynamically updates the MinIO prefix using the data_upload_validate API endpoint.
        
        Args:
            client_name: Client name from request (preferred over env vars)
            app_name: App name from request (preferred over env vars)
            project_name: Project name from request (preferred over env vars)
        """
        try:
            # Use passed parameters first, then fall back to environment variables
            if not client_name:
                client_name = os.getenv("CLIENT_NAME", "")
            if not app_name:
                app_name = os.getenv("APP_NAME", "")
            if not project_name:
                project_name = os.getenv("PROJECT_NAME", "")
            
            # Don't use "default" values - if we don't have real values, log error and return
            if not client_name or not app_name or not project_name:
                logger.warning(
                    f"⚠️ Missing project context: "
                    f"client={client_name or 'N/A'}, "
                    f"app={app_name or 'N/A'}, "
                    f"project={project_name or 'N/A'}"
                )
                logger.warning(
                    "⚠️ Cannot update MinIO prefix without valid project context. "
                    "Files may not be found."
                )
                return
            
            # Method 1: Call the data_upload_validate API endpoint
            try:
                validate_api_url = settings.VALIDATE_API_URL
                if not validate_api_url.startswith("http"):
                    validate_api_url = f"http://{validate_api_url}"
                
                url = f"{validate_api_url}/api/data-upload-validate/get_object_prefix"
                params = {
                    "client_name": client_name,
                    "app_name": app_name,
                    "project_name": project_name
                }
                
                logger.info(f"🔍 Fetching dynamic path from: {url}")
                logger.info(f"🔍 With params: {params}")
                
                response = requests.get(url, params=params, timeout=30)
                if response.status_code == 200:
                    data = response.json()
                    current = data.get("prefix", "")
                    if current and current != self.prefix:
                        logger.info(f"✅ Dynamic path fetched successfully: {current}")
                        logger.info(f"MinIO prefix updated from '{self.prefix}' to '{current}'")
                        self.prefix = current
                        self.file_loader.object_prefix = current
                        self.file_analyzer.prefix = current
                        self._load_files()
                        return
                    elif current:
                        logger.info(f"✅ Dynamic path fetched: {current} (no change needed)")
                        return
                    else:
                        logger.warning(f"API returned empty prefix: {data}")
                else:
                    logger.warning(
                        f"API call failed with status {response.status_code}: {response.text}"
                    )
            except Exception as e:
                logger.warning(f"Failed to fetch dynamic path from API: {e}")
            
            # Method 2: Fallback to constructing prefix from context
            current = f"{client_name}/{app_name}/{project_name}/"
            
            if self.prefix != current:
                logger.info(
                    f"MinIO prefix updated from '{self.prefix}' to '{current}' "
                    "(constructed from context)"
                )
                self.prefix = current
                self.file_loader.object_prefix = current
                self.file_analyzer.prefix = current
                self._load_files()
            else:
                logger.info(f"Using current prefix: {current}")
                
        except Exception as e:
            logger.error(f"Failed to update prefix: {e}")
    
    def _load_files(self) -> None:
        """Load available files using the standardized loader and update resolver."""
        try:
            files_with_columns = self.file_loader.load_files()
            self._raw_files_with_columns = files_with_columns or {}
            self.files_with_columns = self._raw_files_with_columns
            self.files_metadata = {}
            self.file_context_resolver.update_files(self._raw_files_with_columns)
            self._last_context_selection = None
            logger.info(f"Loaded {len(self.files_with_columns)} files from MinIO")
        except Exception as e:
            logger.error(f"Error loading files from MinIO: {e}")
            self.files_with_columns = {}
            self._raw_files_with_columns = {}
            self.files_metadata = {}
            self.file_context_resolver.update_files({})
            self._last_context_selection = None
            raise FileLoadError(f"Failed to load files: {e}")
    
    def _ensure_files_loaded(self) -> None:
        """Ensure files are loaded before processing requests."""
        if not self._files_loaded:
            self._load_files()
            self._files_loaded = True
    
    # ========================================================================
    # Context Building Methods
    # ========================================================================
    
    def _build_conversation_context(self, session_id: str) -> str:
        """Builds a conversational context from the session history."""
        history = self.sessions.get(session_id, [])
        if not history:
            return "This is the first interaction."
        
        # Use the last 5 interactions to keep the context relevant and concise
        context_parts = []
        for interaction in history[-5:]:
            context_parts.append(f"User asked: {interaction.get('user_prompt', '')}")
            context_parts.append(
                f"You responded: {json.dumps(interaction.get('system_response', {}))}"
            )
        
        return "--- CONVERSATION HISTORY ---\n" + "\n".join(context_parts)
    
    def _resolve_file_context(
        self,
        user_prompt: str,
        top_k: int = 4,
        include_metadata: bool = True
    ) -> FileContextResult:
        """Resolve relevant files and columns for the user prompt."""
        selection = self.file_context_resolver.resolve(
            user_prompt=user_prompt,
            top_k=top_k,
            include_metadata=include_metadata
        )
        self._last_context_selection = selection
        return selection
    
    def _enhance_context_with_columns(self, context: str, user_prompt: str) -> str:
        """Adds relevant file/column information to improve accuracy."""
        if not self.files_with_columns:
            context += "\n\n--- FILE CONTEXT ---\n"
            context += "No files are currently loaded. Upload or select data first."
            self._last_context_selection = None
            return context
        
        selection = self._resolve_file_context(user_prompt, top_k=4, include_metadata=True)
        
        relevant = selection.relevant_files or self.file_context_resolver.get_available_files()
        context += "\n\n--- RELEVANT FILES AND COLUMNS ---\n"
        context += json.dumps(relevant, indent=2)
        
        if selection.file_details:
            context += "\n\n--- FILE DETAILS ---\n"
            context += json.dumps(selection.file_details, indent=2)
        
        if selection.matched_columns:
            context += "\n\n--- MATCHED COLUMNS ---\n"
            context += json.dumps(selection.matched_columns, indent=2)
        
        if selection.other_files:
            context += "\n\nOther available files (not included above): "
            context += ", ".join(selection.other_files)
        
        return context
    
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
        logger.info(f"CALLING LLM:")
        logger.info(f"API URL: {self.api_url}")
        logger.info(f"Model: {self.model_name}")
        logger.info(f"Prompt Length: {len(prompt)}")
        
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
            logger.info("Sending request to LLM...")
            response = requests.post(
                self.api_url,
                json=payload,
                headers=headers,
                timeout=300
            )
            response.raise_for_status()
            
            response_data = response.json()
            content = response_data.get('message', {}).get('content', '')
            logger.info(f"LLM Response Status: {response.status_code}")
            logger.info(f"LLM Content Length: {len(content)}")
            
            return content
            
        except Exception as e:
            logger.error(f"Error calling LLM: {e}")
            raise
    
    def _extract_json(self, response: str) -> Optional[Dict[str, Any]]:
        """
        Extract JSON from LLM response using multiple fallback strategies.
        
        Args:
            response: The raw LLM response string
        
        Returns:
            Extracted JSON as dictionary, or None if extraction fails
        """
        logger.info(f"🔍 Extracting JSON (response length: {len(response)})")
        
        if not response:
            logger.error("❌ Empty response")
            return None
        
        # Step 1: Clean response - remove thinking tags and code blocks
        cleaned = re.sub(r"<think>.*?</think>", "", response, flags=re.DOTALL)
        cleaned = re.sub(r"<reasoning>.*?</reasoning>", "", cleaned, flags=re.DOTALL)
        cleaned = re.sub(r"```json\s*", "", cleaned)
        cleaned = re.sub(r"```\s*", "", cleaned)
        cleaned = cleaned.strip()
        
        logger.info(f"📋 Cleaned response length: {len(cleaned)}")
        
        # Method 1: Try regex patterns first
        json_patterns = [
            r'```json\s*(\{.*?\})\s*```',
            r'```\s*(\{.*?\})\s*```',
        ]
        
        for pattern in json_patterns:
            matches = re.findall(pattern, cleaned, re.DOTALL | re.IGNORECASE)
            for match in matches:
                try:
                    result = json.loads(match)
                    logger.info("✅ Successfully extracted JSON using pattern matching")
                    return result
                except json.JSONDecodeError:
                    continue
        
        # Method 2: Try brace counting
        try:
            start_idx = cleaned.find("{")
            if start_idx == -1:
                logger.error("❌ No opening brace found")
                return None
            
            # Count braces (respecting strings to avoid counting braces inside strings)
            brace_count = 0
            in_string = False
            escape_next = False
            end_idx = start_idx
            
            for i in range(start_idx, len(cleaned)):
                char = cleaned[i]
                
                # Handle escape sequences
                if escape_next:
                    escape_next = False
                    continue
                if char == '\\':
                    escape_next = True
                    continue
                
                # Track if we're inside a string
                if char == '"':
                    in_string = not in_string
                    continue
                
                # Only count braces outside of strings
                if not in_string:
                    if char == "{":
                        brace_count += 1
                    elif char == "}":
                        brace_count -= 1
                        if brace_count == 0:
                            end_idx = i + 1
                            break
            
            if brace_count != 0:
                logger.error(f"❌ Unbalanced braces (remaining count: {brace_count})")
                return None
            
            # Extract and parse JSON
            json_str = cleaned[start_idx:end_idx]
            logger.info(f"📦 Extracted JSON string (length: {len(json_str)})")
            
            result = json.loads(json_str)
            logger.info("✅ Successfully extracted JSON using brace counting")
            return result
            
        except json.JSONDecodeError:
            pass
        except Exception as e:
            logger.debug(f"Brace counting failed: {e}")
        
        # Method 3: Try simple bracket matching (fallback)
        try:
            start = cleaned.find('{')
            end = cleaned.rfind('}')
            if start != -1 and end != -1 and end > start:
                json_str = cleaned[start:end+1]
                result = json.loads(json_str)
                logger.info("✅ Successfully extracted JSON using bracket matching")
                return result
        except json.JSONDecodeError:
            pass
        
        # If all methods fail, return None
        logger.warning("❌ All JSON extraction methods failed")
        logger.warning(f"Response preview for debugging: {cleaned[:500]}")
        return None
    
    # ========================================================================
    # Session Management Methods
    # ========================================================================
    
    def create_session(self, session_id: Optional[str] = None) -> str:
        """Creates a new session if one doesn't exist."""
        if session_id is None:
            session_id = str(uuid.uuid4())
        if session_id not in self.sessions:
            self.sessions[session_id] = []
            logger.info(f"Created new session: {session_id}")
        return session_id
    
    def get_session_history(self, session_id: str) -> List[Dict[str, Any]]:
        """Get session history."""
        return self.sessions.get(session_id, [])
    
    def get_all_sessions(self) -> List[str]:
        """Get all session IDs."""
        return list(self.sessions.keys())
    
    def clear_session(self, session_id: str) -> bool:
        """Clear a session."""
        if session_id in self.sessions:
            del self.sessions[session_id]
            logger.info(f"Cleared session: {session_id}")
            return True
        return False
    
    # ========================================================================
    # Abstract Methods (to be implemented by subclasses)
    # ========================================================================
    
    @abstractmethod
    def _build_prompt(
        self,
        user_prompt: str,
        available_files: Dict[str, Any],
        context: str,
        file_details: Optional[Dict[str, Any]] = None,
        other_files: Optional[List[str]] = None,
        matched_columns: Optional[Dict[str, List[str]]] = None
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
    # Main Processing Method (Template Method Pattern)
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
        Main entry point to process a user's request.
        Uses Template Method pattern to orchestrate all common steps.
        
        Args:
            user_prompt: The user's request/prompt
            session_id: Optional session ID for conversation continuity
            client_name: Client name for dynamic path resolution
            app_name: App name for dynamic path resolution
            project_name: Project name for dynamic path resolution
        
        Returns:
            Dictionary with the agent's response
        """
        logger.info(f"Processing request for session '{session_id}': '{user_prompt}'")
        
        if not user_prompt or not user_prompt.strip():
            return {
                "success": False,
                "error": "Prompt cannot be empty.",
                "session_id": session_id
            }
        
        # 1. Set context and update prefix
        self.set_context(client_name, app_name, project_name)
        self._maybe_update_prefix(client_name, app_name, project_name)
        
        # 2. Load files
        try:
            self._ensure_files_loaded()
        except FileLoadError as e:
            logger.error(f"File loading failed: {e}")
            return {
                "success": False,
                "error": "No data files found in the specified MinIO location.",
                "session_id": session_id
            }
        
        if not self.files_with_columns:
            logger.warning("No files are loaded. Cannot process request.")
            return {
                "success": False,
                "error": "No data files found in the specified MinIO location.",
                "session_id": session_id
            }
        
        # 3. Create or get session
        session_id = self.create_session(session_id)
        
        # 4. Build conversation context
        context = self._build_conversation_context(session_id)
        
        # 5. Resolve file context
        selection = self._resolve_file_context(user_prompt, top_k=4, include_metadata=True)
        available_for_prompt = (
            selection.to_object_column_mapping(self._raw_files_with_columns)
            if selection
            else self._raw_files_with_columns
        )
        
        # 6. Build the final prompt (agent-specific)
        prompt = self._build_prompt(
            user_prompt=user_prompt,
            available_files=available_for_prompt,
            context=context,
            file_details=selection.file_details if selection else {},
            other_files=selection.other_files if selection else [],
            matched_columns=selection.matched_columns if selection else {}
        )
        
        logger.info("Sending final prompt to LLM...")
        logger.debug(f"LLM Prompt: {prompt}")
        
        # 7. Call LLM and extract JSON
        try:
            llm_response_str = self._call_llm(prompt)
            result = self._extract_json(llm_response_str)
            
            # 8. Handle JSON extraction failure
            if not result:
                logger.warning("JSON extraction failed, using fallback response")
                result = self._create_fallback_response(session_id)
            else:
                # 9. Validate JSON (agent-specific)
                if not self._validate_json(result):
                    logger.warning("JSON validation failed, using fallback response")
                    result = self._create_fallback_response(session_id)
                else:
                    # 10. Normalize result (agent-specific)
                    result = self._normalize_result(result)
            
            # 11. Store interaction in session history
            interaction = {
                "user_prompt": user_prompt,
                "system_response": result,
                "timestamp": datetime.now().isoformat()
            }
            self.sessions[session_id].append(interaction)
            result["session_id"] = session_id
            
            logger.info(f"Request processed successfully. Success: {result.get('success', False)}")
            return result
            
        except Exception as e:
            logger.error(f"Error during LLM call or JSON processing: {e}", exc_info=True)
            # Create helpful error response
            error_result = self._create_fallback_response(session_id)
            error_result["error"] = str(e)
            error_result["success"] = False
            return error_result


