# llm_merge.py
import json
import logging
import os
import uuid
from datetime import datetime
from typing import Dict, Any, Optional

from Agent_Merge.ai_logic import build_merge_prompt, call_merge_llm, extract_json
from file_loader import FileLoader
from file_analyzer import FileAnalyzer
from file_context_resolver import FileContextResolver, FileContextResult

# --- Setup a logger for clear, informative output ---
logger = logging.getLogger("smart.merge")
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')


class SmartMergeAgent:
    """
    An intelligent agent that uses an LLM to determine how to merge tabular data files
    stored in MinIO, handling various Arrow-based file formats.
    """

    def __init__(self, api_url, model_name, bearer_token, minio_endpoint, access_key, secret_key, bucket, prefix):
        logger.info("Initializing SmartMergeAgent...")
        self.api_url = api_url
        self.model_name = model_name
        self.bearer_token = bearer_token
        self.bucket = bucket
        self.prefix = prefix
        self.sessions = {}
        
        # Initialize FileLoader for standardized file handling
        self.file_loader = FileLoader(
            minio_endpoint=minio_endpoint,
            minio_access_key=access_key,
            minio_secret_key=secret_key,
            minio_bucket=bucket,
            object_prefix=prefix
        )
        self.file_analyzer = FileAnalyzer(
            minio_endpoint=minio_endpoint,
            access_key=access_key,
            secret_key=secret_key,
            bucket=bucket,
            prefix=prefix,
            secure=False
        )
        self.file_context_resolver = FileContextResolver(
            file_loader=self.file_loader,
            file_analyzer=self.file_analyzer
        )
        
        # Files will be loaded lazily when needed
        self.files_with_columns = {}
        self.files_metadata: Dict[str, Dict[str, Any]] = {}
        self._raw_files_with_columns: Dict[str, Any] = {}
        self._last_context_selection: Optional[FileContextResult] = None
        self._files_loaded = False

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
            logger.info(f"🔧 Environment context set for dynamic path resolution: {client_name}/{app_name}/{project_name}")
        else:
            logger.info("🔧 Using existing environment context for dynamic path resolution")

    def _ensure_files_loaded(self) -> None:
        """Ensure files are loaded before processing requests"""
        if not self._files_loaded:
            self._load_files()
            self._files_loaded = True

    def _maybe_update_prefix(self, client_name: str = "", app_name: str = "", project_name: str = "") -> None:
        """Dynamically updates the MinIO prefix using the data_upload_validate API endpoint.
        
        Args:
            client_name: Client name from request (preferred over env vars)
            app_name: App name from request (preferred over env vars)
            project_name: Project name from request (preferred over env vars)
        """
        try:
            # 🔧 CRITICAL FIX: Use passed parameters first, then fall back to environment variables
            import requests
            import os
            
            # Use passed parameters if provided, otherwise read from environment
            if not client_name:
                client_name = os.getenv("CLIENT_NAME", "")
            if not app_name:
                app_name = os.getenv("APP_NAME", "")
            if not project_name:
                project_name = os.getenv("PROJECT_NAME", "")
            
            # 🔧 CRITICAL FIX: Don't use "default" values - if we don't have real values, log error and return
            if not client_name or not app_name or not project_name:
                logger.warning(f"⚠️ Missing project context: client={client_name or 'N/A'}, app={app_name or 'N/A'}, project={project_name or 'N/A'}")
                logger.warning("⚠️ Cannot update MinIO prefix without valid project context. Files may not be found.")
                return
            
            # Method 1: Call the data_upload_validate API endpoint
            try:
                validate_api_url = os.getenv("VALIDATE_API_URL", "http://fastapi:8001")
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
                        logger.info("MinIO prefix updated from '%s' to '%s'", self.prefix, current)
                        self.prefix = current
                        self._load_files()
                        return
                    elif current:
                        logger.info(f"✅ Dynamic path fetched: {current} (no change needed)")
                        return
                    else:
                        logger.warning(f"API returned empty prefix: {data}")
                else:
                    logger.warning(f"API call failed with status {response.status_code}: {response.text}")
                        
            except Exception as e:
                logger.warning(f"Failed to fetch dynamic path from API: {e}")
            
            # Method 2: Fallback to constructing prefix from context (no "default" values)
            current = f"{client_name}/{app_name}/{project_name}/"
            
            if self.prefix != current:
                logger.info("MinIO prefix updated from '%s' to '%s' (constructed from context)", self.prefix, current)
                self.prefix = current
                self._load_files()
            else:
                logger.info(f"Using current prefix: {current}")
                
        except Exception as e:
            logger.error(f"Failed to update prefix: {e}")

    def _load_files(self) -> None:
        """Load available files using the standardized loader and update resolver."""
        try:
            self._maybe_update_prefix()
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



    def _enhance_context_with_columns(self, context: str, user_prompt: str) -> str:
        """Adds relevant file/column information from the resolver to improve accuracy."""
        if not self.files_with_columns:
            context += "\n\n--- FILE CONTEXT ---\nNo files are currently loaded. Upload or select data before merging."
            self._last_context_selection = None
            return context

        selection = self.file_context_resolver.resolve(
            user_prompt=user_prompt,
            top_k=4,
            include_metadata=True
        )
        self._last_context_selection = selection

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
            context += "\n\nOther available files (not included above): " + ", ".join(selection.other_files)

        context += "\n\n--- INSTRUCTIONS FOR LLM ---\n"
        context += "1. Analyze the user's request to identify which files they want to merge\n"
        context += "2. Use the column information above to determine the best join columns\n"
        context += "3. If the user's request is unclear, suggest appropriate files based on their description\n"
        context += "4. Always verify that the suggested files exist in the available files list\n"

        return context

    def _build_context(self, session_id: str) -> str:
        """Builds a conversational context from the session history."""
        history = self.sessions.get(session_id, [])
        if not history:
            return "This is the first interaction."
            
        # Use the last 5 interactions to keep the context relevant and concise
        context_parts = []
        for interaction in history[-5:]:
            context_parts.append(f"User asked: {interaction['user_prompt']}")
            context_parts.append(f"You responded: {json.dumps(interaction['system_response'])}")
        
        return "--- CONVERSATION HISTORY ---\n" + "\n".join(context_parts)

    def create_session(self, session_id: str = None) -> str:
        """Creates a new session if one doesn't exist."""
        if session_id is None:
            session_id = str(uuid.uuid4())
        if session_id not in self.sessions:
            self.sessions[session_id] = []
            logger.info(f"Created new session: {session_id}")
        return session_id

    def process_request(self, user_prompt: str, session_id: str = None, 
                       client_name: str = "", app_name: str = "", project_name: str = "") -> dict:
        """
        Main entry point to process a user's request to merge files.
        Works exactly like the explore agent for perfect compatibility.
        """
        logger.info(f"Processing request for session '{session_id}': '{user_prompt}'")
        if not user_prompt or not user_prompt.strip():
            return {"success": False, "error": "Prompt cannot be empty.", "session_id": session_id}
        
        # Set environment context for dynamic path resolution (like concat agent)
        self.set_context(client_name, app_name, project_name)
            
        session_id = self.create_session(session_id)
        
        # Check if MinIO prefix needs an update (and files need reloading)
        # 🔧 CRITICAL FIX: Pass context parameters to _maybe_update_prefix
        self._maybe_update_prefix(client_name, app_name, project_name)
        
        # Load files lazily only when needed
        self._ensure_files_loaded()
        
        if not self.files_with_columns:
            logger.warning("No files are loaded. Cannot process merge request.")
            return {
                "success": False, 
                "error": "No data files found in the specified MinIO location.", 
                "session_id": session_id
            }

        # 1. Build context from history
        context = self._build_context(session_id)
        
        # 2. Enhance context with file/column info
        context = self._enhance_context_with_columns(context, user_prompt)
        
        # 3. Build the final prompt for the LLM using relevant file context
        selection = self._last_context_selection or self.file_context_resolver.resolve(
            user_prompt=user_prompt,
            top_k=4,
            include_metadata=True
        )
        available_for_prompt = selection.to_object_column_mapping(self._raw_files_with_columns) if selection else self._raw_files_with_columns
        prompt = build_merge_prompt(
            user_prompt,
            available_for_prompt,
            context,
            file_details=selection.file_details if selection else {},
            other_files=selection.other_files if selection else [],
            matched_columns=selection.matched_columns if selection else {}
        )
        logger.info("Sending final prompt to LLM...")
        logger.debug(f"LLM Prompt: {prompt}")

        # 4. Call the LLM and process the response
        try:
            llm_response_str = call_merge_llm(self.api_url, self.model_name, self.bearer_token, prompt)
            result = extract_json(llm_response_str)
            
            # LENIENT HANDLING: If JSON extraction fails, create a helpful fallback response
            if not result:
                logger.warning("JSON extraction failed, creating fallback response")
                # Build file list for suggestions
                file_list = []
                for name, data in self.files_with_columns.items():
                    col_count = len(data.get('columns', []))
                    file_list.append(f"{name} ({col_count} columns)")
                
                # Build detailed file info for smart_response
                file_details = []
                for name, data in self.files_with_columns.items():
                    columns = data.get('columns', [])
                    col_count = len(columns)
                    sample_cols = ', '.join(columns[:8])
                    if col_count > 8:
                        sample_cols += '...'
                    file_details.append(f"**{name}** ({col_count} columns) - {sample_cols}")
                
                result = {
                    "success": False,
                    "suggestions": [
                        "Here's what I found about your files:",
                        f"Available files for merge: {', '.join(file_list)}",
                        "To complete merge, specify: files + join columns + join type",
                        "Or say 'yes' to use my suggestions"
                    ],
                    "message": "Here's what I can help you with",
                    "smart_response": f"I'd be happy to help you with Merge operations! Here are your available files and their columns:\n" + 
                                   "\n".join(file_details) +
                                   "\n\nI can help you merge these files by specifying which files to join and which columns to use for the merge operation.",
                    "available_files": self.files_with_columns,
                    "next_steps": [
                        "Tell me which files you want to merge",
                        "Specify the join columns for merging",
                        "Choose the join type (inner, left, right, outer)",
                        "Ask me to suggest the best merge configuration"
                    ]
                }

            logger.info(f"🔍 EXTRACTED RESULT: {json.dumps(result, indent=2)}")
            logger.info(f"🔍 RESULT KEYS: {list(result.keys())}")
            logger.info(f"🔍 SMART_RESPONSE IN RESULT: {'smart_response' in result}")
            if 'smart_response' in result:
                logger.info(f"🔍 SMART_RESPONSE VALUE: '{result['smart_response']}'")

            # Store interaction in session history
            interaction = {
                "user_prompt": user_prompt,
                "system_response": result,
                "timestamp": datetime.now().isoformat()
            }
            self.sessions[session_id].append(interaction)
            result["session_id"] = session_id

            logger.info(f"Request processed successfully. Success: {result.get('success', False)}")
            logger.info(f"🔍 FINAL RESULT TO RETURN: {json.dumps(result, indent=2)}")
            return result
            
        except Exception as e:
            logger.error(f"Error during LLM call or JSON processing: {e}", exc_info=True)
            # Create helpful error response instead of generic error
            # Build file list for error response
            file_list = []
            for name, data in self.files_with_columns.items():
                col_count = len(data.get('columns', []))
                file_list.append(f"{name} ({col_count} columns)")
            
            # Build detailed file info for error smart_response
            file_details = []
            for name, data in self.files_with_columns.items():
                columns = data.get('columns', [])
                col_count = len(columns)
                sample_cols = ', '.join(columns[:8])
                if col_count > 8:
                    sample_cols += '...'
                file_details.append(f"**{name}** ({col_count} columns) - {sample_cols}")
            
            error_result = {
                "success": False,
                "suggestions": [
                    "Here's what I found about your files:",
                    f"Available files for merge: {', '.join(file_list)}",
                    "To complete merge, specify: files + join columns + join type",
                    "Or say 'yes' to use my suggestions"
                ],
                "message": "Here's what I can help you with",
                "smart_response": f"I'd be happy to help you with Merge operations! Here are your available files and their columns:\n" + 
                               "\n".join(file_details) +
                               "\n\nI can help you merge these files by specifying which files to join and which columns to use for the merge operation.",
                "available_files": self.files_with_columns,
                "next_steps": [
                    "Tell me which files you want to merge",
                    "Specify the join columns for merging", 
                    "Choose the join type (inner, left, right, outer)",
                    "Ask me to suggest the best merge configuration"
                ],
                "error": str(e),
                "session_id": session_id
            }
            return error_result

    # --- Session Management Methods ---
    def get_session_history(self, session_id):
        return self.sessions.get(session_id, [])

    def get_all_sessions(self):
        return list(self.sessions.keys())

    def clear_session(self, session_id):
        if session_id in self.sessions:
            del self.sessions[session_id]
            logger.info(f"Cleared session: {session_id}")
            return True
        return False