# llm_merge.py
import json
import logging
import os
import uuid
from datetime import datetime
from io import BytesIO

import pandas as pd
import pyarrow as pa
import pyarrow.feather as pf
import pyarrow.parquet as pq
from minio import Minio

from Agent_Merge.ai_logic import build_merge_prompt, call_merge_llm, extract_json

# --- Setup a logger for clear, informative output ---
logger = logging.getLogger("smart.merge")
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')


class SmartMergeAgent:
    """
    An intelligent agent that uses an LLM to determine how to merge tabular data files
    stored in MinIO, handling various Arrow-based file formats.
    """

    def __init__(self, api_url, model_name, bearer_token, minio_endpoint, access_key, secret_key, bucket, prefix):
        logger.info("Initializing SmartMergeAgent...")
        self.api_url = api_url
        self.model_name = model_name
        self.bearer_token = bearer_token
        self.minio_client = Minio(minio_endpoint, access_key=access_key, secret_key=secret_key, secure=False)
        self.bucket = bucket
        self.prefix = prefix
        self.sessions = {}
        self.files_with_columns = {}
        
        # Load files on initialization
        self._load_files()

    def _maybe_update_prefix(self) -> None:
        """Dynamically updates the MinIO prefix using the same system as data_upload_validate."""
        try:
            # Import the dynamic path function from data_upload_validate
            import sys
            import os
            sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..', 'TrinityBackendFastAPI', 'app', 'features'))
            
            from data_upload_validate.app.routes import get_object_prefix
            import asyncio
            
            # Get the current dynamic path (this is what data_upload_validate uses)
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                current = loop.run_until_complete(get_object_prefix())
            finally:
                loop.close()
            
            if self.prefix != current:
                logger.info("MinIO prefix updated from '%s' to '%s'", self.prefix, current)
                self.prefix = current
                # Since prefix changed, we must reload the files.
                self._load_files()
                
        except Exception as e:
            logger.warning(f"Failed to get dynamic path, using fallback: {e}")
            # Fallback to environment variables
            client = os.getenv("CLIENT_NAME", "").strip()
            app = os.getenv("APP_NAME", "").strip()
            project = os.getenv("PROJECT_NAME", "").strip()

            current = f"{client}/{app}/{project}/" if any([client, app, project]) else ""
            current = current.lstrip("/")
            if current and not current.endswith("/"):
                current += "/"

            if self.prefix != current:
                logger.info("MinIO prefix updated from '%s' to '%s'", self.prefix, current)
                self.prefix = current
                # Since prefix changed, we must reload the files.
                self._load_files()

    def _load_files(self) -> None:
        """
        Loads files from MinIO, intelligently reading various Arrow formats.
        This method is streamlined to try reading files as Parquet, Feather, or Arrow IPC
        and correctly extracts column names.
        """
        logger.info(f"Loading files from MinIO bucket '{self.bucket}' with prefix '{self.prefix}'...")
        self.files_with_columns = {}
        
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
                    # If all reading methods failed, log an error and store empty columns.
                    self.files_with_columns[filename] = []
                    logger.error(f"All reading methods failed for '{filename}'. Unable to determine format.")
                    # Log the first 16 bytes (magic number) for manual inspection
                    logger.error(f"File '{filename}' starts with bytes: {file_data[:16]}")
            
            logger.info(f"Finished loading. Found and processed {files_loaded} files.")
            
            # Print summary of all loaded files
            print(f"\n🎯 SUMMARY: Loaded {files_loaded} files with columns:")
            for filename, columns in self.files_with_columns.items():
                print(f"  • {filename}: {len(columns)} columns")
            print("=" * 50)

        except Exception as e:
            logger.error(f"A critical error occurred while loading files from MinIO: {e}", exc_info=True)
            self.files_with_columns = {}



    def _enhance_context_with_columns(self, context: str, user_prompt: str) -> str:
        """Adds file and column information to the LLM context for better accuracy."""
        # Remove manual file matching - let the LLM handle file selection
        # Simply provide all available files and their columns
        
        context += "\n\n--- AVAILABLE FILES AND COLUMNS ---\n"
        context += "Here are all the files available for merging with their column information:\n"
        context += json.dumps(self.files_with_columns, indent=2)
        context += "\n\n--- INSTRUCTIONS FOR LLM ---\n"
        context += "1. Analyze the user's request to identify which files they want to merge\n"
        context += "2. Use the column information above to determine the best join columns\n"
        context += "3. If the user's request is unclear, suggest appropriate files based on their description\n"
        context += "4. Always verify that the suggested files exist in the available files list\n"
        
        return context

    def _build_context(self, session_id: str) -> str:
        """Builds a conversational context from the session history."""
        history = self.sessions.get(session_id, [])
        if not history:
            return "This is the first interaction."
            
        # Use the last 5 interactions to keep the context relevant and concise
        context_parts = []
        for interaction in history[-5:]:
            context_parts.append(f"User asked: {interaction['user_prompt']}")
            context_parts.append(f"You responded: {json.dumps(interaction['system_response'])}")
        
        return "--- CONVERSATION HISTORY ---\n" + "\n".join(context_parts)

    def create_session(self, session_id: str = None) -> str:
        """Creates a new session if one doesn't exist."""
        if session_id is None:
            session_id = str(uuid.uuid4())
        if session_id not in self.sessions:
            self.sessions[session_id] = []
            logger.info(f"Created new session: {session_id}")
        return session_id

    def process_request(self, user_prompt: str, session_id: str = None) -> dict:
        """
        Main entry point to process a user's request to merge files.
        """
        logger.info(f"Processing request for session '{session_id}': '{user_prompt}'")
        if not user_prompt or not user_prompt.strip():
            return {"success": False, "error": "Prompt cannot be empty.", "session_id": session_id}
            
        session_id = self.create_session(session_id)
        
        # Check if MinIO prefix needs an update (and files need reloading)
        self._maybe_update_prefix()
        
        if not self.files_with_columns:
            logger.warning("No files are loaded. Cannot process merge request.")
            return {
                "success": False, 
                "error": "No data files found in the specified MinIO location.", 
                "session_id": session_id
            }

        # 1. Build context from history
        context = self._build_context(session_id)
        
        # 2. Enhance context with file/column info
        context = self._enhance_context_with_columns(context, user_prompt)
        
        # 3. Build the final prompt for the LLM
        prompt = build_merge_prompt(user_prompt, self.files_with_columns, context)
        logger.info("Sending final prompt to LLM...")
        logger.debug(f"LLM Prompt: {prompt}")

        # 4. Call the LLM and process the response
        try:
            llm_response_str = call_merge_llm(self.api_url, self.model_name, self.bearer_token, prompt)
            result = extract_json(llm_response_str)
            
            if not result:
                raise ValueError("LLM response did not contain valid JSON.")

            # Store interaction in session history
            interaction = {
                "user_prompt": user_prompt,
                "system_response": result,
                "timestamp": datetime.now().isoformat()
            }
            self.sessions[session_id].append(interaction)
            result["session_id"] = session_id

            logger.info(f"Request processed successfully. Success: {result.get('success', False)}")
            return result
            
        except Exception as e:
            logger.error(f"Error during LLM call or JSON processing: {e}", exc_info=True)
            return {"success": False, "error": f"A system error occurred: {e}", "session_id": session_id}

    # --- Session Management Methods ---
    def get_session_history(self, session_id):
        return self.sessions.get(session_id, [])

    def get_all_sessions(self):
        return list(self.sessions.keys())

    def clear_session(self, session_id):
        if session_id in self.sessions:
            del self.sessions[session_id]
            logger.info(f"Cleared session: {session_id}")
            return True
        return False