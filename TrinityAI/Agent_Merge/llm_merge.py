# llm_merge.py
import json
import logging
import os
import uuid
from datetime import datetime

from Agent_Merge.ai_logic import build_merge_prompt, call_merge_llm, extract_json
from file_loader import FileLoader

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
        self.bucket = bucket
        self.prefix = prefix
        self.sessions = {}
        
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

    def _maybe_update_prefix(self) -> None:
        """Dynamically updates the MinIO prefix and reloads files."""
        try:
            # Use FileLoader's prefix update method
            self.file_loader._maybe_update_prefix()
            if self.file_loader.object_prefix != self.prefix:
                logger.info("MinIO prefix updated from '%s' to '%s'", self.prefix, self.file_loader.object_prefix)
                self.prefix = self.file_loader.object_prefix
                # Reload files with new prefix
                self.files_with_columns = self.file_loader.load_files()
        except Exception as e:
            logger.warning(f"Failed to update prefix: {e}")

    def _load_files(self) -> None:
        """Load files using the standardized FileLoader."""
        self.files_with_columns = self.file_loader.load_files()



    def _enhance_context_with_columns(self, context: str, user_prompt: str) -> str:
        """Adds file and column information to the LLM context for better accuracy."""
        # Use FileLoader's standardized file info string method
        file_info = self.file_loader.get_file_info_string(self.files_with_columns)
        
        context += "\n\n--- AVAILABLE FILES AND COLUMNS ---\n"
        context += f"Here are all the files available for merging: {file_info}\n"
        context += "\nDetailed file information:\n"
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

    def process_request(self, user_prompt: str, session_id: str = None, 
                       client_name: str = "", app_name: str = "", project_name: str = "") -> dict:
        """
        Main entry point to process a user's request to merge files.
        Works exactly like the explore agent for perfect compatibility.
        """
        logger.info(f"Processing request for session '{session_id}': '{user_prompt}'")
        if not user_prompt or not user_prompt.strip():
            return {"success": False, "error": "Prompt cannot be empty.", "session_id": session_id}
        
        # Set environment context for dynamic path resolution (like explore agent)
        self.file_loader.set_context(client_name, app_name, project_name)
            
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