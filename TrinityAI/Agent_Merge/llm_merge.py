import requests
import json
import re
from minio import Minio
from minio.error import S3Error
from datetime import datetime
import uuid
import pandas as pd
from io import BytesIO
import logging
from typing import Dict, List, Optional, Any
import time

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class JSONHistoryAgent:
    """Agent that provides complete JSON history to LLM with improved reliability"""
    
    def __init__(self, api_url: str, model_name: str, bearer_token: str, 
                 minio_endpoint: str, access_key: str, secret_key: str, 
                 bucket: str, prefix: str):
        self.api_url = api_url
        self.model_name = model_name
        self.bearer_token = bearer_token
        
        # MinIO connection
        self.minio_client = Minio(
            minio_endpoint, 
            access_key=access_key, 
            secret_key=secret_key, 
            secure=False
        )
        self.bucket = bucket
        self.prefix = prefix
        
        # Simple memory storage
        self.sessions: Dict[str, List[Dict]] = {}
        self.files_with_columns: Dict[str, List[str]] = {}
        
        # Load files
        self._load_files()
    
    def _load_files(self) -> None:
        """Load files from MinIO with improved error handling"""
        try:
            objects = self.minio_client.list_objects(
                self.bucket, 
                prefix=self.prefix, 
                recursive=True
            )
            
            files_loaded = 0
            for obj in objects:
                if obj.object_name.endswith(('.xlsx', '.xls', '.csv')):
                    filename = obj.object_name.split('/')[-1]
                    
                    try:
                        response = self.minio_client.get_object(self.bucket, obj.object_name)
                        file_data = response.read()
                        response.close()
                        response.release_conn()
                        
                        if filename.endswith('.csv'):
                            df = pd.read_csv(BytesIO(file_data))
                        else:
                            df = pd.read_excel(BytesIO(file_data))
                        
                        self.files_with_columns[filename] = df.columns.tolist()
                        files_loaded += 1
                        logger.info(f"Loaded {filename} with {len(df.columns)} columns")
                        
                    except Exception as e:
                        logger.warning(f"Could not load {filename}: {e}")
                        self.files_with_columns[filename] = []
            
            logger.info(f"Successfully loaded {files_loaded} files from MinIO")
            
        except Exception as e:
            logger.error(f"MinIO connection failed: {e}")
            self.files_with_columns = {}
    
    def _extract_json(self, response: str) -> Optional[Dict]:
        """Improved JSON extraction with multiple strategies"""
        if not response:
            logger.warning("Empty response from LLM")
            return None
        
        # Strategy 1: Remove think tags and other common LLM artifacts
        cleaned = re.sub(r'<think>.*?</think>', '', response, flags=re.DOTALL)
        cleaned = re.sub(r'```json\s*', '', cleaned)
        cleaned = re.sub(r'```\s*', '', cleaned)
        
        # Strategy 2: Find JSON blocks with multiple patterns
        json_patterns = [
            r'\{[^{}]*\{[^{}]*\}[^{}]*\}',  # Nested JSON
            r'\{[^{}]+\}',  # Simple JSON
            r'\{.*?\}(?=\s*$)',  # JSON at end
            r'\{.*\}',  # Greedy JSON (last resort)
        ]
        
        for pattern in json_patterns:
            matches = re.findall(pattern, cleaned, re.DOTALL)
            
            for match in matches:
                try:
                    # Try to parse the JSON
                    parsed = json.loads(match)
                    
                    # Validate that it has expected structure
                    if isinstance(parsed, dict) and ('success' in parsed or 'suggestions' in parsed):
                        logger.info("Successfully extracted JSON from response")
                        return parsed
                except json.JSONDecodeError:
                    continue
        
        # Strategy 3: Try to find JSON anywhere in the response
        try:
            # Look for the start of JSON
            start_idx = cleaned.find('{')
            if start_idx != -1:
                # Try to balance braces
                brace_count = 0
                end_idx = start_idx
                
                for i in range(start_idx, len(cleaned)):
                    if cleaned[i] == '{':
                        brace_count += 1
                    elif cleaned[i] == '}':
                        brace_count -= 1
                        if brace_count == 0:
                            end_idx = i + 1
                            break
                
                if end_idx > start_idx:
                    potential_json = cleaned[start_idx:end_idx]
                    try:
                        parsed = json.loads(potential_json)
                        if isinstance(parsed, dict):
                            logger.info("Extracted JSON using brace balancing")
                            return parsed
                    except json.JSONDecodeError:
                        pass
        except Exception as e:
            logger.error(f"Error in JSON extraction strategy 3: {e}")
        
        # Strategy 4: Try to fix common JSON issues
        try:
            # Remove trailing commas
            fixed = re.sub(r',\s*}', '}', cleaned)
            fixed = re.sub(r',\s*]', ']', fixed)
            
            # Try to find JSON in fixed string
            match = re.search(r'\{.*\}', fixed, re.DOTALL)
            if match:
                try:
                    parsed = json.loads(match.group())
                    if isinstance(parsed, dict):
                        logger.info("Extracted JSON after fixing common issues")
                        return parsed
                except json.JSONDecodeError:
                    pass
        except Exception as e:
            logger.error(f"Error in JSON extraction strategy 4: {e}")
        
        logger.warning(f"Failed to extract JSON from response: {response[:200]}...")
        return None
    
    def _call_llm(self, prompt: str, retry_count: int = 3) -> str:
        """Call LLM with retry logic and timeout handling"""
        payload = {
            "model": self.model_name,
            "messages": [{"role": "user", "content": prompt}],
            "stream": False,
            "options": {
                "temperature": 0.1,
                "num_predict": 1500,
                "top_p": 0.9,
                "repeat_penalty": 1.1
            }
        }
        
        headers = {
            "Authorization": f"Bearer {self.bearer_token}",
            "Content-Type": "application/json"
        }
        
        for attempt in range(retry_count):
            try:
                response = requests.post(
                    self.api_url, 
                    json=payload, 
                    headers=headers, 
                    timeout=120
                )
                response.raise_for_status()
                
                content = response.json().get('message', {}).get('content', '')
                if content:
                    return content
                    
            except requests.Timeout:
                logger.warning(f"LLM request timeout (attempt {attempt + 1}/{retry_count})")
                time.sleep(2 ** attempt)  # Exponential backoff
            except requests.RequestException as e:
                logger.error(f"LLM request failed (attempt {attempt + 1}/{retry_count}): {e}")
                if attempt < retry_count - 1:
                    time.sleep(2 ** attempt)
                else:
                    raise
        
        return ""
    
    def _build_json_history(self, history: List[Dict]) -> str:
        """Build complete JSON history for LLM"""
        if not history:
            return "NO PREVIOUS INTERACTIONS"
        
        json_history = ["=== COMPLETE JSON HISTORY ==="]
        
        for i, interaction in enumerate(history, 1):
            json_history.append(f"\n--- INTERACTION {i} ---")
            json_history.append(f"USER: \"{interaction['user_prompt']}\"")
            json_history.append(f"SYSTEM RESPONSE:")
            json_history.append(json.dumps(interaction['system_response'], indent=2))
            json_history.append(f"TIME: {interaction['timestamp']}")
        
        return "\n".join(json_history)
    
    def process_request(self, user_prompt: str, session_id: Optional[str] = None) -> Dict[str, Any]:
        """Process request with complete JSON history and improved prompt"""
        
        # Validate input
        if not user_prompt or not user_prompt.strip():
            return {
                "success": False,
                "suggestions": ["Please provide a valid input"],
                "session_id": session_id or str(uuid.uuid4())
            }
        
        # Create session if needed
        if session_id is None:
            session_id = str(uuid.uuid4())
        
        # Get or create session
        if session_id not in self.sessions:
            self.sessions[session_id] = []
        
        history = self.sessions[session_id]
        
        # Build complete JSON history for LLM
        complete_json_history = self._build_json_history(history)
        
        # Create the merge_json template as a string to avoid f-string issues
        merge_json_template = """{{
  "bucket_name": "trinity",
  "file1": ["exact_filename.csv"],
  "file2": ["exact_filename.csv"],
  "join_columns": ["column_name"],
  "join_type": "inner"
}}"""
        
        # Create improved prompt using string concatenation instead of f-string for the template
        prompt = f"""You are a JSON-only merge assistant. You MUST respond with ONLY valid JSON, no other text.

CURRENT USER INPUT: "{user_prompt}"

AVAILABLE FILES WITH COLUMNS:
{json.dumps(self.files_with_columns, indent=2)}

{complete_json_history}

CRITICAL RULES:
1. Respond with ONLY JSON - no explanations, no text before or after
2. Read the JSON HISTORY to understand context
3. If user says "yes" or agrees → Use information from the LAST system response
4. Build complete configuration from ALL available information
5. Only single files we are able to take so if multiple files in json return success false and ask to select the files 

REQUIRED RESPONSE FORMAT (choose one):

For SUCCESS (when you have all required information):
{{
  "success": true,
  "merge_json": {merge_json_template},
  "source": "Brief explanation"
}}

For PARTIAL (when missing information):
{{
  "success": false,
  "suggestions": [
    "What you understand so far",
    "What is still needed",
    "Specific next step"
  ],
  "context_from_history": "Information from previous interactions",
  "still_needed": "Specific missing information"
}}

RESPOND WITH ONLY THE JSON:"""

        try:
            # Call LLM
            logger.info(f"Processing request for session {session_id}")
            response = self._call_llm(prompt)
            
            # Extract JSON with improved method
            result = self._extract_json(response)
            
            if not result:
                # Fallback: try to create a helpful response
                result = {
                    "success": False,
                    "suggestions": [
                        "I had trouble understanding your request.",
                        "Please try rephrasing or providing more specific information.",
                        "You can mention specific file names or column names."
                    ],
                    "error": "JSON extraction failed",
                    "raw_response_preview": response[:200] if response else "No response"
                }
            
            # Validate and clean the result
            result = self._validate_response(result)
            
            # Store interaction in history
            interaction = {
                "user_prompt": user_prompt,
                "system_response": result,
                "timestamp": datetime.now().isoformat(),
                "raw_llm_response": response[:500] if response else None
            }
            
            history.append(interaction)
            
            # Keep last 10 interactions
            if len(history) > 15:
                self.sessions[session_id] = history[-15:]
            
            # Add session_id to response
            result["session_id"] = session_id
            
            return result
            
        except Exception as e:
            logger.error(f"Error processing request: {e}", exc_info=True)
            return {
                "success": False,
                "suggestions": [f"System error occurred: {str(e)}"],
                "session_id": session_id,
                "error_type": type(e).__name__
            }
    
    def _validate_response(self, response: Dict) -> Dict:
        """Validate and clean the response structure"""
        if not isinstance(response, dict):
            return {
                "success": False,
                "suggestions": ["Invalid response format"]
            }
        
        # Ensure required fields exist
        if "success" not in response:
            response["success"] = False
        
        if response["success"]:
            # Validate success response
            required_fields = ["merge_json"]
            for field in required_fields:
                if field not in response:
                    response["success"] = False
                    response["suggestions"] = [f"Missing required field: {field}"]
                    response["error"] = "Incomplete success response"
                    break
                    
            # Additional validation for merge_json structure
            if "merge_json" in response:
                merge_json = response["merge_json"]
                if isinstance(merge_json, dict):
                    required_merge_fields = ["bucket_name", "file1", "file2", "join_columns", "join_type"]
                    for field in required_merge_fields:
                        if field not in merge_json:
                            response["success"] = False
                            response["suggestions"] = [f"Missing required field in merge_json: {field}"]
                            response["error"] = "Incomplete merge_json structure"
                            break
        else:
            # Ensure suggestions exist for failure
            if "suggestions" not in response:
                response["suggestions"] = ["Unable to process request"]
        
        return response
    
    def get_session_history(self, session_id: str) -> List[Dict]:
        """Get session history"""
        return self.sessions.get(session_id, [])
    
    def debug_session(self, session_id: str) -> Dict:
        """Debug session history"""
        history = self.sessions.get(session_id, [])
        return {
            "session_id": session_id,
            "total_interactions": len(history),
            "complete_history": history,
            "json_history_for_llm": self._build_json_history(history)
        }
    
    def clear_session(self, session_id: str) -> bool:
        """Clear a specific session"""
        if session_id in self.sessions:
            del self.sessions[session_id]
            return True
        return False
    
    def get_all_sessions(self) -> List[str]:
        """Get all active session IDs"""
        return list(self.sessions.keys())
