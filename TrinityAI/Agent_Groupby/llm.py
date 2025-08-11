# import requests
# import json
# import re
# from minio import Minio
# from datetime import datetime
# import uuid
# import logging
# from typing import Dict, List, Optional, Any, Union
# import time
# import pandas as pd
# from io import BytesIO

# # LangChain specific imports for memory
# from langchain_core.messages import BaseMessage, HumanMessage, AIMessage
# from langchain.memory import ConversationBufferWindowMemory

# # Set logging to INFO for cleaner production logs
# logging.basicConfig(level=logging.INFO)
# logger = logging.getLogger(__name__)

# ALLOWED_KEYS = {"success", "message", "json", "session_id", "suggestions"}

# # Define the NEW JSON structure for aggregation
# OPERATION_FORMAT = """
# {
#   "bucket_name": "trinity",
#   "object_names": "your_file.csv",
#   "identifiers": ["group_by_col1", "group_by_col2"],
#   "aggregations": {
#     "numeric_col_1": {
#       "agg": "sum",
#       "rename_to": "sum_of_col_1"
#     },
#     "numeric_col_2": {
#       "agg": "weighted_mean",
#       "weight_by": "column_to_use_for_weights",
#       "rename_to": "weighted_avg_of_col_2"
#     },
#     "numeric_col_3": {
#         "agg": "rank_pct",
#         "rename_to": "rank_of_col_3"
#     }
#   }
# }
# """

# # Define the NEW supported aggregation functions
# SUPPORTED_AGGREGATIONS = {
#     "sum": {"requires_weight": False, "description": "Calculates the sum of a numeric column."},
#     "mean": {"requires_weight": False, "description": "Calculates the average of a numeric column."},
#     "min": {"requires_weight": False, "description": "Finds the minimum value in a numeric column."},
#     "max": {"requires_weight": False, "description": "Finds the maximum value in a numeric column."},
#     "count": {"requires_weight": False, "description": "Counts the number of entries in a column."},
#     "median": {"requires_weight": False, "description": "Calculates the median of a numeric column."},
#     "weighted_mean": {"requires_weight": True, "description": "Calculates the weighted mean, requires a 'weight_by' column."},
#     "rank_pct": {"requires_weight": False, "description": "Computes the rank of a column as a percentile."}
# }


# class OperationHistoryAgent:
#     """
#     Robust agent for LLM-driven stepwise JSON construction for data aggregation.
#     Uses LangChain's memory for interactive, context-aware conversations.
#     """

#     def __init__(
#         self, api_url: str, model_name: str, bearer_token: str,
#         minio_endpoint: str, access_key: str, secret_key: str,
#         bucket: str, prefix: str,
#         history_window_size: int = 5
#     ):
#         self.api_url = api_url
#         self.model_name = model_name
#         self.bearer_token = bearer_token
#         logger.info(f"Initializing MinIO client for endpoint: {minio_endpoint}")
#         try:
#             self.minio_client = Minio(
#                 minio_endpoint, access_key=access_key, secret_key=secret_key, secure=False
#             )
#         except Exception as e:
#             logger.critical(f"Failed to create MinIO client: {e}")
#             self.minio_client = None

#         self.bucket = bucket
#         self.prefix = prefix
#         self.sessions: Dict[str, Dict[str, Any]] = {}
#         self.files_with_columns: Dict[str, List[str]] = {}
#         self._load_files()
#         self.history_window_size = history_window_size

#     def _load_files(self) -> None:
#         """Load all files/columns from MinIO."""
#         if not self.minio_client:
#             logger.error("MinIO client not initialized. Cannot load files.")
#             return

#         self.files_with_columns = {}
#         full_prefix_path = f"{self.prefix.rstrip('/')}/"
#         logger.info(f"Attempting to load files from MinIO bucket '{self.bucket}' with prefix '{full_prefix_path}'...")
#         try:
#             all_objects = list(self.minio_client.list_objects(self.bucket, prefix=full_prefix_path, recursive=True))
#             if not all_objects:
#                 logger.warning(f"No objects found in MinIO bucket '{self.bucket}' under prefix '{full_prefix_path}'.")
#                 return

#             for obj in all_objects:
#                 if obj.object_name.endswith('/'): continue
                
#                 relative_path = obj.object_name[len(full_prefix_path):]
#                 if not relative_path: continue
#                 filename = relative_path.split('/')[-1]

#                 try:
#                     data_stream = self.minio_client.get_object(self.bucket, obj.object_name)
#                     data_bytes = data_stream.read()
                    
#                     cols = []
#                     if filename.lower().endswith('.csv'):
#                         cols = pd.read_csv(BytesIO(data_bytes), nrows=20).columns.tolist()
#                     elif filename.lower().endswith(('.xlsx', '.xls')):
#                         cols = pd.read_excel(BytesIO(data_bytes), nrows=20).columns.tolist()
#                     else:
#                         continue
                    
#                     self.files_with_columns[filename] = cols
#                     logger.debug(f"Loaded columns for {filename}: {cols}")
#                 except Exception as e:
#                     logger.error(f"Failed to read/parse file '{obj.object_name}': {e}")
#             logger.info(f"Finished loading files. Total {len(self.files_with_columns)} files loaded.")
#         except Exception as e:
#             logger.critical(f"MinIO connection or listing failed: {e}", exc_info=True)
#             self.files_with_columns = {}

#     def _extract_json(self, response: str) -> Optional[Union[Dict, List]]:
#         """Extracts a JSON object from the LLM's raw text response."""
#         if not response:
#             return None

#         logger.debug(f"Attempting to extract JSON from raw LLM response: {response[:500]}...")
        
#         match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', response, flags=re.DOTALL)
#         if match:
#             json_str = match.group(1)
#             try:
#                 parsed = json.loads(json_str)
#                 if isinstance(parsed, dict):
#                     logger.debug("Successfully extracted JSON object from triple backticks.")
#                     return parsed
#             except json.JSONDecodeError as e:
#                 logger.warning(f"Failed to parse JSON from backtick block: {e}. Trying other methods.")

#         # Fallback to finding the first and last curly brace
#         start = response.find('{')
#         end = response.rfind('}')
#         if start != -1 and end != -1 and start < end:
#             json_str = response[start:end+1]
#             try:
#                 parsed = json.loads(json_str)
#                 if isinstance(parsed, dict):
#                     logger.debug("Successfully extracted JSON object using curly brace search.")
#                     return parsed
#             except json.JSONDecodeError:
#                 logger.warning("Failed to parse JSON from direct curly brace extraction.")
        
#         logger.error("No valid JSON object could be extracted from the LLM response.")
#         return None

#     def _enforce_allowed_keys(self, result: dict, session_id: str) -> dict:
#         """Filters the LLM response to conform to the required output format."""
#         result["session_id"] = session_id
#         filtered_result = {k: v for k, v in result.items() if k in ALLOWED_KEYS}

#         # If success is true, 'json' must be a dict. If false, it must not be present.
#         if filtered_result.get("success"):
#             if "json" not in filtered_result:
#                 filtered_result["json"] = {} # Default to empty dict on success if missing
#                 logger.warning("LLM returned success=true but 'json' key was missing. Added empty dict.")
#         else:
#             filtered_result.pop("json", None)

#         # Ensure all other essential keys are present with sensible defaults
#         for key in ["success", "message", "session_id", "suggestions"]:
#             if key not in filtered_result:
#                 if key == "success":
#                     filtered_result[key] = False
#                 elif key == "message":
#                     filtered_result[key] = "An error occurred or the message was not provided."
#                 elif key == "session_id":
#                     filtered_result[key] = session_id
#                 elif key == "suggestions":
#                     filtered_result[key] = ["I'm not sure how to proceed. Can you please rephrase?"]
        
#         return filtered_result

#     def _build_json_history(self, history_messages: List[BaseMessage]) -> str:
#         """Builds a structured history string from LangChain BaseMessage objects."""
#         if not history_messages:
#             return "No history in this session."
        
#         buf = ["=== Conversation History ==="]
#         for i, msg in enumerate(history_messages, 1):
#             role = "User" if isinstance(msg, HumanMessage) else "Assistant"
#             buf.append(f"\n--- Turn {i} ({role}) ---")
#             buf.append(msg.content)
#         return "\n".join(buf)

#     def _call_llm(self, prompt: str, retry: int = 3) -> str:
#         """Calls the LLM API with the given prompt and handles retries."""
#         payload = {
#             "model": self.model_name,
#             "messages": [{"role": "user", "content": prompt}],
#             "options": {"temperature": 0.1},
#             "stream": False
#         }
#         headers = {"Authorization": f"Bearer {self.bearer_token}", "Content-Type": "application/json"}
        
#         for attempt in range(retry):
#             try:
#                 r = requests.post(self.api_url, json=payload, headers=headers, timeout=120)
#                 r.raise_for_status()
#                 response_data = r.json()
#                 content = response_data.get("message", {}).get("content", "")
#                 logger.info(f"LLM call successful on attempt {attempt+1}.")
#                 return content
#             except requests.exceptions.RequestException as e:
#                 logger.error(f"LLM call failed (Attempt {attempt+1}/{retry}): {e}")
#                 if attempt < retry - 1:
#                     time.sleep(1.5 * (attempt + 1))
        
#         logger.critical("LLM call failed after all retries.")
#         return ""

#     def process_request(self, user_prompt: str, session_id: Optional[str] = None) -> Dict[str, Any]:
#         """Processes a user's request by calling the LLM and formatting the response."""
#         if not user_prompt or not user_prompt.strip():
#             return {
#                 "success": False, "message": "Input cannot be empty.",
#                 "session_id": session_id or str(uuid.uuid4()), "suggestions": ["Please tell me what operation you want to perform."]
#             }
            
#         if not self.files_with_columns:
#             self._load_files()
#             if not self.files_with_columns:
#                 return {
#                     "success": False, "message": "Could not load any data files from MinIO.",
#                     "session_id": session_id or str(uuid.uuid4()), "suggestions": [
#                         f"Please check that files exist in bucket '{self.bucket}' under prefix '{self.prefix}'.",
#                         "Verify your MinIO connection details and permissions."
#                     ]
#                 }

#         if not session_id:
#             session_id = str(uuid.uuid4())
        
#         if session_id not in self.sessions:
#             self.sessions[session_id] = {
#                 "memory": ConversationBufferWindowMemory(k=self.history_window_size, return_messages=True)
#             }
#             logger.info(f"Initialized new session: {session_id}")
            
#         session_data = self.sessions[session_id]
#         current_memory: ConversationBufferWindowMemory = session_data["memory"]
        
#         history_messages = current_memory.load_memory_variables({})["history"]
#         history_string = self._build_json_history(history_messages)

#         supported_ops_detailed = json.dumps(SUPPORTED_AGGREGATIONS, indent=2)

#         # This is the master prompt that drives the agent's behavior for the new aggregation task.
#         prompt = f"""
#         You are an expert AI assistant that converts natural language into a specific JSON format for data aggregation.
#         Your goal is to be helpful and guide the user step-by-step to build a valid JSON command.

#         ## Primary Task
#         Your task is to populate a JSON object based on the user's request. You must gather all the necessary information interactively.

#         ## Response JSON Structure
#         You MUST respond with ONLY a single JSON object. No other text. The JSON has these keys:
#         - `success`: (boolean) `true` ONLY when you have enough information to create a valid operation JSON, `false` otherwise.
#         - `message`: (string) A concise, one-sentence summary of the result or the current status.
#         - `json`: (object) If `success` is `true`, this key holds the complete and valid aggregation operation JSON. It MUST NOT be present if `success` is `false`.
#         - `session_id`: (string) The session ID provided below.
#         - `suggestions`: (list of strings) This is your main tool for interacting with the user. Use it to ask for missing information or provide options if success is true just formally ask for next steps and you can do more operations on the same JSON.
#         NOTE: 1. If user do more than one operation so in that case you have to add the previous operation in the `json` key and in future it will try to add more operation then add to the same `json` key.
#               2. If user not say explicitly to remove the previous operation then you have to keep the previous operation in the `json` key, if user say for remove then remove that operation from the `json` key.    
#         ## Rules for a Successful Operation (`success: true`)
#         1.  You can only set `success` to `true` when the final JSON is fully specified. This means you MUST have:
#             - The `object_names` (the file to use).
#             - The `identifiers` (at least one column to group by).
#             - At least ONE complete entry in the `aggregations` dictionary.
#         2.  Each entry in the `aggregations` dictionary must have an `agg` function and a `rename_to` name.
#         3.  If an aggregation uses `agg: "weighted_mean"`, it MUST also have a `weight_by` key with a valid column name.
#         4.  The final `json` payload MUST match the format shown in `<output_format>`.

#         ### **CRITICAL**: Final `json` output format for `success: true`
#         <output_format>
#         {OPERATION_FORMAT.strip()}
#         </output_format>

#         ## Rules for Information Gathering (`success: false`)
#         - This is the default state while you are collecting information.
#         - **Always** use the `suggestions` list to ask the user for the next piece of information you need.
#         - **Your conversational flow should be:**
#             1.  If the file isn't known, ask for it. Provide the list of available files.
#             2.  Once the file is known, ask for the 'identifier' columns (the columns to group by). Provide the list of columns for that file.
#             3.  Once identifiers are known, ask for the first aggregation (e.g., "What is the first aggregation you'd like to perform?").
#             4.  For each aggregation, ask for: the column to aggregate, the function, and the new name.
#             5.  **If the function is 'weighted_mean'**, you MUST then ask for the column to use as the weight.
#             6.  Use the conversation history to fill in details from previous turns.
#             7. Suggestions should be clear and actionable, guiding the user step-by-step. Don't be show your self as a robot, be helpful and friendly , Remember you are intelligent not dumb.
#         ---
#         ## Context for this Request

#         ### Session ID
#         `{session_id}`

#         ### Available Files and Columns
#         ```json
#         {json.dumps(self.files_with_columns, indent=2)}
#         ```

#         ### Supported Aggregation Functions
#         ```json
#         {supported_ops_detailed}
#         ```

#         ### Conversation History
#         {history_string}
#         ---

#         ## Current User Request
#         "{user_prompt}"

#         NOW, generate the complete JSON response based on all the rules and context.
#         """

#         logger.info(f"Processing request for session {session_id}...")
#         # For debugging, you can uncomment the next line
#         # print("\n--- LLM PROMPT ---\n", prompt, "\n-------------------\n")

#         raw_llm_response = self._call_llm(prompt)
#         # For debugging, you can uncomment the next line
#         print("\n--- LLM RAW RESPONSE ---\n", repr(raw_llm_response), "\n------------------------\n")

#         if not raw_llm_response or not raw_llm_response.strip():
#             logger.error("LLM returned a blank response.")
#             final_result = {
#                 "success": False,
#                 "message": "The AI model returned an empty response.", "session_id": session_id,
#                 "suggestions": ["Please try your request again. If the problem persists, simplify your request."]
#             }
#         else:
#             parsed_json = self._extract_json(raw_llm_response)
#             if not parsed_json or not isinstance(parsed_json, dict):
#                 logger.error(f"Failed to parse a valid JSON object from LLM response. Raw text: {raw_llm_response}")
#                 final_result = {
#                     "success": False, "message": "I couldn't generate a valid response in the required format.",
#                     "session_id": session_id,
#                     "suggestions": ["Could you please rephrase your request?", f"The model's raw output was: {raw_llm_response[:200]}..."]
#                 }
#             else:
#                 final_result = self._enforce_allowed_keys(parsed_json, session_id)

#         try:
#             ai_response_str = json.dumps(final_result)
#             current_memory.save_context({"input": user_prompt}, {"output": ai_response_str})
#             logger.info(f"Saved context to memory for session {session_id}.")
#         except Exception as e:
#             logger.error(f"Failed to save context to memory for session {session_id}: {e}")

#         logger.info(f"Final response for session {session_id}: Success = {final_result.get('success')}")
#         return final_result



















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

# Set logging to INFO for cleaner production logs
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

ALLOWED_KEYS = {"success", "message", "json", "session_id", "suggestions"}

# Define the NEW JSON structure for aggregation
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

# Define the NEW supported aggregation functions
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


class OperationHistoryAgent:
    """
    Robust agent for LLM-driven stepwise JSON construction for data aggregation.
    Uses LangChain's memory for interactive, context-aware conversations.
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
                except Exception as e:
                    logger.error(f"Failed to read/parse file '{obj.object_name}': {e}")
            logger.info(f"Finished loading files. Total {len(self.files_with_columns)} files loaded.")
        except Exception as e:
            logger.critical(f"MinIO connection or listing failed: {e}", exc_info=True)
            self.files_with_columns = {}

    def _extract_json(self, response: str) -> Optional[Dict]:
        """Extracts a JSON object from the LLM's raw text response."""
        if not response:
            return None
        
        match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', response, flags=re.DOTALL)
        if match:
            json_str = match.group(1)
            try:
                parsed = json.loads(json_str)
                if isinstance(parsed, dict): return parsed
            except json.JSONDecodeError:
                pass

        start = response.find('{')
        end = response.rfind('}')
        if start != -1 and end != -1 and start < end:
            json_str = response[start:end+1]
            try:
                parsed = json.loads(json_str)
                if isinstance(parsed, dict): return parsed
            except json.JSONDecodeError:
                pass
        
        logger.error("No valid JSON object could be extracted from the LLM response.")
        return None

    def _enforce_allowed_keys(self, result: dict, session_id: str) -> dict:
        """Filters the LLM response and provides intelligent fallbacks for missing keys."""
        result["session_id"] = session_id
        filtered_result = {k: v for k, v in result.items() if k in ALLOWED_KEYS}

        is_success = filtered_result.get("success", False)

        if is_success:
            if "json" not in filtered_result:
                filtered_result["json"] = {}
        else:
            filtered_result.pop("json", None)

        if "suggestions" not in filtered_result or not filtered_result["suggestions"]:
            if is_success:
                filtered_result["suggestions"] = [
                    "Operation configured successfully! What would you like to do next?",
                    "You can add another aggregation or type 'finish'.",
                ]
            else:
                filtered_result["suggestions"] = [
                    "I need a bit more information to proceed.",
                    "Please tell me what file to use or what aggregation to perform."
                ]

        if "message" not in filtered_result:
            filtered_result["message"] = "Operation complete." if is_success else "Awaiting input."
        if "success" not in filtered_result:
             filtered_result["success"] = False

        return filtered_result

    def _build_json_history(self, history_messages: List[BaseMessage]) -> str:
        """Builds a structured history string from LangChain BaseMessage objects."""
        if not history_messages:
            return "No history in this session."
        
        buf = ["=== Conversation History (Your memory of the current JSON being built) ==="]
        for msg in history_messages:
            role = "User" if isinstance(msg, HumanMessage) else "Assistant (Your previous JSON response)"
            buf.append(f"\n--- {role} ---")
            buf.append(msg.content)
        return "\n".join(buf)

    def _call_llm(self, prompt: str, retry: int = 3) -> str:
        """Calls the LLM API with the given prompt and handles retries."""
        payload = {
            "model": self.model_name,
            "messages": [{"role": "user", "content": prompt}],
            "options": {"temperature": 0.05}, # Lower temperature for more deterministic behavior
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
        
        if session_id not in self.sessions:
            self.sessions[session_id] = {
                "memory": ConversationBufferWindowMemory(k=self.history_window_size, return_messages=True)
            }
            logger.info(f"Initialized new session: {session_id}")
            
        session_data = self.sessions[session_id]
        current_memory: ConversationBufferWindowMemory = session_data["memory"]
        
        history_messages = current_memory.load_memory_variables({})["history"]
        history_string = self._build_json_history(history_messages)

        supported_ops_detailed = json.dumps(SUPPORTED_AGGREGATIONS, indent=2)

        prompt = f"""
        You are an expert, friendly, and conversational AI assistant. Your primary goal is to help a user build a JSON object for a data aggregation task by guiding them step-by-step.

        ## Core Task & Behavior
        Your main job is to populate a single JSON object based on the user's request. You must be **stateful** and **cumulative**.

        ### CRITICAL BEHAVIORAL RULES:
        1.  **CUMULATIVE BY DEFAULT**: Always **ADD** new aggregations to the `aggregations` dictionary from the history. Do NOT remove existing ones unless the user explicitly says "remove", "clear", "start over", or uses words like "only" or "just" (e.g., "only sum sales").
        2.  **HANDLE COLUMN CONFLICTS**: If the user asks to perform an aggregation on a column that **already has an aggregation defined** in the history, you MUST ask for confirmation before changing it. Do not overwrite blindly.
            - **Example**: If history has a `sum` on `Sales`, and the user says "average of sales", you MUST respond with `success: false` and `suggestions` like: ["You already have a 'sum' operation on the 'Sales' column. Do you want to replace it with 'average'?"]
        3.  **GUIDE, DON'T ASSUME**: If any detail (file, column, operation, rename) is unclear, ask for clarification.

        ## Response JSON Structure
        You MUST respond with ONLY a single JSON object. No other text.
        - `success`: (boolean) `true` ONLY when a valid operation is fully configured.
        - `message`: (string) A short, friendly summary of what you did or what you need.
        - `json`: (object) If `success` is `true`, this holds the complete aggregation operation. Do not include if `success` is `false`.
        - `session_id`: (string) Use the session ID provided below.
        - `suggestions`: (list of strings) This is your main tool for interacting. It must always be helpful and clear.

        ## How to Craft 'suggestions'
        
        ### If `success` is `FALSE` (gathering info or asking for confirmation):
        - Ask clear, direct questions.
        - **Examples**:
            - "Okay, which file shall we work on? The available files are: [list files]"
            - "Got it. Now, which columns should I group by (as identifiers)? For the file 'X', the columns are: [list columns]"
            - "Great. What's the first aggregation? (e.g., 'sum the Sales column and name it TotalSales')"
            - "You already have a `sum` on 'Sales'. Do you want to replace it with `mean`?"

        ### If `success` is `TRUE` (operation is configured):
        - Confirm what you've done and offer clear next steps.
        - **Examples**:
            - "Alright, I've added the weighted average for 'Volume'. What's next? You can add another aggregation or say 'finish'."
            - "Done! The aggregation is ready. Would you like to add another one?"

        ### **CRITICAL**: Final `json` output format
        <output_format>
        {OPERATION_FORMAT.strip()}
        </output_format>
        
        ---
        ## Context for this Request

        ### Session ID
        `{session_id}`

        ### Available Files and Columns
        ```json
        {json.dumps(self.files_with_columns, indent=2)}
        ```

        ### Supported Aggregation Functions
        ```json
        {supported_ops_detailed}
        ```

        ### Conversation History
        {history_string}
        ---

        ## Current User Request
        "{user_prompt}"

        NOW, generate the complete JSON response based on all the rules and context.
        """

        logger.info(f"Processing request for session {session_id}...")
        
        raw_llm_response = self._call_llm(prompt)
        
        if not raw_llm_response or not raw_llm_response.strip():
            logger.error("LLM returned a blank response.")
            final_result = {
                "success": False, "message": "The AI model returned an empty response.", "session_id": session_id,
                "suggestions": ["Please try your request again. If the problem persists, simplify your request."]
            }
        else:
            parsed_json = self._extract_json(raw_llm_response)
            if not parsed_json or not isinstance(parsed_json, dict):
                logger.error(f"Failed to parse a valid JSON object from LLM response.")
                final_result = {
                    "success": False, "message": "I had a little trouble with that request.",
                    "session_id": session_id,
                    "suggestions": ["Could you please try rephrasing that?", "For example, you could say 'sum the sales column'."]
                }
            else:
                final_result = self._enforce_allowed_keys(parsed_json, session_id)

        try:
            ai_response_str = json.dumps(final_result)
            current_memory.save_context({"input": user_prompt}, {"output": ai_response_str})
            logger.info(f"Saved context to memory for session {session_id}.")
        except Exception as e:
            logger.error(f"Failed to save context to memory for session {session_id}: {e}")

        logger.info(f"Final response for session {session_id}: Success = {final_result.get('success')}")
        return final_result