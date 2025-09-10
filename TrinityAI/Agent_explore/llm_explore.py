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
        
        # Session management
        self.sessions = {}  # {session_id: [messages]}
        self.files_with_columns = {}  # {file_path: [columns]}
        self.current_file_context = None
        
        # Backend integration removed - following chart maker pattern
        
        logger.info(f"ExploreAgent initialized with model: {model_name}")
    
    def process(self, user_prompt: str, session_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Process user prompt and generate exploration configuration.
        Main entry point for exploration requests.
        Follows chart maker pattern - generates config only, no backend calls.
        """
        logger.info(f"Processing explore request for session '{session_id}': '{user_prompt}'")
        
        if not user_prompt or not user_prompt.strip():
            return {"success": False, "error": "Prompt cannot be empty.", "session_id": session_id}

        try:
            # Get or create session
            if not session_id:
                session_id = f"explore_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            
            if session_id not in self.sessions:
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
            logger.info(f"🔍 Complete Prompt:\n{prompt}")
            
            llm_response = call_explore_llm(self.api_url, self.model_name, self.bearer_token, prompt)
            logger.info(f"🔍 Explore Process - LLM response length: {len(llm_response)}")
            logger.info(f"🔍 Complete LLM Response:\n{llm_response}")
            
            result = extract_json(llm_response, self.files_with_columns)
            logger.info(f"🔍 Explore Process - Extracted result: {json.dumps(result, indent=2) if result else 'None'}")
            
            # 🔍 FILTER DEBUGGING: Check if AI generated filters
            if result and result.get("success") and result.get("exploration_config"):
                configs = result["exploration_config"]
                logger.info(f"🔍 AI EXPLORE FILTERS - Processing {len(configs)} exploration configs")
                
                # Check if any config has filters
                has_any_filters = any(config.get("filters", {}) for config in configs)
                
                if has_any_filters:
                    # Get the first config with filters as the reference
                    reference_filters = None
                    for config in configs:
                        if config.get("filters", {}):
                            reference_filters = config.get("filters", {})
                            break
                    
                    logger.info(f"🔍 AI EXPLORE FILTERS - Reference filters: {reference_filters}")
                    
                    # Apply the same filters to all configs
                    for i, config in enumerate(configs):
                        if not config.get("filters", {}):
                            config["filters"] = reference_filters
                            logger.info(f"🔍 AI EXPLORE FILTERS - Applied reference filters to config {i+1}")
                        else:
                            logger.info(f"🔍 AI EXPLORE FILTERS - Config {i+1} already has filters: {config.get('filters', {})}")
                
                # Log final filter state
                for i, config in enumerate(configs):
                    filters = config.get("filters", {})
                    logger.info(f"🔍 AI EXPLORE FILTERS - Final Config {i+1}: {filters}")
                    logger.info(f"🔍 AI EXPLORE FILTERS - Type: {type(filters)}, Empty: {not filters or len(filters) == 0}")
                    if filters:
                        logger.info(f"🔍 AI EXPLORE FILTERS - Filter columns: {list(filters.keys())}")
                        for col, vals in filters.items():
                            logger.info(f"🔍 AI EXPLORE FILTERS - {col}: {vals}")
            
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
                
                # Add error response to session
                self.sessions[session_id].append({
                    "role": "assistant",
                    "content": error_result["message"],
                    "timestamp": datetime.now().isoformat()
                })
                
                return error_result
            
            # Add session tracking
            result["session_id"] = session_id
            
            # Add assistant response to session
            self.sessions[session_id].append({
                "role": "assistant",
                "content": result.get("message", "Exploration configuration generated"),
                "timestamp": datetime.now().isoformat()
            })
            
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
            
            # Add error response to session
            if session_id in self.sessions:
                self.sessions[session_id].append({
                    "role": "assistant",
                    "content": error_result["message"],
                    "timestamp": datetime.now().isoformat()
                })
            
            return error_result
    
    def process_conversation(self, query: str, session_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Process conversational query with full memory context.
        Compatible with AIChatBot frontend integration.
        """
        return self.process(query, session_id)
    
    def set_file_context(self, file_id: str, columns: List[str], file_name: Optional[str] = None):
        """Set the current file context for exploration"""
        self.current_file_context = {
            "file_id": file_id,
            "columns": columns,
            "file_name": file_name or file_id
        }
        
        # Also add to files_with_columns for AI processing
        self.files_with_columns[file_id] = columns
        
        logger.info(f"File context set: {file_id} with {len(columns)} columns")
    
    def get_file_context(self) -> Optional[Dict[str, Any]]:
        """Get current file context information"""
        return self.current_file_context
    
    def list_available_files(self) -> Dict[str, Any]:
        """List all available files from MinIO for exploration"""
        try:
            self._load_available_files()
            return {
                "success": True,
                "files": self.files_with_columns,
                "total_files": len(self.files_with_columns),
                "current_context": self.current_file_context
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
    
    def _load_available_files(self):
        """Load available files from MinIO with their columns"""
        try:
            from minio import Minio
            from minio.error import S3Error
            import pyarrow as pa
            import pyarrow.ipc as ipc
            
            # Initialize MinIO client
            minio_client = Minio(
                self.minio_endpoint,
                access_key=self.minio_access_key,
                secret_key=self.minio_secret_key,
                secure=False
            )
            
            # List objects in bucket
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
                            files_with_columns[obj.object_name] = columns
                            
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
        """Build conversation context from session history"""
        if session_id not in self.sessions:
            return ""
        
        messages = self.sessions[session_id]
        context_parts = []
        
        for msg in messages[-10:]:  # Last 10 messages for context
            role = msg["role"]
            content = msg["content"]
            timestamp = msg.get("timestamp", "")
            
            if role == "user":
                context_parts.append(f"User: {content}")
            elif role == "assistant":
                context_parts.append(f"Assistant: {content}")
        
        return "\n".join(context_parts)
    
    # Backend integration methods removed - following chart maker pattern
    # The explore agent now only generates configuration, frontend handles execution
