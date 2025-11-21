# main_df_validate.py
import os
import time
import logging
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

from .llm_df_validate import SmartDfValidateAgent

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("trinity.df_validate.app")

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

# Initialize router and agent
router = APIRouter()

cfg_llm = get_llm_config()

logger.info(f"DF_VALIDATE AGENT INITIALIZATION:")
logger.info(f"LLM Config: {cfg_llm}")

agent = SmartDfValidateAgent(
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

class DfValidateRequest(BaseModel):
    prompt: str
    session_id: Optional[str] = None
    client_name: str = ""
    app_name: str = ""
    project_name: str = ""

@router.post("/df-validate")
def validate_data(request: DfValidateRequest):
    """Smart data validation and dtype conversion endpoint with complete memory"""
    start_time = time.time()
    
    logger.info(f"DF_VALIDATE REQUEST RECEIVED:")
    logger.info(f"Prompt: {request.prompt}")
    logger.info(f"Session ID: {request.session_id}")
    
    try:
        # Process with complete memory context
        result = agent.process_request(request.prompt, request.session_id, 
                                     request.client_name, request.app_name, request.project_name)

        # Add timing
        processing_time = round(time.time() - start_time, 2)
        result["processing_time"] = processing_time

        logger.info(f"DF_VALIDATE REQUEST COMPLETED:")
        logger.info(f"Success: {result.get('success', False)}")
        logger.info(f"Used Memory: {result.get('used_memory', False)}")
        logger.info(f"Processing Time: {processing_time}s")

        # Preserve LLM smart response
        if result.get("success") and result.get("validate_json"):
            cfg = result["validate_json"]
            file_name = cfg.get("file_name", "")
            dtype_changes = cfg.get("dtype_changes", {})
            
            # Return the configuration for frontend to call backend API directly
            result["validate_config"] = {
                "file_name": file_name,  # Just filename, backend will resolve path
                "dtype_changes": dtype_changes,
            }
            
            # Add session ID for consistency
            if request.session_id:
                result["session_id"] = request.session_id
            
            # Update message to indicate configuration is ready
            result["message"] = f"Data validation configuration ready: {file_name} with {len(dtype_changes)} dtype conversions"

        return result
        
    except Exception as e:
        logger.error(f"DF_VALIDATE REQUEST FAILED: {e}")
        error_result = {
            "success": False,
            "error": str(e),
            "processing_time": round(time.time() - start_time, 2),
            "smart_response": f"I encountered an error while processing your request: {str(e)}. Please try again."
        }
        return error_result

@router.get("/history/{session_id}")
def get_complete_history(session_id: str):
    """Get complete session history with all JSON details"""
    logger.info(f"Getting history for session: {session_id}")
    history = agent.get_session_history(session_id)
    stats = agent.get_session_stats(session_id)
    
    return {
        "success": True,
        "session_id": session_id,
        "complete_history": history,
        "session_stats": stats,
        "total_interactions": len(history)
    }

@router.get("/session_details/{session_id}")
def get_session_details(session_id: str):
    """Get detailed session information for debugging"""
    logger.info(f"Getting session details for: {session_id}")
    details = agent.get_detailed_session_info(session_id)
    
    return {
        "success": True,
        "session_id": session_id,
        "details": details
    }

@router.get("/files")
def list_available_files():
    """List all available files"""
    logger.info("Listing available files")
    files = agent.get_available_files()
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
        "service": "smart_df_validate_agent",
        "version": "1.0.0",
        "active_sessions": len(agent.sessions),
        "loaded_files": len(agent.files_with_columns),
        "features": [
            "complete_memory_context",
            "intelligent_suggestions",
            "conversational_responses",
            "user_preference_learning",
            "dtype_conversion_recommendations"
        ]
    }
    logger.info(f"Health check: {status}")
    return status

# Export the router for mounting in main_api.py




