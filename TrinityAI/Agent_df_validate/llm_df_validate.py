# llm_df_validate.py

import requests
import json
import re
import pandas as pd
from .ai_logic import build_prompt, call_llm, extract_json
from pathlib import Path
from datetime import datetime
import uuid
import os
from typing import Dict, Any, Optional, List
import logging
from file_loader import FileLoader
from file_analyzer import FileAnalyzer
from file_context_resolver import FileContextResolver, FileContextResult

logger = logging.getLogger("trinity.df_validate")


def safe_json_dumps(obj, indent=2):
    """
    Safely serialize object to JSON, handling NaT and other non-serializable types.
    
    Args:
        obj: Object to serialize
        indent: JSON indentation level
        
    Returns:
        JSON string
    """
    def default_serializer(obj):
        """Custom default serializer for json.dumps"""
        # Handle pandas NaT (Not a Time)
        if pd.isna(obj):
            return None
        # Handle pandas Timestamp
        if isinstance(obj, pd.Timestamp):
            if pd.isna(obj):
                return None
            return str(obj)
        # Handle pandas Timedelta
        if isinstance(obj, pd.Timedelta):
            if pd.isna(obj):
                return None
            return str(obj)
        # Handle other non-serializable types
        try:
            return str(obj)
        except Exception:
            return None
    
    return json.dumps(obj, indent=indent, default=default_serializer)


def _describe_endpoint(client) -> str:
    """Return a human readable endpoint for the given MinIO client."""
    ep = getattr(client, "_endpoint_url", None)
    if ep:
        return str(ep)
    try:
        return client._base_url._url.netloc
    except Exception:
        return "unknown"


class SmartDfValidateAgent:
    """Complete LLM-driven data validation and dtype conversion agent with full history context"""

    def __init__(self, api_url, model_name, bearer_token, minio_endpoint, access_key, secret_key, bucket, prefix):
        self.api_url = api_url
        self.model_name = model_name
        self.bearer_token = bearer_token
        self.bucket = bucket
        self.prefix = prefix
        
        # Memory system
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
        self.files_metadata: Dict[str, Dict[str, Any]] = {}
        self._raw_files_with_columns: Dict[str, Any] = {}
        self._last_context_selection: Optional[FileContextResult] = None
        
        # Files will be loaded lazily when needed
        self.files_with_columns = {}
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
            
            # Method 2: Fallback to environment variables
            import os
            client_name = os.getenv("CLIENT_NAME", "default_client")
            app_name = os.getenv("APP_NAME", "default_app")
            project_name = os.getenv("PROJECT_NAME", "default_project")
            current = f"{client_name}/{app_name}/{project_name}/"
            
            if self.prefix != current:
                logger.info("MinIO prefix updated from '%s' to '%s' (env fallback)", self.prefix, current)
                self.prefix = current
                self._load_files()
            else:
                logger.info(f"Using current prefix: {current}")
                
        except Exception as e:
            logger.error(f"Failed to update prefix: {e}")

    def _load_files(self):
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
    
    def create_session(self, session_id=None):
        """Create new session"""
        if session_id is None:
            session_id = str(uuid.uuid4())
        
        self.sessions[session_id] = {
            "session_id": session_id,
            "created_at": datetime.now().isoformat(),
            "conversation_history": [],
            "successful_configs": [],
            "user_preferences": {
                "favorite_files": {},
                "preferred_dtypes": {},
                "common_patterns": []
            }
        }
        return session_id
    
    def get_session(self, session_id):
        """Get or create session"""
        if session_id not in self.sessions:
            self.create_session(session_id)
        return self.sessions[session_id]
    
    def process_request(self, user_prompt, session_id=None, client_name="", app_name="", project_name=""):
        """Main processing method - everything handled by LLM with complete history"""
        
        # Set environment context for dynamic path resolution
        self.set_context(client_name, app_name, project_name)
        
        if session_id is None:
            session_id = self.create_session()
        
        session = self.get_session(session_id)
        self._maybe_update_prefix()
        
        # Load files lazily only when needed
        self._ensure_files_loaded()
        
        # Build rich conversation context with complete JSON history
        context = self._build_rich_context(session_id)
        
        selection = self.file_context_resolver.resolve(
            user_prompt=user_prompt,
            top_k=4,
            include_metadata=True
        )
        self._last_context_selection = selection

        available_for_prompt = selection.to_object_column_mapping(self._raw_files_with_columns) if selection else self._raw_files_with_columns
        prompt = build_prompt(
            user_prompt,
            available_for_prompt,
            context,
            file_details=selection.file_details if selection else {},
            other_files=selection.other_files if selection else [],
            matched_columns=selection.matched_columns if selection else {}
        )

        try:
            # Call LLM
            response = self._call_llm(prompt)
            result = self._extract_json(response)
            
            if not result:
                return self._create_fallback_response(session_id)
            
            # Process result with enhanced memory updates
            processed_result = self._process_llm_result(result, session_id, user_prompt)
            
            # Update memory with complete interaction data
            self._update_comprehensive_memory(session_id, user_prompt, result, processed_result)
            
            return processed_result
            
        except Exception as e:
            logger.error("Processing failed: %s", e)
            return self._create_error_response(session_id, str(e))
    
    def _build_rich_context(self, session_id):
        """Build comprehensive conversation context with complete JSON history"""
        session = self.get_session(session_id)
        
        context_parts = []
        
        # Complete conversation history with full JSON details
        history = session.get("conversation_history", [])
        if history:
            context_parts.append("COMPLETE CONVERSATION HISTORY:")
            for i, conv in enumerate(history[-10:], 1):  # Last 10 interactions
                context_parts.append(f"\n--- INTERACTION {i} ---")
                context_parts.append(f"User Input: '{conv['user_prompt']}'")
                context_parts.append(f"System Response: {safe_json_dumps(conv['system_response'], indent=2)}")
                context_parts.append(f"Result Type: {conv['result_type']}")
                context_parts.append(f"Timestamp: {conv['timestamp']}")
        
        # Successful configurations with complete details
        successful = session.get("successful_configs", [])
        if successful:
            context_parts.append("\n\nSUCCESSFUL CONFIGURATIONS:")
            for i, config in enumerate(successful[-5:], 1):  # Last 5 successful configs
                context_parts.append(f"\n--- SUCCESS {i} ---")
                context_parts.append(f"User Request: '{config['user_prompt']}'")
                context_parts.append(f"Configuration: {safe_json_dumps(config['config'], indent=2)}")
                context_parts.append(f"Timestamp: {config['timestamp']}")
        
        # User preferences and patterns
        prefs = session.get("user_preferences", {})
        if prefs.get("favorite_files"):
            context_parts.append("\n\nUSER PREFERENCES:")
            context_parts.append(f"Favorite Files: {safe_json_dumps(prefs['favorite_files'], indent=2)}")
            if prefs.get("preferred_dtypes"):
                context_parts.append(f"Preferred Dtypes: {safe_json_dumps(prefs['preferred_dtypes'], indent=2)}")
            if prefs.get("common_patterns"):
                context_parts.append(f"Common Patterns: {safe_json_dumps(prefs['common_patterns'], indent=2)}")
        
        # Recent context for conversational responses
        if history:
            last_interaction = history[-1]
            context_parts.append(f"\n\nLAST INTERACTION CONTEXT:")
            context_parts.append(f"Last User Input: '{last_interaction['user_prompt']}'")
            context_parts.append(f"Last System Response: {safe_json_dumps(last_interaction['system_response'], indent=2)}")
            if last_interaction.get('suggested_files'):
                context_parts.append(f"Files I Suggested: {last_interaction['suggested_files']}")
        
        return "\n".join(context_parts) if context_parts else "No previous conversation history"
    
    def _process_llm_result(self, result, session_id, user_prompt):
        """Process LLM result with enhanced response formatting"""
        session = self.get_session(session_id)
        
        if result.get("success"):
            # Store successful configuration
            validate_json = result.get("validate_json", {})
            session["successful_configs"].append({
                "timestamp": datetime.now().isoformat(),
                "user_prompt": user_prompt,
                "config": validate_json,
                "reasoning": result.get("reasoning", ""),
                "used_memory": result.get("used_memory", False)
            })
            
            # Update user preferences
            self._update_user_preferences(session_id, validate_json)
            
            # Enhance smart_response with detailed insights if not already provided
            smart_response = result.get("smart_response", "")
            if not smart_response or "[list of conversions" in smart_response:
                # Build detailed smart_response with actual conversion details
                file_name = validate_json.get("file_name", "the file")
                dtype_changes = validate_json.get("dtype_changes", {})
                
                if dtype_changes and len(dtype_changes) > 0:
                    # User requested dtype changes
                    conversion_list = []
                    for col, dtype in dtype_changes.items():
                        if isinstance(dtype, dict):
                            dtype_str = dtype.get("dtype", "")
                            format_str = dtype.get("format", "")
                            if format_str:
                                conversion_list.append(f"• {col} → {dtype_str} with format {format_str}")
                            else:
                                conversion_list.append(f"• {col} → {dtype_str}")
                        else:
                            conversion_list.append(f"• {col} → {dtype}")
                    
                    conversions_text = "\n".join(conversion_list)
                    
                    smart_response = f"I'll help you load the file and apply dtype conversions in a two-step process:\n\n📂 **Step 1: Load File**\nI'll load \"{file_name}\" into the data upload atom so you can see it in the UI.\n\n🔄 **Step 2: Apply Dtype Conversions**\nI'll convert the following columns:\n{conversions_text}\n\n💡 **Insights:**\nThese conversions will ensure your data types are correct for downstream operations. After conversion, you'll see the updated file in the UI with the new data types applied.\n\n✅ The file will be ready for use in other operations once the conversion is complete."
                else:
                    # User only wants to load the file, no dtype changes
                    smart_response = f"I'll load the file for you:\n\n📂 **Loading File**\nI'll load \"{file_name}\" into the data upload atom so you can see it in the UI.\n\n💡 **Note:**\nNo dtype changes were requested, so the file will maintain its current data types. The file will be ready for use in downstream operations once loaded."
            
            # Return the validate_json as a nested object
            return {
                "success": True,
                "message": result.get("message", "Data validation and dtype conversion configuration completed successfully"),
                "validate_json": validate_json,
                "smart_response": smart_response,
                "reasoning": result.get("reasoning", ""),
                "used_memory": result.get("used_memory", False),
                "session_id": session_id
            }
        else:
            # Return enhanced failure response with intelligent suggestions
            return {
                "success": False,
                "message": result.get("message", "More information needed for validation"),
                "smart_response": result.get("smart_response", "I'd be happy to help you validate and convert data types!"),
                "suggestions": result.get("suggestions", []),
                "file_analysis": result.get("file_analysis", {}),
                "next_steps": result.get("next_steps", []),
                "reasoning": result.get("reasoning", ""),
                "session_id": session_id
            }

    
    def _update_user_preferences(self, session_id, validate_json):
        """Update user preferences based on successful configurations"""
        session = self.get_session(session_id)
        prefs = session["user_preferences"]
        
        # Track favorite files
        filename = validate_json.get("file_name", "")
        if filename:
            prefs["favorite_files"][filename] = prefs["favorite_files"].get(filename, 0) + 1
        
        # Track preferred dtypes
        dtype_changes = validate_json.get("dtype_changes", {})
        for col, dtype in dtype_changes.items():
            if isinstance(dtype, dict):
                dtype_str = dtype.get("dtype", "")
            else:
                dtype_str = dtype
            if dtype_str:
                prefs["preferred_dtypes"][col] = dtype_str
        
        # Track common patterns
        pattern = {
            "file_name": filename,
            "dtype_changes": dtype_changes
        }
        
        # Add to patterns if unique
        if pattern not in prefs["common_patterns"]:
            prefs["common_patterns"].append(pattern)
            if len(prefs["common_patterns"]) > 10:
                prefs["common_patterns"] = prefs["common_patterns"][-10:]
    
    def _update_comprehensive_memory(self, session_id, user_prompt, llm_result, processed_result):
        """Update session memory with complete interaction data"""
        session = self.get_session(session_id)
        
        # Store complete interaction with all details
        interaction = {
            "timestamp": datetime.now().isoformat(),
            "user_prompt": user_prompt,
            "system_response": processed_result,
            "llm_raw_result": llm_result,
            "result_type": "success" if processed_result.get("success") else "failure",
            "has_suggestions": bool(processed_result.get("suggestions")),
            "used_memory": llm_result.get("used_memory", False),
            "reasoning": llm_result.get("reasoning", "")
        }
        
        session["conversation_history"].append(interaction)
        
        # Keep extensive history (1000 interactions)
        if len(session["conversation_history"]) > 1000:
            session["conversation_history"] = session["conversation_history"][-1000:]
        
        # Keep successful configs (100 configs)
        if len(session["successful_configs"]) > 100:
            session["successful_configs"] = session["successful_configs"][-100:]
    
    def _call_llm(self, prompt):
        """Call LLM with prompt"""
        return call_llm(self.api_url, self.model_name, self.bearer_token, prompt)
    
    def _extract_json(self, response):
        """Extract JSON from LLM response"""
        return extract_json(response)
    
    def _create_fallback_response(self, session_id):
        """Create fallback response when LLM fails"""
        return {
            "success": False,
            "message": "I couldn't process that request. Could you please rephrase?",
            "smart_response": "I'm having trouble understanding your request. Could you please tell me which file you'd like to validate and what data types you'd like to convert?",
            "session_id": session_id
        }
    
    def _create_error_response(self, session_id, error_msg):
        """Create error response"""
        return {
            "success": False,
            "error": error_msg,
            "message": f"An error occurred: {error_msg}",
            "smart_response": f"I encountered an error while processing your request: {error_msg}. Please try again.",
            "session_id": session_id
        }
    
    def get_session_history(self, session_id):
        """Get complete session history"""
        session = self.get_session(session_id)
        return session.get("conversation_history", [])
    
    def get_session_stats(self, session_id):
        """Get session statistics"""
        session = self.get_session(session_id)
        return {
            "total_interactions": len(session.get("conversation_history", [])),
            "successful_configs": len(session.get("successful_configs", [])),
            "created_at": session.get("created_at", ""),
            "last_interaction": session.get("conversation_history", [{}])[-1].get("timestamp", "") if session.get("conversation_history") else ""
        }
    
    def get_detailed_session_info(self, session_id):
        """Get detailed session information for debugging"""
        session = self.get_session(session_id)
        return {
            "session_id": session_id,
            "created_at": session.get("created_at", ""),
            "total_interactions": len(session.get("conversation_history", [])),
            "successful_configs": len(session.get("successful_configs", [])),
            "user_preferences": session.get("user_preferences", {}),
            "recent_history": session.get("conversation_history", [])[-5:],
            "recent_successful": session.get("successful_configs", [])[-5:]
        }
    
    def get_available_files(self):
        """Get list of available files"""
        self._ensure_files_loaded()
        return list(self.files_with_columns.keys())

