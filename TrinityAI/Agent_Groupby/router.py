from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from typing import Optional, Dict, Any
import time
import logging
from .main import agent

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/groupby", tags=["groupby"])

class GroupbyRequest(BaseModel):
    prompt: str
    session_id: Optional[str] = None

@router.post("/", response_model=Dict[str, Any])
async def groupby_operation(request: GroupbyRequest):
    """
    Process a groupby operation request using natural language.
    - **prompt**: User's natural language instruction (e.g., "group by region and sum sales").
    - **session_id**: A unique ID to maintain conversation context.
    """
    t0 = time.time()
    try:
        logger.info(f"[GROUPBY] Processing: '{request.prompt[:100]}...' | Session: {request.session_id}")
        result = agent.process_request(request.prompt, request.session_id)
        result["api_processing_time_seconds"] = round(time.time() - t0, 2)
        return result
    except Exception as e:
        logger.error(f"Error in groupby endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@router.get("/files", response_model=Dict[str, Any])
async def list_groupby_files():
    """List all files available for groupby operations."""
    if not agent.files_with_columns:
        return {"message": "No files found or MinIO is not reachable.", "files": {}}
    return {"files": agent.files_with_columns, "total_files_found": len(agent.files_with_columns)}

@router.post("/reload-files", response_model=Dict[str, Any])
async def reload_groupby_files():
    """Reload files from MinIO for groupby operations."""
    try:
        start_time = time.time()
        agent._load_files()
        duration = round(time.time() - start_time, 2)
        return {
            "message": "File cache reloaded from MinIO.",
            "total_files_found": len(agent.files_with_columns),
            "duration_seconds": duration
        }
    except Exception as e:
        logger.error(f"Error during groupby file reload: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to reload files: {e}")

@router.delete("/session/{session_id}", response_model=Dict[str, str])
async def clear_groupby_session(session_id: str):
    """Clear a specific groupby session's history."""
    if session_id in agent.sessions:
        del agent.sessions[session_id]
        logger.info(f"Groupby session {session_id} cleared.")
        return {"message": f"Session {session_id} cleared successfully."}
    else:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Session '{session_id}' not found.")

@router.get("/health")
async def groupby_health():
    """Health check for groupby agent."""
    return {
        "status": "healthy",
        "agent": "groupby",
        "version": "2.0",
        "files_loaded": len(agent.files_with_columns) if agent.files_with_columns else 0
    }