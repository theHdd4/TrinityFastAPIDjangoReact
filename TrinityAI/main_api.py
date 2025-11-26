import os
import sys
import time
import logging
import json
import requests
import uvicorn
import asyncio
from pathlib import Path
from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any, Tuple, Optional, Iterable, Mapping
import numpy as np
from pymongo import MongoClient
from fastapi.encoders import jsonable_encoder
try:
    from TrinityAI.redis_client import get_redis_client
except ModuleNotFoundError:  # pragma: no cover - fallback for docker image layout
    from redis_client import get_redis_client

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
if str(BACKEND_ROOT) not in sys.path:
    sys.path.append(str(BACKEND_ROOT))

# Also add parent directory for TrinityAgent access
BACKEND_PARENT = BACKEND_ROOT.parent
if str(BACKEND_PARENT) not in sys.path:
    sys.path.append(str(BACKEND_PARENT))

BACKEND_REPO = BACKEND_ROOT.parent / "TrinityBackendFastAPI"
BACKEND_API = BACKEND_REPO / "app"

# ``app`` is a top-level package inside ``TrinityBackendFastAPI`` while
# helpers such as ``DataStorageRetrieval`` live inside the ``app`` folder.
# Add both locations to ``sys.path`` so the imports work when running the
# AI service outside the Docker compose environment.
for path in (BACKEND_REPO, BACKEND_API):
    if path.exists():
        path_str = str(path)
        if path_str not in sys.path:
            sys.path.append(path_str)

try:
    from app.core.mongo import build_host_mongo_uri
except ModuleNotFoundError:
    logger.warning(
        "FastAPI backend package unavailable; falling back to local Mongo URI builder"
    )

    def _first_non_empty(vars_: Iterable[str], default: str) -> str:
        """Return the first non-empty environment variable value."""

        for name in vars_:
            value = os.getenv(name)
            if value is None:
                continue
            stripped = value.strip()
            if stripped:
                return stripped
        return default

    def build_host_mongo_uri(
        *,
        username: str = "admin_dev",
        password: str = "pass_dev",
        auth_source: str = "admin",
        default_host: str = "localhost",
        default_port: str = "9005",
        host_env_vars: Tuple[str, ...] = ("HOST_IP", "MONGO_HOST"),
        port_env_vars: Tuple[str, ...] = ("MONGO_PORT",),
        auth_source_env_vars: Tuple[str, ...] = ("MONGO_AUTH_SOURCE", "MONGO_AUTH_DB"),
        database: str | None = None,
        options: Mapping[str, str] | None = None,
    ) -> str:
        """Construct a MongoDB URI using host information from the environment."""

        host = _first_non_empty(host_env_vars, default_host)
        port = _first_non_empty(port_env_vars, default_port)
        auth_db = _first_non_empty(auth_source_env_vars, auth_source)

        credentials = ""
        if username and password:
            credentials = f"{username}:{password}@"
        elif username:
            credentials = f"{username}@"

        path = f"/{database}" if database else "/"

        query_params: Dict[str, str] = {}
        if auth_db:
            query_params["authSource"] = auth_db
        if options:
            for key, value in options.items():
                if value is None:
                    continue
                query_params[key] = value

        query = ""
        if query_params:
            joined = "&".join(f"{key}={value}" for key, value in query_params.items())
            query = f"?{joined}"

        return f"mongodb://{credentials}{host}:{port}{path}{query}"

# Load environment variables from Redis so subsequent configuration
# functions see CLIENT_NAME, APP_NAME and PROJECT_NAME
from DataStorageRetrieval.arrow_client import load_env_from_redis

load_env_from_redis()

# ---------------------------------------------------------------------------
# Redis and Mongo configuration
# ---------------------------------------------------------------------------
redis_client = get_redis_client()

DEFAULT_MONGO_URI = build_host_mongo_uri()
MONGO_URI = (
    os.getenv("CLASSIFY_MONGO_URI")
    or os.getenv("MONGO_URI")
    or DEFAULT_MONGO_URI
)
# Column classifier configurations are stored in the shared "trinity_db"
# database under the "column_classifier_config" collection.
CONFIG_DB = os.getenv("CLASSIFIER_CONFIG_DB", "trinity_db")
CONFIG_COLLECTION = os.getenv(
    "CLASSIFIER_CONFIGS_COLLECTION",
    "column_classifier_config",
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
# MERGE_PATH = Path(__file__).resolve().parent / "Agent_Merge"  # DISABLED - Using standardized Agent_Merge from TrinityAgent
# CONCAT_PATH = Path(__file__).resolve().parent / "Agent_concat"  # DISABLED - Using standardized Agent_Concat from TrinityAgent
# CREATE_TRANSFORM_PATH = Path(__file__).resolve().parent / "Agent_create_transform"  # DISABLED - Using standardized Agent_CreateTransform from TrinityAgent
GROUPBY_PATH = Path(__file__).resolve().parent / "Agent_groupby"
CHARTMAKER_PATH = Path(__file__).resolve().parent / "Agent_chartmaker"
EXPLORE_PATH = Path(__file__).resolve().parent / "Agent_explore"
DATAFRAME_OPERATIONS_PATH = Path(__file__).resolve().parent / "Agent_dataframe_operations"
DF_VALIDATE_PATH = Path(__file__).resolve().parent / "Agent_df_validate"
# sys.path.append(str(MERGE_PATH))  # DISABLED - Using standardized Agent_Merge from TrinityAgent
# sys.path.append(str(CONCAT_PATH))  # DISABLED - Using standardized Agent_Concat from TrinityAgent
# sys.path.append(str(CREATE_TRANSFORM_PATH))  # DISABLED - Using standardized Agent_CreateTransform from TrinityAgent
sys.path.append(str(GROUPBY_PATH))
sys.path.append(str(CHARTMAKER_PATH))
sys.path.append(str(EXPLORE_PATH))
sys.path.append(str(DATAFRAME_OPERATIONS_PATH))
sys.path.append(str(DF_VALIDATE_PATH))

from single_llm_processor import SingleLLMProcessor
# from Agent_Merge.main_app import router as merge_router  # DISABLED - Using standardized Agent_Merge from TrinityAgent
# from Agent_concat.main_app import router as concat_router  # DISABLED - Using standardized Agent_Concat from TrinityAgent

# ============================================================================
# ============================================================================
# STANDARDIZED CONCAT, MERGE, AND CREATETRANSFORM AGENTS (NEW) - Using TrinityAgent
# Import directly like other agents, but use TrinityAgent's connection interface
# ============================================================================
concat_router = None
merge_router = None
create_transform_router = None

# Use print statements to ensure we see errors even if logger isn't configured
print("=" * 80)
print("LOADING CONCAT AGENT FROM TRINITY AGENT")
print("=" * 80)

try:
    # In Docker, TrinityAI is at /app, so TrinityAgent should be at /app/TrinityAgent
    # Other agents are imported directly like: from Agent_Merge.main_app import router
    # So TrinityAgent should be accessible the same way
    current_file = Path(__file__).resolve()
    print(f"Current file: {current_file}")
    print(f"BACKEND_ROOT (TrinityAI): {BACKEND_ROOT}")
    print(f"BACKEND_PARENT: {BACKEND_PARENT}")
    print(f"Current working directory: {Path.cwd()}")
    
    # Strategy 1: Same directory as main_api.py (Docker: /app/TrinityAgent)
    # This matches how other agents work - they're all in /app/
    TRINITY_AGENT_PATH = BACKEND_ROOT / "TrinityAgent"
    print(f"Strategy 1 (Same dir as main_api.py) - TrinityAgent path: {TRINITY_AGENT_PATH}")
    print(f"Strategy 1 - Path exists: {TRINITY_AGENT_PATH.exists()}")
    
    # Strategy 2: Sibling of TrinityAI (if TrinityAI is a subdirectory)
    if not TRINITY_AGENT_PATH.exists():
        TRINITY_AGENT_PATH = BACKEND_PARENT / "TrinityAgent"
        print(f"Strategy 2 (Sibling) - TrinityAgent path: {TRINITY_AGENT_PATH}")
        print(f"Strategy 2 - Path exists: {TRINITY_AGENT_PATH.exists()}")
    
    # Strategy 3: Environment variable (for Docker/container setups)
    if not TRINITY_AGENT_PATH.exists():
        env_path = os.getenv("TRINITY_AGENT_PATH")
        if env_path:
            TRINITY_AGENT_PATH = Path(env_path)
            print(f"Strategy 3 (Env Var) - TrinityAgent path: {TRINITY_AGENT_PATH}")
            print(f"Strategy 3 - Path exists: {TRINITY_AGENT_PATH.exists()}")
    
    # Strategy 4: Common Docker/container locations
    if not TRINITY_AGENT_PATH.exists():
        possible_paths = [
            Path("/app/TrinityAgent"),  # Docker: same level as other agents
            Path("/app/TrinityFastAPIDjangoReact/TrinityAgent"),
            Path.cwd() / "TrinityAgent",
        ]
        for possible_path in possible_paths:
            if possible_path.exists():
                TRINITY_AGENT_PATH = possible_path
                print(f"Strategy 4 - Found TrinityAgent at: {TRINITY_AGENT_PATH}")
                break
    
    if not TRINITY_AGENT_PATH.exists():
        error_msg = f"TrinityAgent directory not found. Searched:\n"
        error_msg += f"  - {BACKEND_ROOT / 'TrinityAgent'} (Same dir as main_api.py - DOCKER EXPECTED: /app/TrinityAgent)\n"
        error_msg += f"  - {BACKEND_PARENT / 'TrinityAgent'} (Sibling of TrinityAI)\n"
        error_msg += f"  - Environment variable TRINITY_AGENT_PATH: {os.getenv('TRINITY_AGENT_PATH', 'Not set')}\n"
        error_msg += f"Current file: {current_file}\n"
        error_msg += f"BACKEND_ROOT: {BACKEND_ROOT}\n"
        error_msg += f"BACKEND_PARENT: {BACKEND_PARENT}\n"
        error_msg += f"Current working directory: {Path.cwd()}\n"
        error_msg += f"\nIn Docker, TrinityAgent should be at: /app/TrinityAgent (same level as other Agent_* folders)"
        print(f"❌ {error_msg}")
        logger.error(error_msg)
        raise FileNotFoundError(error_msg)
    
    print(f"✅ Using TrinityAgent path: {TRINITY_AGENT_PATH}")
    logger.info(f"✅ TrinityAgent found at: {TRINITY_AGENT_PATH}")
    
    # Add parent directory to path (so we can import as "from TrinityAgent.main_app import ...")
    # In Docker: /app/TrinityAgent -> add /app to path (like other Agent_* imports)
    TRINITY_AGENT_PARENT = TRINITY_AGENT_PATH.parent
    if str(TRINITY_AGENT_PARENT) not in sys.path:
        sys.path.insert(0, str(TRINITY_AGENT_PARENT))
        print(f"✅ Added TrinityAgent parent to sys.path: {TRINITY_AGENT_PARENT}")
        logger.info(f"✅ Added TrinityAgent parent to sys.path: {TRINITY_AGENT_PARENT}")
    
    try:
        # Import like other agents: from TrinityAgent.main_app import ...
        # This matches: from Agent_Merge.main_app import router
        print("Attempting import: from TrinityAgent.main_app import get_concat_router, get_merge_router, get_create_transform_router, get_group_by_router, get_chart_maker_router...")
        from TrinityAgent.main_app import get_concat_router, get_merge_router, get_create_transform_router, get_group_by_router, get_chart_maker_router, initialize_trinity_agent
        print("✅ Successfully imported TrinityAgent.main_app")
        
        # Initialize TrinityAgent (this registers all agents)
        print("Initializing TrinityAgent...")
        init_results = initialize_trinity_agent()
        print(f"TrinityAgent initialization results: {init_results}")
        
        # Get concat router using the connection interface
        print("Getting concat router from TrinityAgent...")
        concat_router = get_concat_router()
        
        if concat_router:
            print("✅✅✅ CONCAT ROUTER RETRIEVED FROM TRINITY AGENT ✅✅✅")
            print(f"✅ Concat router type: {type(concat_router)}")
            route_count = len(concat_router.routes)
            print(f"✅ Concat router has {route_count} routes")
            for route in concat_router.routes:
                if hasattr(route, 'path') and hasattr(route, 'methods'):
                    print(f"  - {list(route.methods)} {route.path}")
                elif hasattr(route, 'path'):
                    print(f"  - {route.path}")
        else:
            print("❌ Concat router is None from get_concat_router()")
            raise RuntimeError("Failed to get concat router from TrinityAgent")
        
        # Get merge router using the connection interface
        print("Getting merge router from TrinityAgent...")
        merge_router = get_merge_router()
        
        if merge_router:
            print("✅✅✅ MERGE ROUTER RETRIEVED FROM TRINITY AGENT ✅✅✅")
            print(f"✅ Merge router type: {type(merge_router)}")
            route_count = len(merge_router.routes)
            print(f"✅ Merge router has {route_count} routes")
            for route in merge_router.routes:
                if hasattr(route, 'path') and hasattr(route, 'methods'):
                    print(f"  - {list(route.methods)} {route.path}")
                elif hasattr(route, 'path'):
                    print(f"  - {route.path}")
        else:
            print("❌ Merge router is None from get_merge_router()")
            logger.warning("⚠️ Merge router is None - merge endpoint will not work")
        
        # Get create_transform router using the connection interface
        print("Getting create_transform router from TrinityAgent...")
        create_transform_router = get_create_transform_router()
        
        if create_transform_router:
            print("✅✅✅ CREATETRANSFORM ROUTER RETRIEVED FROM TRINITY AGENT ✅✅✅")
            print(f"✅ CreateTransform router type: {type(create_transform_router)}")
            route_count = len(create_transform_router.routes)
            print(f"✅ CreateTransform router has {route_count} routes")
            for route in create_transform_router.routes:
                if hasattr(route, 'path') and hasattr(route, 'methods'):
                    print(f"  - {list(route.methods)} {route.path}")
                elif hasattr(route, 'path'):
                    print(f"  - {route.path}")
        else:
            print("❌ CreateTransform router is None from get_create_transform_router()")
            logger.warning("⚠️ CreateTransform router is None - create_transform endpoint will not work")
        
        # Get group_by router using the connection interface
        print("Getting group_by router from TrinityAgent...")
        groupby_router = get_group_by_router()
        
        if groupby_router:
            print("✅✅✅ GROUPBY ROUTER RETRIEVED FROM TRINITY AGENT ✅✅✅")
            print(f"✅ GroupBy router type: {type(groupby_router)}")
            route_count = len(groupby_router.routes)
            print(f"✅ GroupBy router has {route_count} routes")
            for route in groupby_router.routes:
                if hasattr(route, 'path') and hasattr(route, 'methods'):
                    print(f"  - {list(route.methods)} {route.path}")
                elif hasattr(route, 'path'):
                    print(f"  - {route.path}")
        else:
            print("❌ GroupBy router is None from get_group_by_router()")
            logger.warning("⚠️ GroupBy router is None - groupby endpoint will not work")
        
        # Get chart_maker router using the connection interface
        print("Getting chart_maker router from TrinityAgent...")
        chartmaker_router = get_chart_maker_router()
        
        if chartmaker_router:
            print("✅✅✅ CHARTMAKER ROUTER RETRIEVED FROM TRINITY AGENT ✅✅✅")
            print(f"✅ ChartMaker router type: {type(chartmaker_router)}")
            route_count = len(chartmaker_router.routes)
            print(f"✅ ChartMaker router has {route_count} routes")
            for route in chartmaker_router.routes:
                if hasattr(route, 'path') and hasattr(route, 'methods'):
                    print(f"  - {list(route.methods)} {route.path}")
                elif hasattr(route, 'path'):
                    print(f"  - {route.path}")
        else:
            print("❌ ChartMaker router is None from get_chart_maker_router()")
            logger.warning("⚠️ ChartMaker router is None - chartmaker endpoint will not work")
            
    except ImportError as import_err:
        print(f"❌ Failed to import TrinityAgent.main_app: {import_err}")
        print("Trying alternative import path...")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        
        # Fallback: try importing from main_app directly (add TrinityAgent to path first)
        try:
            print("Trying fallback: adding TrinityAgent to path and importing main_app...")
            # Add TrinityAgent itself to path for fallback
            if str(TRINITY_AGENT_PATH) not in sys.path:
                sys.path.insert(0, str(TRINITY_AGENT_PATH))
                print(f"✅ Added TrinityAgent to sys.path for fallback: {TRINITY_AGENT_PATH}")
            from main_app import get_concat_router, get_merge_router, get_create_transform_router, get_group_by_router, get_chart_maker_router, initialize_trinity_agent
            print("✅ Fallback import successful")
            init_results = initialize_trinity_agent()
            concat_router = get_concat_router()
            merge_router = get_merge_router()
            create_transform_router = get_create_transform_router()
            groupby_router = get_group_by_router()
            chartmaker_router = get_chart_maker_router()
            if concat_router:
                print("✅✅✅ CONCAT ROUTER RETRIEVED VIA FALLBACK ✅✅✅")
            if merge_router:
                print("✅✅✅ MERGE ROUTER RETRIEVED VIA FALLBACK ✅✅✅")
            if create_transform_router:
                print("✅✅✅ CREATETRANSFORM ROUTER RETRIEVED VIA FALLBACK ✅✅✅")
            if groupby_router:
                print("✅✅✅ GROUPBY ROUTER RETRIEVED VIA FALLBACK ✅✅✅")
            if chartmaker_router:
                print("✅✅✅ CHARTMAKER ROUTER RETRIEVED VIA FALLBACK ✅✅✅")
        except Exception as fallback_err:
            print(f"❌ Fallback also failed: {fallback_err}")
            import traceback
            print(f"Fallback traceback: {traceback.format_exc()}")
            raise import_err  # Re-raise original error
    except Exception as conn_err:
        print(f"❌ Failed to connect to TrinityAgent: {conn_err}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        raise
    
    print("=" * 80)
    logger.info("=" * 80)
    logger.info("✅ CONCAT AGENT LOADED SUCCESSFULLY")
    logger.info("=" * 80)
    
except ImportError as e:
    error_msg = f"❌❌❌ FAILED TO IMPORT AGENT REGISTRY ❌❌❌\nImportError: {e}"
    print("=" * 80)
    print(error_msg)
    import traceback
    print(f"Full traceback:\n{traceback.format_exc()}")
    print("=" * 80)
    logger.error("=" * 80)
    logger.error(error_msg)
    logger.error(f"Full traceback:\n{traceback.format_exc()}")
    logger.error("=" * 80)
    concat_router = None
    merge_router = None
    create_transform_router = None
    groupby_router = None
    chartmaker_router = None
except Exception as e:
    error_msg = f"❌❌❌ ERROR LOADING CONCAT/MERGE/CREATETRANSFORM AGENTS VIA REGISTRY ❌❌❌\nException: {e}"
    print("=" * 80)
    print(error_msg)
    import traceback
    print(f"Full traceback:\n{traceback.format_exc()}")
    print("=" * 80)
    logger.error("=" * 80)
    logger.error(error_msg)
    logger.error(f"Full traceback:\n{traceback.format_exc()}")
    logger.error("=" * 80)
    concat_router = None
    merge_router = None
    create_transform_router = None

# Final check - if still None, try direct import as last resort
if concat_router is None:
    print("=" * 80)
    print("❌❌❌ CONCAT ROUTER IS STILL NONE AFTER REGISTRY LOAD ❌❌❌")
    print("Attempting direct import as last resort...")
    print("=" * 80)
    
    try:
        # Last resort: try direct import like other agents
        # In Docker, everything is at /app/, so try /app/TrinityAgent first
        TRINITY_AGENT_PATH = BACKEND_ROOT / "TrinityAgent"  # /app/TrinityAgent in Docker
        
        # If not found, try sibling location
        if not TRINITY_AGENT_PATH.exists():
            TRINITY_AGENT_PATH = BACKEND_PARENT / "TrinityAgent"
        
        AGENT_CONCAT_PATH = TRINITY_AGENT_PATH / "Agent_Concat"
        
        print(f"Last resort - TRINITY_AGENT_PATH: {TRINITY_AGENT_PATH}")
        print(f"Last resort - AGENT_CONCAT_PATH: {AGENT_CONCAT_PATH}")
        print(f"Last resort - AGENT_CONCAT_PATH exists: {AGENT_CONCAT_PATH.exists()}")
        
        if AGENT_CONCAT_PATH.exists():
            if str(TRINITY_AGENT_PATH) not in sys.path:
                sys.path.insert(0, str(TRINITY_AGENT_PATH))
            
            # Try importing main_app to register routes, then get router
            try:
                import Agent_Concat.main_app
                print("✅ Imported main_app directly")
            except Exception as main_app_err:
                print(f"⚠️ Could not import main_app: {main_app_err}")
            
            # Try to get router
            try:
                from Agent_Concat.router import router as concat_router
                if concat_router:
                    print(f"✅✅✅ DIRECT IMPORT SUCCESSFUL - Router has {len(concat_router.routes)} routes")
                else:
                    print("❌ Router is None from direct import")
            except Exception as router_err:
                print(f"❌ Could not import router: {router_err}")
                # Try standalone_router
                try:
                    from Agent_Concat.standalone_router import router as concat_router
                    if concat_router:
                        print(f"✅✅✅ STANDALONE ROUTER IMPORTED - Router has {len(concat_router.routes)} routes")
                except Exception as standalone_err:
                    print(f"❌ Could not import standalone_router: {standalone_err}")
        else:
            print(f"❌ Agent_Concat directory does not exist: {AGENT_CONCAT_PATH}")
    except Exception as last_resort_err:
        print(f"❌ Last resort import failed: {last_resort_err}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
    
    if concat_router is None:
        error_msg = "❌❌❌ CONCAT ROUTER IS STILL NONE AFTER ALL ATTEMPTS ❌❌❌\nThis means the agent registry could not load the concat agent"
        print("=" * 80)
        print(error_msg)
        print("=" * 80)
        logger.error("=" * 80)
        logger.error(error_msg)
        logger.error("=" * 80)
    else:
        print("=" * 80)
        print("✅✅✅ CONCAT ROUTER LOADED VIA DIRECT IMPORT ✅✅✅")
        print("=" * 80)
        logger.info("=" * 80)
        logger.info("✅ CONCAT ROUTER LOADED VIA DIRECT IMPORT")
        logger.info("=" * 80)

# from Agent_create_transform.main_app import router as create_transform_router  # DISABLED - Using standardized Agent_CreateTransform from TrinityAgent
# from Agent_groupby.main_app import router as groupby_router  # DISABLED - Using standardized Agent_GroupBy from TrinityAgent
# groupby_router is now loaded from TrinityAgent above
# from Agent_chartmaker.main_app import router as chartmaker_router  # DISABLED - Using standardized Agent_ChartMaker from TrinityAgent
# chartmaker_router is now loaded from TrinityAgent above
from Agent_explore.main_app import router as explore_router
from Agent_dataframe_operations.main_app import router as dataframe_operations_router
from Agent_df_validate.main_app import router as df_validate_router
from Agent_insight.main_app import router as workflow_insight_router
from insight import router as insight_router
from STREAMAI.main_app import router as streamai_router
from workflow_mode import workflow_router

# Memory service router - optional, won't crash if unavailable
try:
    from memory_service import router as memory_router
    MEMORY_SERVICE_AVAILABLE = True
except Exception as e:
    logger.warning(f"Memory service unavailable: {e}")
    memory_router = None
    MEMORY_SERVICE_AVAILABLE = False

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
    session_id: Optional[str] = None

app = FastAPI(
    title="Single LLM Atom Detection API",
    description="API endpoint using single LLM for domain checking, query enhancement, and atom extraction",
    version="7.0"
)

# Import TrinityException for global error handling
try:
    from TrinityAgent.BaseAgent.exceptions import TrinityException
except ImportError:
    try:
        from BaseAgent.exceptions import TrinityException
    except ImportError:
        # Fallback: define minimal exception if import fails
        class TrinityException(Exception):
            def __init__(self, message: str, code: str = "INTERNAL_ERROR"):
                self.message = message
                self.code = code
                super().__init__(self.message)

# Global exception handler for TrinityException
from fastapi import Request
from fastapi.responses import JSONResponse

@app.exception_handler(TrinityException)
async def trinity_exception_handler(request: Request, exc: TrinityException):
    """
    Global exception handler for Trinity AI exceptions.
    Ensures consistent JSON error responses across all endpoints.
    """
    logger.error(f"TrinityException: {exc.message} (code: {exc.code})")
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": exc.message,
            "code": exc.code
        }
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
                f"http://{os.getenv('HOST_IP', 'localhost')}:{os.getenv('FASTAPI_PORT', '8001')}/api/concat/perform",
            )
            
            resp = requests.post(concat_url, json=payload, timeout=300)
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
                
                resp = requests.post(create_url, data=payload, timeout=300)
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
            
            resp = requests.post(groupby_url, data=payload, timeout=300)
            resp.raise_for_status()
            result = resp.json()
            
            logger.info(f"GroupBy operation completed: {result}")
            return result
            
        else:
            raise HTTPException(status_code=400, detail=f"Unknown operation: {request.operation}")
            
    except Exception as e:
        logger.error(f"PERFORM OPERATION FAILED: {e}")
        raise HTTPException(status_code=500, detail=f"Operation failed: {str(e)}")

# Enable CORS for browser-based clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Expose the concat and merge agent APIs alongside the chat endpoints
# IMPORTANT: Include agent routers BEFORE the main chat endpoints to avoid routing conflicts
if merge_router is not None:
    api_router.include_router(merge_router, tags=["merge"])
    logger.info("✅ Merge router included in API")
else:
    logger.error("❌ Merge router is None - merge endpoint will not work")

# Include standardized concat router (from TrinityAgent via agent registry)
logger.info("=" * 80)
logger.info("INCLUDING CONCAT ROUTER IN API")
logger.info("=" * 80)
logger.info(f"concat_router value: {concat_router}")
logger.info(f"concat_router is None: {concat_router is None}")
logger.info(f"concat_router type: {type(concat_router) if concat_router else 'N/A'}")

if concat_router is not None:
    try:
        logger.info(f"Concat router is not None: {concat_router is not None}")
        logger.info(f"Concat router type: {type(concat_router)}")
        
        # Check if router has routes before including
        route_count = len(concat_router.routes) if concat_router else 0
        logger.info(f"Concat router has {route_count} routes before inclusion")
        
        if route_count == 0:
            logger.error("❌❌❌ CONCAT ROUTER HAS NO ROUTES - NOT INCLUDING ❌❌❌")
            logger.error("The route decorators may not have executed during import")
        else:
            api_router.include_router(concat_router, tags=["concat"])
            logger.info("✅ Concat router included in API")
            # Log all routes after inclusion
            try:
                route_count_after = len(concat_router.routes)
                logger.info(f"✅ Concat router has {route_count_after} routes after inclusion")
                for route in concat_router.routes:
                    if hasattr(route, 'path') and hasattr(route, 'methods'):
                        logger.info(f"  - {list(route.methods)} {route.path}")
                    elif hasattr(route, 'path'):
                        logger.info(f"  - {route.path}")
            except Exception as e:
                logger.warning(f"Could not log concat routes: {e}")
    except Exception as e:
        logger.error(f"❌ Failed to include concat router: {e}", exc_info=True)
else:
    logger.error("❌ Concat router is None - concat endpoint will not work")
    logger.error("This means the import from Agent_Concat.main_app failed")
if create_transform_router is not None:
    api_router.include_router(create_transform_router, tags=["create_transform"])
    logger.info("✅ CreateTransform router included in API")
else:
    logger.error("❌ CreateTransform router is None - create_transform endpoint will not work")

# Include standardized group_by router (from TrinityAgent via agent registry)
logger.info("=" * 80)
logger.info("INCLUDING GROUPBY ROUTER IN API")
logger.info("=" * 80)
logger.info(f"groupby_router value: {groupby_router}")
logger.info(f"groupby_router is None: {groupby_router is None}")
logger.info(f"groupby_router type: {type(groupby_router) if groupby_router else 'N/A'}")

if groupby_router is not None:
    try:
        logger.info(f"GroupBy router is not None: {groupby_router is not None}")
        logger.info(f"GroupBy router type: {type(groupby_router)}")
        
        # Check if router has routes before including
        route_count = len(groupby_router.routes) if groupby_router else 0
        logger.info(f"GroupBy router has {route_count} routes before inclusion")
        
        if route_count == 0:
            logger.error("❌❌❌ GROUPBY ROUTER HAS NO ROUTES - NOT INCLUDING ❌❌❌")
            logger.error("The route decorators may not have executed during import")
        else:
            api_router.include_router(groupby_router, tags=["group_by"])
            logger.info("✅ GroupBy router included in API")
            # Log all routes after inclusion
            try:
                route_count_after = len(groupby_router.routes)
                logger.info(f"✅ GroupBy router has {route_count_after} routes after inclusion")
                for route in groupby_router.routes:
                    if hasattr(route, 'path') and hasattr(route, 'methods'):
                        logger.info(f"  - {list(route.methods)} {route.path}")
                    elif hasattr(route, 'path'):
                        logger.info(f"  - {route.path}")
            except Exception as e:
                logger.warning(f"Could not log groupby routes: {e}")
    except Exception as e:
        logger.error(f"❌ Failed to include groupby router: {e}", exc_info=True)
else:
    logger.error("❌ GroupBy router is None - groupby endpoint will not work")
    logger.error("This means the import from Agent_GroupBy.main_app failed")

# Include standardized chart_maker router (from TrinityAgent via agent registry)
logger.info("=" * 80)
logger.info("INCLUDING CHARTMAKER ROUTER IN API")
logger.info("=" * 80)
logger.info(f"chartmaker_router value: {chartmaker_router}")
logger.info(f"chartmaker_router is None: {chartmaker_router is None}")
logger.info(f"chartmaker_router type: {type(chartmaker_router) if chartmaker_router else 'N/A'}")

if chartmaker_router is not None:
    try:
        logger.info(f"ChartMaker router is not None: {chartmaker_router is not None}")
        logger.info(f"ChartMaker router type: {type(chartmaker_router)}")
        
        # Check if router has routes before including
        route_count = len(chartmaker_router.routes) if chartmaker_router else 0
        logger.info(f"ChartMaker router has {route_count} routes before inclusion")
        
        if route_count == 0:
            logger.error("❌❌❌ CHARTMAKER ROUTER HAS NO ROUTES - NOT INCLUDING ❌❌❌")
            logger.error("The route decorators may not have executed during import")
        else:
            api_router.include_router(chartmaker_router, tags=["chart_maker"])
            logger.info("✅ ChartMaker router included in API")
            # Log all routes after inclusion
            try:
                route_count_after = len(chartmaker_router.routes)
                logger.info(f"✅ ChartMaker router has {route_count_after} routes after inclusion")
                for route in chartmaker_router.routes:
                    if hasattr(route, 'path') and hasattr(route, 'methods'):
                        logger.info(f"  - {list(route.methods)} {route.path}")
                    elif hasattr(route, 'path'):
                        logger.info(f"  - {route.path}")
            except Exception as e:
                logger.warning(f"Could not log chartmaker routes: {e}")
    except Exception as e:
        logger.error(f"❌ Failed to include chartmaker router: {e}", exc_info=True)
else:
    logger.error("❌ ChartMaker router is None - chartmaker endpoint will not work")
    logger.error("This means the import from TrinityAgent.main_app failed or get_chart_maker_router returned None")

api_router.include_router(explore_router)
api_router.include_router(dataframe_operations_router)
api_router.include_router(df_validate_router)
api_router.include_router(insight_router)
api_router.include_router(workflow_insight_router)
api_router.include_router(workflow_router)
if memory_router is not None:
    api_router.include_router(memory_router)
    logger.info("✅ Memory service router registered")
else:
    logger.warning("⚠️ Memory service router not available - chat persistence disabled")

# Enable CORS for browser-based clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
        
        # Single LLM processing - only for atom detection, no session management needed
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

# Log all registered routes for debugging
logger.info("=" * 80)
logger.info("ALL REGISTERED ROUTES IN APP")
logger.info("=" * 80)
for route in app.routes:
    if hasattr(route, 'path') and hasattr(route, 'methods'):
        logger.info(f"  {list(route.methods)} {route.path}")
    elif hasattr(route, 'path'):
        logger.info(f"  {route.path}")
logger.info("=" * 80)

# Include Trinity AI streaming router
app.include_router(streamai_router)

# =============================================================================
# Initialize Trinity AI WebSocket components
# =============================================================================
try:
    logger.info("🚀 Initializing Trinity AI WebSocket components...")
    
    # Get LLM configuration
    llm_config = get_llm_config()
    
    # Initialize components
    from STREAMAI.result_storage import get_result_storage
    from STREAMAI.stream_rag_engine import get_stream_rag_engine
    from STREAMAI.stream_api import router as stream_ws_router, initialize_stream_ai_components
    
    # Create instances (simplified for WebSocket)
    rag_engine = get_stream_rag_engine()
    result_storage = get_result_storage()
    
    # Create minimal parameter generator for WebSocket orchestrator
    class SimpleParameterGenerator:
        pass
    
    param_gen = SimpleParameterGenerator()
    
    # Initialize the stream_api components
    initialize_stream_ai_components(
        param_gen=param_gen,
        rag=rag_engine
    )
    
    # Include the WebSocket API router
    app.include_router(stream_ws_router)
    
    logger.info("✅ Trinity AI WebSocket components initialized successfully")
    
except Exception as e:
    logger.error(f"❌ Failed to initialize Trinity AI WebSocket components: {e}")
    import traceback
    traceback.print_exc()
    # Continue running without Trinity AI streaming functionality

if __name__ == "__main__":
    # Run the FastAPI application. Using the `app` instance directly
    # avoids import issues when executing the module via `python main_api.py`.
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=int(os.getenv("AI_PORT", 8002)),
        reload=False,
    )