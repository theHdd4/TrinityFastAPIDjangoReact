# llm_group_by.py
import json
import uuid
import logging
import os
from typing import Dict, Any, List, Optional
from langchain_core.messages import HumanMessage
from langchain.memory import ConversationBufferWindowMemory

from .ai_logic import build_prompt_group_by, call_llm_group_by, extract_json_group_by
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from file_loader import FileLoader

logger = logging.getLogger("agent.group_by")

# from original llm.py
OPERATION_FORMAT = """
{
  "bucket_name": "trinity",
  "object_names": "your_file.csv",
  "identifiers": ["group_by_col1", "group_by_col2"],
  "aggregations": {
    "numeric_col_1": {
      "agg": "sum",
      "rename_to": "sum_of_col_1"
    },
    "numeric_col_2": {
      "agg": "weighted_mean",
      "weight_by": "column_to_use_for_weights",
      "rename_to": "weighted_avg_of_col_2"
    }
  }
}
"""

SUPPORTED_AGGREGATIONS = {
    "sum": {"requires_weight": False, "description": "Calculates the sum of a numeric column."},
    "mean": {"requires_weight": False, "description": "Calculates the average of a numeric column."},
    "min": {"requires_weight": False, "description": "Finds the minimum value in a numeric column."},
    "max": {"requires_weight": False, "description": "Finds the maximum value in a numeric column."},
    "count": {"requires_weight": False, "description": "Counts the number of entries in a column."},
    "median": {"requires_weight": False, "description": "Calculates the median of a numeric column."},
    "weighted_mean": {"requires_weight": True, "description": "Calculates the weighted mean, requires a 'weight_by' column."},
    "rank_pct": {"requires_weight": False, "description": "Computes the rank of a column as a percentile."}
}

ALLOWED_KEYS = {"success", "message", "groupby_json", "session_id", "suggestions", "reasoning", "used_memory", "next_steps", "error", "processing_time", "smart_response", "file_analysis"}

class SmartGroupByAgent:
    def __init__(self, api_url, model_name, bearer_token,
                 minio_endpoint, access_key, secret_key, bucket, prefix,
                 history_window_size=5):
        self.api_url = api_url
        self.model_name = model_name
        self.bearer_token = bearer_token
        self.bucket = bucket
        self.prefix = prefix
        self.sessions: Dict[str, Dict[str, Any]] = {}
        self.history_window_size = history_window_size
        
        # File context for intelligent suggestions
        self.files_with_columns: Dict[str, List[str]] = {}
        self.files_metadata: Dict[str, Dict[str, Any]] = {}
        self.current_file_id: Optional[str] = None
        
        # MinIO configuration
        self.minio_endpoint = minio_endpoint
        self.access_key = access_key
        self.secret_key = secret_key
        
        # Initialize FileLoader for standardized file handling
        self.file_loader = FileLoader(
            minio_endpoint=minio_endpoint,
            minio_access_key=access_key,
            minio_secret_key=secret_key,
            minio_bucket=bucket,
            object_prefix=prefix
        )
        
        # Files will be loaded lazily when needed
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
            
            # logger.info(f"Loading files with prefix: {self.prefix}")
            
            # Initialize MinIO client
            # Handle different minio library versions
            try:
                # Try newer API (all keyword arguments)
                minio_client = Minio(
                    endpoint=self.file_loader.minio_endpoint,
                    access_key=self.file_loader.minio_access_key,
                    secret_key=self.file_loader.minio_secret_key,
                    secure=False
                )
            except (TypeError, ValueError):
                # Fallback for older minio versions (endpoint as positional)
                minio_client = Minio(
                    self.file_loader.minio_endpoint,
                    access_key=self.file_loader.minio_access_key,
                    secret_key=self.file_loader.minio_secret_key,
                    secure=False
                )
            
            # List objects in bucket with current prefix
            objects = minio_client.list_objects(bucket_name=self.file_loader.minio_bucket, prefix=self.prefix, recursive=True)
            
            files_with_columns = {}
            
            for obj in objects:
                try:
                    if obj.object_name.endswith('.arrow'):
                        # Get Arrow file data
                        response = minio_client.get_object(bucket_name=self.file_loader.minio_bucket, object_name=obj.object_name)
                        data = response.read()
                        
                        # Read Arrow file
                        with pa.ipc.open_file(pa.BufferReader(data)) as reader:
                            table = reader.read_all()
                            columns = table.column_names
                            files_with_columns[obj.object_name] = {"columns": columns}
                            
                        # logger.info(f"Loaded Arrow file {obj.object_name} with {len(columns)} columns")
                    
                    elif obj.object_name.endswith(('.csv', '.xlsx', '.xls')):
                        # For CSV/Excel files, try to read headers
                        response = minio_client.get_object(bucket_name=self.file_loader.minio_bucket, object_name=obj.object_name)
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

    def _history_str(self, session_id: str) -> str:
        hist = self.sessions[session_id]["memory"].load_memory_variables({}).get("history", [])
        if not hist:
            return "No history."
        buf = []
        for msg in hist:
            role = "User" if isinstance(msg, HumanMessage) else "Assistant"
            buf.append(f"{role}: {msg.content}")
        return "\n".join(buf)

    def _enforce_allowed_keys(self, result: dict, session_id: str) -> dict:
        """
        MINIMAL validation - just add session_id and filter keys, let handlers deal with validation
        """
        if not result:
            return {"success": False, "message": "No valid JSON found", "session_id": session_id}
        
        # Just add session_id and filter to allowed keys
        result["session_id"] = session_id
        filtered = {k: v for k, v in result.items() if k in ALLOWED_KEYS}
        
        logger.info(f"✅ Minimal validation passed, returning {len(filtered)} keys")
        return filtered

    def process_request(self, user_prompt: str, session_id: Optional[str] = None, client_name: str = "", app_name: str = "", project_name: str = ""):
        # Set environment context for dynamic path resolution (like explore agent)
        self.set_context(client_name, app_name, project_name)
        
        if not user_prompt.strip():
            return {"success": False, "message": "Empty prompt.", "session_id": session_id or str(uuid.uuid4()),
                    "suggestions": ["Please describe the aggregation you want."]}
        
        # Check if MinIO prefix needs an update (and files need reloading)
        self._maybe_update_prefix()
        
        # Load files lazily only when needed
        self._ensure_files_loaded()
        
        if not self.files_with_columns:
            return {"success": False, "message": "No files loaded.", "session_id": session_id or str(uuid.uuid4()),
                    "suggestions": ["Check MinIO connection."]}

        if not session_id:
            session_id = str(uuid.uuid4())
            self.sessions[session_id] = {"memory": ConversationBufferWindowMemory(k=self.history_window_size, return_messages=True)}
        elif session_id not in self.sessions:
            self.sessions[session_id] = {"memory": ConversationBufferWindowMemory(k=self.history_window_size, return_messages=True)}

        mem = self.sessions[session_id]["memory"]
        hist_str = self._history_str(session_id)
        sup_det = json.dumps(SUPPORTED_AGGREGATIONS, indent=2)

        prompt = build_prompt_group_by(user_prompt, session_id, self.files_with_columns, sup_det, OPERATION_FORMAT, hist_str)
        
        # 🔧 LOG LLM REQUEST AND RESPONSE
        logger.info(f"🤖 GROUPBY LLM REQUEST:")
        logger.info(f"📝 User Prompt: {user_prompt}")
        logger.info(f"🔧 Session ID: {session_id}")
        logger.info(f"📁 Available Files: {list(self.files_with_columns.keys())}")
        logger.info(f"📋 Prompt Length: {len(prompt)} characters")

        raw = call_llm_group_by(self.api_url, self.model_name, self.bearer_token, prompt)
        
        # 🔧 LOG LLM RESPONSE
        logger.info(f"🤖 GROUPBY LLM RESPONSE:")
        logger.info(f"📄 Raw Response Length: {len(raw) if raw else 0} characters")
        if raw:
            logger.info(f"📄 FULL RAW LLM RESPONSE:")
            logger.info("=" * 80)
            logger.info(raw)
            logger.info("=" * 80)
        else:
            logger.warning("❌ No response from LLM")
        
        if not raw:
            return {"success": False, "message": "No response from LLM", "session_id": session_id, "suggestions": ["Try again."]}

        parsed = extract_json_group_by(raw) or {}
        parsed = self._normalize_groupby_result(parsed)
        
        # 🔧 LOG PARSED JSON
        logger.info(f"🔍 GROUPBY PARSED JSON:")
        logger.info(f"✅ Success: {parsed.get('success', False)}")
        logger.info(f"📊 Has groupby_json: {bool(parsed.get('groupby_json'))}")
        logger.info(f"💬 Has smart_response: {bool(parsed.get('smart_response'))}")
        logger.info(f"📋 Has suggestions: {bool(parsed.get('suggestions'))}")
        if parsed.get('smart_response'):
            logger.info(f"💬 Smart Response: {parsed['smart_response'][:200]}...")
        logger.info(f"🔍 FULL PARSED JSON:")
        logger.info("=" * 80)
        logger.info(json.dumps(parsed, indent=2))
        logger.info("=" * 80)
        
        # LENIENT HANDLING: If JSON extraction fails, create a helpful fallback response
        if not parsed:
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
            
            parsed = {
                "success": False,
                "suggestions": [
                    "Here's what I found about your files:",
                    f"Available files for groupby: {', '.join(file_list)}",
                    "To complete groupby, specify: file + group columns + aggregation functions",
                    "Or say 'yes' to use my suggestions"
                ],
                "message": "Here's what I can help you with",
                "smart_response": f"I'd be happy to help you with GroupBy operations! Here are your available files and their columns:\n" + 
                               "\n".join(file_details) +
                               "\n\nI can help you group and aggregate this data by specifying which columns to group by and which aggregation functions to use.",
                "available_files": self.files_with_columns,
                "next_steps": [
                    "Tell me which file you want to group",
                    "Specify the columns to group by",
                    "Choose the aggregation functions (sum, mean, count, etc.)",
                    "Ask me to suggest the best grouping strategy"
                ]
            }
        
        result = self._enforce_allowed_keys(parsed, session_id)
        
        mem.save_context({"input": user_prompt}, {"output": json.dumps(result)})
        return result

    def get_session_history(self, session_id): return self.sessions.get(session_id, {}).get("memory").load_memory_variables({})
    def get_all_sessions(self): return list(self.sessions.keys())
    def clear_session(self, session_id): return self.sessions.pop(session_id, None) is not None

    def _normalize_groupby_result(self, parsed: Dict[str, Any]) -> Dict[str, Any]:
        """
        Detect raw GroupBy configs (no wrapper) and convert them into the standard response shape.
        This prevents strict validation from stripping out valid configs when smart_response is missing.
        """
        if not parsed or "groupby_json" in parsed:
            return parsed

        config_keys = {
            "bucket_name",
            "object_names",
            "file_name",
            "file_key",
            "identifiers",
            "aggregations",
            "source_file",
            "bucket",
        }

        if not any(key in parsed for key in config_keys):
            return parsed

        logger.info("🔄 Detected raw GroupBy configuration without wrapper – normalizing for backend/UI compatibility")

        config: Dict[str, Any] = {}
        for key in list(parsed.keys()):
            if key in config_keys:
                config[key] = parsed.pop(key)

        if not config.get("bucket_name"):
            config["bucket_name"] = "trinity"

        parsed["groupby_json"] = config

        if "success" not in parsed:
            parsed["success"] = True
        if "message" not in parsed:
            parsed["message"] = "GroupBy configuration generated"

        return parsed
