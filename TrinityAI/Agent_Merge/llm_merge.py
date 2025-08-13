import json
from minio import Minio
from minio.error import S3Error
from datetime import datetime
import uuid
import pandas as pd
from io import BytesIO
import logging
from typing import Dict, List, Optional, Any
from ai_logic import build_prompt, call_llm, extract_json

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
        """Delegate JSON extraction to the shared logic module."""
        return extract_json(response)
    
    def _call_llm(self, prompt: str, retry_count: int = 3) -> str:
        """Delegate LLM calling to the shared logic module."""
        return call_llm(self.api_url, self.model_name, self.bearer_token, prompt)
    
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

        # Create prompt using shared AI logic
        prompt = build_prompt(user_prompt, self.files_with_columns, complete_json_history)

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
