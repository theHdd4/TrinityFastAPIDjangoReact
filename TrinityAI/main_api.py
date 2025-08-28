import os
import sys
import time
import logging
import json
import redis
import requests
import uvicorn
import asyncio
from pathlib import Path
from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any, Tuple, Optional
import numpy as np
from pymongo import MongoClient
from fastapi.encoders import jsonable_encoder

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
    logger.warning("Mongo connection failed: %s", exc)
    mongo_client = None
    config_db = None

CACHE_TTL = 3600


async def _query_registry_names(schema: str) -> Tuple[Tuple[str, str, str] | None, str]:
    """Directly query Postgres for client/app/project names."""
    try:
        from DataStorageRetrieval.db.connection import (
            asyncpg,
            POSTGRES_HOST,
            POSTGRES_USER,
            POSTGRES_PASSWORD,
            POSTGRES_DB,
            POSTGRES_PORT,
        )
        if asyncpg is None:
            return None, "asyncpg not available"
        conn = await asyncpg.connect(
            host=POSTGRES_HOST,
            user=POSTGRES_USER,
            password=POSTGRES_PASSWORD,
            database=POSTGRES_DB,
            port=int(POSTGRES_PORT),
            server_settings={"search_path": schema},
        )
        query = (
            "SELECT client_name, app_name, project_name FROM registry_environment "
            "ORDER BY updated_at DESC LIMIT 1"
        )
        message = (
            f"Looking in the postgres server: {POSTGRES_HOST}:{POSTGRES_PORT} in the schema: {schema} "
            f"table: registry_environment with the query: {query}"
        )
        logger.debug(message)
        row = await conn.fetchrow(query)
        await conn.close()
        if row:
            names = (row["client_name"], row["app_name"], row["project_name"])
            result_msg = f"result fetched are {names}"
            logger.debug(result_msg)
            return names, f"{message} and {result_msg}"
        return None, message
    except Exception as exc:
        err = f"direct query failed: {exc}"
        logger.warning(err)
        return None, err


def get_classifier_config_from_mongo(client: str, app: str, project: str):
    """Load classifier configuration from MongoDB."""
    if config_db is None:
        return None
    try:
        document_id = f"{client}/{app}/{project}"
        return config_db[CONFIG_COLLECTION].find_one({"_id": document_id})
    except Exception as exc:  # pragma: no cover - runtime failures
        logger.warning("Mongo read error: %s", exc)
        return None


def _fetch_names_from_db(
    client_override: str | None = None,
    app_override: str | None = None,
    project_override: str | None = None,
) -> tuple[str, str, str, dict]:
    """Retrieve client, app and project names using backend helpers."""
    load_env_from_redis()
    client = client_override or os.getenv("CLIENT_NAME", "")
    app = app_override or os.getenv("APP_NAME", "")
    project = project_override or os.getenv("PROJECT_NAME", "")
    debug: Dict[str, Any] = {}

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
            debug["source"] = "get_env_vars"
            client = env.get("CLIENT_NAME", client)
            app = env.get("APP_NAME", app)
            project = env.get("PROJECT_NAME", project)
    except Exception as exc:
        logger.warning("get_env_vars failed: %s", exc)
        try:
            from DataStorageRetrieval.db.environment import fetch_environment_names
            from DataStorageRetrieval.db.connection import (
                POSTGRES_HOST,
                POSTGRES_PORT,
                get_tenant_schema,
            )

            schema = get_tenant_schema(client) or client
            query = (
                "SELECT client_name, app_name, project_name FROM registry_environment "
                "ORDER BY updated_at DESC LIMIT 1"
            )
            message = (
                f"Looking in the postgres server: {POSTGRES_HOST}:{POSTGRES_PORT} in the schema: {schema} "
                f"table: registry_environment with the query: {query}"
            )
            debug.update(
                {
                    "source": "fetch_environment_names",
                    "host": POSTGRES_HOST,
                    "port": POSTGRES_PORT,
                    "schema": schema,
                    "table": "registry_environment",
                    "query": query,
                    "message": message,
                }
            )
            names = asyncio.run(fetch_environment_names(schema))
            if names:
                client, app, project = names
                debug["result"] = {
                    "client": client,
                    "app": app,
                    "project": project,
                }
                debug["message"] = message + f" and result fetched are {(client, app, project)}"
            else:
                names, msg = asyncio.run(_query_registry_names(schema))
                debug["message"] = msg
                if names:
                    debug["source"] = "direct_query"
                    client, app, project = names
                    debug["result"] = {
                        "client": client,
                        "app": app,
                        "project": project,
                    }
                    debug["message"] = msg
        except Exception:
            try:
                from DataStorageRetrieval.db import fetch_client_app_project
                from DataStorageRetrieval.db.connection import POSTGRES_HOST, POSTGRES_PORT

                user_id = int(os.getenv("USER_ID", "0"))
                project_id = int(os.getenv("PROJECT_ID", "0"))
                if user_id and project_id:
                    debug.update(
                        {
                            "source": "fetch_client_app_project",
                            "host": POSTGRES_HOST,
                            "port": POSTGRES_PORT,
                            "schema": "<default>",
                            "table": "accounts_userenvironmentvariable",
                            "query": (
                                "SELECT client_name, app_name, project_name FROM accounts_userenvironmentvariable "
                                "WHERE user_id=$1 AND key='PROJECT_NAME' AND project_id LIKE '%' || $2 ORDER BY updated_at DESC LIMIT 1"
                            ),
                        }
                    )
                    client_db, app_db, project_db = asyncio.run(
                        fetch_client_app_project(user_id, project_id)
                    )
                    client = client_db or client
                    app = app_db or app
                    project = project_db or project
                    debug["result"] = {
                        "client": client,
                        "app": app,
                        "project": project,
                    }
                    debug["message"] = (
                        f"Looking in the postgres server: {POSTGRES_HOST}:{POSTGRES_PORT} in the schema: <default> "
                        "table: accounts_userenvironmentvariable with the query: "
                        + debug.get("query", "")
                        + f" and result fetched are {(client, app, project)}"
                    )
            except Exception as exc_db:  # pragma: no cover - optional path
                logger.warning(
                    "fallback fetch_client_app_project failed: %s", exc_db
                )

    os.environ["CLIENT_NAME"] = client
    os.environ["APP_NAME"] = app
    os.environ["PROJECT_NAME"] = project
    if client and app and project:
        os.environ["MINIO_PREFIX"] = f"{client}/{app}/{project}/"
    logger.debug(
        "_fetch_names_from_db resolved client=%s app=%s project=%s", client, app, project
    )
    logger.info("ENV resolved -> client=%s app=%s project=%s", client, app, project)
    return client, app, project, debug


def get_minio_config() -> Dict[str, str]:
    """Return MinIO configuration using database names when available."""
    logger.debug("get_minio_config() called")
    client, app, project, _ = _fetch_names_from_db()
    prefix = f"{client}/{app}/{project}/" if client and app and project else ""
    os.environ["MINIO_PREFIX"] = prefix
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
MERGE_PATH = Path(__file__).resolve().parent / "Agent_Merge"
CONCAT_PATH = Path(__file__).resolve().parent / "Agent_concat"
CREATE_TRANSFORM_PATH = Path(__file__).resolve().parent / "Agent_create_transform"
GROUPBY_PATH = Path(__file__).resolve().parent / "Agent_groupby"
CHARTMAKER_PATH = Path(__file__).resolve().parent / "Agent_chartmaker"
sys.path.append(str(MERGE_PATH))
sys.path.append(str(CONCAT_PATH))
sys.path.append(str(CREATE_TRANSFORM_PATH))
sys.path.append(str(GROUPBY_PATH))
sys.path.append(str(CHARTMAKER_PATH))

from single_llm_processor import SingleLLMProcessor
from Agent_Merge.main_app import router as merge_router
from Agent_concat.main_app import router as concat_router
from Agent_create_transform.main_app import router as create_transform_router
from Agent_groupby.main_app import router as groupby_router
from Agent_chartmaker.main_app import router as chartmaker_router

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
        logger.error("System initialization error: %s", e)
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

# Add perform endpoint for both concat and merge operations
class PerformRequest(BaseModel):
    operation: str  # "concat", "merge", "create_transform", or "groupby"
    file1: str
    file2: str
    bucket_name: str = "trinity"
    # For merge
    join_columns: Optional[str] = None
    join_type: Optional[str] = "inner"
    # For concat
    concat_direction: Optional[str] = "vertical"
    # For create_transform
    identifiers: Optional[str] = None
    operations: Optional[str] = None
    # For groupby
    groupby_identifiers: Optional[str] = None
    groupby_aggregations: Optional[str] = None

@api_router.post("/perform")
async def perform_operation(request: PerformRequest):
    """Perform concat, merge, create_transform, or groupby operations"""
    logger.info(f"PERFORM REQUEST: {request.operation}")
    logger.info(f"Files: {request.file1} + {request.file2}")
    
    try:
        if request.operation == "concat":
            # Handle concatenation
            payload = {
                "file1": request.file1,
                "file2": request.file2,
                "concat_direction": request.concat_direction or "vertical",
            }
            
            # Call the backend concat API
            concat_url = os.getenv(
                "CONCAT_PERFORM_URL",
                f"http://{os.getenv('HOST_IP', 'localhost')}:{os.getenv('FASTAPI_PORT', '8004')}/api/concat/perform",
            )
            
            resp = requests.post(concat_url, json=payload, timeout=60)
            resp.raise_for_status()
            result = resp.json()
            
            logger.info(f"Concat operation completed: {result}")
            return result
            
        elif request.operation == "merge":
            # Merge operations are handled by the merge agent calling the backend API directly
            # This endpoint is not used for merge operations
            raise HTTPException(status_code=400, detail="Merge operations should be performed through the merge agent endpoint")
            
        elif request.operation == "create_transform":
            # Handle create/transform operations
            try:
                # Parse the operations JSON string
                operations_data = json.loads(request.operations or "[]")
                
                # Convert operations to the format expected by the backend
                payload = {
                    "object_names": request.file1,
                    "bucket_name": request.bucket_name,
                    "identifiers": request.identifiers or ""
                }
                
                # Add operations in the format expected by the backend
                for idx, op in enumerate(operations_data):
                    if isinstance(op, dict) and "operation" in op and "source_columns" in op:
                        op_type = op["operation"]
                        source_cols = op["source_columns"]
                        rename_to = op.get("rename_to", "")
                        
                        # The backend expects the operation type to be part of the key
                        # Format: {op_type}_{idx}, {op_type}_{idx}_rename, etc.
                        payload[f"{op_type}_{idx}"] = ",".join(source_cols)
                        if rename_to:
                            payload[f"{op_type}_{idx}_rename"] = rename_to
                        
                        # Add any additional parameters if they exist
                        if "param" in op:
                            payload[f"{op_type}_{idx}_param"] = op["param"]
                        if "period" in op:
                            payload[f"{op_type}_{idx}_period"] = op["period"]
                
                logger.info(f"Create/Transform payload: {payload}")
                
                # Call the backend createcolumn API
                create_url = os.getenv(
                    "CREATE_PERFORM_URL",
                    f"http://{os.getenv('HOST_IP', 'localhost')}:{os.getenv('FASTAPI_PORT', '8001')}/api/create/perform",
                )
                
                resp = requests.post(create_url, data=payload, timeout=60)
                resp.raise_for_status()
                result = resp.json()
                
                logger.info(f"Create/Transform operation completed: {result}")
                return result
                
            except Exception as e:
                logger.error(f"Create/Transform operation failed: {e}")
                raise HTTPException(status_code=500, detail=f"Create/Transform operation failed: {str(e)}")
            
        elif request.operation == "groupby":
            # Handle groupby operations
            payload = {
                "file_key": request.file1,
                "bucket_name": request.bucket_name,
                "object_names": request.file1,
                "identifiers": request.groupby_identifiers or "[]",
                "aggregations": request.groupby_aggregations or "{}"
            }
            
            # Call the backend groupby API
            groupby_url = os.getenv(
                "GROUPBY_PERFORM_URL",
                f"http://{os.getenv('HOST_IP', 'localhost')}:{os.getenv('FASTAPI_PORT', '8001')}/api/groupby/run",
            )
            
            resp = requests.post(groupby_url, data=payload, timeout=60)
            resp.raise_for_status()
            result = resp.json()
            
            logger.info(f"GroupBy operation completed: {result}")
            return result
            
        else:
            raise HTTPException(status_code=400, detail=f"Unknown operation: {request.operation}")
            
    except Exception as e:
        logger.error(f"PERFORM OPERATION FAILED: {e}")
        raise HTTPException(status_code=500, detail=f"Operation failed: {str(e)}")

# Expose the concat and merge agent APIs alongside the chat endpoints
api_router.include_router(merge_router)
api_router.include_router(concat_router)
api_router.include_router(create_transform_router)
api_router.include_router(groupby_router)
api_router.include_router(chartmaker_router)

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
        logger.info("Single LLM API Request: %s", request.query)
        
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
        
        logger.info(
            "Single LLM API Response Status: %s", result.get("domain_status", "unknown")
        )
        
        # Clean and return the result
        clean_result = convert_numpy(result)
        return jsonable_encoder(clean_result)
        
    except Exception as e:
        logger.error("Single LLM API Error: %s", e)
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
    client, app_name, project, _ = _fetch_names_from_db()
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
async def get_environment(
    client: str | None = None,
    app: str | None = None,
    project: str | None = None,
):
    """Return current environment variables and MinIO prefix."""
    client_name, app_name, project_name, debug = _fetch_names_from_db(client, app, project)
    prefix = get_minio_config()["prefix"]
    logger.info(
        "environment fetched client=%s app=%s project=%s prefix=%s",
        client_name,
        app_name,
        project_name,
        prefix,
    )
    return {
        "client_name": client_name,
        "app_name": app_name,
        "project_name": project_name,
        "prefix": prefix,
        "debug": debug,
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
