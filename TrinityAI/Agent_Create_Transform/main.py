import os
import sys
from pathlib import Path
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import time
import json
import logging
import uvicorn
from dotenv import load_dotenv # New import

# --- Required Python Libraries (pip install these) ---
# fastapi
# uvicorn
# requests
# python-minio
# pandas
# openpyxl
# python-dotenv
# ---------------------------------------------------

# Load environment variables from .env file
load_dotenv()

# Add current directory to sys.path to allow importing llm_agent
sys.path.append(str(Path(__file__).resolve().parent))
from llm import OperationHistoryAgent # Updated import to reflect the common file structure

# Set logging to DEBUG for verbose output
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# --- Configuration Functions (using user-provided values) ---
def get_llm_config():
    ollama_host = os.getenv("OLLAMA_HOST", "10.2.1.65")
    llm_port = os.getenv("OLLAMA_PORT", "11434")
    api_url = os.getenv("LLM_API_URL", f"http://{ollama_host}:{llm_port}/api/chat")
    return {
        "api_url": api_url,
        "model_name": os.getenv("LLM_MODEL_NAME", "deepseek-r1:32b"),
        "bearer_token": os.getenv("LLM_BEARER_TOKEN", "aakash_api_key"),
    }

def get_minio_config():
    client, app, project = "default_client", "default_app", "default_project"
    prefix_default = f"{client}/{app}/{project}/"
    return {
        "endpoint": os.getenv("MINIO_ENDPOINT", "localhost:9000"),
        "access_key": os.getenv("MINIO_ACCESS_KEY", "minio"),
        "secret_key": os.getenv("MINIO_SECRET_KEY", "minio123"),
        "bucket": os.getenv("MINIO_BUCKET", "trinity"),
        "prefix": os.getenv("MINIO_PREFIX", prefix_default),
    }

cfg_llm = get_llm_config()
cfg_minio = get_minio_config()

# Initialize the agent globally
try:
    agent = OperationHistoryAgent(
        cfg_llm["api_url"],
        cfg_llm["model_name"],
        cfg_llm["bearer_token"],
        cfg_minio["endpoint"],
        cfg_minio["access_key"],
        cfg_minio["secret_key"],
        cfg_minio["bucket"],
        cfg_minio["prefix"],
    )
    logger.info("OperationHistoryAgent initialized successfully. Attempted to load MinIO files at startup.")
    if not agent.files_with_columns:
        logger.warning("No files were loaded from MinIO during initial agent setup. Please check MinIO configuration and data existence.")
except Exception as e:
    logger.critical(f"Failed to initialize OperationHistoryAgent: {e}. Exiting.", exc_info=True)
    sys.exit(1)


app = FastAPI(
    title="Tabular Operations LLM JSON Assistant",
    description="Smart, memory-driven step-by-step agent for column operations. Integrates with Ollama LLM and MinIO.",
    version="1.0"
)

class OpsRequest(BaseModel):
    prompt: str
    session_id: Optional[str] = None

@app.post("/operation", response_model=Dict[str, Any])
async def operate(request: OpsRequest):
    """
    Process column operation request (step-by-step, memory-driven).
    - **prompt**: User natural language (e.g., "add sales and returns, then log")
    - **session_id**: Use to continue a session
    """
    t0 = time.time()
    try:
        logger.info(f"[API_CALL] /operation - Prompt: {request.prompt[:100]}... | Session: {request.session_id}")
        result = agent.process_request(request.prompt, request.session_id)
        result["processing_time_api"] = round(time.time() - t0, 2)
        return result
    except Exception as e:
        logger.error(f"Error processing operation request: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Internal Server Error: {e}")

@app.get("/history/{session_id}", response_model=Dict[str, Any])
async def get_history(session_id: str):
    """
    Retrieve interaction history for a given session ID.
    """
    try:
        history = agent.get_session_history(session_id)
        if not history:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"No session found for {session_id}")
        return {"session_id": session_id, "history": history, "total_interactions": len(history)}
    except HTTPException:
        raise # Re-raise HTTPExceptions
    except Exception as e:
        logger.error(f"Error getting history for session {session_id}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Internal Server Error: {e}")

@app.get("/debug/{session_id}", response_model=Dict[str, Any])
async def debug_session(session_id: str):
    """
    Get detailed debug information for a session, including full prompt history sent to LLM.
    """
    try:
        debug_info = agent.debug_session(session_id)
        if debug_info["total_interactions"] == 0:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"No session found for {session_id}")
        return debug_info
    except HTTPException:
        raise # Re-raise HTTPExceptions
    except Exception as e:
        logger.error(f"Error debugging session {session_id}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Internal Server Error: {e}")

@app.delete("/session/{session_id}", response_model=Dict[str, str])
async def clear_session(session_id: str):
    """
    Clear a specific session's history.
    """
    try:
        if not agent.clear_session(session_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Session {session_id} not found")
        return {"message": f"Session {session_id} cleared successfully."}
    except HTTPException:
        raise # Re-raise HTTPExceptions
    except Exception as e:
        logger.error(f"Error clearing session {session_id}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Internal Server Error: {e}")

@app.get("/sessions", response_model=Dict[str, Any])
async def list_sessions():
    """
    List all active session IDs.
    """
    try:
        sessions = agent.get_all_sessions()
        return {"sessions": sessions, "total_sessions": len(sessions)}
    except Exception as e:
        logger.error(f"Error listing sessions: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Internal Server Error: {e}")

@app.get("/files", response_model=Dict[str, Any])
async def list_files():
    """
    List all files and their detected columns loaded from MinIO.
    This cache is updated at startup and can be refreshed manually via /reload-files.
    """
    try:
        return {"files": agent.files_with_columns, "total_files": len(agent.files_with_columns)}
    except Exception as e:
        logger.error(f"Error listing files: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Internal Server Error: {e}")

@app.post("/reload-files", response_model=Dict[str, Any])
async def reload_files():
    """
    Manually trigger a reload of files and columns from MinIO.
    This is useful if new files are added to MinIO after the API started.
    """
    try:
        start = time.time()
        agent._load_files() # Call the internal method to reload
        return {"message": "Files reloaded from MinIO", "total_files": len(agent.files_with_columns),
                "processing_time": round(time.time() - start, 2)}
    except Exception as e:
        logger.error(f"Error reloading files from MinIO: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Internal Server Error: {e}")

@app.get("/health", response_model=Dict[str, Any])
async def health_check():
    """
    Perform a health check of the API and its dependencies (MinIO, LLM).
    """
    try:
        # Basic check for MinIO connectivity
        minio_healthy = False
        try:
            agent.minio_client.list_buckets() # Simple operation to check connection
            minio_healthy = True
            logger.debug("MinIO health check: Connected successfully.")
        except Exception as e:
            logger.warning(f"MinIO health check failed: {e}")
            minio_healthy = False

        # Basic check for LLM connectivity
        llm_healthy = False
        try:
            # Send a very simple prompt to check LLM API (retry=1 to not delay health check)
            test_llm_response = agent._call_llm("ping", retry=1)
            # A simple 'ping' or 'hello' might not get a perfect response, just check if something came back
            if test_llm_response and test_llm_response.strip() != "":
                llm_healthy = True
                logger.debug(f"LLM health check: Received non-empty response.")
            else:
                logger.warning(f"LLM health check failed: Empty or invalid response for 'ping'.")
        except Exception as e:
            logger.warning(f"LLM health check failed: {e}")
            llm_healthy = False

        status_msg = "healthy" if minio_healthy and llm_healthy else "degraded"
        
        return {
            "status": status_msg,
            "minio_status": "healthy" if minio_healthy else "unhealthy",
            "llm_status": "healthy" if llm_healthy else "unhealthy",
            "active_sessions": len(agent.sessions),
            "loaded_files": len(agent.files_with_columns),
            "api_version": "1.0",
        }
    except Exception as e:
        logger.error(f"Health check failed with unexpected error: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Health check encountered an error: {e}")

@app.get("/")
async def root():
    """
    Root endpoint with API overview.
    """
    return {
        "message": "LLM Tabular Operations Assistant - API Endpoints",
        "endpoints": {
            "POST /operation": "Stepwise, memory-driven JSON builder for tabular operations",
            "GET /files": "List files and their detected columns from MinIO",
            "GET /history/{session_id}": "Get interaction history for a session",
            "GET /debug/{session_id}": "Get detailed debug info for a session (including LLM prompts)",
            "DELETE /session/{session_id}": "Clear a specific session's history",
            "GET /sessions": "List all active session IDs",
            "POST /reload-files": "Manually reload files from MinIO",
            "GET /health": "Check API and dependency health",
        },
        "documentation": "/docs"
    }

if __name__ == "__main__":
    # Ensure environment variables are loaded for local runs
    load_dotenv() 
    
    host = os.getenv("AI_HOST", "0.0.0.0")
    port = int(os.getenv("AI_PORT", 8003))
    
    logger.info(f"Starting FastAPI application on {host}:{port}")
    uvicorn.run(app, host=host, port=port, log_level="debug", reload=False) # Changed log_level to debug here for direct run