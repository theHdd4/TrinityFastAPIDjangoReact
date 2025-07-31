import os
import sys
import asyncio
from pathlib import Path
import json
import uvicorn
import logging
from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any
import numpy as np
from pymongo import MongoClient
import redis

logger = logging.getLogger("trinity.ai")


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


# Path to backend helpers mounted via volume in docker-compose
# We add the AI directory itself and the FastAPI backend so the
# ``DataStorageRetrieval`` package and ``app`` utilities can be
# imported normally when running outside Docker.
BACKEND_ROOT = Path(__file__).resolve().parent
sys.path.append(str(BACKEND_ROOT))
BACKEND_API = BACKEND_ROOT.parent / "TrinityBackendFastAPI" / "app"
if BACKEND_API.exists():
    sys.path.append(str(BACKEND_API))

# Load environment variables from Redis so subsequent configuration
# functions see CLIENT_NAME, APP_NAME and PROJECT_NAME
from DataStorageRetrieval.arrow_client import load_env_from_redis

load_env_from_redis()

# ---------------------------------------------------------------------------
# Redis and Mongo configuration
# ---------------------------------------------------------------------------
REDIS_HOST = os.getenv("REDIS_HOST", "redis")
redis_client = redis.Redis(host=REDIS_HOST, port=6379, decode_responses=True)

MONGO_URI = os.getenv(
    "CLASSIFY_MONGO_URI",
    "mongodb://admin_dev:pass_dev@10.2.1.65:9005/?authSource=admin",
)
CONFIG_DB = os.getenv("CLASSIFIER_CONFIG_DB", "trinity_prod")
CONFIG_COLLECTION = os.getenv(
    "CLASSIFIER_CONFIGS_COLLECTION",
    "column_classifier_configs",
)

try:
    mongo_client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    config_db = mongo_client[CONFIG_DB]
except Exception as exc:  # pragma: no cover - optional Mongo
    print(f"⚠️ Mongo connection failed: {exc}")
    mongo_client = None
    config_db = None

CACHE_TTL = 3600


def get_classifier_config_from_mongo(client: str, app: str, project: str):
    """Load classifier configuration from MongoDB."""
    if config_db is None:
        return None
    try:
        document_id = f"{client}/{app}/{project}"
        return config_db[CONFIG_COLLECTION].find_one({"_id": document_id})
    except Exception as exc:  # pragma: no cover - runtime failures
        print(f"⚠️ Mongo read error: {exc}")
        return None


def _fetch_names_from_db() -> tuple[str, str, str]:
    """Retrieve client, app and project names using backend helpers."""
    client = os.getenv("CLIENT_NAME", "default_client")
    app = os.getenv("APP_NAME", "default_app")
    project = os.getenv("PROJECT_NAME", "default_project")

    try:
        # Use the FastAPI/Django helper which queries Redis or Postgres
        from app.core.utils import get_env_vars

        env = asyncio.run(
            get_env_vars(
                client_name=client,
                app_name=app,
                project_name=project,
            )
        )
        if env:
            client = env.get("CLIENT_NAME", client)
            app = env.get("APP_NAME", app)
            project = env.get("PROJECT_NAME", project)
    except Exception as exc:
        logger.warning("get_env_vars failed: %s", exc)
        try:
            from DataStorageRetrieval.db.environment import fetch_environment_names

            names = asyncio.run(fetch_environment_names(client))
            if names:
                client, app, project = names
        except Exception:
            try:
                from DataStorageRetrieval.db import fetch_client_app_project

                user_id = int(os.getenv("USER_ID", "0"))
                project_id = int(os.getenv("PROJECT_ID", "0"))
                if user_id and project_id:
                    client_db, app_db, project_db = asyncio.run(
                        fetch_client_app_project(user_id, project_id)
                    )
                    client = client_db or client
                    app = app_db or app
                    project = project_db or project
            except Exception as exc_db:  # pragma: no cover - optional path
                logger.warning(
                    "fallback fetch_client_app_project failed: %s", exc_db
                )

    os.environ["CLIENT_NAME"] = client
    os.environ["APP_NAME"] = app
    os.environ["PROJECT_NAME"] = project
    load_env_from_redis()
    logger.debug(
        "_fetch_names_from_db resolved client=%s app=%s project=%s", client, app, project
    )
    print(f"ENV resolved -> client={client} app={app} project={project}")
    return client, app, project


def get_minio_config() -> Dict[str, str]:
    """Return MinIO configuration using database names when available."""
    logger.debug("get_minio_config() called")
    client, app, project = _fetch_names_from_db()
    prefix_default = f"{client}/{app}/{project}/"
    prefix = os.getenv("MINIO_PREFIX", prefix_default)
    if not prefix.endswith("/"):
        prefix += "/"
    config = {
        # Default to the development MinIO service if not explicitly configured
        "endpoint": os.getenv("MINIO_ENDPOINT", "minio:9000"),
        "access_key": os.getenv("MINIO_ACCESS_KEY", "minio"),
        "secret_key": os.getenv("MINIO_SECRET_KEY", "minio123"),
        "bucket": os.getenv("MINIO_BUCKET", "trinity"),
        "prefix": prefix,
    }
    logger.debug("minio config resolved: %s", config)
    return config

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

# Router with a global prefix for all Trinity AI endpoints
api_router = APIRouter(prefix="/trinityai")

# Expose the concat and merge agent APIs alongside the chat endpoints
api_router.include_router(concat_app.router)
api_router.include_router(merge_app.router)

# Enable CORS for browser-based clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@api_router.post("")
@api_router.post("/")
@api_router.post("/chat")
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

@api_router.get("/health")
async def health():
    return {
        "status": "healthy",
        "version": "7.0",
        "features": ["single_llm_processing", "domain_classification", "atom_extraction", "backward_compatible"],
        "flow": "User Input → Single LLM → Domain Check + Query Enhancement + Atom Extraction",
        "processing_type": "unified_single_llm"
    }

@api_router.get("/debug/{query}")
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

@api_router.get("/atoms")
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


@api_router.get("/get_config")
async def get_config():
    """Return column classifier configuration from cache or MongoDB."""
    load_env_from_redis()
    client = os.getenv("CLIENT_NAME", "default_client")
    app_name = os.getenv("APP_NAME", "")
    project = os.getenv("PROJECT_NAME", "default_project")
    key = f"{client}/{app_name}/{project}/column_classifier_config"
    cached = redis_client.get(key)
    if cached:
        try:
            return {"status": "success", "source": "redis", "data": json.loads(cached)}
        except Exception:
            pass

    mongo_data = get_classifier_config_from_mongo(client, app_name, project)
    if mongo_data:
        try:
            redis_client.setex(key, CACHE_TTL, json.dumps(mongo_data, default=str))
        except Exception:
            pass
        return {"status": "success", "source": "mongo", "data": mongo_data}

    raise HTTPException(status_code=404, detail="Configuration not found")


@api_router.get("/env")
async def get_environment():
    """Return current environment variables and MinIO prefix."""
    client, app, project = _fetch_names_from_db()
    prefix = get_minio_config()["prefix"]
    logger.info(
        "environment fetched client=%s app=%s project=%s prefix=%s",
        client,
        app,
        project,
        prefix,
    )
    return {
        "client_name": client,
        "app_name": app,
        "project_name": project,
        "prefix": prefix,
    }

# After defining all endpoints include the router so the app registers them
app.include_router(api_router)

if __name__ == "__main__":
    # Run the FastAPI application. Using the `app` instance directly
    # avoids import issues when executing the module via `python main_api.py`.
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=int(os.getenv("AI_PORT", 8002)),
        reload=False,
    )
