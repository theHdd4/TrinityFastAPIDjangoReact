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
        If default values are provided, try to fetch actual context from API.
        """
        # 🔧 CRITICAL FIX: If default values are provided, try to fetch actual context
        is_default = (client_name in ["default", "default_client", ""] and 
                     app_name in ["default", "default_app", ""] and 
                     project_name in ["default", "default_project", ""])
        
        if is_default:
            # Try to fetch actual context from the validate API
            try:
                validate_api_url = os.getenv("VALIDATE_API_URL", "http://fastapi:8001")
                if not validate_api_url.startswith("http"):
                    validate_api_url = f"http://{validate_api_url}"
                
                url = f"{validate_api_url}/api/data-upload-validate/get_object_prefix"
                logger.info(f"🔍 Fetching actual project context from: {url}")
                
                response = requests.get(url, timeout=10)
                if response.status_code == 200:
                    data = response.json()
                    # Extract context from prefix if available
                    prefix = data.get("prefix", "")
                    environment = data.get("environment", {})
                    
                    if environment:
                        actual_client = environment.get("CLIENT_NAME", "")
                        actual_app = environment.get("APP_NAME", "")
                        actual_project = environment.get("PROJECT_NAME", "")
                        
                        if actual_client and actual_app and actual_project:
                            client_name = actual_client
                            app_name = actual_app
                            project_name = actual_project
                            logger.info(f"✅ Fetched actual context from API: {client_name}/{app_name}/{project_name}")
                        elif prefix:
                            # Parse from prefix: client/app/project/
                            parts = prefix.rstrip('/').split('/')
                            if len(parts) >= 3:
                                client_name = parts[0] if parts[0] else client_name
                                app_name = parts[1] if parts[1] else app_name
                                project_name = parts[2] if parts[2] else project_name
                                logger.info(f"✅ Parsed context from prefix: {client_name}/{app_name}/{project_name}")
            except Exception as e:
                logger.warning(f"⚠️ Failed to fetch actual context from API: {e}, using provided values")
        
        # Set environment variables if we have valid values
        if client_name and client_name not in ["default", "default_client"]:
            os.environ["CLIENT_NAME"] = client_name
        if app_name and app_name not in ["default", "default_app"]:
            os.environ["APP_NAME"] = app_name
        if project_name and project_name not in ["default", "default_project"]:
            os.environ["PROJECT_NAME"] = project_name
            
        # Log the final context being used
        final_client = os.getenv("CLIENT_NAME", client_name or "default")
        final_app = os.getenv("APP_NAME", app_name or "default")
        final_project = os.getenv("PROJECT_NAME", project_name or "default")
        logger.info(f"🔧 Environment context set for dynamic path resolution: {final_client}/{final_app}/{final_project}")
    
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
            
            # 🔧 CRITICAL: Load comprehensive file details for identified files (like chart maker)
            # This ensures the LLM has exact column names, types, and sample values
            file_details_loaded = {}
            if selection and selection.relevant_files:
                # Get the first relevant file (most likely what user is talking about)
                relevant_file_paths = list(selection.relevant_files.keys())
                if relevant_file_paths:
                    primary_file_path = relevant_file_paths[0]
                    logger.info(f"🔍 Identified primary file from user query: {primary_file_path}")
                    
                    # Load comprehensive file details from backend
                    try:
                        import requests
                        import os
                        
                        # Get the dataframe operations API URL
                        df_ops_api_url = os.getenv("DATAFRAME_OPERATIONS_API_URL", "http://fastapi:8001")
                        if not df_ops_api_url.startswith("http"):
                            df_ops_api_url = f"http://{df_ops_api_url}"
                        
                        # Call the load-file-details endpoint
                        load_details_url = f"{df_ops_api_url}/api/dataframe-operations/load-file-details"
                        logger.info(f"📥 Loading file details from: {load_details_url}")
                        logger.info(f"📥 Object name: {primary_file_path}")
                        
                        response = requests.post(
                            load_details_url,
                            json={"object_name": primary_file_path},
                            timeout=30
                        )
                        
                        if response.status_code == 200:
                            file_details_loaded = response.json()
                            logger.info(f"✅ File details loaded successfully:")
                            logger.info(f"   - File ID: {file_details_loaded.get('file_id')}")
                            logger.info(f"   - Columns: {len(file_details_loaded.get('columns', []))}")
                            logger.info(f"   - Numeric columns: {len(file_details_loaded.get('numeric_columns', []))}")
                            logger.info(f"   - Categorical columns: {len(file_details_loaded.get('categorical_columns', []))}")
                            logger.info(f"   - Row count: {file_details_loaded.get('row_count', 0)}")
                            
                            # Store the file_id for use in operations
                            if file_details_loaded.get('file_id'):
                                # Update selection with loaded file details
                                if not selection.file_details:
                                    selection.file_details = {}
                                selection.file_details[primary_file_path] = file_details_loaded
                        else:
                            logger.warning(f"⚠️ Failed to load file details: {response.status_code} - {response.text}")
                    except Exception as e:
                        logger.warning(f"⚠️ Error loading file details from backend: {e}")
                        # Continue without file details - will use basic file info
            
            context = self._extend_context_with_files(context, selection, file_details_loaded)
            
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

            # 🔧 CRITICAL: Pass comprehensive file details to prompt builder
            # This ensures the LLM receives exact column names, types, and sample values
            prompt_file_details = {}
            if file_details_loaded:
                # Use the loaded file details (most comprehensive)
                prompt_file_details = file_details_loaded
            elif selection and selection.file_details:
                # Fallback to selection file details
                prompt_file_details = selection.file_details

            prompt = build_dataframe_operations_prompt(
                user_prompt,
                available_for_prompt,
                context,
                current_df_state,
                file_details=prompt_file_details,
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
        
        # 🔧 OPTIMIZATION: Reduce conversation history to last 10 messages (reduced from 20)
        # This reduces prompt size while maintaining recent context
        for msg in messages[-10:]:
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
            
            # Extract key information from conversation history (reduced scope)
            user_files = []
            user_operations = []
            user_preferences = []
            
            # Only analyze last 5 messages for patterns (reduced from 10)
            for msg in messages[-5:]:
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

    def _extend_context_with_files(self, context: str, selection: Optional[FileContextResult], file_details_loaded: Optional[Dict[str, Any]] = None) -> str:
        """
        Append relevant file information and metadata into the conversation context.
        Enhanced to include comprehensive file details (like chart maker) so LLM can use exact column names.
        OPTIMIZED: Only includes details for the matched file to reduce prompt size.
        """
        if not selection:
            return context

        parts: List[str] = []
        if context:
            parts.append(context)

        # 🔧 OPTIMIZATION: Only include comprehensive file details for the matched file
        # Skip the "RELEVANT DATA FILES AND COLUMNS" section if we have comprehensive details
        # This reduces prompt size significantly
        
        if file_details_loaded:
            # Only include details for the matched file
            parts.append("\n--- MATCHED FILE DETAILS (USE EXACT COLUMN NAMES) ---")
            parts.append("⚠️ CRITICAL: Use EXACT column names from 'columns' below (case-sensitive).")
            parts.append("⚠️ For filters, use values from 'unique_values' or 'sample_data'.")
            
            # Filter to only include relevant columns if matched_columns exist
            all_columns = file_details_loaded.get("columns", [])
            matched_cols = selection.matched_columns if selection else {}
            
            # If we have matched columns, prioritize those
            columns_to_include = all_columns
            if matched_cols:
                # Extract column names from matched_columns
                matched_col_names = set()
                for file_path, cols in matched_cols.items():
                    if isinstance(cols, list):
                        matched_col_names.update(cols)
                    elif isinstance(cols, dict):
                        matched_col_names.update(cols.keys())
                
                # Include matched columns plus a few more for context (limit to 30 total)
                columns_to_include = [col for col in all_columns if col in matched_col_names][:30]
                if len(columns_to_include) < len(all_columns):
                    # Add a few more columns for context
                    remaining = [col for col in all_columns if col not in matched_col_names][:10]
                    columns_to_include.extend(remaining)
            
            # Limit columns to reduce size
            columns_to_include = columns_to_include[:40]  # Max 40 columns
            
            # Filter unique_values and column_types to only include relevant columns
            filtered_unique_values = {
                col: vals for col, vals in file_details_loaded.get("unique_values", {}).items()
                if col in columns_to_include
            }
            
            filtered_column_types = {
                col: dtype for col, dtype in file_details_loaded.get("column_types", {}).items()
                if col in columns_to_include
            }
            
            # Filter numeric/categorical columns
            filtered_numeric = [col for col in file_details_loaded.get("numeric_columns", []) if col in columns_to_include]
            filtered_categorical = [col for col in file_details_loaded.get("categorical_columns", []) if col in columns_to_include]
            
            # Reduce sample_data to 1 row to minimize size
            sample_data = file_details_loaded.get("sample_data", [])
            if len(sample_data) > 1:
                sample_data = sample_data[:1]
            
            parts.append(json.dumps({
                "file_id": file_details_loaded.get("file_id"),
                "object_name": file_details_loaded.get("object_name"),
                "columns": columns_to_include,
                "numeric_columns": filtered_numeric,
                "categorical_columns": filtered_categorical,
                "column_types": filtered_column_types,
                "unique_values": filtered_unique_values,
                "sample_data": sample_data,
                "row_count": file_details_loaded.get("row_count", 0)
            }, indent=2))
            parts.append("")
            parts.append("INSTRUCTIONS: Use EXACT column names from 'columns' above. Include 'file_id' in operations.")
        
        else:
            # Fallback: Show relevant files if no comprehensive details loaded
            relevant = selection.relevant_files or self.file_context_resolver.get_available_files()
            if relevant:
                # Only show first file to reduce size
                first_file = {list(relevant.keys())[0]: list(relevant.values())[0]} if relevant else {}
                parts.append("\n--- RELEVANT FILE ---")
                parts.append(json.dumps(first_file, indent=2))
            
            if selection.file_details:
                parts.append("\n--- FILE DETAILS ---")
                # Only include first file's details
                first_file_details = {}
                for file_path, details in list(selection.file_details.items())[:1]:
                    first_file_details[file_path] = details
                parts.append(json.dumps(first_file_details, indent=2))

        # Only include matched columns if they exist and are relevant
        if selection.matched_columns and not file_details_loaded:
            parts.append("\n--- MATCHED COLUMNS ---")
            parts.append(json.dumps(selection.matched_columns, indent=2))

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
