# llm_create_transform.py
import json
import uuid
import logging
import os
from datetime import datetime
from typing import Dict, Any, Optional, List
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage
from langchain.memory import ConversationBufferWindowMemory

from .ai_logic import (
    build_prompt_create_transform,
    call_llm_create_transform,
    extract_json_from_response
)
from file_loader import FileLoader

logger = logging.getLogger(__name__)
ALLOWED_KEYS = {"success", "message", "json", "session_id", "suggestions", "reasoning", "used_memory", "next_steps", "error", "processing_time", "smart_response", "file_analysis"}


class SmartCreateTransformAgent:
    def __init__(
        self,
        api_url: str,
        model_name: str,
        bearer_token: str,
        minio_endpoint: str,
        access_key: str,
        secret_key: str,
        bucket: str,
        prefix: str,
        supported_operations: dict,
        operation_format: str,
        history_window_size: int = 5
    ):
        self.api_url = api_url
        self.model_name = model_name
        self.bearer_token = bearer_token
        self.bucket = bucket
        self.prefix = prefix
        self.supported_operations = supported_operations
        self.operation_format = operation_format
        self.sessions: Dict[str, Dict[str, Any]] = {}
        self.history_window_size = history_window_size
        
        # Initialize FileLoader for standardized file handling
        self.file_loader = FileLoader(
            minio_endpoint=minio_endpoint,
            minio_access_key=access_key,
            minio_secret_key=secret_key,
            minio_bucket=bucket,
            object_prefix=prefix
        )
        
        # Load files on initialization using standardized method
        self._load_files()
    
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
                            
                        logger.info(f"Loaded Arrow file {obj.object_name} with {len(columns)} columns")
                    
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
                        logger.info(f"Loaded {obj.object_name.split('.')[-1].upper()} file {obj.object_name} with {len(columns)} columns")
                        
                except Exception as e:
                    logger.warning(f"Failed to load file {obj.object_name}: {e}")
                    continue
            
            self.files_with_columns = files_with_columns
            logger.info(f"Loaded {len(files_with_columns)} files from MinIO")
            
        except Exception as e:
            logger.error(f"Error loading files from MinIO: {e}")
            self.files_with_columns = {}

    def _build_history_string(self, history_msgs: List[BaseMessage]) -> str:
        if not history_msgs:
            return "No history."
        buf = []
        for i, msg in enumerate(history_msgs, 1):
            role = "User" if isinstance(msg, HumanMessage) else "Assistant"
            buf.append(f"\n--- {role} {i} ---\n{msg.content}")
        return "\n".join(buf)

    def process_request(self, user_prompt: str, session_id: Optional[str] = None, client_name: str = "", app_name: str = "", project_name: str = "") -> dict:
        # Set environment context for dynamic path resolution (like explore agent)
        self.set_context(client_name, app_name, project_name)
        
        if not user_prompt.strip():
            return {
                "success": False,
                "message": "Empty input.",
                "session_id": session_id or str(uuid.uuid4()),
                "suggestions": ["Please specify the desired operation."]
            }
        
        # Check if MinIO prefix needs an update (and files need reloading)
        self._maybe_update_prefix()
        
        if not self.files_with_columns:
            self._load_files()
        if not self.files_with_columns:
            return {
                "success": False,
                "message": "No files loaded from MinIO.",
                "session_id": session_id or str(uuid.uuid4()),
                "suggestions": ["Check MinIO connection and bucket/prefix."]
            }

        if not session_id:
            session_id = str(uuid.uuid4())
            self.sessions[session_id] = {"memory": ConversationBufferWindowMemory(k=self.history_window_size, return_messages=True)}
        elif session_id not in self.sessions:
            self.sessions[session_id] = {"memory": ConversationBufferWindowMemory(k=self.history_window_size, return_messages=True)}

        memory: ConversationBufferWindowMemory = self.sessions[session_id]["memory"]
        history_str = self._build_history_string(memory.load_memory_variables({})["history"])
        supported_ops = json.dumps(self.supported_operations, indent=2)
        prompt = build_prompt_create_transform(user_prompt, session_id, self.files_with_columns, supported_ops, self.operation_format, history_str)

        # 🔍 DETAILED LOGGING: Print what we're sending to LLM
        print("\n" + "="*80)
        print("🚀 SENDING TO LLM (CREATE TRANSFORM AGENT):")
        print("="*80)
        print(f"📝 User Prompt: {user_prompt}")
        print(f"🆔 Session ID: {session_id}")
        print(f"📁 Files with Columns: {json.dumps(self.files_with_columns, indent=2)}")
        print(f"⚙️ Supported Operations: {supported_ops}")
        print(f"📋 Operation Format: {self.operation_format}")
        print(f"📚 History: {history_str}")
        print("="*80)
        print("📤 FULL PROMPT SENT TO LLM:")
        print("="*80)
        print(prompt)
        print("="*80)

        raw = call_llm_create_transform(self.api_url, self.model_name, self.bearer_token, prompt)
        
        # 🔍 DETAILED LOGGING: Print what LLM returned
        print("\n" + "="*80)
        print("🤖 LLM RESPONSE RECEIVED:")
        print("="*80)
        print(f"📥 Raw Response: {raw}")
        print("="*80)
        
        if not raw:
            print("❌ LLM returned NO response!")
            return {
                "success": False,
                "message": "LLM returned no response.",
                "session_id": session_id,
                "suggestions": ["Try again later."]
            }
        
        parsed = extract_json_from_response(raw) or {}
        print(f"🔍 Parsed JSON: {json.dumps(parsed, indent=2)}")
        
        result = self._enforce_allowed_keys(parsed, session_id)
        print(f"✅ Final Result: {json.dumps(result, indent=2)}")
        print("="*80)
        
        memory.save_context({"input": user_prompt}, {"output": json.dumps(result)})
        return result

    def _enforce_allowed_keys(self, result: dict, session_id: str) -> dict:
        result["session_id"] = session_id
        filtered = {k: v for k, v in result.items() if k in ALLOWED_KEYS}
        
        # If success and json exists, ensure it has all required fields
        if filtered.get("success") and "json" in filtered:
            json_data = filtered["json"]
            
            # Handle both list and single object formats
            if isinstance(json_data, list):
                # Process each item in the list
                for config in json_data:
                    if isinstance(config, dict):
                        # Auto-generate missing required fields for backend compatibility
                        if "bucket_name" not in config:
                            config["bucket_name"] = "trinity"
                            
                        # 🔧 CRITICAL FIX: Convert all column names to lowercase for backend compatibility
                        # Convert operation columns to lowercase
                        for key, value in config.items():
                            if key.endswith(('_0', '_1', '_2', '_3', '_4', '_5')) and not key.endswith('_rename'):
                                if isinstance(value, str):
                                    # Convert comma-separated columns to lowercase
                                    columns = [col.strip().lower() for col in value.split(',')]
                                    config[key] = ','.join(columns)
            elif isinstance(json_data, dict):
                # Handle single object format
                config = json_data
                # Auto-generate missing required fields for backend compatibility
                if "bucket_name" not in config:
                    config["bucket_name"] = "trinity"
                    
                # 🔧 CRITICAL FIX: Convert all column names to lowercase for backend compatibility
                # Convert operation columns to lowercase
                for key, value in config.items():
                    if key.endswith(('_0', '_1', '_2', '_3', '_4', '_5')) and not key.endswith('_rename'):
                        if isinstance(value, str):
                            # Convert comma-separated columns to lowercase
                            columns = [col.strip().lower() for col in value.split(',')]
                            config[key] = ','.join(columns)
                
            # 🔍 STRICT VALIDATION: Only return success=true when ALL required fields are present and valid
            if isinstance(json_data, list):
                for config in json_data:
                    if isinstance(config, dict):
                        # Check if all required fields are present and valid
                        required_fields = ["bucket_name", "object_name"]
                        missing_fields = [field for field in required_fields if field not in config or not config[field]]
                        
                        if missing_fields:
                            logger.warning(f"Missing or empty required fields: {missing_fields}")
                            # Set success to false if any required field is missing
                            filtered["success"] = False
                            filtered["message"] = f"Missing required fields: {', '.join(missing_fields)}"
                            filtered["suggestions"] = [f"Please provide: {', '.join(missing_fields)}"]
                            # Remove the incomplete json
                            filtered.pop("json", None)
                            return filtered
                        
                        # Validate that at least one operation exists
                        operation_keys = [key for key in config.keys() if key.endswith(('_0', '_1', '_2', '_3', '_4', '_5')) and not key.endswith('_rename')]
                        if not operation_keys:
                            logger.warning("No operations found in configuration")
                            filtered["success"] = False
                            filtered["message"] = "No operations found in configuration"
                            filtered["suggestions"] = ["Please specify at least one operation"]
                            filtered.pop("json", None)
                            return filtered
                        
                        # Validate that each operation has a corresponding rename
                        for op_key in operation_keys:
                            rename_key = f"{op_key}_rename"
                            if rename_key not in config or not config[rename_key]:
                                logger.warning(f"Missing rename for operation {op_key}")
                                filtered["success"] = False
                                filtered["message"] = f"Missing rename for operation {op_key}"
                                filtered["suggestions"] = [f"Please provide rename for {op_key}"]
                                filtered.pop("json", None)
                                return filtered
                            
                            # Validate operation columns are not empty
                            if not config[op_key] or config[op_key].strip() == "":
                                logger.warning(f"Operation {op_key} has no columns")
                                filtered["success"] = False
                                filtered["message"] = f"Operation {op_key} has no columns"
                                filtered["suggestions"] = [f"Please specify columns for {op_key}"]
                                filtered.pop("json", None)
                                return filtered
                            
            elif isinstance(json_data, dict):
                # Handle single object validation
                config = json_data
                required_fields = ["bucket_name", "object_name"]
                missing_fields = [field for field in required_fields if field not in config or not config[field]]
                
                if missing_fields:
                    logger.warning(f"Missing or empty required fields: {missing_fields}")
                    filtered["success"] = False
                    filtered["message"] = f"Missing required fields: {', '.join(missing_fields)}"
                    filtered["suggestions"] = [f"Please provide: {', '.join(missing_fields)}"]
                    filtered.pop("json", None)
                    return filtered
                
                # Validate that at least one operation exists
                operation_keys = [key for key in config.keys() if key.endswith(('_0', '_1', '_2', '_3', '_4', '_5')) and not key.endswith('_rename')]
                if not operation_keys:
                    logger.warning("No operations found in configuration")
                    filtered["success"] = False
                    filtered["message"] = "No operations found in configuration"
                    filtered["suggestions"] = ["Please specify at least one operation"]
                    filtered.pop("json", None)
                    return filtered
                
                # Validate that each operation has a corresponding rename
                for op_key in operation_keys:
                    rename_key = f"{op_key}_rename"
                    if rename_key not in config or not config[rename_key]:
                        logger.warning(f"Missing rename for operation {op_key}")
                        filtered["success"] = False
                        filtered["message"] = f"Missing rename for operation {op_key}"
                        filtered["suggestions"] = [f"Please provide rename for {op_key}"]
                        filtered.pop("json", None)
                        return filtered
                    
                    # Validate operation columns are not empty
                    if not config[op_key] or config[op_key].strip() == "":
                        logger.warning(f"Operation {op_key} has no columns")
                        filtered["success"] = False
                        filtered["message"] = f"Operation {op_key} has no columns"
                        filtered["suggestions"] = ["Please specify columns for {op_key}"]
                        filtered.pop("json", None)
                        return filtered
                
        elif filtered.get("success") and "json" not in filtered:
            # If success=true but no json, this is invalid
            logger.warning("Success=true but no json provided")
            filtered["success"] = False
            filtered["message"] = "Configuration incomplete - missing json"
            filtered["suggestions"] = ["Please provide complete configuration"]
            return filtered
            
        if not filtered.get("success"):
            filtered.pop("json", None)
            
        for k in ["success", "message", "suggestions"]:
            filtered.setdefault(k, False if k == "success" else ([] if k == "suggestions" else ""))
        return filtered

    def get_session_history(self, session_id):
        mem = self.sessions.get(session_id, {}).get("memory")
        return mem.load_memory_variables({}) if mem else {}

    def get_all_sessions(self):
        return list(self.sessions.keys())

    def clear_session(self, session_id):
        return self.sessions.pop(session_id, None) is not None
    
    def list_available_files(self) -> Dict[str, Any]:
        """List all available files from MinIO for create/transform operations using dynamic paths"""
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
