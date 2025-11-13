# llm_dataframe_operations.py - DataFrame Operations Agent LLM Integration

import os
import sys
import json
import logging
import requests
from typing import Dict, Any, Optional, List, Union
from datetime import datetime

logger = logging.getLogger("smart.dataframe_operations.llm")

# Add parent directory to path for shared utilities
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from file_loader import FileLoader
from file_analyzer import FileAnalyzer
from file_context_resolver import FileContextResolver, FileContextResult

class DataFrameOperationsAgent:
    """
    DataFrame Operations Agent that integrates with the DataFrame Operations backend API.
    Handles AI-powered DataFrame manipulation configuration generation and automatic execution.
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
        
        # Session management
        self.sessions = {}  # {session_id: [messages]}
        self.files_with_columns = {}  # {file_path: [columns]}
        self.dataframe_sessions = {}  # {df_id: dataframe_state}
        self.current_df_context = None
        self.files_metadata: Dict[str, Dict[str, Any]] = {}
        self._last_context_selection: Optional[FileContextResult] = None

        # Shared file utilities
        self.file_loader = FileLoader(
            minio_endpoint=minio_endpoint,
            minio_access_key=minio_access_key,
            minio_secret_key=minio_secret_key,
            minio_bucket=minio_bucket,
            object_prefix=object_prefix
        )
        self.file_analyzer = FileAnalyzer(
            minio_endpoint=minio_endpoint,
            access_key=minio_access_key,
            secret_key=minio_secret_key,
            bucket=minio_bucket,
            prefix=object_prefix,
            secure=False
        )
        self.file_context_resolver = FileContextResolver(
            file_loader=self.file_loader,
            file_analyzer=self.file_analyzer
        )
        
        logger.info(f"DataFrameOperationsAgent initialized with model: {model_name}")
    
    def set_context(self, client_name: str = "", app_name: str = "", project_name: str = "") -> None:
        """
        Set environment context for dynamic path resolution.
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
                client_name: str = "", app_name: str = "", project_name: str = "",
                current_df_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Process user prompt and generate DataFrame operations configuration.
        Main entry point for DataFrame operations requests.
        """
        logger.info(f"Processing DataFrame operations request for session '{session_id}': '{user_prompt}'")
        
        if not user_prompt or not user_prompt.strip():
            return {"success": False, "error": "Prompt cannot be empty.", "session_id": session_id}

        try:
            # Set environment context for dynamic path resolution
            self.set_context(client_name, app_name, project_name)
            
            # Get or create session (in-memory only - no disk storage)
            if not session_id:
                session_id = f"df_ops_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            
            # Initialize session if not exists
            if session_id not in self.sessions:
                self.sessions[session_id] = []
            
            # Add user message to session
            self.sessions[session_id].append({
                "role": "user",
                "content": user_prompt,
                "timestamp": datetime.now().isoformat(),
                "current_df_id": current_df_id
            })
            
            # Keep only recent messages to prevent memory bloat (last 50 messages)
            if len(self.sessions[session_id]) > 50:
                self.sessions[session_id] = self.sessions[session_id][-50:]
            
            # Load available files if not already loaded
            if not self.files_with_columns:
                self._load_available_files()
            
            if not self.files_with_columns:
                logger.warning("No files are loaded. Cannot process DataFrame operations request.")
                return {
                    "success": False, 
                    "error": "No data files found in the specified MinIO location.", 
                    "session_id": session_id,
                    "smart_response": "I don't see any data files available. Please upload a CSV or Excel file first, then I can help you with DataFrame operations like filtering, sorting, adding columns, and more."
                }
            
            # Build context from conversation history
            context = self._build_conversation_context(session_id)
            logger.info(f"📚 Session Context Built: {len(context)} characters")

            # Resolve relevant files and extend context with targeted file details
            selection = self.file_context_resolver.resolve(
                user_prompt=user_prompt,
                top_k=3,
                include_metadata=True
            )
            self._last_context_selection = selection
            context = self._extend_context_with_files(context, selection)
            
            # Get current dataframe state if available
            current_df_state = None
            if current_df_id and current_df_id in self.dataframe_sessions:
                current_df_state = self.dataframe_sessions[current_df_id]
            
            # Generate DataFrame operations configuration using AI
            try:
                from .ai_logic import build_dataframe_operations_prompt, call_dataframe_operations_llm, extract_dataframe_operations_json
            except ImportError as ie:
                logger.error(f"Failed to import ai_logic: {ie}")
                return {
                    "success": False,
                    "error": f"AI logic import failed: {str(ie)}",
                    "session_id": session_id,
                    "smart_response": "DataFrame operations AI service is currently unavailable due to import issues."
                }
            
            if selection:
                available_for_prompt = selection.to_object_column_mapping(self.files_with_columns)
            else:
                available_for_prompt = self.files_with_columns

            prompt = build_dataframe_operations_prompt(
                user_prompt,
                available_for_prompt,
                context,
                current_df_state,
                file_details=selection.file_details if selection else {},
                other_files=selection.other_files if selection else []
            )
            logger.info(f"🔍 DataFrame Operations Process - Generated prompt length: {len(prompt)}")
            logger.info("="*100)
            logger.info("📤 SENDING TO LLM:")
            logger.info("="*100)
            logger.info(f"User Prompt: {user_prompt}")
            logger.info(f"Relevant Files Sent: {list(available_for_prompt.keys())}")
            logger.info(f"Context Length: {len(context)} characters")
            logger.info("")
            logger.info("📝 FULL COMPLETE PROMPT (ALL CHARACTERS):")
            logger.info("="*100)
            logger.info(prompt)
            logger.info("="*100)
            logger.info(f"Total Prompt Length: {len(prompt)} characters")
            logger.info("="*100)
            
            llm_response = call_dataframe_operations_llm(self.api_url, self.model_name, self.bearer_token, prompt)
            
            logger.info("="*100)
            logger.info("📥 RECEIVED FROM LLM:")
            logger.info("="*100)
            logger.info(f"LLM Response Length: {len(llm_response)} characters")
            logger.info(f"LLM Response Full Text:\n{llm_response}")
            logger.info("="*100)
            
            
            result = extract_dataframe_operations_json(llm_response, self.files_with_columns)
            
            logger.info("="*100)
            logger.info("🔍 JSON EXTRACTION RESULT:")
            logger.info("="*100)
            if result:
                logger.info(f"✅ JSON Extracted Successfully!")
                logger.info(f"Success: {result.get('success', False)}")
                logger.info(f"Has dataframe_config: {'dataframe_config' in result}")
                if 'dataframe_config' in result and 'operations' in result['dataframe_config']:
                    operations = result['dataframe_config']['operations']
                    logger.info(f"Number of operations: {len(operations)}")
                    for i, op in enumerate(operations):
                        logger.info(f"  Operation {i+1}: {op.get('api_endpoint', 'unknown')} - {op.get('operation_name', 'unknown')}")
                        logger.info(f"    Parameters: {json.dumps(op.get('parameters', {}), indent=4)}")
                logger.info(f"Smart Response: {result.get('smart_response', 'N/A')}")
                logger.info(f"Full Extracted JSON:\n{json.dumps(result, indent=2)}")
            else:
                logger.error(f"❌ JSON Extraction Failed!")
                logger.error(f"LLM Response that failed parsing:\n{llm_response}")
            logger.info("="*100)
            
            
            if not result:
                logger.error("❌ Failed to extract valid JSON from LLM response")
                logger.error(f"🔍 Raw LLM response that failed JSON extraction:\n{llm_response}")
                
                # Return a helpful error response
                error_result = {
                    "success": False,
                    "message": "Could not parse JSON from LLM response",
                    "suggestions": [
                        "Try rephrasing your request more clearly",
                        "Ask for specific DataFrame operations like 'filter data where Country = USA'",
                        "Specify the file you want to work with",
                        "Ask for help with available operations"
                    ],
                    "smart_response": "I had trouble understanding your DataFrame operations request. Please try asking for specific operations like 'filter my data', 'sort by column', 'add a new column', or 'save the results'. I can help with data loading, filtering, sorting, column operations, formulas, and saving.",
                    "reasoning": "JSON parsing failed",
                    "used_memory": False,
                    "session_id": session_id
                }
                
                # Add error response to session
                self.sessions[session_id].append({
                    "role": "assistant",
                    "content": error_result.get("smart_response", error_result.get("message", "Error occurred")),
                    "timestamp": datetime.now().isoformat(),
                    "full_result": error_result
                })
                
                return error_result
            
            # Add session tracking
            result["session_id"] = session_id
            
            # Add assistant response to session with complete result
            self.sessions[session_id].append({
                "role": "assistant",
                "content": result.get("smart_response", result.get("message", "DataFrame operations configuration generated")),
                "timestamp": datetime.now().isoformat(),
                "full_result": result
            })
            
            logger.info(f"Successfully generated DataFrame operations config for session {session_id}")
            return result
                
        except Exception as e:
            logger.error(f"Error processing DataFrame operations request: {e}")
            error_result = {
                "success": False,
                "message": f"Error processing request: {str(e)}",
                "error": str(e),
                "session_id": session_id,
                "used_memory": False,
                "smart_response": "I encountered an error while processing your DataFrame operations request. Please try rephrasing your request or ask for help with specific operations."
            }
            
            # Add error response to session
            if session_id in self.sessions:
                self.sessions[session_id].append({
                    "role": "assistant",
                    "content": error_result.get("smart_response", error_result.get("message", "Error occurred")),
                    "timestamp": datetime.now().isoformat(),
                    "full_result": error_result
                })
            
            return error_result
    
    def process_conversation(self, query: str, session_id: Optional[str] = None,
                           client_name: str = "", app_name: str = "", project_name: str = "",
                           current_df_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Process conversational query with full memory context.
        Compatible with AIChatBot frontend integration.
        """
        return self.process(query, session_id, client_name, app_name, project_name, current_df_id)
    
    def set_dataframe_context(self, df_id: str, df_state: Dict[str, Any]):
        """Set the current dataframe context for operations"""
        self.dataframe_sessions[df_id] = df_state
        self.current_df_context = {
            "df_id": df_id,
            "state": df_state
        }
        logger.info(f"DataFrame context set: {df_id}")
    
    def get_dataframe_context(self) -> Optional[Dict[str, Any]]:
        """Get current dataframe context information"""
        return self.current_df_context
    
    def list_available_files(self) -> Dict[str, Any]:
        """List all available files from MinIO for DataFrame operations using dynamic paths"""
        try:
            self._load_available_files()
            return {
                "success": True,
                "files": self.files_with_columns,
                "total_files": len(self.files_with_columns),
                "current_context": self.current_df_context,
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
        """Dynamically updates the MinIO prefix using the data_upload_validate API endpoint."""
        try:
            # Method 1: Call the data_upload_validate API endpoint
            try:
                import requests
                import os
                
                client_name = os.getenv("CLIENT_NAME", "")
                app_name = os.getenv("APP_NAME", "")
                project_name = os.getenv("PROJECT_NAME", "")
                
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
                    if current and current != self.object_prefix:
                        logger.info(f"✅ Dynamic path fetched successfully: {current}")
                        logger.info("MinIO prefix updated from '%s' to '%s'", self.object_prefix, current)
                        self.object_prefix = current
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
            
            # Method 2: Fallback to environment variables
            import os
            client_name = os.getenv("CLIENT_NAME", "default_client")
            app_name = os.getenv("APP_NAME", "default_app")
            project_name = os.getenv("PROJECT_NAME", "default_project")
            current = f"{client_name}/{app_name}/{project_name}/"
            
            if self.object_prefix != current:
                logger.info("MinIO prefix updated from '%s' to '%s' (env fallback)", self.object_prefix, current)
                self.object_prefix = current
                self._load_available_files()
            else:
                logger.info(f"Using current prefix: {current}")
                
        except Exception as e:
            logger.error(f"Failed to update prefix: {e}")

    def _load_available_files(self):
        """Load available files using the standardized loader and update shared context."""
        try:
            self._maybe_update_prefix()
            files_with_columns = self.file_loader.load_files()
            self.files_with_columns = files_with_columns or {}
            self.files_metadata = {}
            self.file_context_resolver.update_files(self.files_with_columns)
            self._last_context_selection = None
            logger.info(f"Loaded {len(self.files_with_columns)} files from MinIO via standardized loader")
        except Exception as e:
            logger.error(f"Error loading files from MinIO: {e}")
            self.files_with_columns = {}
            self.files_metadata = {}
            self.file_context_resolver.update_files({})
            self._last_context_selection = None
    
    def _build_conversation_context(self, session_id: str) -> str:
        """Build conversation context from session history with ChatGPT-style memory"""
        if session_id not in self.sessions:
            return ""
        
        messages = self.sessions[session_id]
        if not messages:
            return ""
        
        context_parts = []
        context_parts.append("=== DATAFRAME OPERATIONS CONVERSATION HISTORY ===")
        
        # Include more messages for better context
        for msg in messages[-20:]:
            role = msg["role"]
            content = msg["content"]
            timestamp = msg.get("timestamp", "")
            current_df_id = msg.get("current_df_id", "")
            
            if role == "user":
                context_parts.append(f"👤 User: {content}")
                if current_df_id:
                    context_parts.append(f"📊 Current DataFrame ID: {current_df_id}")
            elif role == "assistant":
                # Include both the smart_response and the full result
                context_parts.append(f"🤖 Assistant: {content}")
                if "full_result" in msg and msg["full_result"]:
                    # Include the complete result JSON so LLM knows the previous configuration
                    context_parts.append(f"📋 Previous Configuration: {json.dumps(msg['full_result'], indent=2)}")
        
        context_parts.append("=== END DATAFRAME OPERATIONS CONVERSATION HISTORY ===")
        context_parts.append("")
        
        # Debug: Log the context being built
        context_str = "\n".join(context_parts)
        logger.info(f"📚 Built conversation context: {len(context_str)} characters")
        logger.info(f"📚 Context preview: {context_str[:300]}...")
        
        # Add intelligent context analysis
        if len(messages) > 2:
            context_parts.append("🧠 DATAFRAME OPERATIONS CONVERSATION INTELLIGENCE:")
            context_parts.append("- This is an ongoing conversation about DataFrame operations")
            context_parts.append("- Previous interactions should inform current responses")
            context_parts.append("- Maintain context and build upon previous DataFrame states")
            context_parts.append("- Remember user preferences, successful operations, and patterns")
            context_parts.append("- Understand contextual responses like 'yes', 'no', 'apply that', 'execute it'")
            context_parts.append("- Track DataFrame transformations and current state")
            context_parts.append("")
            
            # Extract key information from conversation history
            user_files = []
            user_operations = []
            user_preferences = []
            
            for msg in messages[-10:]:
                if msg["role"] == "user":
                    content = msg["content"].lower()
                    # Extract file mentions
                    if any(ext in content for ext in ['.csv', '.xlsx', '.arrow']):
                        import re
                        files = re.findall(r'(\w+\.(csv|xlsx|arrow))', content)
                        user_files.extend([f[0] for f in files])
                    
                    # Extract operation mentions
                    operations = ["filter", "sort", "add", "delete", "rename", "duplicate", "move", "formula", "save"]
                    for op in operations:
                        if op in content:
                            user_operations.append(op)
                    
                    # Extract preferences
                    if "yes" in content:
                        user_preferences.append("positive_response")
                    elif "no" in content:
                        user_preferences.append("negative_response")
            
            # Add extracted patterns to context
            if user_files:
                context_parts.append(f"📁 USER FILE PREFERENCES: {list(set(user_files))}")
            if user_operations:
                context_parts.append(f"🔧 USER OPERATION PREFERENCES: {list(set(user_operations))}")
            if user_preferences:
                context_parts.append(f"💭 USER RESPONSE PATTERNS: {list(set(user_preferences))}")
            context_parts.append("")
        
        return "\n".join(context_parts)

    def _extend_context_with_files(self, context: str, selection: Optional[FileContextResult]) -> str:
        """Append relevant file information and metadata into the conversation context."""
        if not selection:
            return context

        parts: List[str] = []
        if context:
            parts.append(context)

        relevant = selection.relevant_files or self.file_context_resolver.get_available_files()
        if relevant:
            parts.append("\n--- RELEVANT DATA FILES AND COLUMNS ---")
            parts.append(json.dumps(relevant, indent=2))

        if selection.file_details:
            parts.append("\n--- FILE DETAILS ---")
            parts.append(json.dumps(selection.file_details, indent=2))

        if selection.matched_columns:
            parts.append("\n--- MATCHED COLUMNS ---")
            parts.append(json.dumps(selection.matched_columns, indent=2))

        if selection.other_files:
            parts.append("\nOther available files (not included above): " + ", ".join(selection.other_files))

        return "\n".join(part for part in parts if part)
    
    def clear_session(self, session_id: str) -> bool:
        """Clear a specific session from memory"""
        if session_id in self.sessions:
            del self.sessions[session_id]
            logger.info(f"Cleared session: {session_id}")
            return True
        return False
    
    def get_all_sessions(self) -> List[str]:
        """Get list of all active session IDs"""
        return list(self.sessions.keys())
