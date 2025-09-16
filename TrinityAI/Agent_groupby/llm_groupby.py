# llm_group_by.py
import json
import uuid
import logging
import os
from typing import Dict, Any, List, Optional
from langchain_core.messages import HumanMessage
from langchain.memory import ConversationBufferWindowMemory

from .ai_logic import build_prompt_group_by, call_llm_group_by, extract_json_group_by
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

ALLOWED_KEYS = {"success", "message", "groupby_json", "session_id", "suggestions"}

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
        
        # Initialize FileLoader for standardized file handling
        self.file_loader = FileLoader(
            minio_endpoint=minio_endpoint,
            minio_access_key=access_key,
            minio_secret_key=secret_key,
            minio_bucket=bucket,
            object_prefix=prefix
        )
        
        # Load files on initialization
        self.files_with_columns = self.file_loader.load_files()

    def _load_files(self):
        """Load files using the standardized FileLoader."""
        self.files_with_columns = self.file_loader.load_files()

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
            
        if not filtered.get("success"):
            filtered.pop("groupby_json", None)
            
        filtered.setdefault("suggestions", [] if filtered.get("success") else ["Please provide more details."])
        filtered.setdefault("message", "")
        return filtered

    def process_request(self, user_prompt: str, session_id: Optional[str] = None):
        if not user_prompt.strip():
            return {"success": False, "message": "Empty prompt.", "session_id": session_id or str(uuid.uuid4()),
                    "suggestions": ["Please describe the aggregation you want."]}
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
