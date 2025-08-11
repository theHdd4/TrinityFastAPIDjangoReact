import os
import sys
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any
import time
import json
import requests
from llm_concat import SmartConcatAgent
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration shared via main_api
PARENT_DIR = Path(__file__).resolve().parent.parent
sys.path.append(str(PARENT_DIR))
from main_api import get_llm_config, get_minio_config

cfg_llm = get_llm_config()
cfg_minio = get_minio_config()
logger.debug("cfg_minio resolved: %s", cfg_minio)

# Initialize agent
try:
    agent = SmartConcatAgent(
        cfg_llm["api_url"],
        cfg_llm["model_name"],
        cfg_llm["bearer_token"],
        cfg_minio["endpoint"],
        cfg_minio["access_key"],
        cfg_minio["secret_key"],
        cfg_minio["bucket"],
        cfg_minio["prefix"],
    )
    logger.info("SmartConcatAgent initialized successfully")
except Exception as e:
    logger.error(f"Failed to initialize SmartConcatAgent: {e}")
    raise



# Request/Response models
class ConcatRequest(BaseModel):
    prompt: str
    session_id: Optional[str] = None

class SessionResponse(BaseModel):
    session_id: str
    message: str

# Create router
router = APIRouter(prefix="/concat", tags=["concat"])

@router.post("/", response_model=Dict[str, Any])
async def concat_files(request: ConcatRequest):
    """
    Process concat request with conversation history
    
    - **prompt**: User input text
    - **session_id**: Optional session ID for continuing conversations
    """
    start_time = time.time()
    
    try:
        logger.info(f"[REQUEST] Prompt: {request.prompt}")
        logger.info(f"[REQUEST] Session: {request.session_id}")
        
        # Process with complete JSON history
        result = agent.process_request(request.prompt, request.session_id)
        
        # Always ensure result is a dict
        if result is None:
            result = {
                "success": False, 
                "suggestions": ["Processing failed - no response from agent"]
            }
        
        # Add processing time
        result["processing_time"] = round(time.time() - start_time, 2)
        
        # Log results
        logger.info(f"[RESULT] Success: {result.get('success', False)}")
        logger.info(f"[RESULT] Session: {result.get('session_id', 'None')}")
        logger.debug(f"[DEBUG] Full Response: {json.dumps(result, indent=2)}")
        

        
        return result
        
    except Exception as e:
        logger.error(f"Error in concat_files: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        return {
            "status": "healthy",
            "approach": "complete_json_history",
            "active_sessions": len(agent.sessions),
            "loaded_files": len(agent.available_files),
            "current_prefix": agent.prefix,
            "environment_vars": {
                "CLIENT_NAME": os.getenv("CLIENT_NAME", ""),
                "APP_NAME": os.getenv("APP_NAME", ""),
                "PROJECT_NAME": os.getenv("PROJECT_NAME", ""),
                "MINIO_PREFIX": os.getenv("MINIO_PREFIX", "")
            },
            "api_version": "2.0"
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}", exc_info=True)
        return {
            "status": "unhealthy",
            "error": str(e)
        }

@router.get("/files")
async def list_files():
    """Get all available files with their columns"""
    try:
        return {
            "files": agent.available_files,
            "total_files": len(agent.available_files)
        }
    except Exception as e:
        logger.error(f"Error listing files: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/history/{session_id}")
async def get_history(session_id: str):
    """Get session history"""
    try:
        history = agent.get_session_history(session_id)
        return {
            "session_id": session_id,
            "history": history,
            "total_interactions": len(history)
        }
    except Exception as e:
        logger.error(f"Error getting history: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/session/{session_id}")
async def clear_session(session_id: str):
    """Clear a specific session"""
    try:
        success = agent.clear_session(session_id)
        return {
            "session_id": session_id,
            "cleared": success,
            "message": "Session cleared successfully" if success else "Session not found"
        }
    except Exception as e:
        logger.error(f"Error clearing session: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
