# llm_create_transform.py
import json
import uuid
import logging
import os
from datetime import datetime
from typing import Dict, Any, Optional, List
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
import pyarrow.feather as pf
from io import BytesIO
from minio import Minio
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage
from langchain.memory import ConversationBufferWindowMemory

from .ai_logic import (
    build_prompt_create_transform,
    call_llm_create_transform,
    extract_json_from_response
)

logger = logging.getLogger(__name__)
ALLOWED_KEYS = {"success", "message", "create_transform_json", "session_id", "suggestions"}


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
        try:
            self.minio_client = Minio(minio_endpoint, access_key=access_key, secret_key=secret_key, secure=False)
        except Exception as e:
            logger.critical(f"MinIO init failed: {e}")
            self.minio_client = None
        self.files_with_columns: Dict[str, List[str]] = {}
        self._load_files()
        self.history_window_size = history_window_size

    def _load_files(self):
        """Loads files from MinIO, intelligently reading various Arrow formats."""
        logger.info(f"Loading files from MinIO bucket '{self.bucket}' with prefix '{self.prefix}'...")
        self.files_with_columns.clear()
        
        if not self.minio_client:
            logger.error("No MinIO client.")
            return
            
        try:
            objects = self.minio_client.list_objects(self.bucket, prefix=self.prefix, recursive=True)
            
            files_loaded = 0
            for obj in objects:
                # We are primarily interested in files with the .arrow extension
                if not obj.object_name.endswith('.arrow'):
                    continue

                filename = os.path.basename(obj.object_name)
                full_object_path = obj.object_name
                logger.info(f"Processing file: {filename}")
                logger.info(f"Full MinIO object path: {full_object_path}")
                logger.info(f"Bucket: {self.bucket}, Prefix: {self.prefix}")

                try:
                    # Use the full object path, not just the filename
                    response = self.minio_client.get_object(self.bucket, full_object_path)
                    file_data = response.read()
                    logger.info(f"Successfully read file from MinIO path: {full_object_path}")
                finally:
                    response.close()
                    response.release_conn()

                table = None
                # --- Simplified Reading Logic ---
                # Define a list of reading functions to try in order of likelihood.
                # Each function takes a bytes buffer and returns a PyArrow Table.
                readers = [
                    ("Parquet", lambda buffer: pq.read_table(buffer)),
                    ("Feather", lambda buffer: pf.read_table(buffer)),
                    ("Arrow IPC", lambda buffer: pa.ipc.open_stream(buffer).read_all())
                ]

                for format_name, reader_func in readers:
                    try:
                        # Use a BytesIO buffer to read the in-memory file data
                        buffer = BytesIO(file_data)
                        table = reader_func(buffer)
                        logger.info(f"Successfully read '{filename}' as {format_name} format.")
                        break  # Stop on the first successful read
                    except Exception as e:
                        logger.debug(f"Could not read '{filename}' as {format_name}: {e}")

                # --- Column Extraction ---
                if table is not None:
                    columns = table.column_names
                    self.files_with_columns[filename] = columns
                    files_loaded += 1
                    
                    # Enhanced column printing for better visibility
                    logger.info(f"=== COLUMN EXTRACTION FOR '{filename}' ===")
                    logger.info(f"Total columns: {len(columns)}")
                    logger.info(f"Columns: {columns}")
                    logger.info(f"Column types: {[table.schema.field(col).type for col in columns]}")
                    logger.info(f"Row count: {table.num_rows}")
                    logger.info(f"File size: {len(file_data)} bytes")
                    logger.info("=" * 50)
                    
                    # Also print to console for immediate visibility
                    print(f"\n📁 File: {filename}")
                    print(f"📊 Columns ({len(columns)}): {columns}")
                    print(f"📈 Rows: {table.num_rows}")
                    print(f"💾 Size: {len(file_data)} bytes")
                    print("-" * 40)
                    
                else:
                    logger.warning(f"Could not read '{filename}' in any supported format.")
                    
            logger.info(f"Finished loading. Found and processed {files_loaded} files.")
            print(f"\n🎯 SUMMARY: Loaded {files_loaded} files with columns:")
            for filename, columns in self.files_with_columns.items():
                print(f"  • {filename}: {len(columns)} columns")
            print("=" * 50)
            
        except Exception as e:
            logger.error(f"MinIO list_objects failed: {e}")

    def _build_history_string(self, history_msgs: List[BaseMessage]) -> str:
        if not history_msgs:
            return "No history."
        buf = []
        for i, msg in enumerate(history_msgs, 1):
            role = "User" if isinstance(msg, HumanMessage) else "Assistant"
            buf.append(f"\n--- {role} {i} ---\n{msg.content}")
        return "\n".join(buf)

    def process_request(self, user_prompt: str, session_id: Optional[str] = None) -> dict:
        if not user_prompt.strip():
            return {
                "success": False,
                "message": "Empty input.",
                "session_id": session_id or str(uuid.uuid4()),
                "suggestions": ["Please specify the desired operation."]
            }
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
        
        # If success and create_transform_json exists, ensure it has all required fields
        if filtered.get("success") and "create_transform_json" in filtered:
            create_config = filtered["create_transform_json"]
            
            # Auto-generate missing required fields for backend compatibility
            if "bucket_name" not in create_config:
                create_config["bucket_name"] = "trinity"
                
            # Ensure identifiers is always an array
            if "identifiers" not in create_config:
                create_config["identifiers"] = []
            elif not isinstance(create_config["identifiers"], list):
                create_config["identifiers"] = [create_config["identifiers"]] if create_config["identifiers"] else []
                
            # 🔧 CRITICAL FIX: Convert all column names to lowercase for backend compatibility
            if "identifiers" in create_config and create_config["identifiers"]:
                create_config["identifiers"] = [col.lower() for col in create_config["identifiers"]]
                
            if "operations" in create_config and create_config["operations"]:
                # Convert operation column names to lowercase
                for op in create_config["operations"]:
                    if "source_columns" in op and op["source_columns"]:
                        op["source_columns"] = [col.lower() for col in op["source_columns"]]
                
        elif filtered.get("success") and "create_transform_json" not in filtered:
            filtered["create_transform_json"] = {}
            
        if not filtered.get("success"):
            filtered.pop("create_transform_json", None)
            
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
