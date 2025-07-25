import os
import sys
from pathlib import Path
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any
import time
import json
from llm_merge import JSONHistoryAgent
import logging
import uvicorn

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration shared via main_api
PARENT_DIR = Path(__file__).resolve().parent.parent
sys.path.append(str(PARENT_DIR))
from main_api import get_llm_config, get_minio_config

cfg_llm = get_llm_config()
cfg_minio = get_minio_config()

# Initialize FastAPI app
app = FastAPI(
    title="JSON History Agent API",
    description="AI-powered file merge assistant with conversation history",
    version="2.0"
)

# Initialize agent
try:
    agent = JSONHistoryAgent(
        cfg_llm["api_url"],
        cfg_llm["model_name"],
        cfg_llm["bearer_token"],
        cfg_minio["endpoint"],
        cfg_minio["access_key"],
        cfg_minio["secret_key"],
        cfg_minio["bucket"],
        cfg_minio["prefix"],
    )
    logger.info("JSONHistoryAgent initialized successfully")
except Exception as e:
    logger.error(f"Failed to initialize JSONHistoryAgent: {e}")
    raise

# Request/Response models
class MergeRequest(BaseModel):
    prompt: str
    session_id: Optional[str] = None

class SessionResponse(BaseModel):
    session_id: str
    message: str

# API Endpoints

@app.post("/merge", response_model=Dict[str, Any])
async def merge_files(request: MergeRequest):
    """
    Process merge request with conversation history
    
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
        logger.error(f"Error in merge_files: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/history/{session_id}")
async def get_history(session_id: str):
    """
    Get conversation history for a session
    
    - **session_id**: Session ID to retrieve history for
    """
    try:
        history = agent.get_session_history(session_id)
        
        if not history:
            raise HTTPException(
                status_code=404, 
                detail=f"No history found for session {session_id}"
            )
        
        return {
            "session_id": session_id,
            "history": history, 
            "total_interactions": len(history)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting history: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/debug/{session_id}")
async def debug_session(session_id: str):
    """
    Debug session - see complete session data including what LLM receives
    
    - **session_id**: Session ID to debug
    """
    try:
        debug_info = agent.debug_session(session_id)
        
        if debug_info["total_interactions"] == 0:
            raise HTTPException(
                status_code=404,
                detail=f"No session found with ID {session_id}"
            )
        
        return debug_info
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error debugging session: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/session/{session_id}")
async def clear_session(session_id: str):
    """
    Clear a specific session
    
    - **session_id**: Session ID to clear
    """
    try:
        success = agent.clear_session(session_id)
        
        if not success:
            raise HTTPException(
                status_code=404,
                detail=f"Session {session_id} not found"
            )
        
        return {
            "message": f"Session {session_id} cleared successfully",
            "session_id": session_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error clearing session: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/sessions")
async def list_sessions():
    """Get all active session IDs"""
    try:
        sessions = agent.get_all_sessions()
        return {
            "sessions": sessions,
            "total": len(sessions)
        }
    except Exception as e:
        logger.error(f"Error listing sessions: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/files")
async def list_files():
    """Get all available files with their columns"""
    try:
        return {
            "files": agent.files_with_columns,
            "total_files": len(agent.files_with_columns)
        }
    except Exception as e:
        logger.error(f"Error listing files: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/reload-files")
async def reload_files():
    """Reload files from MinIO"""
    try:
        start_time = time.time()
        agent._load_files()
        
        return {
            "message": "Files reloaded successfully",
            "total_files": len(agent.files_with_columns),
            "processing_time": round(time.time() - start_time, 2)
        }
    except Exception as e:
        logger.error(f"Error reloading files: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        return {
            "status": "healthy",
            "approach": "complete_json_history",
            "active_sessions": len(agent.sessions),
            "loaded_files": len(agent.files_with_columns),
            "api_version": "2.0"
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}", exc_info=True)
        return {
            "status": "unhealthy",
            "error": str(e)
        }

@app.get("/")
async def root():
    """Root endpoint with API information"""
    return {
        "message": "JSON History Agent API",
        "version": "2.0",
        "endpoints": {
            "POST /merge": "Process merge request",
            "GET /history/{session_id}": "Get session history",
            "GET /debug/{session_id}": "Debug session",
            "DELETE /session/{session_id}": "Clear session",
            "GET /sessions": "List all sessions",
            "GET /files": "List available files",
            "POST /reload-files": "Reload files from MinIO",
            "GET /health": "Health check"
        }
    }

# Exception handlers
@app.exception_handler(404)
async def not_found_handler(request, exc):
    return {
        "error": "Not found",
        "message": str(exc.detail) if hasattr(exc, 'detail') else "Resource not found",
        "status_code": 404
    }

@app.exception_handler(500)
async def internal_error_handler(request, exc):
    return {
        "error": "Internal server error",
        "message": "An unexpected error occurred",
        "status_code": 500
    }

if __name__ == "__main__":
    # Run the application
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=int(os.getenv("AI_PORT", 8002)),
        log_level="info",
        reload=False
    )