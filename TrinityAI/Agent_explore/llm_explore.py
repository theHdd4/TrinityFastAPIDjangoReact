# llm_explore.py - Explore Agent LLM Integration

import os
import json
import logging
import requests
from typing import Dict, Any, Optional, List, Union
from datetime import datetime

logger = logging.getLogger("smart.explore.llm")

class ExploreAgent:
    """
    Explore Agent that integrates with the Explore Atom backend API.
    Handles AI-powered data exploration configuration generation.
    """
    
    def __init__(self, api_url: str, model_name: str, bearer_token: str, 
                 minio_endpoint: str, minio_access_key: str, minio_secret_key: str, 
                 minio_bucket: str, object_prefix: str = ""):
        self.api_url = api_url
        self.model_name = model_name
        self.bearer_token = bearer_token
        self.minio_endpoint = minio_endpoint
        self.minio_access_key = minio_access_key
        self.minio_secret_key = minio_secret_key
        self.minio_bucket = minio_bucket
        self.object_prefix = object_prefix
        
        # Dynamic path resolution - will be updated per request
        
        # Session management
        self.sessions = {}  # {session_id: [messages]}
        self.files_with_columns = {}  # {file_path: [columns]}
        self.current_file_context = None
        
        # Backend integration removed - following chart maker pattern
        
        logger.info(f"ExploreAgent initialized with model: {model_name}")
    
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
    
    def process(self, user_prompt: str, session_id: Optional[str] = None, 
                client_name: str = "", app_name: str = "", project_name: str = "") -> Dict[str, Any]:
        """
        Process user prompt and generate exploration configuration.
        Main entry point for exploration requests.
        Follows chart maker pattern - generates config only, no backend calls.
        """
        logger.info(f"Processing explore request for session '{session_id}': '{user_prompt}'")
        
        if not user_prompt or not user_prompt.strip():
            return {"success": False, "error": "Prompt cannot be empty.", "session_id": session_id}

        try:
            # Set environment context for dynamic path resolution (like merge agent)
            self.set_context(client_name, app_name, project_name)
            
            # Get or create session
            if not session_id:
                session_id = f"explore_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            
            # Try to load existing session from disk
            if session_id not in self.sessions:
                if not self._load_session_from_disk(session_id):
                    self.sessions[session_id] = []
            
            # Add user message to session
            self.sessions[session_id].append({
                "role": "user",
                "content": user_prompt,
                "timestamp": datetime.now().isoformat()
            })
            
            # Load available files if not already loaded
            if not self.files_with_columns:
                self._load_available_files()
            
            if not self.files_with_columns:
                logger.warning("No files are loaded. Cannot process explore request.")
                return {
                    "success": False, 
                    "error": "No data files found in the specified MinIO location.", 
                    "session_id": session_id
                }
            
            # Build context from conversation history
            context = self._build_conversation_context(session_id)
            logger.info(f"📚 Session Context Built: {len(context)} characters")
            
            # Generate exploration configuration using AI
            from .ai_logic import build_explore_prompt, call_explore_llm, extract_json
            
            prompt = build_explore_prompt(user_prompt, self.files_with_columns, context)
            logger.info(f"🔍 Explore Process - Generated prompt length: {len(prompt)}")
            
            llm_response = call_explore_llm(self.api_url, self.model_name, self.bearer_token, prompt)
            logger.info(f"🔍 Explore Process - LLM response length: {len(llm_response)}")
            
            # 🔧 PRINT AI OUTPUT FOR DEBUGGING
            print("=" * 80)
            print("🤖 AI LLM RESPONSE:")
            print("=" * 80)
            print(llm_response)
            print("=" * 80)
            
            result = extract_json(llm_response, self.files_with_columns)
            logger.info(f"🔍 Explore Process - Extracted result: {json.dumps(result, indent=2) if result else 'None'}")
            
            # 🔧 PRINT PARSED JSON FOR DEBUGGING
            print("=" * 80)
            print("📋 PARSED JSON RESULT:")
            print("=" * 80)
            print(json.dumps(result, indent=2) if result else "None")
            print("=" * 80)
            
            # Apply filters to exploration configs if needed
            if result and result.get("success") and result.get("exploration_config"):
                configs = result["exploration_config"]
                
                # Check if any config has filters
                has_any_filters = any(config.get("filters", {}) for config in configs)
                
                if has_any_filters:
                    # Get the first config with filters as the reference
                    reference_filters = None
                    for config in configs:
                        if config.get("filters", {}):
                            reference_filters = config.get("filters", {})
                            break
                    
                    # Apply the same filters to all configs
                    for i, config in enumerate(configs):
                        if not config.get("filters", {}):
                            config["filters"] = reference_filters
            
            if not result:
                logger.error("❌ Failed to extract valid JSON from LLM response")
                logger.error(f"🔍 Raw LLM response that failed JSON extraction:\n{llm_response}")
                
                # Return a helpful error response instead of raising an exception
                error_result = {
                    "success": False,
                    "message": "Could not parse JSON from LLM response",
                    "suggestions": [
                        "The AI response was not in valid JSON format",
                        "Try rephrasing your request more clearly",
                        "Make sure to ask for a specific exploration type (trends, patterns, outliers)",
                        "Include the data file name in your request"
                    ],
                    "smart_response": "I had trouble understanding your request. Please try asking for an exploration in a simpler way, like 'Show trends in sales data' or 'Find patterns in customer behavior'.",
                    "reasoning": "JSON parsing failed",
                    "used_memory": False,
                    "session_id": session_id
                }
                
                # Add error response to session with complete result
                self.sessions[session_id].append({
                    "role": "assistant",
                    "content": error_result.get("smart_response", error_result.get("message", "Error occurred")),
                    "timestamp": datetime.now().isoformat(),
                    "full_result": error_result  # Store complete result
                })
                
                # Save session to disk for persistence
                self._save_session_to_disk(session_id)
                
                return error_result
            
            # Add session tracking
            result["session_id"] = session_id
            
            # Add assistant response to session with complete result (including JSON config)
            self.sessions[session_id].append({
                "role": "assistant",
                "content": result.get("smart_response", result.get("message", "Exploration configuration generated")),
                "timestamp": datetime.now().isoformat(),
                "full_result": result  # Store complete result including exploration_config JSON
            })
            
            # Save session to disk for persistence
            self._save_session_to_disk(session_id)
            
            logger.info(f"Successfully generated exploration config for session {session_id}")
            return result
                
        except Exception as e:
            logger.error(f"Error processing exploration request: {e}")
            error_result = {
                "success": False,
                "message": f"Error processing request: {str(e)}",
                "error": str(e),
                "session_id": session_id,
                "used_memory": False
            }
            
            # Add error response to session with complete result
            if session_id in self.sessions:
                self.sessions[session_id].append({
                    "role": "assistant",
                    "content": error_result.get("smart_response", error_result.get("message", "Error occurred")),
                    "timestamp": datetime.now().isoformat(),
                    "full_result": error_result  # Store complete result
                })
                
                # Save session to disk for persistence
                self._save_session_to_disk(session_id)
            
            return error_result
    
    def process_conversation(self, query: str, session_id: Optional[str] = None,
                           client_name: str = "", app_name: str = "", project_name: str = "") -> Dict[str, Any]:
        """
        Process conversational query with full memory context.
        Compatible with AIChatBot frontend integration.
        """
        return self.process(query, session_id, client_name, app_name, project_name)
    
    def set_file_context(self, file_id: str, columns: List[str], file_name: Optional[str] = None):
        """Set the current file context for exploration"""
        self.current_file_context = {
            "file_id": file_id,
            "columns": columns,
            "file_name": file_name or file_id
        }
        
        # Also add to files_with_columns for AI processing
        self.files_with_columns[file_id] = {"columns": columns}
        
        logger.info(f"File context set: {file_id} with {len(columns)} columns")
    
    def get_file_context(self) -> Optional[Dict[str, Any]]:
        """Get current file context information"""
        return self.current_file_context
    
    def list_available_files(self) -> Dict[str, Any]:
        """List all available files from MinIO for exploration using dynamic paths"""
        try:
            self._load_available_files()
            return {
                "success": True,
                "files": self.files_with_columns,
                "total_files": len(self.files_with_columns),
                "current_context": self.current_file_context,
                "dynamic_prefix": self.object_prefix
            }
        except Exception as e:
            logger.error(f"Error listing available files: {e}")
            return {
                "success": False,
                "message": f"Failed to list files: {str(e)}",
                "files": {},
                "total_files": 0
            }
    
    def get_session_history(self, session_id: str) -> List[Dict[str, Any]]:
        """Get conversation history for a specific session"""
        return self.sessions.get(session_id, [])
    
    def _maybe_update_prefix(self) -> None:
        """Dynamically updates the MinIO prefix using the data_upload_validate API endpoint.
        Uses the same dynamic path resolution as merge agent for consistency."""
        try:
            # Method 1: Call the data_upload_validate API endpoint to get the current prefix
            try:
                import requests
                import os
                
                # Get environment context from environment variables
                client_name = os.getenv("CLIENT_NAME", "")
                app_name = os.getenv("APP_NAME", "")
                project_name = os.getenv("PROJECT_NAME", "")
                
                # Use the correct backend API endpoint for dynamic path resolution (same as merge agent)
                validate_api_url = os.getenv("VALIDATE_API_URL", "http://fastapi:8001")
                if not validate_api_url.startswith("http"):
                    validate_api_url = f"http://{validate_api_url}"
                
                # Call the correct API endpoint that returns the current dynamic path
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
                    if current and current != self.object_prefix:
                        logger.info(f"✅ Dynamic path fetched successfully: {current}")
                        logger.info("MinIO prefix updated from '%s' to '%s'", self.object_prefix, current)
                        self.object_prefix = current
                        # Since prefix changed, we must reload the files.
                        self._load_available_files()
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
            
            # Method 2: Fallback to environment variables if API fails
            import os
            client_name = os.getenv("CLIENT_NAME", "default_client")
            app_name = os.getenv("APP_NAME", "default_app")
            project_name = os.getenv("PROJECT_NAME", "default_project")
            current = f"{client_name}/{app_name}/{project_name}/"
            
            if self.object_prefix != current:
                logger.info("MinIO prefix updated from '%s' to '%s' (env fallback)", self.object_prefix, current)
                self.object_prefix = current
                # Since prefix changed, we must reload the files.
                self._load_available_files()
            else:
                logger.info(f"Using current prefix: {current}")
                
        except Exception as e:
            logger.error(f"Failed to update prefix: {e}")
            # Keep the existing prefix if all methods fail

    def _load_available_files(self):
        """Load available files from MinIO with their columns using dynamic paths"""
        try:
            from minio import Minio
            from minio.error import S3Error
            import pyarrow as pa
            import pyarrow.ipc as ipc
            
            # Update prefix to current path before loading files
            self._maybe_update_prefix()
            
            logger.info(f"Loading files with prefix: {self.object_prefix}")
            
            # Initialize MinIO client
            minio_client = Minio(
                self.minio_endpoint,
                access_key=self.minio_access_key,
                secret_key=self.minio_secret_key,
                secure=False
            )
            
            # List objects in bucket with current prefix
            objects = minio_client.list_objects(self.minio_bucket, prefix=self.object_prefix, recursive=True)
            
            files_with_columns = {}
            
            for obj in objects:
                if obj.object_name.endswith('.arrow'):
                    try:
                        # Get object data
                        response = minio_client.get_object(self.minio_bucket, obj.object_name)
                        data = response.read()
                        
                        # Read Arrow file
                        with pa.ipc.open_file(pa.BufferReader(data)) as reader:
                            table = reader.read_all()
                            columns = table.column_names
                            files_with_columns[obj.object_name] = {"columns": columns}
                            
                        logger.info(f"Loaded file {obj.object_name} with {len(columns)} columns")
                        
                    except Exception as e:
                        logger.warning(f"Failed to load file {obj.object_name}: {e}")
                        continue
            
            self.files_with_columns = files_with_columns
            logger.info(f"Loaded {len(files_with_columns)} files from MinIO")
            
        except Exception as e:
            logger.error(f"Error loading files from MinIO: {e}")
            # Set empty dict on error
            self.files_with_columns = {}
    
    def _build_conversation_context(self, session_id: str) -> str:
        """Build conversation context from session history with ChatGPT-style memory"""
        if session_id not in self.sessions:
            return ""
        
        messages = self.sessions[session_id]
        if not messages:
            return ""
        
        context_parts = []
        context_parts.append("=== CONVERSATION HISTORY ===")
        
        # Include more messages for better context (last 20 instead of 10)
        for msg in messages[-20:]:
            role = msg["role"]
            content = msg["content"]
            timestamp = msg.get("timestamp", "")
            
            if role == "user":
                context_parts.append(f"👤 User: {content}")
            elif role == "assistant":
                # Include both the smart_response and the full result (including JSON config)
                context_parts.append(f"🤖 Assistant: {content}")
                if "full_result" in msg and msg["full_result"]:
                    # Include the complete result JSON so LLM knows the previous configuration
                    context_parts.append(f"📋 Previous Configuration: {json.dumps(msg['full_result'], indent=2)}")
        
        context_parts.append("=== END CONVERSATION HISTORY ===")
        context_parts.append("")
        
        # Debug: Log the context being built
        context_str = "\n".join(context_parts)
        logger.info(f"📚 Built conversation context: {len(context_str)} characters")
        logger.info(f"📚 Context preview: {context_str[:300]}...")
        
        # Add intelligent context analysis
        if len(messages) > 2:
            context_parts.append("🧠 CONVERSATION INTELLIGENCE:")
            context_parts.append("- This is an ongoing conversation about data exploration")
            context_parts.append("- Previous interactions should inform current responses")
            context_parts.append("- Maintain context and build upon previous discussions")
            context_parts.append("- Remember user preferences, successful configurations, and patterns")
            context_parts.append("- Understand contextual responses like 'yes', 'no', 'use that', 'create it'")
            context_parts.append("")
            
            # Extract key information from conversation history
            user_files = []
            user_chart_types = []
            user_preferences = []
            
            for msg in messages[-10:]:  # Last 10 messages for pattern analysis
                if msg["role"] == "user":
                    content = msg["content"].lower()
                    # Extract file mentions
                    if ".arrow" in content:
                        # Simple file extraction - look for .arrow files
                        import re
                        files = re.findall(r'(\w+\.arrow)', content)
                        user_files.extend(files)
                    # Extract chart type preferences
                    if "bar chart" in content:
                        user_chart_types.append("bar_chart")
                    elif "line chart" in content:
                        user_chart_types.append("line_chart")
                    elif "pie chart" in content:
                        user_chart_types.append("pie_chart")
                    # Extract preferences
                    if "yes" in content:
                        user_preferences.append("positive_response")
                    elif "no" in content:
                        user_preferences.append("negative_response")
            
            # Add extracted patterns to context
            if user_files:
                context_parts.append(f"📁 USER FILE PREFERENCES: {list(set(user_files))}")
            if user_chart_types:
                context_parts.append(f"📊 USER CHART PREFERENCES: {list(set(user_chart_types))}")
            if user_preferences:
                context_parts.append(f"💭 USER RESPONSE PATTERNS: {list(set(user_preferences))}")
            context_parts.append("")
        
        return "\n".join(context_parts)
    
    def _save_session_to_disk(self, session_id: str):
        """Save session to disk for persistence"""
        try:
            import os
            sessions_dir = "sessions"
            if not os.path.exists(sessions_dir):
                os.makedirs(sessions_dir)
            
            session_file = os.path.join(sessions_dir, f"{session_id}.json")
            with open(session_file, 'w') as f:
                json.dump(self.sessions[session_id], f, indent=2)
            
            logger.info(f"Session {session_id} saved to disk")
        except Exception as e:
            logger.warning(f"Failed to save session {session_id} to disk: {e}")
    
    def _load_session_from_disk(self, session_id: str):
        """Load session from disk if it exists"""
        try:
            import os
            sessions_dir = "sessions"
            session_file = os.path.join(sessions_dir, f"{session_id}.json")
            
            if os.path.exists(session_file):
                with open(session_file, 'r') as f:
                    self.sessions[session_id] = json.load(f)
                logger.info(f"Session {session_id} loaded from disk with {len(self.sessions[session_id])} messages")
                return True
        except Exception as e:
            logger.warning(f"Failed to load session {session_id} from disk: {e}")
        return False
    
    # Backend integration methods removed - following chart maker pattern
    # The explore agent now only generates configuration, frontend handles execution