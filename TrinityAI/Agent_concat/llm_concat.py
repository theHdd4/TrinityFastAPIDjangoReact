# llm_concat_agent.py

import requests
import json
import re
from .ai_logic import build_prompt, call_llm, extract_json
from pathlib import Path
from datetime import datetime
import uuid
import os
from typing import Dict, Any, Optional, List
import logging
from file_loader import FileLoader

logger = logging.getLogger("trinity.concat")


def _describe_endpoint(client) -> str:
    """Return a human readable endpoint for the given MinIO client."""
    ep = getattr(client, "_endpoint_url", None)
    if ep:
        return str(ep)
    try:
        return client._base_url._url.netloc
    except Exception:
        return "unknown"

class SmartConcatAgent:
    """Complete LLM-driven concatenation agent with full history context"""

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
        """Load available files from MinIO with their columns using dynamic paths"""
        try:
            try:
                from minio import Minio
                from minio.error import S3Error
                import pyarrow as pa
                import pyarrow.ipc as ipc
                import pandas as pd
                import io
            except ImportError as ie:
                logger.error(f"Failed to import required libraries: {ie}")
                self.files_with_columns = {}
                return
            
            logger.info(f"Loading files with prefix: {self.prefix}")
            
            # Initialize MinIO client
            minio_client = Minio(
                self.file_loader.minio_endpoint,
                access_key=self.file_loader.minio_access_key,
                secret_key=self.file_loader.minio_secret_key,
                secure=False
            )
            
            # List objects in bucket with current prefix
            objects = minio_client.list_objects(self.file_loader.minio_bucket, prefix=self.prefix, recursive=True)
            
            files_with_columns = {}
            
            for obj in objects:
                try:
                    if obj.object_name.endswith('.arrow'):
                        # Get Arrow file data
                        response = minio_client.get_object(self.file_loader.minio_bucket, obj.object_name)
                        data = response.read()
                        
                        # Read Arrow file
                        with pa.ipc.open_file(pa.BufferReader(data)) as reader:
                            table = reader.read_all()
                            columns = table.column_names
                            files_with_columns[obj.object_name] = {"columns": columns}
                            
                        # logger.info(f"Loaded Arrow file {obj.object_name} with {len(columns)} columns")
                    
                    elif obj.object_name.endswith(('.csv', '.xlsx', '.xls')):
                        # For CSV/Excel files, try to read headers
                        response = minio_client.get_object(self.file_loader.minio_bucket, obj.object_name)
                        data = response.read()
                        
                        if obj.object_name.endswith('.csv'):
                            # Read CSV headers
                            df_sample = pd.read_csv(io.BytesIO(data), nrows=0)  # Just headers
                            columns = list(df_sample.columns)
                        else:
                            # Read Excel headers
                            df_sample = pd.read_excel(io.BytesIO(data), nrows=0)  # Just headers
                            columns = list(df_sample.columns)
                        
                        files_with_columns[obj.object_name] = {"columns": columns}
                        # logger.info(f"Loaded {obj.object_name.split('.')[-1].upper()} file {obj.object_name} with {len(columns)} columns")
                        
                except Exception as e:
                    logger.warning(f"Failed to load file {obj.object_name}: {e}")
                    continue
            
            self.files_with_columns = files_with_columns
            logger.info(f"Loaded {len(files_with_columns)} files from MinIO")
            
        except Exception as e:
            logger.error(f"Error loading files from MinIO: {e}")
            self.files_with_columns = {}
    
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
                "preferred_direction": "vertical",
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
        
        # Set environment context for dynamic path resolution (like explore agent)
        self.set_context(client_name, app_name, project_name)
        
        if session_id is None:
            session_id = self.create_session()
        
        session = self.get_session(session_id)
        self._maybe_update_prefix()
        
        # Load files lazily only when needed
        self._ensure_files_loaded()
        
        # Build rich conversation context with complete JSON history
        context = self._build_rich_context(session_id)
        
        # Create LLM prompt using the shared AI logic
        prompt = build_prompt(user_prompt, self.files_with_columns, context)

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
                context_parts.append(f"System Response: {json.dumps(conv['system_response'], indent=2)}")
                context_parts.append(f"Result Type: {conv['result_type']}")
                context_parts.append(f"Timestamp: {conv['timestamp']}")
        
        # Successful configurations with complete details
        successful = session.get("successful_configs", [])
        if successful:
            context_parts.append("\n\nSUCCESSFUL CONFIGURATIONS:")
            for i, config in enumerate(successful[-5:], 1):  # Last 5 successful configs
                context_parts.append(f"\n--- SUCCESS {i} ---")
                context_parts.append(f"User Request: '{config['user_prompt']}'")
                context_parts.append(f"Configuration: {json.dumps(config['config'], indent=2)}")
                context_parts.append(f"Timestamp: {config['timestamp']}")
        
        # User preferences and patterns
        prefs = session.get("user_preferences", {})
        if prefs.get("favorite_files"):
            context_parts.append("\n\nUSER PREFERENCES:")
            context_parts.append(f"Favorite Files: {json.dumps(prefs['favorite_files'], indent=2)}")
            context_parts.append(f"Preferred Direction: {prefs['preferred_direction']}")
            if prefs.get("common_patterns"):
                context_parts.append(f"Common Patterns: {json.dumps(prefs['common_patterns'], indent=2)}")
        
        # Recent context for conversational responses
        if history:
            last_interaction = history[-1]
            context_parts.append(f"\n\nLAST INTERACTION CONTEXT:")
            context_parts.append(f"Last User Input: '{last_interaction['user_prompt']}'")
            context_parts.append(f"Last System Response: {json.dumps(last_interaction['system_response'], indent=2)}")
            if last_interaction.get('suggested_files'):
                context_parts.append(f"Files I Suggested: {last_interaction['suggested_files']}")
        
        return "\n".join(context_parts) if context_parts else "No previous conversation history"
    
    def _process_llm_result(self, result, session_id, user_prompt):
        """Process LLM result with enhanced response formatting"""
        session = self.get_session(session_id)
        
        if result.get("success"):
            # Store successful configuration
            concat_json = result.get("concat_json", {})
            session["successful_configs"].append({
                "timestamp": datetime.now().isoformat(),
                "user_prompt": user_prompt,
                "config": concat_json,
                "reasoning": result.get("reasoning", ""),
                "used_memory": result.get("used_memory", False)
            })
            
            # Update user preferences
            self._update_user_preferences(session_id, concat_json)
            
            # **FIXED: Return the concat_json as a nested object instead of flattening it**
            return {
                "success": True,
                "message": result.get("message", "Concatenation configuration completed successfully"),
                "concat_json": {
                    "bucket_name": concat_json.get("bucket_name", "trinity"),
                    "file1": concat_json.get("file1", []),
                    "file2": concat_json.get("file2", []),
                    "concat_direction": concat_json.get("concat_direction", "vertical")
                },
                "reasoning": result.get("reasoning", ""),
                "used_memory": result.get("used_memory", False),
                "session_id": session_id
            }
        else:
            # Return enhanced failure response with intelligent suggestions
            return {
                "success": False,
                "message": result.get("message", "More information needed for concatenation"),
                "suggestions": result.get("suggestions", []),
                "recommended_files": result.get("recommended_files", []),
                "next_steps": result.get("next_steps", []),
                "reasoning": result.get("reasoning", ""),
                "session_id": session_id
            }

    
    def _update_user_preferences(self, session_id, concat_json):
        """Update user preferences based on successful configurations"""
        session = self.get_session(session_id)
        prefs = session["user_preferences"]
        
        # Track favorite files
        for file_key in ["file1", "file2"]:
            if concat_json.get(file_key):
                filename = concat_json[file_key][0] if isinstance(concat_json[file_key], list) else concat_json[file_key]
                prefs["favorite_files"][filename] = prefs["favorite_files"].get(filename, 0) + 1
        
        # Track preferred direction
        direction = concat_json.get("concat_direction", "vertical")
        prefs["preferred_direction"] = direction
        
        # Track common patterns
        pattern = {
            "file1": concat_json.get("file1", [""])[0],
            "file2": concat_json.get("file2", [""])[0],
            "direction": direction
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
            "suggested_files": processed_result.get("recommended_files", []),
            "used_memory": llm_result.get("used_memory", False),
            "reasoning": llm_result.get("reasoning", "")
        }
        
        session["conversation_history"].append(interaction)
        
        # Keep extensive history (1000 interactions)
        if len(session["conversation_history"]) > 1000:
            session["conversation_history"] = session["conversation_history"][-1000:]
        
        # Keep successful configs (100 configs)
        if len(session.get("successful_configs", [])) > 100:
            session["successful_configs"] = session["successful_configs"][-100:]
    
    def _call_llm(self, prompt):
        """Delegate to the shared AI logic module."""
        return call_llm(self.api_url, self.model_name, self.bearer_token, prompt)
    
    def _extract_json(self, response):
        """Delegate JSON extraction to the AI logic module."""
        return extract_json(response)
    
    def _create_fallback_response(self, session_id):
        """Create fallback response when LLM fails"""
        session = self.get_session(session_id)
        
        # Use memory for fallback suggestions
        favorite_files = list(session.get("user_preferences", {}).get("favorite_files", {}).keys())[:3]
        
        return {
            "success": False,
            "message": "I had trouble understanding your request, but I can help based on your history",
            "suggestions": [
                "I had trouble processing your request",
                "Let me suggest based on your previous usage:",
                f"Files you've used before: {', '.join(favorite_files) if favorite_files else 'None yet'}",
                f"Available files: {', '.join(list(self.files_with_columns.keys())[:5])}",
                "Example: 'concatenate beans.csv with mayo.csv vertically'"
            ],
            "recommended_files": favorite_files,
            "next_steps": [
                "Please try with specific file names",
                "Or say 'yes' if you want to use suggested files",
                "Or say 'show me available files' to see all options"
            ],
            "session_id": session_id
        }
    
    def _create_error_response(self, session_id, error_msg):
        """Create error response"""
        return {
            "success": False,
            "message": f"System error occurred: {error_msg}",
            "suggestions": [
                "System error occurred, please try again",
                "If the problem persists, contact support",
                "Try simplifying your request"
            ],
            "session_id": session_id
        }
    
    def get_session_history(self, session_id):
        """Get complete session history with all JSON details"""
        session = self.get_session(session_id)
        return session.get("conversation_history", [])
    
    def get_available_files(self):
        """Get available files"""
        return list(self.files_with_columns.keys())
    
    def list_available_files(self) -> Dict[str, Any]:
        """List all available files from MinIO for concatenation using dynamic paths"""
        try:
            # Check if MinIO prefix needs an update (and files need reloading)
            self._maybe_update_prefix()
            self._load_files()
            return {
                "success": True,
                "files": self.files_with_columns,
                "total_files": len(self.files_with_columns),
                "dynamic_prefix": self.prefix
            }
        except Exception as e:
            logger.error(f"Error listing available files: {e}")
            return {
                "success": False,
                "error": str(e),
                "files": {},
                "total_files": 0
            }
    
    def get_session_stats(self, session_id):
        """Get comprehensive session statistics"""
        session = self.get_session(session_id)
        
        history = session.get("conversation_history", [])
        successful = len([h for h in history if h.get("result_type") == "success"])
        
        return {
            "session_id": session_id,
            "total_interactions": len(history),
            "successful_configs": len(session.get("successful_configs", [])),
            "success_rate": successful / len(history) if history else 0,
            "created_at": session.get("created_at"),
            "available_files": len(self.files_with_columns),
            "user_preferences": session.get("user_preferences", {}),
            "memory_utilization": {
                "favorite_files": len(session.get("user_preferences", {}).get("favorite_files", {})),
                "common_patterns": len(session.get("user_preferences", {}).get("common_patterns", [])),
                "history_depth": len(history)
            }
        }
    
    def get_detailed_session_info(self, session_id):
        """Get detailed session information for debugging"""
        session = self.get_session(session_id)
        
        return {
            "session_data": session,
            "available_files": list(self.files_with_columns.keys()),
            "memory_context": self._build_rich_context(session_id)
        }
