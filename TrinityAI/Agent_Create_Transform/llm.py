# import requests
# import json
# import re
# from minio import Minio
# from datetime import datetime
# import uuid
# import logging
# from typing import Dict, List, Optional, Any
# import time
# import pandas as pd
# from io import BytesIO

# # Set logging to DEBUG for verbose output
# logging.basicConfig(level=logging.DEBUG)
# logger = logging.getLogger(__name__)

# ALLOWED_KEYS = {"success", "message", "json", "session_id", "suggestions"}

# OPERATION_FORMAT = """
# {
#   "bucket_name": "trinity",
#   "object_name": "sales_data.csv",
#   "add_1": "sales,returns",
#   "add_1_rename": "total_sales",
#   "subtract_2": "sales,cost",
#   "subtract_2_rename": "profit"
#   // etc...
# }
# """

# class OperationHistoryAgent:
#     """
#     Robust agent for LLM-driven stepwise column-operation JSON construction.
#     Only protocol-compliant keys returned; prompt and LLM output fully debugged.
#     """

#     def __init__(
#         self, api_url: str, model_name: str, bearer_token: str,
#         minio_endpoint: str, access_key: str, secret_key: str,
#         bucket: str, prefix: str
#     ):
#         self.api_url = api_url
#         self.model_name = model_name
#         self.bearer_token = bearer_token
#         logger.info(f"Initializing MinIO client for endpoint: {minio_endpoint}")
#         self.minio_client = Minio(
#             minio_endpoint, access_key=access_key, secret_key=secret_key, secure=False
#         )
#         self.bucket = bucket
#         self.prefix = prefix
#         self.sessions: Dict[str, List[Dict]] = {}
#         self.files_with_columns: Dict[str, List[str]] = {}
#         self._load_files()

#     def _load_files(self) -> None:
#         """Load all files/columns from MinIO. No constraints on number of files/columns."""
#         self.files_with_columns = {}
#         full_prefix_path = f"{self.prefix.rstrip('/')}/" # Ensure prefix ends with a slash
#         logger.info(f"Attempting to load ALL files from MinIO bucket '{self.bucket}' under prefix '{full_prefix_path}'...")
#         try:
#             # List objects with the specified prefix
#             all_objects = list(self.minio_client.list_objects(self.bucket, prefix=full_prefix_path, recursive=True))
            
#             if not all_objects:
#                 logger.warning(f"No objects found in MinIO bucket '{self.bucket}' under prefix '{full_prefix_path}'.")
#                 return

#             files_loaded_count = 0
#             for obj in all_objects:
#                 filename_full_path = obj.object_name
#                 # Ensure it's a file, not a directory marker
#                 if filename_full_path.endswith('/'):
#                     logger.debug(f"Skipping directory marker: {filename_full_path}")
#                     continue

#                 # Extract filename from the full path
#                 # This assumes the filename is the last component after the prefix
#                 relative_path = filename_full_path[len(full_prefix_path):]
#                 if not relative_path: # Handles cases where object_name is exactly the prefix itself
#                     continue
#                 filename = relative_path.split('/')[-1]

#                 logger.debug(f"Processing MinIO object: {filename_full_path} (extracted filename: {filename})")
#                 try:
#                     data_stream = self.minio_client.get_object(self.bucket, obj.object_name)
#                     data_bytes = data_stream.read() # Read the whole object into memory
                    
#                     cols = []
#                     if filename.endswith('.csv'):
#                         cols = pd.read_csv(BytesIO(data_bytes), nrows=20).columns.tolist()
#                     elif filename.endswith('.xlsx') or filename.endswith('.xls'):
#                         cols = pd.read_excel(BytesIO(data_bytes), nrows=20).columns.tolist()
#                     else:
#                         logger.debug(f"Skipping unsupported file type: {filename}")
#                         continue
                    
#                     self.files_with_columns[filename] = cols
#                     files_loaded_count += 1
#                     logger.debug(f"Successfully loaded columns for {filename}: {cols}")
#                 except Exception as e:
#                     logger.error(f"Failed to read/parse file '{filename_full_path}' from MinIO: {e}", exc_info=True)
#                     logger.error(f"Please ensure '{filename}' is a valid CSV or Excel file and its content is not corrupted.")
#                     # Continue to next file even if one fails
#             logger.info(f"Finished loading files. Total {files_loaded_count} files loaded successfully from MinIO.")
#             if not self.files_with_columns:
#                 logger.warning("After attempting to load all files, 'files_with_columns' is still empty. "
#                                "This might indicate an issue with file formats, content, or the MinIO prefix.")
#         except Exception as e:
#             logger.critical(f"MinIO connection or listing objects failed: {e}. "
#                            "Please verify MinIO endpoint, access keys, bucket, and network connectivity.", exc_info=True)
#             self.files_with_columns = {}

#     def _extract_json(self, response: str) -> Optional[Dict]:
#         if not response:
#             logger.debug("LLM response is empty, cannot extract JSON.")
#             return None

#         logger.debug(f"Attempting to extract JSON from raw LLM response (first 500 chars): {response[:500]}...")
        
#         # Try to find JSON block within triple backticks first
#         match = re.search(r'```(?:json)?\s*(.*?)\s*```', response, flags=re.DOTALL)
#         if match:
#             json_str = match.group(1)
#             try:
#                 parsed_json = json.loads(json_str)
#                 if isinstance(parsed_json, dict):
#                     logger.debug("Successfully extracted JSON from triple backticks.")
#                     return parsed_json
#             except json.JSONDecodeError as e:
#                 logger.warning(f"Failed to parse JSON from backtick block: {e}. Attempting other patterns.")
        
#         # If not found or failed, try to extract directly from the cleaned response
#         # This removes any lingering backticks if the LLM didn't put them correctly around the JSON
#         cleaned = re.sub(r'```(?:json)?\s*|\s*```', '', response, flags=re.DOTALL).strip()
        
#         # Fallback to direct curly brace extraction
#         start = cleaned.find('{')
#         end = cleaned.rfind('}')
#         if start != -1 and end != -1 and start < end:
#             try:
#                 parsed_json = json.loads(cleaned[start:end + 1])
#                 logger.debug("Successfully extracted JSON from direct curly brace search.")
#                 return parsed_json
#             except json.JSONDecodeError as e:
#                 logger.warning(f"Failed to parse JSON from direct curly brace extraction: {e}. Attempting regex patterns.")
#                 pass # Continue to more aggressive patterns

#         # More aggressive regex patterns for JSON extraction
#         json_patterns = [
#             r'\{[^{}]*\{[^{}]*\}[^{}]*\}', # Nested JSON (most specific first)
#             r'\{[^{}]+\}',               # Simple single-level JSON
#             r'\{.*?\}(?=\s*$)',           # JSON at end of string
#             r'\{.*\}',                    # Most permissive, could capture non-JSON parts if not careful
#         ]
#         for pattern in json_patterns:
#             matches = re.findall(pattern, cleaned, flags=re.DOTALL)
#             for match in matches:
#                 try:
#                     parsed = json.loads(match)
#                     if isinstance(parsed, dict):
#                         logger.debug(f"Successfully extracted JSON using regex pattern: {pattern}")
#                         return parsed
#                 except json.JSONDecodeError:
#                     continue # Try next match or next pattern if parsing fails
#         logger.warning("No valid JSON dictionary could be extracted from the LLM response using any method.")
#         return None

#     def _enforce_allowed_keys(self, result: dict, session_id: str) -> dict:
#         # Ensure session_id is always present and correct
#         result["session_id"] = session_id
        
#         # If success is True but 'json' key is missing, add an empty one
#         if result.get("success") is True and "json" not in result:
#             result["json"] = {}
#             logger.debug("Added empty 'json' dict because 'success' was true but 'json' was missing.")

#         # Filter out disallowed keys
#         filtered_result = {k: v for k, v in result.items() if k in ALLOWED_KEYS}
        
#         # Ensure essential keys are present with default values if missing
#         for k in ["success", "message", "session_id", "suggestions"]:
#             if k not in filtered_result:
#                 if k == "success":
#                     filtered_result[k] = False
#                     logger.debug(f"Set missing key '{k}' to False.")
#                 elif k == "message":
#                     filtered_result[k] = "No specific message generated by LLM, or message was filtered."
#                     logger.debug(f"Set missing key '{k}' to default message.")
#                 elif k == "session_id":
#                     filtered_result[k] = session_id # Should already be set, but as a fallback
#                     logger.debug(f"Set missing key '{k}' to session_id (fallback).")
#                 elif k == "suggestions":
#                     filtered_result[k] = ["No suggestions generated by LLM, or suggestions were filtered."]
#                     logger.debug(f"Set missing key '{k}' to default suggestions.")

#         # Ensure 'json' is only present if 'success' is True
#         if not filtered_result["success"] and "json" in filtered_result:
#             filtered_result.pop("json")
#             logger.debug("Removed 'json' key because 'success' was false.")
            
#         return filtered_result


#     def _build_json_history(self, history: List[Dict]) -> str:
#         if not history:
#             return ""
#         buf = ["=== HISTORY ==="]
#         for i, h in enumerate(history, 1):
#             buf.append(f"\n--- STEP {i} ---")
#             buf.append(f"USER: \"{h['user_prompt']}\"\nRESULT:")
#             # Use json.dumps for system_response for proper formatting in history
#             buf.append(json.dumps(h['system_response'], indent=2))
#             buf.append(f"TIME: {h['timestamp']}")
#         return "\n".join(buf)

#     def _call_llm(self, prompt: str, retry: int = 3) -> str:
#         payload = {
#             "model": self.model_name,
#             "messages": [{"role": "user", "content": prompt}],
#             "options": {"temperature": 0.1, "num_predict": 1500},
#             "stream": False # Ensure we get a single response, not a stream
#         }
#         headers = {"Authorization": f"Bearer {self.bearer_token}", "Content-Type": "application/json"}
        
#         logger.info(f"Calling LLM at {self.api_url} with model {self.model_name} (Attempt 1/{retry})")
#         for attempt in range(retry):
#             try:
#                 r = requests.post(self.api_url, json=payload, headers=headers, timeout=120) # Increased timeout
#                 r.raise_for_status()  # Raise HTTPError for bad responses (4xx or 5xx)
#                 response_data = r.json()
#                 content = response_data.get("message", {}).get("content", "")
#                 logger.info(f"LLM call successful (Attempt {attempt+1}/{retry}). Status: {r.status_code}")
#                 return content
#             except requests.exceptions.HTTPError as http_err:
#                 logger.error(f"HTTP error occurred during LLM call (Attempt {attempt+1}/{retry}): {http_err} - Response body: {r.text}")
#             except requests.exceptions.ConnectionError as conn_err:
#                 logger.error(f"Connection error occurred during LLM call (Attempt {attempt+1}/{retry}): {conn_err} - Is Ollama/LLM endpoint running and reachable at {self.api_url}?")
#             except requests.exceptions.Timeout as timeout_err:
#                 logger.error(f"Timeout error occurred during LLM call (Attempt {attempt+1}/{retry}): {timeout_err} - LLM call took too long (>{120}s). Consider increasing timeout or optimizing prompt.")
#             except json.JSONDecodeError as json_err:
#                 logger.error(f"JSON decode error from LLM response (Attempt {attempt+1}/{retry}): {json_err} - Raw response: {r.text}")
#             except Exception as e:
#                 logger.error(f"An unexpected error occurred during LLM call (Attempt {attempt+1}/{retry}): {e}", exc_info=True)
            
#             if attempt < retry - 1:
#                 logger.info(f"Retrying LLM call in {1.5 * (attempt+1)} seconds...")
#                 time.sleep(1.5 * (attempt+1))
#         logger.error("LLM call failed after all retries.")
#         return ""

#     def process_request(self, user_prompt: str, session_id: Optional[str] = None) -> Dict[str, Any]:
#         if not user_prompt or not user_prompt.strip():
#             return {
#                 "success": False,
#                 "message": "Please provide your operation instruction.",
#                 "suggestions": ["E.g.: 'add sales and cost in sales.csv as total_amount'"],
#                 "session_id": session_id or str(uuid.uuid4())
#             }
        
#         # Always attempt to reload files if files_with_columns is empty
#         # This acts as a re-initialization if MinIO wasn't ready at startup or if _load_files failed
#         if not self.files_with_columns:
#              logger.warning("Files and columns cache is empty. Attempting to reload from MinIO now.")
#              self._load_files()
#              if not self.files_with_columns:
#                  return {
#                      "success": False,
#                      "message": "Could not load any files or columns from MinIO. Please check MinIO configuration and data.",
#                      "suggestions": [
#                          "Ensure MinIO is running and accessible.",
#                          f"Verify bucket name '{self.bucket}' and prefix '{self.prefix}' are correct.",
#                          "Upload some valid .csv or .xlsx files to the specified MinIO location.",
#                          "Check MinIO container logs for any errors during file upload or access."
#                      ],
#                      "session_id": session_id or str(uuid.uuid4())
#                  }

#         if not session_id:
#             session_id = str(uuid.uuid4())
#             logger.info(f"Starting new session: {session_id}")
#         if session_id not in self.sessions:
#             self.sessions[session_id] = []
#             logger.info(f"Initialized new session history for {session_id}")
        
#         history = self.sessions[session_id]
#         context_files = self.files_with_columns
#         op_json_example = OPERATION_FORMAT.strip()
#         json_history = self._build_json_history(history)

#         # Build the LLM prompt
#         prompt = f"""
# You are a JSON-only AI assistant for configuring tabular data operations with NO EXTRAS.
# You must help the user build an operations JSON, step by step, following this schema:

# <output_format>
# {op_json_example}
# </output_format>

# Rules:
# - RESPOND ONLY WITH JSON; NEVER generate additional keys or commentary outside the JSON.
# - The JSON response MUST adhere to the allowed keys: "success" (bool), "message" (str), "json" (dict, only if success), "session_id" (str), and "suggestions" (list of str).
# - If more information, clarification, or choices are needed (e.g., file/column lists), ALWAYS provide it ONLY in the 'suggestions' list.
# - All summaries, next steps, or clarifying questions for the user must be in 'suggestions'.
# - If the configuration for a specific operation is fully understood and complete, set 'success' to true and fill the 'json' key according to the <output_format> schema. Otherwise, 'success' must be false.
# - Always ensure the "session_id" in your response is exactly: "{session_id}".

# Available files and their columns for reference:
# {json.dumps(context_files, indent=2)}

# Session history (previous interactions to maintain context):
# {json_history}

# Supported operations for columns (use these as keys in the 'json' field if success is true): add, subtract, multiply, divide, residual, log, sqrt, exp, dummy, rpi, stl_outlier, marketshare, kalman_filter, standardize_zscore, standardize_minmax, power (needs 'exponent' parameter), logistic (needs 'gr', 'co', 'mp' parameters), detrend, deseasonalize, detrend_deseasonalize.
# RULES: 1. The success is only true if the JSON is complete and valid according to the <output_format> schema.
# If you need to ask the user for more information, do not set 'success' to true
# 2. Suggestion should be used to ask the user for more information, clarification, or choices.
# 3. If the operation is fully understood and complete, set 'success' to true and fill the 'json' key according to the <output_format> schema.
# 4 User only able to see 'suggestions'  key in the response so make suggesttion accordingly .
# CURRENT USER INPUT: "{user_prompt}"

# RESPOND WITH ONLY THE JSON (DO NOT INCLUDE ANY TEXT OR COMMENTARY BEFORE OR AFTER THE JSON):
# """
#         logger.info(f"[OP_AGENT] Processing request for session {session_id}. User prompt: '{user_prompt}'")
#         print("\n--- LLM PROMPT (for debugging) ---\n", prompt, "\n----------------------------------\n")
        
#         t0 = time.time()
#         response = self._call_llm(prompt)
        
#         print("\n--- LLM RAW RESPONSE (for debugging) ---\n", repr(response), "\n----------------------------------------\n")
        
#         if not response or not response.strip():
#             logger.error("LLM returned blank/whitespace output. Check endpoint, model, or prompt size!")
#             return {
#                 "success": False,
#                 "message": "LLM returned no output. The model may have timed out, crashed, or cannot process your prompt.",
#                 "session_id": session_id,
#                 "suggestions": [
#                     "Try again or reload.",
#                     "Reduce the complexity of your prompt or the amount of historical context.",
#                     "Check Ollama/DeepSeek model status and logs for errors.",
#                     "Try a very trivial prompt (e.g., 'Hello') to ensure LLM endpoint is healthy."
#                 ]
#             }
        
#         result = self._extract_json(response) or {}
#         result = self._enforce_allowed_keys(result, session_id)
#         result["timetaken"] = str(round(time.time() - t0, 2))
        
#         interaction = {
#             "user_prompt": user_prompt,
#             "system_response": result,
#             "timestamp": datetime.now().isoformat()
#         }
#         history.append(interaction)
        
#         # Keep history limited to the last 15 interactions to prevent prompt bloat
#         if len(history) > 15:
#             self.sessions[session_id] = history[-15:]
#             logger.debug(f"Trimmed session history for {session_id} to last 15 interactions.")

#         logger.info(f"[OP_AGENT] Request processed for session {session_id}. Success: {result['success']}")
#         logger.debug(f"[OP_AGENT] Final result: {json.dumps(result, indent=2)}")
        
#         return result

#     def get_session_history(self, session_id: str) -> List[Dict]:
#         return self.sessions.get(session_id, [])

#     def debug_session(self, session_id: str) -> Dict:
#         history = self.sessions.get(session_id, [])
#         return {
#             "session_id": session_id,
#             "total_interactions": len(history),
#             "complete_history": history,
#             "json_history_for_llm": self._build_json_history(history)
#         }

#     def clear_session(self, session_id: str) -> bool:
#         if session_id in self.sessions:
#             del self.sessions[session_id]
#             logger.info(f"Session {session_id} cleared.")
#             return True
#         logger.info(f"Attempted to clear non-existent session: {session_id}")
#         return False

#     def get_all_sessions(self) -> List[str]:
#         return list(self.sessions.keys())































































































# import requests
# import json
# import re
# from minio import Minio
# from datetime import datetime
# import uuid
# import logging
# from typing import Dict, List, Optional, Any
# import time
# import pandas as pd
# from io import BytesIO

# # Set logging to DEBUG for verbose output
# logging.basicConfig(level=logging.DEBUG)
# logger = logging.getLogger(__name__)

# ALLOWED_KEYS = {"success", "message", "json", "session_id", "suggestions"}

# OPERATION_FORMAT = """
# {
#   "bucket_name": "trinity",
#   "object_name": "sales_data.csv",
#   "add_1": "sales,returns",
#   "add_1_rename": "total_sales",
#   "subtract_2": "sales,cost",
#   "subtract_2_rename": "profit"
#   // etc...
# }
# """

# class OperationHistoryAgent:
#     """
#     Robust agent for LLM-driven stepwise column-operation JSON construction.
#     Only protocol-compliant keys returned; prompt and LLM output fully debugged.
#     """

#     def __init__(
#         self, api_url: str, model_name: str, bearer_token: str,
#         minio_endpoint: str, access_key: str, secret_key: str,
#         bucket: str, prefix: str
#     ):
#         self.api_url = api_url
#         self.model_name = model_name
#         self.bearer_token = bearer_token
#         logger.info(f"Initializing MinIO client for endpoint: {minio_endpoint}")
#         self.minio_client = Minio(
#             minio_endpoint, access_key=access_key, secret_key=secret_key, secure=False
#         )
#         self.bucket = bucket
#         self.prefix = prefix
#         self.sessions: Dict[str, List[Dict]] = {}
#         self.files_with_columns: Dict[str, List[str]] = {}
#         self._load_files()

#     def _load_files(self) -> None:
#         """Load all files/columns from MinIO. No constraints on number of files/columns."""
#         self.files_with_columns = {}
#         full_prefix_path = f"{self.prefix.rstrip('/')}/" # Ensure prefix ends with a slash
#         logger.info(f"Attempting to load ALL files from MinIO bucket '{self.bucket}' under prefix '{full_prefix_path}'...")
#         try:
#             # List objects with the specified prefix
#             all_objects = list(self.minio_client.list_objects(self.bucket, prefix=full_prefix_path, recursive=True))
            
#             if not all_objects:
#                 logger.warning(f"No objects found in MinIO bucket '{self.bucket}' under prefix '{full_prefix_path}'.")
#                 return

#             files_loaded_count = 0
#             for obj in all_objects:
#                 filename_full_path = obj.object_name
#                 # Ensure it's a file, not a directory marker
#                 if filename_full_path.endswith('/'):
#                     logger.debug(f"Skipping directory marker: {filename_full_path}")
#                     continue

#                 # Extract filename from the full path
#                 # This assumes the filename is the last component after the prefix
#                 relative_path = filename_full_path[len(full_prefix_path):]
#                 if not relative_path: # Handles cases where object_name is exactly the prefix itself
#                     continue
#                 filename = relative_path.split('/')[-1]

#                 logger.debug(f"Processing MinIO object: {filename_full_path} (extracted filename: {filename})")
#                 try:
#                     data_stream = self.minio_client.get_object(self.bucket, obj.object_name)
#                     data_bytes = data_stream.read() # Read the whole object into memory
                    
#                     cols = []
#                     if filename.endswith('.csv'):
#                         cols = pd.read_csv(BytesIO(data_bytes), nrows=20).columns.tolist()
#                     elif filename.endswith('.xlsx') or filename.endswith('.xls'):
#                         cols = pd.read_excel(BytesIO(data_bytes), nrows=20).columns.tolist()
#                     else:
#                         logger.debug(f"Skipping unsupported file type: {filename}")
#                         continue
                    
#                     self.files_with_columns[filename] = cols
#                     files_loaded_count += 1
#                     logger.debug(f"Successfully loaded columns for {filename}: {cols}")
#                 except Exception as e:
#                     logger.error(f"Failed to read/parse file '{filename_full_path}' from MinIO: {e}", exc_info=True)
#                     logger.error(f"Please ensure '{filename}' is a valid CSV or Excel file and its content is not corrupted.")
#                     # Continue to next file even if one fails
#             logger.info(f"Finished loading files. Total {files_loaded_count} files loaded successfully from MinIO.")
#             if not self.files_with_columns:
#                 logger.warning("After attempting to load all files, 'files_with_columns' is still empty. "
#                                "This might indicate an issue with file formats, content, or the MinIO prefix.")
#         except Exception as e:
#             logger.critical(f"MinIO connection or listing objects failed: {e}. "
#                            "Please verify MinIO endpoint, access keys, bucket, and network connectivity.", exc_info=True)
#             self.files_with_columns = {}

#     def _extract_json(self, response: str) -> Optional[Dict]:
#         if not response:
#             logger.debug("LLM response is empty, cannot extract JSON.")
#             return None

#         logger.debug(f"Attempting to extract JSON from raw LLM response (first 500 chars): {response[:500]}...")
        
#         # Try to find JSON block within triple backticks first
#         match = re.search(r'```(?:json)?\s*(.*?)\s*```', response, flags=re.DOTALL)
#         if match:
#             json_str = match.group(1)
#             try:
#                 parsed_json = json.loads(json_str)
#                 if isinstance(parsed_json, dict):
#                     logger.debug("Successfully extracted JSON from triple backticks.")
#                     return parsed_json
#             except json.JSONDecodeError as e:
#                 logger.warning(f"Failed to parse JSON from backtick block: {e}. Attempting other patterns.")
        
#         # If not found or failed, try to extract directly from the cleaned response
#         # This removes any lingering backticks if the LLM didn't put them correctly around the JSON
#         cleaned = re.sub(r'```(?:json)?\s*|\s*```', '', response, flags=re.DOTALL).strip()
        
#         # Fallback to direct curly brace extraction
#         start = cleaned.find('{')
#         end = cleaned.rfind('}')
#         if start != -1 and end != -1 and start < end:
#             try:
#                 parsed_json = json.loads(cleaned[start:end + 1])
#                 logger.debug("Successfully extracted JSON from direct curly brace search.")
#                 return parsed_json
#             except json.JSONDecodeError as e:
#                 logger.warning(f"Failed to parse JSON from direct curly brace extraction: {e}. Attempting regex patterns.")
#                 pass # Continue to more aggressive patterns

#         # More aggressive regex patterns for JSON extraction
#         json_patterns = [
#             r'\{[^{}]*\{[^{}]*\}[^{}]*\}', # Nested JSON (most specific first)
#             r'\{[^{}]+\}',               # Simple single-level JSON
#             r'\{.*?\}(?=\s*$)',           # JSON at end of string
#             r'\{.*\}',                    # Most permissive, could capture non-JSON parts if not careful
#         ]
#         for pattern in json_patterns:
#             matches = re.findall(pattern, cleaned, flags=re.DOTALL)
#             for match in matches:
#                 try:
#                     parsed = json.loads(match)
#                     if isinstance(parsed, dict):
#                         logger.debug(f"Successfully extracted JSON using regex pattern: {pattern}")
#                         return parsed
#                 except json.JSONDecodeError:
#                     continue # Try next match or next pattern if parsing fails
#         logger.warning("No valid JSON dictionary could be extracted from the LLM response using any method.")
#         return None

#     def _enforce_allowed_keys(self, result: dict, session_id: str) -> dict:
#         # Ensure session_id is always present and correct
#         result["session_id"] = session_id
        
#         # If success is True but 'json' key is missing, add an empty one
#         # This handles cases where LLM implies success but forgets the 'json' field
#         if result.get("success") is True and "json" not in result:
#             result["json"] = {}
#             logger.warning("LLM returned success=true but 'json' was missing. Adding empty json dict.")

#         # Filter out disallowed keys
#         filtered_result = {k: v for k, v in result.items() if k in ALLOWED_KEYS}
        
#         # Ensure essential keys are present with default values if missing
#         for k in ["success", "message", "session_id", "suggestions"]:
#             if k not in filtered_result:
#                 if k == "success":
#                     filtered_result[k] = False # Default to false if not specified by LLM
#                     logger.debug(f"Set missing key '{k}' to False.")
#                 elif k == "message":
#                     filtered_result[k] = "An unexpected error occurred or the LLM did not provide a specific message."
#                     logger.debug(f"Set missing key '{k}' to default message (fallback).")
#                 elif k == "session_id":
#                     filtered_result[k] = session_id # Should already be set, but as a fallback
#                     logger.debug(f"Set missing key '{k}' to session_id (fallback).")
#                 elif k == "suggestions":
#                     filtered_result[k] = ["Please try rephrasing your request or ask for more specific assistance."]
#                     logger.debug(f"Set missing key '{k}' to default suggestions (fallback).")

#         # Crucial: Ensure 'json' is ONLY present if 'success' is True
#         if not filtered_result["success"] and "json" in filtered_result:
#             filtered_result.pop("json")
#             logger.debug("Removed 'json' key because 'success' was false, as per strict protocol.")
            
#         return filtered_result


#     def _build_json_history(self, history: List[Dict]) -> str:
#         if not history:
#             return ""
#         buf = ["=== HISTORY ==="]
#         for i, h in enumerate(history, 1):
#             buf.append(f"\n--- STEP {i} ---")
#             buf.append(f"USER: \"{h['user_prompt']}\"\nRESULT:")
#             # Use json.dumps for system_response for proper formatting in history
#             # Only include the essential output fields in history to save token space
#             hist_output = {k: h['system_response'].get(k) for k in ['success', 'message'] if k in h['system_response']}
#             # For suggestions, just indicate presence, or a truncated version if very long
#             if 'suggestions' in h['system_response'] and h['system_response']['suggestions']:
#                 hist_output['suggestions_count'] = len(h['system_response']['suggestions'])
#                 hist_output['first_suggestion'] = h['system_response']['suggestions'][0][:50] + "..." if len(h['system_response']['suggestions'][0]) > 50 else h['system_response']['suggestions'][0]
            
#             if h['system_response'].get('success') and h['system_response'].get('json'):
#                 hist_output['json_keys'] = list(h['system_response']['json'].keys()) # Just keys, not full JSON for brevity
#             buf.append(json.dumps(hist_output, indent=2))
#             buf.append(f"TIME: {h['timestamp']}")
#         return "\n".join(buf)

#     def _call_llm(self, prompt: str, retry: int = 3) -> str:
#         payload = {
#             "model": self.model_name,
#             "messages": [{"role": "user", "content": prompt}],
#             "options": {"temperature": 0.1, "num_predict": 1500},
#             "stream": False # Ensure we get a single response, not a stream
#         }
#         headers = {"Authorization": f"Bearer {self.bearer_token}", "Content-Type": "application/json"}
        
#         logger.info(f"Calling LLM at {self.api_url} with model {self.model_name} (Attempt 1/{retry})")
#         for attempt in range(retry):
#             try:
#                 r = requests.post(self.api_url, json=payload, headers=headers, timeout=120) # Increased timeout
#                 r.raise_for_status()  # Raise HTTPError for bad responses (4xx or 5xx)
#                 response_data = r.json()
#                 content = response_data.get("message", {}).get("content", "")
#                 logger.info(f"LLM call successful (Attempt {attempt+1}/{retry}). Status: {r.status_code}")
#                 return content
#             except requests.exceptions.HTTPError as http_err:
#                 logger.error(f"HTTP error occurred during LLM call (Attempt {attempt+1}/{retry}): {http_err} - Response body: {r.text}")
#             except requests.exceptions.ConnectionError as conn_err:
#                 logger.error(f"Connection error occurred during LLM call (Attempt {attempt+1}/{retry}): {conn_err} - Is Ollama/LLM endpoint running and reachable at {self.api_url}?")
#             except requests.exceptions.Timeout as timeout_err:
#                 logger.error(f"Timeout error occurred during LLM call (Attempt {attempt+1}/{retry}): {timeout_err} - LLM call took too long (>{120}s). Consider increasing timeout or optimizing prompt.")
#             except json.JSONDecodeError as json_err:
#                 logger.error(f"JSON decode error from LLM response (Attempt {attempt+1}/{retry}): {json_err} - Raw response: {r.text}")
#             except Exception as e:
#                 logger.error(f"An unexpected error occurred during LLM call (Attempt {attempt+1}/{retry}): {e}", exc_info=True)
            
#             if attempt < retry - 1:
#                 logger.info(f"Retrying LLM call in {1.5 * (attempt+1)} seconds...")
#                 time.sleep(1.5 * (attempt+1))
#         logger.error("LLM call failed after all retries.")
#         return ""

#     def process_request(self, user_prompt: str, session_id: Optional[str] = None) -> Dict[str, Any]:
#         if not user_prompt or not user_prompt.strip():
#             return {
#                 "success": False,
#                 "message": "Please provide your operation instruction.",
#                 "suggestions": ["E.g.: 'add sales and cost in sales.csv as total_amount'"],
#                 "session_id": session_id or str(uuid.uuid4())
#             }
        
#         if not self.files_with_columns:
#              logger.warning("Files and columns cache is empty. Attempting to reload from MinIO now.")
#              self._load_files()
#              if not self.files_with_columns:
#                  return {
#                      "success": False,
#                      "message": "MinIO files not available.",
#                      "suggestions": [
#                          "Could not load any files or columns from MinIO.",
#                          "Please ensure MinIO is running and accessible.",
#                          f"Verify bucket name '{self.bucket}' and prefix '{self.prefix}' are correct.",
#                          "Upload some valid .csv or .xlsx files to the specified MinIO location.",
#                          "Check MinIO container logs for any errors during file upload or access."
#                      ],
#                      "session_id": session_id or str(uuid.uuid4())
#                  }

#         if not session_id:
#             session_id = str(uuid.uuid4())
#             logger.info(f"Starting new session: {session_id}")
#         if session_id not in self.sessions:
#             self.sessions[session_id] = []
#             logger.info(f"Initialized new session history for {session_id}")
        
#         history = self.sessions[session_id]
#         context_files = self.files_with_columns
#         op_json_example = OPERATION_FORMAT.strip()
#         json_history = self._build_json_history(history)

#         # Build the LLM prompt with STRICT instructions for 'message' and 'suggestions'
#         prompt = f"""
# You are an advanced, interactive JSON-only AI assistant for configuring tabular data operations.
# Your primary goal is to guide the user step-by-step to a complete operation JSON.

# <output_format>
# {op_json_example}
# </output_format>
# Note: 1. Try to capture user context , if user write partial names of files, operation, columns, etc. try to capture them and use them in the operation JSON.
#       2. Always use the history properly to get what finally user wants to do.
# Rules for JSON output:
# - RESPOND ONLY WITH JSON; NEVER generate additional commentary before or after the JSON.
# - The JSON response MUST adhere to the allowed keys: "success" (bool), "message" (str), "json" (dict, only if success), "session_id" (str), and "suggestions" (list of str).
# - Always ensure the "session_id" in your response is exactly: "{session_id}".

# **Crucial Logic for 'success', 'message', and 'suggestions':**

# 1.  **IF `success` is TRUE:**
#     * This state means the entire operation, based on the user's current and past inputs, is **fully and unambiguously understood**, and a **complete, valid JSON operation** can be generated.
#     * The `json` field MUST be present and contain the full operation definition.
#     * **message**: A very short, positive confirmation. E.g., "Operation configured successfully.", "Task completed! Ready for execution."
#     * **suggestions**: This list contains next steps or follow-up questions *now that the task is complete*. E.g.,
#         * "Congratulations! Your operation is now ready."
#         * "Would you like to add another operation or refine this one?"
#         * "You can now proceed with executing the configured operation."
#         * "Type 'show history' to review the steps."

# 2.  **IF `success` is FALSE (Incomplete Information / Step in Progress):**
#     * This state means the operation is **NOT yet fully understood or complete**.
#     * The `json` field MUST NOT be present.
#     * **message**: A very short, factual statement indicating incompleteness. E.g., "More details required.", "Operation incomplete.", "Clarification needed."
#     * **suggestions**: This list is your primary way to interact and guide the user. It MUST contain all necessary information for the user to proceed. E.g.,
#         * **If a file is missing/unclear:** "Which file are you working with? Available files are: [list files here]."
#         * **If columns are missing/unclear:** "Please specify the exact column names. Available columns in [filename] are: [list columns here]."
#         * **If an operation type is ambiguous:** "What kind of operation do you want (e.g., add, subtract, multiply)?"
#         * **General guidance:** "Please provide more specific details.", "Can you rephrase your request?", "To see all available operations, ask 'what can you do?'"
#         * **Always include relevant context:** E.g., "Currently loaded files: {json.dumps(context_files, indent=2)}" if relevant to the missing info.

# Available files and their columns for reference (use this to populate `suggestions` when `success` is false and file/column info is needed):
# {json.dumps(context_files, indent=2)}

# Supported operations for columns (use these as keys in the 'json' field if success is true): add, subtract, multiply, divide, residual, log, sqrt, exp, dummy, rpi, stl_outlier, marketshare, kalman_filter, standardize_zscore, standardize_minmax, power (needs 'exponent' parameter), logistic (needs 'gr', 'co', 'mp' parameters), detrend, deseasonalize, detrend_deseasonalize.

# Session history (previous interactions to maintain context, use this to avoid repetition or fill gaps):
# {json_history}

# CURRENT USER INPUT: "{user_prompt}"

# RESPOND WITH ONLY THE JSON (DO NOT INCLUDE ANY TEXT OR COMMENTARY BEFORE OR AFTER THE JSON):
# """
#         logger.info(f"[OP_AGENT] Processing request for session {session_id}. User prompt: '{user_prompt}'")
#         print("\n--- LLM PROMPT (for debugging) ---\n", prompt, "\n----------------------------------\n")
        
#         t0 = time.time()
#         response = self._call_llm(prompt)
        
#         print("\n--- LLM RAW RESPONSE (for debugging) ---\n", repr(response), "\n----------------------------------------\n")
        
#         if not response or not response.strip():
#             logger.error("LLM returned blank/whitespace output. Check endpoint, model, or prompt size!")
#             return {
#                 "success": False,
#                 "message": "LLM output empty.",
#                 "session_id": session_id,
#                 "suggestions": [
#                     "The model returned no output. It might have timed out or failed to process the request.",
#                     "Try rephrasing your prompt to be simpler.",
#                     "Check Ollama/DeepSeek model status and logs for any errors.",
#                     "Ensure the LLM API is reachable and healthy."
#                 ]
#             }
        
#         result = self._extract_json(response) or {}
#         result = self._enforce_allowed_keys(result, session_id)
#         result["timetaken"] = str(round(time.time() - t0, 2))
        
#         interaction = {
#             "user_prompt": user_prompt,
#             "system_response": result,
#             "timestamp": datetime.now().isoformat()
#         }
#         history.append(interaction)
        
#         # Keep history limited to the last 15 interactions to prevent prompt bloat
#         if len(history) > 15:
#             self.sessions[session_id] = history[-15:]
#             logger.debug(f"Trimmed session history for {session_id} to last 15 interactions.")

#         logger.info(f"[OP_AGENT] Request processed for session {session_id}. Success: {result['success']}")
#         logger.debug(f"[OP_AGENT] Final result: {json.dumps(result, indent=2)}")
        
#         return result

#     def get_session_history(self, session_id: str) -> List[Dict]:
#         return self.sessions.get(session_id, [])

#     def debug_session(self, session_id: str) -> Dict:
#         history = self.sessions.get(session_id, [])
#         return {
#             "session_id": session_id,
#             "total_interactions": len(history),
#             "complete_history": history,
#             "json_history_for_llm": self._build_json_history(history)
#         }

#     def clear_session(self, session_id: str) -> bool:
#         if session_id in self.sessions:
#             del self.sessions[session_id]
#             logger.info(f"Session {session_id} cleared.")
#             return True
#         logger.info(f"Attempted to clear non-existent session: {session_id}")
#         return False

#     def get_all_sessions(self) -> List[str]:
#         return list(self.sessions.keys())















####################################WORKING CODE NEED TO ADD MULTIPLE JSON ONLY ####################################################################################






import requests
import json
import re
from minio import Minio
from datetime import datetime
import uuid
import logging
from typing import Dict, List, Optional, Any, Union
import time
import pandas as pd
from io import BytesIO

# LangChain specific imports for memory
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage
from langchain.memory import ConversationBufferWindowMemory

# Set logging to DEBUG for verbose output
logging.basicConfig(level=logging.INFO) # Changed to INFO for cleaner production logs
logger = logging.getLogger(__name__)

ALLOWED_KEYS = {"success", "message", "json", "session_id", "suggestions"}

# Define the non-standard output format that your backend accepts
OPERATION_FORMAT = """
[
  {
    "bucket_name": "trinity",
    "object_name": "sales_data.csv",
    "add_1": "sales,returns",
    "add_1_rename": "total_sales",
    "multiply_1": "quantity,unit_price",
    "multiply_1_rename": "revenue",
    "add_2": "column1,column2",
    "add_2_rename": "sum_of_columns",
  }
]
"""

# Define supported operations and their rules
SUPPORTED_OPERATIONS = {
    "add": {"min_cols": 2, "col_type": "Numeric", "params": [], "renamable": True},
    "subtract": {"min_cols": 2, "col_type": "Numeric", "params": [], "renamable": True},
    "multiply": {"min_cols": 2, "col_type": "Numeric", "params": [], "renamable": True},
    "divide": {"min_cols": 2, "col_type": "Numeric", "params": [], "renamable": True},
    "residual": {"min_cols": 2, "col_type": "Numeric", "params": [], "renamable": True, "notes": "First column is dependent (Y), rest are predictors (X)."},
    "dummy": {"min_cols": 1, "col_type": "Categorical", "params": [], "renamable": True},
    "rpi": {"min_cols": 1, "col_type": "Any", "params": [], "renamable": True, "notes": "Used as pivot keys."},
    "stl_outlier": {"min_cols": 1, "col_type": "Numeric", "params": [], "renamable": True},
    "power": {"min_cols": 1, "col_type": "Numeric", "params": ["exponent"], "renamable": True},
    "log": {"min_cols": 1, "col_type": "Numeric", "params": [], "renamable": True},
    "sqrt": {"min_cols": 1, "col_type": "Numeric", "params": [], "renamable": True},
    "exp": {"min_cols": 1, "col_type": "Numeric", "params": [], "renamable": True},
    "marketshare": {"min_cols": 1, "col_type": "Any", "params": [], "renamable": True, "notes": "Used as grouping keys."},
    "kalman_filter": {"min_cols": 0, "col_type": "Any", "params": [], "renamable": True, "notes": "Columns are optional (used for grouping)."},
    "standardize_zscore": {"min_cols": 1, "col_type": "Numeric", "params": [], "renamable": True},
    "standardize_minmax": {"min_cols": 1, "col_type": "Numeric", "params": [], "renamable": True},
    "logistic": {"min_cols": 1, "col_type": "Numeric", "params": ["gr", "co", "mp"], "renamable": True},
    "detrend": {"min_cols": 1, "col_type": "Numeric", "params": ["period"], "renamable": True, "notes": "STL decomposition. 'period' is optional."},
    "deseasonalize": {"min_cols": 1, "col_type": "Numeric", "params": ["period"], "renamable": True, "notes": "STL decomposition. 'period' is optional."},
    "detrend_deseasonalize": {"min_cols": 1, "col_type": "Numeric", "params": ["period"], "renamable": True, "notes": "STL decomposition. 'period' is optional."}
}

# Added: Individual operation JSON examples for detailed prompt clarity
# Added: Individual operation JSON examples for detailed prompt clarity
INDIVIDUAL_OPERATION_EXAMPLES = [
    {
      "object_name": "your_file.csv",
      "bucket_name": "trinity",
      "add": "column1,column2,column3",
      "add_rename": "sum_of_columns"
    },
    {
      "object_name": "your_file.csv",
      "bucket_name": "trinity",
      "subtract": "column1,column2,column3",
      "subtract_rename": "difference"
    },
    {
      "object_name": "your_file.csv",
      "bucket_name": "trinity",
      "multiply": "quantity,unit_price",
      "multiply_rename": "total_price"
    },
    {
      "object_name": "your_file.csv",
      "bucket_name": "trinity",
      "divide": "total,quantity",
      "divide_rename": "unit_price"
    },
    {
      "object_name": "your_file.csv",
      "bucket_name": "trinity",
      "residual": "dependent_var,indep_var1,indep_var2",
      "residual_rename": "residuals"
    },
    {
      "object_name": "your_file.csv",
      "bucket_name": "trinity",
      "dummy": "category_column",
      "dummy_rename": "category_dummy"
    },
    {
      "object_name": "your_file.csv",
      "bucket_name": "trinity",
      "detrend": "timeseries_column",
      "detrend_period": "12",
      "detrend_rename": "detrended_series"
    },
    {
      "object_name": "your_file.csv",
      "bucket_name": "trinity",
      "deseasonalize": "timeseries_column",
      "deseasonalize_period": "12",
      "deseasonalize_rename": "deseasonalized_series"
    },
    {
      "object_name": "your_file.csv",
      "bucket_name": "trinity",
      "detrend_deseasonalize": "timeseries_column",
      "detrend_deseasonalize_period": "12",
      "detrend_deseasonalize_rename": "residual_series"
    },
    {
      "object_name": "your_file.csv",
      "bucket_name": "trinity",
      "power": "numeric_column",
      "power_param": "2",
      "power_rename": "squared_values"
    },
    {
      "object_name": "your_file.csv",
      "bucket_name": "trinity",
      "log": "positive_column",
      "log_rename": "log_values"
    },
    {
      "object_name": "your_file.csv",
      "bucket_name": "trinity",
      "sqrt": "non_negative_column",
      "sqrt_rename": "sqrt_values"
    },
    {
      "object_name": "your_file.csv",
      "bucket_name": "trinity",
      "exp": "numeric_column",
      "exp_rename": "exp_values"
    },
    {
      "object_name": "your_file.csv",
      "bucket_name": "trinity",
      "logistic": "numeric_column",
      "logistic_param": "{\"gr\": 0.5, \"co\": 0.3, \"mp\": 0.5}",
      "logistic_rename": "logistic_transformed"
    },
    {
      "object_name": "your_file.csv",
      "bucket_name": "trinity",
      "standardize_zscore": "numeric_column",
      "standardize_zscore_rename": "standardized_values"
    },
    {
      "object_name": "your_file.csv",
      "bucket_name": "trinity",
      "rpi": "price_column",
      "identifiers": "product_id,region_id"
    },
    {
      "object_name": "your_file.csv",
      "bucket_name": "trinity",
      "stl_outlier": "timeseries_column",
      "stl_outlier_rename": "is_outlier"
    }
]
class OperationHistoryAgent:
    """
    Robust agent for LLM-driven stepwise column-operation JSON construction,
    enhanced with LangChain's ConversationBufferWindowMemory for interactivity.
    """

    def __init__(
        self, api_url: str, model_name: str, bearer_token: str,
        minio_endpoint: str, access_key: str, secret_key: str,
        bucket: str, prefix: str,
        history_window_size: int = 5
    ):
        self.api_url = api_url
        self.model_name = model_name
        self.bearer_token = bearer_token
        logger.info(f"Initializing MinIO client for endpoint: {minio_endpoint}")
        try:
            self.minio_client = Minio(
                minio_endpoint, access_key=access_key, secret_key=secret_key, secure=False
            )
        except Exception as e:
            logger.critical(f"Failed to create MinIO client: {e}")
            self.minio_client = None

        self.bucket = bucket
        self.prefix = prefix
        self.sessions: Dict[str, Dict[str, Any]] = {}
        self.files_with_columns: Dict[str, List[str]] = {}
        self._load_files()
        self.history_window_size = history_window_size

    def _load_files(self) -> None:
        """Load all files/columns from MinIO."""
        if not self.minio_client:
            logger.error("MinIO client not initialized. Cannot load files.")
            return

        self.files_with_columns = {}
        full_prefix_path = f"{self.prefix.rstrip('/')}/"
        logger.info(f"Attempting to load files from MinIO bucket '{self.bucket}' with prefix '{full_prefix_path}'...")
        try:
            all_objects = list(self.minio_client.list_objects(self.bucket, prefix=full_prefix_path, recursive=True))
            if not all_objects:
                logger.warning(f"No objects found in MinIO bucket '{self.bucket}' under prefix '{full_prefix_path}'.")
                return

            for obj in all_objects:
                if obj.object_name.endswith('/'): continue
                
                relative_path = obj.object_name[len(full_prefix_path):]
                if not relative_path: continue
                filename = relative_path.split('/')[-1]

                try:
                    data_stream = self.minio_client.get_object(self.bucket, obj.object_name)
                    data_bytes = data_stream.read()
                    
                    cols = []
                    if filename.lower().endswith('.csv'):
                        cols = pd.read_csv(BytesIO(data_bytes), nrows=20).columns.tolist()
                    elif filename.lower().endswith(('.xlsx', '.xls')):
                        cols = pd.read_excel(BytesIO(data_bytes), nrows=20).columns.tolist()
                    else:
                        continue
                    
                    self.files_with_columns[filename] = cols
                    logger.debug(f"Loaded columns for {filename}: {cols}")
                except Exception as e:
                    logger.error(f"Failed to read/parse file '{obj.object_name}': {e}")
            logger.info(f"Finished loading files. Total {len(self.files_with_columns)} files loaded.")
        except Exception as e:
            logger.critical(f"MinIO connection or listing failed: {e}", exc_info=True)
            self.files_with_columns = {}

    def _extract_json(self, response: str) -> Optional[Union[Dict, List]]:
        """Extracts JSON from LLM response, with fallback for non-standard formats."""
        if not response:
            return None

        logger.debug(f"Attempting to extract JSON from raw LLM response: {response[:300]}...")
        match = re.search(r'```(?:json)?\s*(.*?)\s*```', response, flags=re.DOTALL)
        if match:
            json_str = match.group(1)
            try:
                return json.loads(json_str)
            except json.JSONDecodeError:
                logger.warning("Found backticks but failed to parse JSON. Trying to repair.")
                # The repair logic below can be applied here as well if needed
                pass
        
        # This logic is specifically for the non-standard "no comma" format
        # It's less common for modern models, but kept for robustness
        array_match = re.search(r'\[\s*(\{.*?\})\s*\]', response, flags=re.DOTALL)
        if array_match:
            obj_str_raw = array_match.group(1)
            repaired_obj_str = re.sub(
                r'((?:\"(?:\\\"|[^\"])*?\"|\d+(?:\.\d+)?|true|false|null)\s*)\s*(\"[a-zA-Z_][a-zA-Z0-9_]*?\"\s*:\s*)',
                r'\1,\2',
                obj_str_raw,
                flags=re.DOTALL
            )
            try:
                parsed_json = json.loads(f"[{repaired_obj_str}]")
                logger.debug("Successfully extracted and 'repaired' non-standard JSON.")
                return parsed_json
            except json.JSONDecodeError as e:
                logger.warning(f"Failed to parse repaired non-standard JSON: {e}")

        # Final fallback: try to parse the whole cleaned response
        try:
            cleaned_response = re.sub(r'```(?:json)?', '', response).strip()
            return json.loads(cleaned_response)
        except json.JSONDecodeError:
            logger.error("No valid JSON could be extracted from the LLM response.")
            return None


    def _enforce_allowed_keys(self, result: dict, session_id: str) -> dict:
        """Filters the LLM response to conform to the required output format."""
        result["session_id"] = session_id
        filtered_result = {k: v for k, v in result.items() if k in ALLOWED_KEYS}

        if not filtered_result.get("success"):
            filtered_result.pop("json", None)
            if "message" not in filtered_result:
                filtered_result["message"] = "I encountered an issue. Please try rephrasing."
            if "suggestions" not in filtered_result:
                filtered_result["suggestions"] = ["How can I help you differently?"]
        else: # success is true
            if "json" not in filtered_result:
                 filtered_result["json"] = [] # Ensure json key exists on success
                 logger.warning("LLM returned success=true but 'json' was missing. Added empty list.")

        # Ensure all core keys are present
        for key in ["success", "message", "session_id", "suggestions"]:
            if key not in filtered_result:
                if key == "success": filtered_result[key] = False
                elif key == "session_id": filtered_result[key] = session_id
                else: filtered_result[key] = [] if key == "suggestions" else ""
        
        return filtered_result

    def _build_json_history(self, history_messages: List[BaseMessage]) -> str:
        """Builds a structured history string from LangChain BaseMessage objects."""
        if not history_messages:
            return "No history in this session."
        
        buf = ["=== Conversation History ==="]
        for i, msg in enumerate(history_messages, 1):
            role = "User" if isinstance(msg, HumanMessage) else "Assistant"
            buf.append(f"\n--- Turn {i} ({role}) ---")
            buf.append(msg.content)
        return "\n".join(buf)


    def _call_llm(self, prompt: str, retry: int = 3) -> str:
        """Calls the LLM API with the given prompt and handles retries."""
        payload = {
            "model": self.model_name,
            "messages": [{"role": "user", "content": prompt}],
            "options": {"temperature": 0.1},
            "stream": False
        }
        headers = {"Authorization": f"Bearer {self.bearer_token}", "Content-Type": "application/json"}
        
        for attempt in range(retry):
            try:
                r = requests.post(self.api_url, json=payload, headers=headers, timeout=120)
                r.raise_for_status()
                response_data = r.json()
                content = response_data.get("message", {}).get("content", "")
                logger.info(f"LLM call successful on attempt {attempt+1}.")
                return content
            except requests.exceptions.RequestException as e:
                logger.error(f"LLM call failed (Attempt {attempt+1}/{retry}): {e}")
                if attempt < retry - 1:
                    time.sleep(1.5 * (attempt + 1))
        
        logger.critical("LLM call failed after all retries.")
        return ""

    def process_request(self, user_prompt: str, session_id: Optional[str] = None) -> Dict[str, Any]:
        """Processes a user's request by calling the LLM and formatting the response."""
        if not user_prompt or not user_prompt.strip():
            return {
                "success": False, "message": "Input cannot be empty.",
                "session_id": session_id or str(uuid.uuid4()), "suggestions": ["Please tell me what operation you want to perform."]
            }
            
        if not self.files_with_columns:
            self._load_files()
            if not self.files_with_columns:
                return {
                    "success": False, "message": "Could not load any data files from MinIO.",
                    "session_id": session_id or str(uuid.uuid4()), "suggestions": [
                        f"Please check that files exist in bucket '{self.bucket}' under prefix '{self.prefix}'.",
                        "Verify your MinIO connection details and permissions."
                    ]
                }

        if not session_id:
            session_id = str(uuid.uuid4())
            self.sessions[session_id] = {
                "memory": ConversationBufferWindowMemory(k=self.history_window_size, return_messages=True)
            }
            logger.info(f"Initialized new session: {session_id}")
        elif session_id not in self.sessions:
            self.sessions[session_id] = {
                "memory": ConversationBufferWindowMemory(k=self.history_window_size, return_messages=True)
            }
            logger.warning(f"Re-initialized memory for unknown session: {session_id}")
            
        session_data = self.sessions[session_id]
        current_memory: ConversationBufferWindowMemory = session_data["memory"]
        
        history_messages = current_memory.load_memory_variables({})["history"]
        history_string = self._build_json_history(history_messages)

        supported_ops_detailed = "\n".join([f"- '{k}': {v}" for k, v in SUPPORTED_OPERATIONS.items()])

        # This is the master prompt that drives the agent's behavior.
        prompt = f"""
        You are an expert AI assistant that converts natural language into a specific JSON format for data operations. 
        Your goal is to be helpful, accurate, and guide the user to a valid command.

        ## Primary Task
        Based on the user's request, available data, and conversation history, generate a JSON object.

        ## Response JSON Structure
        You MUST respond with ONLY a single JSON object. No other text or explanation. The JSON has these keys:
        - `success`: (boolean) `true` if you can create a valid operation JSON, `false` otherwise.
        - `message`: (string) A concise, one-sentence summary of the result.
        - `json`: (list) ONLY if success is `true`. Contains object with the operation(s) having the format {OPERATION_FORMAT} and use bucket_name as in "operation_format" .
        - `session_id`: (string) The session ID provided below.
        - `suggestions`: (list of strings) Helpful next steps or questions for the user.

        ## Rules for `success: true`
        1. The user's request must be clear, complete, and contain all necessary information for an operation.
        2. The requested file and column names MUST exist in the "Available Files" context.
        3. The operation MUST be in the "Supported Operations" list.
        4. The `json` key's value MUST be a list containing  objects. This object MUST conform to the non-standard format example below (no commas between operations).
        5. If user give multiple options then json have all the operations in a single final json, having same bucket and file name other things are related to the operation format (basically union of operations) if file has multiple same operation use suffix 1,2....
        6. IF user already provided some operation in the history then you can use that operation and add the new operation to it and continue for next as we have to compile it .

        

        ### **CRITICAL**: Final `json` output format for `success: true`
        <output_format>
        {OPERATION_FORMAT.strip()}
        </output_format>

        ## Rules for `success: false` (Guidance Mode)
        - If the user asks a question (e.g., "what files are there?"), answer it in the `suggestions`.
        - If the user's request is ambiguous or incomplete (e.g., missing file, columns, or parameters), ask for the missing information in the `suggestions`. Be specific.
        - Example `suggestions`: ["The file 'data.csv' has these columns: ['colA', 'colB']. Which ones do you want to add?", "To use the 'power' operation, please provide an exponent, for example: 'raise colA to the power of 2'."]

        ---
        ## Context for this Request

        ### Session ID
        `{session_id}`

        ### Available Files and Columns
        ```json
        {json.dumps(self.files_with_columns, indent=2)}
        ```

        ### Supported Operations and their requirements
        ```
        {supported_ops_detailed}
        ```

        ### Conversation History
        {history_string}
        ---

        ## Current User Request
        "{user_prompt}"

        NOW, generate the complete JSON response.
        """

        logger.info(f"Processing request for session {session_id}...")
        # print("\n--- LLM PROMPT (for debugging) ---\n", prompt, "\n----------------------------------\n")

        raw_llm_response = self._call_llm(prompt)
        # print("\n--- LLM RAW RESPONSE (for debugging) ---\n", repr(raw_llm_response), "\n----------------------------------------\n")

        if not raw_llm_response or not raw_llm_response.strip():
            logger.error("LLM returned a blank response.")
            final_result = {
                "success": False,
                "message": "The AI model returned an empty response. This might be a temporary issue.",
                "session_id": session_id,
                "suggestions": [
                    "Please try your request again in a moment.",
                    "If the problem persists, try simplifying your request."
                ]
            }
        else:
            parsed_json = self._extract_json(raw_llm_response)
            if not parsed_json or not isinstance(parsed_json, dict):
                logger.error(f"Failed to parse a valid JSON object from LLM response. Raw text: {raw_llm_response}")
                final_result = {
                    "success": False,
                    "message": "I couldn't generate a valid response. My output was not in the correct format.",
                    "session_id": session_id,
                    "suggestions": [
                        "Could you please rephrase your request? I might understand it better.",
                        f"The model's raw output was: {raw_llm_response[:200]}..."
                    ]
                }
            else:
                # Enforce the final format for consistency and safety
                final_result = self._enforce_allowed_keys(parsed_json, session_id)

        # Save the context for the next turn
        try:
            # We save the final, cleaned-up JSON as the AI's response
            ai_response_str = json.dumps(final_result)
            current_memory.save_context({"input": user_prompt}, {"output": ai_response_str})
            logger.info(f"Saved context to memory for session {session_id}.")
        except Exception as e:
            logger.error(f"Failed to save context to memory for session {session_id}: {e}")

        logger.info(f"Final response for session {session_id}: {json.dumps(final_result, indent=2)}")
        return final_result

















########################################### TRYING TO ADDD MULTIPLE JSON AT A TIME ##############################################################



