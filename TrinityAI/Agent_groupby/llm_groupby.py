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
            
            # logger.info(f"Loading files with prefix: {self.prefix}")
            
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
        result["session_id"] = session_id
        filtered = {k: v for k, v in result.items() if k in ALLOWED_KEYS}
        
        # If success and groupby_json exists, ensure it has all required fields
        if filtered.get("success") and "groupby_json" in filtered:
            groupby_config = filtered["groupby_json"]
            
            # Auto-generate missing required fields for backend compatibility
            if "validator_atom_id" not in groupby_config:
                # Generate a real validator_atom_id from session
                groupby_config["validator_atom_id"] = f"groupby_{session_id[:8]}"
            
            if "file_key" not in groupby_config:
                # Use object_names as file_key if available
                if "object_names" in groupby_config:
                    groupby_config["file_key"] = groupby_config["object_names"]
                else:
                    groupby_config["file_key"] = "unknown_file"
            
            # Ensure bucket_name is set
            if "bucket_name" not in groupby_config:
                groupby_config["bucket_name"] = "trinity"
                
            # Ensure all required fields are present and valid
            required_fields = ["bucket_name", "object_names", "identifiers", "aggregations", "validator_atom_id", "file_key"]
            missing_fields = [field for field in required_fields if field not in groupby_config or not groupby_config[field]]
            
            if missing_fields:
                logger.warning(f"Missing or empty required fields: {missing_fields}")
                # Try to fill missing fields with sensible defaults
                if "identifiers" not in groupby_config or not groupby_config["identifiers"]:
                    groupby_config["identifiers"] = []
                if "aggregations" not in groupby_config or not groupby_config["aggregations"]:
                    groupby_config["aggregations"] = {}
                    
            # 🔧 CRITICAL FIX: Convert all column names to lowercase for backend compatibility
            if "identifiers" in groupby_config and groupby_config["identifiers"]:
                groupby_config["identifiers"] = [col.lower() for col in groupby_config["identifiers"]]
                
            if "aggregations" in groupby_config and groupby_config["aggregations"]:
                # Convert aggregation column names to lowercase
                new_aggregations = {}
                for col_name, agg_config in groupby_config["aggregations"].items():
                    new_aggregations[col_name.lower()] = agg_config
                groupby_config["aggregations"] = new_aggregations
                
        elif filtered.get("success") and "groupby_json" not in filtered:
            filtered["groupby_json"] = {}
            
        # Only remove groupby_json if success is explicitly false AND we don't have other useful fields
        if not filtered.get("success") and not filtered.get("suggestions") and not filtered.get("smart_response"):
            filtered.pop("groupby_json", None)
            
        # Set default suggestions and message
        if not filtered.get("suggestions"):
            filtered["suggestions"] = [] if filtered.get("success") else ["Please provide more details."]
        if not filtered.get("message"):
            filtered["message"] = ""
        
        # Ensure smart_response is present for UI display
        if not filtered.get("smart_response"):
            if filtered.get("success") and filtered.get("groupby_json"):
                # Generate smart response for successful groupby operations
                groupby_config = filtered["groupby_json"]
                identifiers = groupby_config.get("identifiers", [])
                aggregations = groupby_config.get("aggregations", {})
                file_name = groupby_config.get("object_names", "your data")
                
                if identifiers and aggregations:
                    agg_summary = []
                    for field, agg_config in aggregations.items():
                        if isinstance(agg_config, dict):
                            agg_type = agg_config.get("agg", "sum")
                            rename_to = agg_config.get("rename_to", field)
                            agg_summary.append(f"{field} ({agg_type})")
                        else:
                            agg_summary.append(f"{field} ({agg_config})")
                    
                    filtered["smart_response"] = f"I've configured the groupby operation for you. The data will be grouped by {', '.join(identifiers)} and aggregated using {', '.join(agg_summary)}. You can now proceed with the operation or make adjustments as needed."
                else:
                    filtered["smart_response"] = "I've configured the groupby operation for you. You can now proceed with the operation or make adjustments as needed."
            elif filtered.get("success"):
                filtered["smart_response"] = "GroupBy configuration completed successfully. You can now proceed with the operation."
            else:
                # Generate smart response for failed operations
                if filtered.get("suggestions"):
                    filtered["smart_response"] = "I can help you create groupby operations from your data. Please provide more details about what you'd like to group and aggregate, or ask me to suggest appropriate groupings for your data."
                else:
                    filtered["smart_response"] = "I'm here to help you create groupby operations and analyze your data. Please describe what you'd like to group and aggregate."
        
        return filtered

    def process_request(self, user_prompt: str, session_id: Optional[str] = None, client_name: str = "", app_name: str = "", project_name: str = ""):
        # Set environment context for dynamic path resolution (like explore agent)
        self.set_context(client_name, app_name, project_name)
        
        if not user_prompt.strip():
            return {"success": False, "message": "Empty prompt.", "session_id": session_id or str(uuid.uuid4()),
                    "suggestions": ["Please describe the aggregation you want."]}
        
        # Check if MinIO prefix needs an update (and files need reloading)
        self._maybe_update_prefix()
        
        if not self.files_with_columns:
            self._load_files()
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
        
        # 🔍 DETAILED LOGGING: Print what we're sending to LLM
        print("\n" + "="*80)
        print("🚀 SENDING TO LLM (GROUPBY AGENT):")
        print("="*80)
        print(f"📝 User Prompt: {user_prompt}")
        print(f"🆔 Session ID: {session_id}")
        print(f"📁 Files with Columns: {json.dumps(self.files_with_columns, indent=2)}")
        print(f"⚙️ Supported Aggregations: {sup_det}")
        print(f"📋 Operation Format: {OPERATION_FORMAT}")
        print(f"📚 History: {hist_str}")
        print("="*80)
        print("📤 FULL PROMPT SENT TO LLM:")
        print("="*80)
        print(prompt)
        print("="*80)

        raw = call_llm_group_by(self.api_url, self.model_name, self.bearer_token, prompt)
        
        # 🔍 DETAILED LOGGING: Print what LLM returned
        print("\n" + "="*80)
        print("🤖 LLM RESPONSE RECEIVED:")
        print("="*80)
        print(f"📥 Raw Response: {raw}")
        print("="*80)
        
        if not raw:
            print("❌ LLM returned NO response!")
            return {"success": False, "message": "No response from LLM", "session_id": session_id, "suggestions": ["Try again."]}

        parsed = extract_json_group_by(raw) or {}
        print(f"🔍 Parsed JSON: {json.dumps(parsed, indent=2)}")
        
        result = self._enforce_allowed_keys(parsed, session_id)
        print(f"✅ Final Result: {json.dumps(result, indent=2)}")
        print("="*80)
        
        mem.save_context({"input": user_prompt}, {"output": json.dumps(result)})
        return result

    def get_session_history(self, session_id): return self.sessions.get(session_id, {}).get("memory").load_memory_variables({})
    def get_all_sessions(self): return list(self.sessions.keys())
    def clear_session(self, session_id): return self.sessions.pop(session_id, None) is not None
