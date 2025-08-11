import os
import sys
from pathlib import Path
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel
from typing import Optional, Dict, Any
import time
import logging
import uvicorn
from dotenv import load_dotenv

# --- Required Python Libraries (pip install these) ---
# fastapi, uvicorn, requests, python-minio, pandas, openpyxl, python-dotenv, langchain
# ---------------------------------------------------

# Load environment variables from .env file
load_dotenv()

# Add current directory to sys.path to allow importing llm
sys.path.append(str(Path(__file__).resolve().parent))
from llm import OperationHistoryAgent

# Set logging level
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- Configuration Functions ---
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
    logger.info("OperationHistoryAgent initialized successfully.")
    if not agent.files_with_columns:
        logger.warning("No files were loaded from MinIO during initial setup. Check MinIO config and data.")
except Exception as e:
    logger.critical(f"Failed to initialize OperationHistoryAgent: {e}. Exiting.", exc_info=True)
    sys.exit(1)


app = FastAPI(
    title="Data Aggregation LLM JSON Assistant",
    description="An intelligent, conversational agent for building data aggregation JSON commands. Integrates with Ollama LLM and MinIO.",
    version="2.0"
)

class OpsRequest(BaseModel):
    prompt: str
    session_id: Optional[str] = None

@app.post("/operation", response_model=Dict[str, Any])
async def operate(request: OpsRequest):
    """
    Process an aggregation operation request (step-by-step, memory-driven).
    - **prompt**: User's natural language instruction (e.g., "group by region and sum sales").
    - **session_id**: A unique ID to maintain conversation context.
    """
    t0 = time.time()
    try:
        logger.info(f"[API_CALL] /operation - Prompt: '{request.prompt[:100]}...' | Session: {request.session_id}")
        result = agent.process_request(request.prompt, request.session_id)
        # Add API processing time to the response, not part of the agent's result
        result["api_processing_time_seconds"] = round(time.time() - t0, 2)
        return result
    except Exception as e:
        logger.error(f"Error in /operation endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@app.get("/files", response_model=Dict[str, Any])
async def list_files():
    """
    List all files and their detected columns loaded from MinIO.
    This cache is created at startup and can be refreshed via /reload-files.
    """
    if not agent.files_with_columns:
        return {"message": "No files found or MinIO is not reachable.", "files": {}}
    return {"files": agent.files_with_columns, "total_files_found": len(agent.files_with_columns)}

@app.post("/reload-files", response_model=Dict[str, Any])
async def reload_files():
    """
    Manually trigger a reload of files and columns from MinIO.
    Useful if new files are added to MinIO after the API has started.
    """
    try:
        start_time = time.time()
        agent._load_files()  # Call the internal method to reload
        duration = round(time.time() - start_time, 2)
        return {
            "message": "File cache reloaded from MinIO.",
            "total_files_found": len(agent.files_with_columns),
            "duration_seconds": duration
        }
    except Exception as e:
        logger.error(f"Error during /reload-files: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to reload files: {e}")

@app.delete("/session/{session_id}", response_model=Dict[str, str])
async def clear_session(session_id: str):
    """
    Clear a specific session's history from memory.
    """
    if session_id in agent.sessions:
        del agent.sessions[session_id]
        logger.info(f"Session {session_id} cleared.")
        return {"message": f"Session {session_id} cleared successfully."}
    else:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Session '{session_id}' not found.")

@app.get("/")
async def root():
    """
    Root endpoint with API overview and documentation link.
    """
    return {
        "message": "LLM Data Aggregation Assistant API",
        "version": "2.0",
        "documentation": "/docs"
    }

if __name__ == "__main__":
    load_dotenv()
    host = os.getenv("AI_HOST", "0.0.0.0")
    port = int(os.getenv("AI_PORT", 8003))
    
    logger.info(f"Starting FastAPI application on http://{host}:{port}")
    uvicorn.run(app, host=host, port=port, log_level="info")