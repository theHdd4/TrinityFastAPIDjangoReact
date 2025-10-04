# main_group_by.py
import os
import time
import logging
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

from .llm_groupby import SmartGroupByAgent

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("trinity.groupby.app")

# Standalone configuration functions (no circular imports)
def get_llm_config():
    """Return LLM configuration from environment variables."""
    ollama_ip = os.getenv("OLLAMA_IP", os.getenv("HOST_IP"))
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

logger.info(f"GROUPBY AGENT INITIALIZATION:")
logger.info(f"LLM Config: {cfg_llm}")

agent = SmartGroupByAgent(
    cfg_llm["api_url"],
    cfg_llm["model_name"],
    cfg_llm["bearer_token"],
    "minio:9000",  # Default values for compatibility
    "minio",
    "minio123",
    "trinity",
    ""
)

# Trinity AI only generates JSON configuration
# Frontend handles all backend API calls and path resolution

class GroupByRequest(BaseModel):
    prompt: str
    session_id: Optional[str] = None
    client_name: str = ""
    app_name: str = ""
    project_name: str = ""

@router.post("/groupby")
def groupby_files(request: GroupByRequest):
    """Smart groupby endpoint with complete memory"""
    start_time = time.time()
    
    logger.info(f"GROUPBY REQUEST RECEIVED:")
    logger.info(f"Prompt: {request.prompt}")
    logger.info(f"Session ID: {request.session_id}")
    
    try:
        # Process with complete memory context
        result = agent.process_request(request.prompt, request.session_id, 
                                     request.client_name, request.app_name, request.project_name)

        # Add timing
        processing_time = round(time.time() - start_time, 2)
        result["processing_time"] = processing_time

        logger.info(f"GROUPBY REQUEST COMPLETED:")
        logger.info(f"Success: {result.get('success', False)}")
        logger.info(f"Processing Time: {processing_time}s")

        # 🔧 SMART RESPONSE FALLBACK: Ensure smart_response is always present
        if "smart_response" not in result or not result["smart_response"]:
            if result.get("success") and result.get("groupby_json"):
                # GroupBy configuration success - create smart response
                cfg = result["groupby_json"]
                identifiers = cfg.get("identifiers", [])
                aggregations = cfg.get("aggregations", {})
                
                result["smart_response"] = f"I've configured the groupby operation for you. The data will be grouped by {identifiers} and aggregated using {list(aggregations.keys()) if aggregations else 'the specified functions'}. You can now proceed with the operation or make adjustments as needed."
            else:
                # Suggestions or error - create smart response
                if result.get("suggestions"):
                    result["smart_response"] = "I can help you perform groupby operations on your data! Based on your available files, I can suggest the best grouping strategies and aggregation functions. What would you like to group and aggregate?"
                else:
                    result["smart_response"] = "I'm here to help you perform groupby operations on your data. Please describe what you'd like to group and aggregate or ask me for suggestions."

        if result.get("success") and result.get("groupby_json"):
            cfg = result["groupby_json"]
            
            # Return the configuration for frontend to handle
            result["groupby_config"] = cfg
            # Also keep the original key for frontend compatibility
            result["groupby_json"] = cfg
            
            # Add session ID for consistency
            if request.session_id:
                result["session_id"] = request.session_id
            
            # Update message to indicate configuration is ready
            result["message"] = f"GroupBy configuration ready"

        return result

    except Exception as e:
        logger.error(f"GROUPBY REQUEST FAILED: {e}")
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
        "service": "smart_groupby_agent",
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
