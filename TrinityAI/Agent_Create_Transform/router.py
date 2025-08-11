from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from typing import Optional, Dict, Any
import time
import logging
from .main import agent

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/create-transform", tags=["create-transform"])

class CreateTransformRequest(BaseModel):
    prompt: str
    session_id: Optional[str] = None

@router.post("/", response_model=Dict[str, Any])
async def create_transform_operation(request: CreateTransformRequest):
    """
    Process a create/transform operation request using natural language.
    - **prompt**: User's natural language instruction (e.g., "create a new column by multiplying price and quantity").
    - **session_id**: A unique ID to maintain conversation context.
    """
    t0 = time.time()
    try:
        logger.info(f"[CREATE_TRANSFORM] Processing: '{request.prompt[:100]}...' | Session: {request.session_id}")
        result = agent.process_request(request.prompt, request.session_id)
        result["api_processing_time_seconds"] = round(time.time() - t0, 2)
        return result
    except Exception as e:
        logger.error(f"Error in create-transform endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@router.get("/files", response_model=Dict[str, Any])
async def list_transform_files():
    """List all files available for create/transform operations."""
    if not agent.files_with_columns:
        return {"message": "No files found or MinIO is not reachable.", "files": {}}
    return {"files": agent.files_with_columns, "total_files_found": len(agent.files_with_columns)}

@router.post("/reload-files", response_model=Dict[str, Any])
async def reload_transform_files():
    """Reload files from MinIO for create/transform operations."""
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
        logger.error(f"Error during transform file reload: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to reload files: {e}")

@router.delete("/session/{session_id}", response_model=Dict[str, str])
async def clear_transform_session(session_id: str):
    """Clear a specific create/transform session's history."""
    if session_id in agent.sessions:
        del agent.sessions[session_id]
        logger.info(f"Create/transform session {session_id} cleared.")
        return {"message": f"Session {session_id} cleared successfully."}
    else:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Session '{session_id}' not found.")

@router.get("/health")
async def transform_health():
    """Health check for create/transform agent."""
    return {
        "status": "healthy",
        "agent": "create-transform",
        "version": "2.0",
        "files_loaded": len(agent.files_with_columns) if agent.files_with_columns else 0
    }