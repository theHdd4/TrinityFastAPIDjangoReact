# main_merge.py
import logging
import os
import time
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

from .ai_logic import build_merge_prompt, call_merge_llm, extract_json
from .llm_merge import SmartMergeAgent

logger = logging.getLogger("smart.merge")

# Initialize router
router = APIRouter()

# Standalone configuration functions (no circular imports)
def get_llm_config():
    """Return LLM configuration from environment variables."""
    ollama_ip = os.getenv("OLLAMA_IP", os.getenv("HOST_IP", "127.0.0.1"))
    llm_port = os.getenv("OLLAMA_PORT", "11434")
    api_url = os.getenv("LLM_API_URL", f"http://{ollama_ip}:{llm_port}/api/chat")
    return {
        "api_url": api_url,
        "model_name": os.getenv("LLM_MODEL_NAME", "deepseek-r1:32b"),
        "bearer_token": os.getenv("LLM_BEARER_TOKEN", "aakash_api_key"),
    }

# Initialize agent
cfg_llm = get_llm_config()

logger.info(f"MERGE AGENT INITIALIZATION:")
logger.info(f"LLM Config: {cfg_llm}")

agent = SmartMergeAgent(
    cfg_llm["api_url"],
    cfg_llm["model_name"],
    cfg_llm["bearer_token"],
    "minio:9000",  # Default values for compatibility
    "minio",
    "minio123",
    "trinity",
    "",
)

# Trinity AI only generates JSON configuration
# Frontend handles all backend API calls and path resolution

class MergeRequest(BaseModel):
    prompt: str
    session_id: Optional[str] = None

@router.post("/merge")
def merge_files(request: MergeRequest):
    """Smart merge endpoint with complete memory"""
    start_time = time.time()
    
    logger.info(f"MERGE REQUEST RECEIVED:")
    logger.info(f"Prompt: {request.prompt}")
    logger.info(f"Session ID: {request.session_id}")
    
    try:
        # Process with complete memory context
        result = agent.process_request(request.prompt, request.session_id)

        # Add timing
        processing_time = round(time.time() - start_time, 2)
        result["processing_time"] = processing_time

        logger.info(f"MERGE REQUEST COMPLETED:")
        logger.info(f"Success: {result.get('success', False)}")
        logger.info(f"Processing Time: {processing_time}s")

        # If merge configuration was successful, return the configuration for frontend to handle
        if result.get("success") and result.get("merge_json"):
            cfg = result["merge_json"]
            file1 = cfg.get("file1")
            if isinstance(file1, list):
                file1 = file1[0] if file1 else ""
            file2 = cfg.get("file2")
            if isinstance(file2, list):
                file2 = file2[0] if file2 else ""
            join_columns = cfg.get("join_columns", ["id"])  # Default to list format
            join_type = cfg.get("join_type", "inner")
            
            # Return clean filenames only - let backend handle path resolution
            # This prevents duplicate path issues
            result["merge_json"] = {
                "file1": file1,  # Just filename, backend will resolve path
                "file2": file2,  # Just filename, backend will resolve path
                "join_columns": join_columns,
                "join_type": join_type,
                "bucket_name": "trinity",  # Add bucket name for compatibility
            }
            
            # Add session ID for consistency
            if request.session_id:
                result["session_id"] = request.session_id
            
            # Update message to indicate configuration is ready
            result["message"] = f"Merge configuration ready: {file1} + {file2} using {join_columns} columns with {join_type} join"

        return result
        
    except Exception as e:
        logger.error(f"MERGE REQUEST FAILED: {e}")
        error_result = {
            "success": False,
            "error": str(e),
            "processing_time": round(time.time() - start_time, 2)
        }
        return error_result

@router.get("/history/{session_id}")
def get_complete_history(session_id: str):
    """Get complete session history with all JSON details"""
    logger.info(f"Getting history for session: {session_id}")
    history = agent.get_session_history(session_id)
    
    return {
        "success": True,
        "session_id": session_id,
        "complete_history": history,
        "total_interactions": len(history)
    }

@router.get("/files")
def list_available_files():
    """List all available files"""
    logger.info("Listing available files")
    files = agent.files_with_columns
    return {
        "success": True,
        "total_files": len(files),
        "files": files
    }

@router.get("/health")
def health_check():
    """Health check endpoint"""
    status = {
        "status": "healthy",
        "service": "smart_merge_agent",
        "version": "1.0.0",
        "active_sessions": len(agent.sessions),
        "loaded_files": len(agent.files_with_columns),
        "features": [
            "complete_memory_context",
            "intelligent_suggestions",
            "conversational_responses",
            "user_preference_learning",
            "enhanced_column_printing",
            "llm_driven_file_selection"
        ]
    }
    logger.info(f"Health check: {status}")
    return status

# Export the router for mounting in main_api.py
