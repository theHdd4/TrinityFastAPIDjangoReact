import os
import sys
import asyncio
from pathlib import Path
import uvicorn
from fastapi import FastAPI
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any
import numpy as np


def get_llm_config() -> Dict[str, str]:
    """Return LLM configuration from environment variables."""
    ollama_ip = os.getenv("OLLAMA_IP", os.getenv("HOST_IP", "127.0.0.1"))
    llm_port = os.getenv("OLLAMA_PORT", "11434")
    api_url = os.getenv("LLM_API_URL", f"http://{ollama_ip}:{llm_port}/api/chat")
    return {
        "api_url": api_url,
        "model_name": os.getenv("LLM_MODEL_NAME", "deepseek-r1:32b"),
        "bearer_token": os.getenv("LLM_BEARER_TOKEN", "aakash_api_key"),
    }


# Path to Django backend for DB helpers
BACKEND_APP = Path(__file__).resolve().parents[1] / "TrinityBackendFastAPI" / "app"
sys.path.append(str(BACKEND_APP))


def _fetch_names_from_db() -> tuple[str, str, str]:
    """Retrieve client, app and project names from the backend database."""
    user_id = int(os.getenv("USER_ID", "0"))
    project_id = int(os.getenv("PROJECT_ID", "0"))
    client = os.getenv("CLIENT_NAME", "default_client")
    app = os.getenv("APP_NAME", "default_app")
    project = os.getenv("PROJECT_NAME", "default_project")
    if user_id and project_id:
        try:
            from DataStorageRetrieval.db import fetch_client_app_project

            client_db, app_db, project_db = asyncio.run(
                fetch_client_app_project(user_id, project_id)
            )
            client = client_db or client
            app = app_db or app
            project = project_db or project
        except Exception as exc:
            print(f"⚠️ Failed to load names from DB: {exc}")
    return client, app, project


def get_minio_config() -> Dict[str, str]:
    """Return MinIO configuration using database names when available."""
    client, app, project = _fetch_names_from_db()
    prefix_default = f"{client}/{app}/{project}/"
    return {
        # Default to the development MinIO service if not explicitly configured
        "endpoint": os.getenv("MINIO_ENDPOINT", "minio:9000"),
        "access_key": os.getenv("MINIO_ACCESS_KEY", "minio"),
        "secret_key": os.getenv("MINIO_SECRET_KEY", "minio123"),
        "bucket": os.getenv("MINIO_BUCKET", "trinity"),
        "prefix": os.getenv("MINIO_PREFIX", prefix_default),
    }

# Ensure the Agent_fetch_atom folder is on the Python path so we can import its modules
AGENT_PATH = Path(__file__).resolve().parent / "Agent_fetch_atom"
sys.path.append(str(AGENT_PATH))

# Include other agents so their APIs can be mounted
CONCAT_PATH = Path(__file__).resolve().parent / "Agent_concat"
MERGE_PATH = Path(__file__).resolve().parent / "Agent_Merge"
sys.path.append(str(CONCAT_PATH))
sys.path.append(str(MERGE_PATH))

from single_llm_processor import SingleLLMProcessor
from Agent_concat.main_app import app as concat_app
from Agent_Merge.main_app import app as merge_app

def convert_numpy(obj):
    if isinstance(obj, dict):
        return {k: convert_numpy(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_numpy(i) for i in obj]
    elif isinstance(obj, (np.float32, np.float64)):
        return float(obj)
    elif isinstance(obj, (np.int32, np.int64)):
        return int(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    else:
        return obj

def initialize_single_llm_system():
    try:
        cfg = get_llm_config()
        processor = SingleLLMProcessor(
            api_url=cfg["api_url"],
            model_name=cfg["model_name"],
            bearer_token=cfg["bearer_token"],
        )
        return processor
    except Exception as e:
        print(f"System initialization error: {e}")
        return None

processor = initialize_single_llm_system()

class QueryRequest(BaseModel):
    query: str

app = FastAPI(
    title="Single LLM Atom Detection API",
    description="API endpoint using single LLM for domain checking, query enhancement, and atom extraction",
    version="7.0"
)

# Expose the concat and merge agent APIs alongside the chat endpoints
app.include_router(concat_app.router)
app.include_router(merge_app.router)

# Enable CORS for browser-based clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/chat")
async def chat_endpoint(request: QueryRequest):
    """
    Process query using single LLM for complete workflow:
    - Query enhancement and grammar correction
    - Domain classification (in/out of domain)
    - Atom/tool extraction and matching
    - Maintains backward compatible JSON format
    """
    try:
        print(f"🚀 Single LLM API Request: {request.query}")
        
        if not processor:
            return jsonable_encoder({
                "domain_status": "in_domain",
                "llm2_status": "error",
                "atom_status": False,
                "match_type": "none",
                "raw_query": request.query,
                "enhanced_query": request.query,
                "final_response": "System not initialized properly",
                "error": "Processor not available"
            })
        
        # Single LLM processing
        result = processor.process_query(request.query)
        
        print(f"🎯 Single LLM API Response Status: {result.get('domain_status', 'unknown')}")
        
        # Clean and return the result
        clean_result = convert_numpy(result)
        return jsonable_encoder(clean_result)
        
    except Exception as e:
        print(f"❌ Single LLM API Error: {e}")
        error_response = {
            "domain_status": "in_domain",
            "llm2_status": "error",
            "atom_status": False,
            "match_type": "none",
            "raw_query": request.query,
            "enhanced_query": request.query,
            "final_response": "Technical error occurred. Please try again.",
            "error": str(e),
            "tools_used": ["Single_LLM_Direct"],
            "processing_steps": ["error_handling"]
        }
        return jsonable_encoder(error_response)

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "version": "7.0",
        "features": ["single_llm_processing", "domain_classification", "atom_extraction", "backward_compatible"],
        "flow": "User Input → Single LLM → Domain Check + Query Enhancement + Atom Extraction",
        "processing_type": "unified_single_llm"
    }

@app.get("/debug/{query}")
async def debug_processing(query: str):
    """Debug endpoint to see single LLM processing details"""
    try:
        if processor:
            result = processor.process_query(query)
            return {
                "raw_query": query,
                "processing_result": result,
                "status": "success"
            }
        else:
            return {"error": "Processor not initialized"}
    except Exception as e:
        return {"error": str(e)}

@app.get("/atoms")
async def list_available_atoms():
    """List all available atoms"""
    try:
        if processor:
            return {
                "total_atoms": len(processor.valid_atoms),
                "atoms": processor.valid_atoms,
                "processing_type": "single_llm"
            }
        else:
            return {"error": "Processor not available"}
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    # Run the FastAPI application. Using the `app` instance directly
    # avoids import issues when executing the module via `python main_api.py`.
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=int(os.getenv("AI_PORT", 8002)),
        reload=False,
    )
