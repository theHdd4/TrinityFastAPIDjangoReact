import os
import sys
import time
import logging
import json
from pathlib import Path

# Ensure current directory is in sys.path for imports (critical for Docker)
_current_dir = Path(__file__).resolve().parent
if str(_current_dir) not in sys.path:
    sys.path.insert(0, str(_current_dir))

import requests
import uvicorn
import asyncio
import importlib
from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any, Tuple, Optional, Iterable, Mapping
import numpy as np
from pymongo import MongoClient
from fastapi.encoders import jsonable_encoder
# Import redis_client with proper fallback for Docker and local environments
try:
    from BaseAgent.redis_client import get_redis_client
except ImportError as e1:
    try:
        from TrinityAgent.BaseAgent.redis_client import get_redis_client
    except ImportError as e2:
        # Fallback for docker image layout - add BaseAgent to path if needed
        backend_root = Path(__file__).resolve().parent
        base_agent_path = backend_root / "BaseAgent"
        redis_client_file = base_agent_path / "redis_client.py"
        
        if base_agent_path.exists() and redis_client_file.exists():
            # Add parent directory to sys.path if not already there
            parent_path = str(backend_root)
            if parent_path not in sys.path:
                sys.path.insert(0, parent_path)
            try:
                from BaseAgent.redis_client import get_redis_client
            except ImportError as e3:
                raise ImportError(
                    f"Failed to import redis_client after adding {parent_path} to sys.path. "
                    f"BaseAgent exists at {base_agent_path}, redis_client.py exists: {redis_client_file.exists()}. "
                    f"Errors: e1={e1}, e2={e2}, e3={e3}"
                ) from e3
        else:
            raise ImportError(
                f"Failed to import redis_client. BaseAgent directory exists: {base_agent_path.exists()}, "
                f"redis_client.py exists: {redis_client_file.exists() if base_agent_path.exists() else False}. "
                f"Current directory: {backend_root}, sys.path: {sys.path[:3]}. "
                f"Errors: e1={e1}, e2={e2}"
            ) from e2

# Import centralized settings
try:
    from BaseAgent.config import settings
except ImportError:
    try:
        from TrinityAgent.BaseAgent.config import settings
    except ImportError:
        # Fallback: create a minimal settings object if import fails
        from BaseAgent.config import Settings
        settings = Settings()

logger = logging.getLogger("trinity.ai")


def get_llm_config() -> Dict[str, str]:
    """Return LLM configuration from centralized settings."""
    return settings.get_llm_config()


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
    # This is expected in microservices deployment where FastAPI backend may not be available
    logger.info(
        "ℹ️ FastAPI backend package unavailable - using local Mongo URI builder from environment variables"
    )

    def _first_non_empty(vars_: Iterable[str], default: str) -> str:
        """Return the first non-empty value from settings or environment variables."""

        for name in vars_:
            # Try settings first, then fallback to os.getenv for backward compatibility
            try:
                value = getattr(settings, name, None)
                if value is not None:
                    value = str(value).strip()
                    if value:
                        return value
            except:
                pass
            
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
        """Construct a MongoDB URI using host information from settings or environment."""

        # Use settings first, fallback to environment variables
        host = settings.MONGO_HOST or settings.HOST_IP or _first_non_empty(host_env_vars, default_host)
        port = settings.MONGO_PORT or _first_non_empty(port_env_vars, default_port)
        auth_db = settings.MONGO_AUTH_SOURCE or settings.MONGO_AUTH_DB or _first_non_empty(auth_source_env_vars, auth_source)

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
try:
    from DataStorageRetrieval.arrow_client import load_env_from_redis
    load_env_from_redis()
except ImportError:
    # This is expected when DataStorageRetrieval module is not available in the container
    # Environment variables will be loaded from .env file or Docker environment instead
    logger.info("ℹ️ DataStorageRetrieval module not available - using environment variables from .env/Docker config")
    # Define a no-op function if DataStorageRetrieval is not available
    def load_env_from_redis():
        pass

# ---------------------------------------------------------------------------
# Redis and Mongo configuration
# ---------------------------------------------------------------------------
redis_client = get_redis_client()

DEFAULT_MONGO_URI = build_host_mongo_uri()
MONGO_URI = (
    settings.CLASSIFY_MONGO_URI
    or settings.MONGO_URI
    or DEFAULT_MONGO_URI
)
# Column classifier configurations are stored in the shared "trinity_db"
# database under the "column_classifier_config" collection.
CONFIG_DB = settings.CONFIG_DB
CONFIG_COLLECTION = settings.CONFIG_COLLECTION

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
    # Use settings first, fallback to os.getenv for backward compatibility
    client = client_override or (settings.CLIENT_NAME if settings.CLIENT_NAME else os.getenv("CLIENT_NAME", ""))
    app = app_override or (settings.APP_NAME if settings.APP_NAME else os.getenv("APP_NAME", ""))
    project = project_override or (settings.PROJECT_NAME if settings.PROJECT_NAME else os.getenv("PROJECT_NAME", ""))
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

                user_id = int(settings.USER_ID or os.getenv("USER_ID", "0"))
                project_id = int(settings.PROJECT_ID or os.getenv("PROJECT_ID", "0"))
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
    os.environ["MINIO_PREFIX"] = prefix  # Keep for backward compatibility
    # Use centralized settings
    config = settings.get_minio_config(prefix=prefix)
    logger.debug("minio config resolved: %s", config)
    return config

# Ensure the Agent_FetchAtom folder is on the Python path so we can import its modules
AGENT_PATH = Path(__file__).resolve().parent / "Agent_FetchAtom"
if AGENT_PATH.exists():
    sys.path.append(str(AGENT_PATH))
# Agent_FetchAtom should exist in TrinityAgent - no fallback needed

# Include other agents so their APIs can be mounted
# All standardized agents are now in TrinityAgent, so paths should be relative to TrinityAgent
# MERGE_PATH = Path(__file__).resolve().parent / "Agent_Merge"  # DISABLED - Using standardized Agent_Merge from TrinityAgent
# CONCAT_PATH = Path(__file__).resolve().parent / "Agent_Concat"  # DISABLED - Using standardized Agent_Concat from TrinityAgent
# CREATE_TRANSFORM_PATH = Path(__file__).resolve().parent / "Agent_CreateTransform"  # DISABLED - Using standardized Agent_CreateTransform from TrinityAgent
# GROUPBY_PATH = Path(__file__).resolve().parent / "Agent_GroupBy"  # DISABLED - Using standardized Agent_GroupBy from TrinityAgent
# CHARTMAKER_PATH = Path(__file__).resolve().parent / "Agent_ChartMaker"  # DISABLED - Using standardized Agent_ChartMaker from TrinityAgent
# EXPLORE_PATH = Path(__file__).resolve().parent / "Agent_Explore"  # Using standardized Agent_Explore from TrinityAgent
# DATAFRAME_OPERATIONS_PATH = Path(__file__).resolve().parent / "Agent_DataFrameOperations"  # DISABLED - Using standardized Agent_DataFrameOperations from TrinityAgent
# DF_VALIDATE_PATH = Path(__file__).resolve().parent / "Agent_DataUploadValidate"  # DISABLED - Using standardized Agent_DataUploadValidate from TrinityAgent

# Import single_llm_processor from Agent_FetchAtom (standardized location)
    try:
        from Agent_FetchAtom.single_llm_processor import SingleLLMProcessor
    except ImportError:
        logger.warning("⚠️ SingleLLMProcessor not available - /chat endpoint will not work")
        SingleLLMProcessor = None
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
    # We're now IN TrinityAgent, so paths are relative to TrinityAgent
    # Other agents are imported directly like: from Agent_Merge.main_app import router
    current_file = Path(__file__).resolve()
    print(f"Current file: {current_file}")
    print(f"BACKEND_ROOT (TrinityAgent): {BACKEND_ROOT}")
    print(f"BACKEND_PARENT: {BACKEND_PARENT}")
    print(f"Current working directory: {Path.cwd()}")
    
    # Strategy 1: Current directory (we're now IN TrinityAgent)
    # main_api.py is now in TrinityAgent, so BACKEND_ROOT is TrinityAgent
    TRINITY_AGENT_PATH = BACKEND_ROOT
    print(f"Strategy 1 (Current dir - we're in TrinityAgent) - TrinityAgent path: {TRINITY_AGENT_PATH}")
    print(f"Strategy 1 - Path exists: {TRINITY_AGENT_PATH.exists()}")
    
    # Strategy 2: Parent directory (if we're in a subdirectory)
    if not TRINITY_AGENT_PATH.exists() or not (TRINITY_AGENT_PATH / "main_app.py").exists():
        TRINITY_AGENT_PATH = BACKEND_PARENT / "TrinityAgent"
        print(f"Strategy 2 (Parent dir) - TrinityAgent path: {TRINITY_AGENT_PATH}")
        print(f"Strategy 2 - Path exists: {TRINITY_AGENT_PATH.exists()}")
    
    # Strategy 3: Environment variable (for Docker/container setups)
    if not TRINITY_AGENT_PATH.exists():
        env_path = os.getenv("TRINITY_AGENT_PATH")  # Not in settings, keep os.getenv for this specific path override
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
        error_msg += f"  - {BACKEND_ROOT} (Current dir - main_api.py is in TrinityAgent)\n"
        error_msg += f"  - {BACKEND_PARENT / 'TrinityAgent'} (Parent dir)\n"
        error_msg += f"  - Environment variable TRINITY_AGENT_PATH: {os.getenv('TRINITY_AGENT_PATH', 'Not set')}\n"
        error_msg += f"Current file: {current_file}\n"
        error_msg += f"BACKEND_ROOT: {BACKEND_ROOT}\n"
        error_msg += f"BACKEND_PARENT: {BACKEND_PARENT}\n"
        error_msg += f"Current working directory: {Path.cwd()}\n"
        error_msg += f"\nmain_api.py is now in TrinityAgent, so TrinityAgent should be at: {BACKEND_ROOT}"
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
        # Import like other agents: from main_app import ...
        # We're now IN TrinityAgent, so we can import directly
        print("Attempting import: from main_app import get_concat_router, get_merge_router, get_create_transform_router, get_group_by_router, get_chart_maker_router, get_dataframe_operations_router...")
        from main_app import get_concat_router, get_merge_router, get_create_transform_router, get_group_by_router, get_chart_maker_router, get_dataframe_operations_router, get_data_upload_validate_router, get_fetch_atom_router, initialize_trinity_agent
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
        
        # Get dataframe_operations router using the connection interface
        print("Getting dataframe_operations router from TrinityAgent...")
        dataframe_operations_router = get_dataframe_operations_router()
        
        if dataframe_operations_router:
            print("✅✅✅ DATAFRAME OPERATIONS ROUTER RETRIEVED FROM TRINITY AGENT ✅✅✅")
            print(f"✅ DataFrameOperations router type: {type(dataframe_operations_router)}")
            route_count = len(dataframe_operations_router.routes)
            print(f"✅ DataFrameOperations router has {route_count} routes")
            for route in dataframe_operations_router.routes:
                if hasattr(route, 'path') and hasattr(route, 'methods'):
                    print(f"  - {list(route.methods)} {route.path}")
                elif hasattr(route, 'path'):
                    print(f"  - {route.path}")
        else:
            # Try one more time after a brief delay to allow registration
            print("Retrying DataFrameOperations router retrieval...")
            # Ensure Agent_DataFrameOperations is imported so it can register itself
            try:
                import Agent_DataFrameOperations.main_app
                print("✅ Imported Agent_DataFrameOperations.main_app for registration")
                # Give it a moment to register
                import time
                time.sleep(0.3)  # Increased delay for registration
                dataframe_operations_router = get_dataframe_operations_router()
                if dataframe_operations_router:
                    print("✅✅✅ DATAFRAME OPERATIONS ROUTER RETRIEVED FROM TRINITY AGENT ✅✅✅")
                    print(f"✅ DataFrameOperations router type: {type(dataframe_operations_router)}")
                    route_count = len(dataframe_operations_router.routes)
                    print(f"✅ DataFrameOperations router has {route_count} routes")
                    for route in dataframe_operations_router.routes:
                        if hasattr(route, 'path') and hasattr(route, 'methods'):
                            print(f"  - {list(route.methods)} {route.path}")
                        elif hasattr(route, 'path'):
                            print(f"  - {route.path}")
                else:
                    print("⚠️ DataFrameOperations router still None after retry (may register later)")
                    logger.warning("⚠️ DataFrameOperations router is None - dataframe_operations endpoint may not work")
            except Exception as e:
                print(f"⚠️ Could not import Agent_DataFrameOperations.main_app: {e}")
                logger.warning("⚠️ DataFrameOperations router is None - dataframe_operations endpoint may not work")
        
        # Get data_upload_validate router using the connection interface
        print("Getting data_upload_validate router from TrinityAgent...")
        data_upload_validate_router = get_data_upload_validate_router()
        
        # Get fetch_atom router using the connection interface
        print("Getting fetch_atom router from TrinityAgent...")
        fetch_atom_router = get_fetch_atom_router()
        
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
            from main_app import get_concat_router, get_merge_router, get_create_transform_router, get_group_by_router, get_chart_maker_router, get_dataframe_operations_router, get_data_upload_validate_router, get_fetch_atom_router, initialize_trinity_agent
            print("✅ Fallback import successful")
            init_results = initialize_trinity_agent()
            concat_router = get_concat_router()
            merge_router = get_merge_router()
            create_transform_router = get_create_transform_router()
            groupby_router = get_group_by_router()
            chartmaker_router = get_chart_maker_router()
            dataframe_operations_router = get_dataframe_operations_router()
            data_upload_validate_router = get_data_upload_validate_router()
            fetch_atom_router = get_fetch_atom_router()
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
    dataframe_operations_router = None
    data_upload_validate_router = None
    fetch_atom_router = None
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
# Import Explore router from standardized Agent_Explore
try:
    from Agent_Explore.main_app import router as explore_router
except ImportError:
    try:
        # Use get_explore_router from main_app connection interface
        from main_app import get_explore_router
        explore_router = get_explore_router()
        if explore_router is None:
            logger.warning("⚠️ Explore router not available via get_explore_router")
    except ImportError:
        logger.error("❌ Failed to import explore router")
        explore_router = None

# Import Correlation router from standardized Agent_Correlation
try:
    from Agent_Correlation.main_app import router as correlation_router
    logger.info("✅ Correlation router imported successfully")
except ImportError:
    logger.warning("⚠️ Correlation router not available")
    correlation_router = None

# dataframe_operations_router is now loaded from TrinityAgent below
# df_validate_router is now loaded from TrinityAgent below (as data_upload_validate_router)
df_validate_router = None  # Will be set from standardized agent below

# Import Insight router from standardized Agent_Insight
try:
    from Agent_Insight.main_app import router as workflow_insight_router
except ImportError:
    logger.warning("⚠️ Workflow insight router not available")
    workflow_insight_router = None

# Import insight router from TrinityAgent
insight_router = None
try:
    from insight import router as insight_router
    if insight_router:
        logger.info("✅ Insight router imported successfully")
    else:
        logger.warning("⚠️ Insight router is None after import")
except ImportError as e:
    logger.warning(f"⚠️ Insight router not available: {e}")
    insight_router = None
except Exception as e:
    logger.error(f"❌ Error importing insight router: {e}")
    insight_router = None
# Import StreamAI from STREAMAI (we're now in TrinityAgent)
from STREAMAI.main_app import router as streamai_router
logger.info("✅ Imported StreamAI (uses standardized /trinityai/fetch-atom endpoint)")
# Import workflow_mode (we're now in TrinityAgent)
from workflow_mode import workflow_router
logger.info("✅ Imported workflow_mode")

# Memory service router - optional, won't crash if unavailable
# Import from memory_service (we're now in TrinityAgent)
try:
    from memory_service import router as memory_router
    MEMORY_SERVICE_AVAILABLE = True
    logger.info("✅ Imported memory_service")
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
        if SingleLLMProcessor is None:
            logger.warning("⚠️ SingleLLMProcessor not available")
            return None
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

# =============================================================================
# Initialize BaseAgent Registry and Auto-Discover Agents
# =============================================================================
from BaseAgent.registry import registry
logger.info("✅ Imported BaseAgent registry")

# Auto-discover and register agents on startup
@app.on_event("startup")
async def initialize_agent_registry():
    """
    Initialize agent registry, auto-discover all agents, and sync to PostgreSQL.
    This runs on every startup to ensure agents are registered in PostgreSQL.
    """
    if registry is None:
        logger.warning("⚠️ Registry not available - skipping agent auto-discovery")
        return
    
    try:
        logger.info("=" * 80)
        logger.info("🔍 INITIALIZING AGENT REGISTRY AND AUTO-DISCOVERY")
        logger.info("=" * 80)
        
        # Get the TrinityAgent directory path (where main_api.py is located)
        trinity_agent_path = Path(__file__).resolve().parent
        
        # Auto-discover agents
        # The auto_discover method will look for Agent_* directories in this path
        registry.auto_discover(str(trinity_agent_path))
        
        # Also try to manually register agents that might have been initialized
        # This helps catch agents that were initialized before auto-discovery
        agent_modules = [
            ("Agent_Merge", "merge_agent"),
            ("Agent_Concat", "concat_agent"),
            ("Agent_GroupBy", "groupby_agent"),
            ("Agent_ChartMaker", "chartmaker_agent"),
            ("Agent_CreateTransform", "create_transform_agent"),
            ("Agent_DataFrameOperations", "dataframe_operations_agent"),
            ("Agent_DataUploadValidate", "data_upload_validate_agent"),
            ("Agent_Explore", "explore_agent"),
            ("Agent_FetchAtom", "fetch_atom_agent"),
        ]
        
        for module_name, var_name in agent_modules:
            try:
                module = importlib.import_module(f"{module_name}.main_app")
                agent_instance = getattr(module, "agent", None)
                if agent_instance is not None and hasattr(agent_instance, 'name'):
                    registry.register(agent_instance)
                    logger.info(f"Manually registered: {agent_instance.name}")
            except Exception as e:
                logger.debug(f"Could not register {module_name}: {e}")
        
        # List all registered agents
        agents = registry.list_agents()
        logger.info(f"✅ Registered {len(agents)} agents:")
        for name, description in agents.items():
            logger.info(f"  - {name}: {description}")
        
        # Sync agents to PostgreSQL on startup
        # NOTE: This is the PRIMARY sync location for trinity-ai service.
        # The background thread sync in agent_registry.py is disabled to avoid duplicate syncs.
        # Django management command sync_agents_to_postgres can be used for manual syncs.
        logger.info("=" * 80)
        logger.info("🔄 SYNCING AGENTS TO POSTGRESQL (STARTUP)")
        logger.info("=" * 80)
        
        try:
            # Import sync function
            from agent_registry import sync_registry_to_postgres
            from BaseAgent.agent_registry_db import get_host_ip_address
            
            # Get host IP
            host_ip = get_host_ip_address()
            logger.info(f"Detected host IP: {host_ip}")
            
            # Get all routers from agent registry
            from agent_registry import get_all_routers
            agent_routers = get_all_routers()
            
            if agent_routers:
                # Sync all agents to PostgreSQL
                sync_results = await sync_registry_to_postgres(host_ip=host_ip)
                
                success_count = sum(1 for v in sync_results.values() if v)
                total_count = len(sync_results)
                
                if success_count == total_count and total_count > 0:
                    sync_msg = f"✅✅✅ All {success_count} agents synced to PostgreSQL on startup (host_ip: {host_ip}) ✅✅✅"
                    print(sync_msg)
                    logger.info(sync_msg)
                elif success_count > 0:
                    sync_msg = f"⚠️ Only {success_count}/{total_count} agents synced to PostgreSQL on startup (host_ip: {host_ip})"
                    print(sync_msg)
                    logger.warning(sync_msg)
                else:
                    sync_msg = f"⚠️ Failed to sync any agents to PostgreSQL on startup (host_ip: {host_ip})"
                    print(sync_msg)
                    logger.warning(sync_msg)
            else:
                logger.warning("⚠️ No agent routers found to sync to PostgreSQL")
                
        except ImportError as e:
            logger.warning(f"⚠️ Could not import sync functions: {e}")
        except Exception as e:
            logger.error(f"❌ Error syncing agents to PostgreSQL on startup: {e}", exc_info=True)
        
        logger.info("=" * 80)
        logger.info("✅ AGENT REGISTRY INITIALIZATION COMPLETE")
        logger.info("=" * 80)
    except Exception as e:
        logger.error(f"❌ Failed to initialize agent registry: {e}", exc_info=True)

# Import TrinityException for global error handling
from BaseAgent.exceptions import TrinityException

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

# =============================================================================
# Unified Agent Executor (Phase 1: Standardization)
# Uses registry to execute agents dynamically without hardcoded if/else logic
# =============================================================================
class AgentExecuteRequest(BaseModel):
    """Request model for unified agent execution."""
    agent_name: str  # e.g., "merge", "concat", "groupby"
    prompt: str
    session_id: Optional[str] = None
    client_name: str = ""
    app_name: str = ""
    project_name: str = ""
    chat_id: Optional[str] = None  # Optional chat_id for Redis cache isolation

@api_router.post("/agent/execute")
async def execute_agent(request: AgentExecuteRequest) -> Dict[str, Any]:
    """
    Unified agent execution endpoint using registry.
    Replaces hardcoded if/else logic with dynamic agent lookup.
    """
    logger.info(f"📥 Received agent execution request: agent_name={request.agent_name}, prompt_length={len(request.prompt)}")
    
    if registry is None:
        logger.error("❌ Agent registry not available")
        raise HTTPException(
            status_code=500,
            detail="Agent registry not available"
        )
    
    # Get agent from registry
    agent = registry.get(request.agent_name)
    if agent is None:
        available_agents = list(registry.list_agents().keys())
        logger.error(f"❌ Agent '{request.agent_name}' not found. Available: {available_agents}")
        raise HTTPException(
            status_code=404,
            detail=f"Agent '{request.agent_name}' not found. Available agents: {available_agents}"
        )
    
    logger.info(f"✅ Found agent '{request.agent_name}' in registry")
    
    try:
        # Import AgentContext
        from BaseAgent.interfaces import AgentContext
        
        # Create context
        context = AgentContext(
            session_id=request.session_id or f"session_{int(time.time())}",
            user_prompt=request.prompt,
            client_name=request.client_name,
            app_name=request.app_name,
            project_name=request.project_name
        )
        
        # Execute agent using standard interface
        result = agent.execute(context)
        
        # Convert AgentResult to dict for JSON response
        return {
            "success": result.success,
            "data": result.data,
            "message": result.message,
            "error": result.error,
            "artifacts": result.artifacts,
            "session_id": result.session_id,
            "processing_time": result.processing_time
        }
    except Exception as e:
        logger.error(f"Error executing agent {request.agent_name}: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Agent execution failed: {str(e)}"
        )

@api_router.get("/agent/list")
async def list_agents() -> Dict[str, Any]:
    """
    List all registered agents and their descriptions.
    Useful for LLM planner to know which agents are available.
    """
    if registry is None:
        return {
            "success": False,
            "error": "Agent registry not available",
            "agents": {}
        }
    
    agents = registry.list_agents()
    return {
        "success": True,
        "count": len(agents),
        "agents": agents
    }

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
                f"http://{settings.HOST_IP}:{settings.FASTAPI_PORT}/api/concat/perform",
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
                    f"http://{settings.HOST_IP}:{settings.FASTAPI_PORT}/api/create/perform",
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
                f"http://{settings.HOST_IP}:{settings.FASTAPI_PORT}/api/groupby/run",
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

# Include standardized dataframe_operations router (from TrinityAgent via agent registry)
# Router should already be initialized above, but ensure it's set if not
try:
    # Check if router was already initialized above
    if dataframe_operations_router is None:
        logger.info("=" * 80)
        logger.info("GETTING DATAFRAME OPERATIONS ROUTER FROM TRINITY AGENT")
        logger.info("=" * 80)
        try:
            dataframe_operations_router = get_dataframe_operations_router()
        except NameError:
            logger.warning("⚠️ get_dataframe_operations_router not available")
            dataframe_operations_router = None
        except Exception as e:
            logger.error(f"❌ Failed to get dataframe_operations router: {e}", exc_info=True)
            dataframe_operations_router = None
except NameError:
    # Variable doesn't exist yet, initialize it
    logger.info("=" * 80)
    logger.info("GETTING DATAFRAME OPERATIONS ROUTER FROM TRINITY AGENT")
    logger.info("=" * 80)
    try:
        dataframe_operations_router = get_dataframe_operations_router()
    except NameError:
        logger.warning("⚠️ get_dataframe_operations_router not available")
        dataframe_operations_router = None
    except Exception as e:
        logger.error(f"❌ Failed to get dataframe_operations router: {e}", exc_info=True)
        dataframe_operations_router = None

logger.info("=" * 80)
logger.info("INCLUDING DATAFRAME OPERATIONS ROUTER IN API")
logger.info("=" * 80)
logger.info(f"dataframe_operations_router value: {dataframe_operations_router}")
logger.info(f"dataframe_operations_router is None: {dataframe_operations_router is None}")
logger.info(f"dataframe_operations_router type: {type(dataframe_operations_router) if dataframe_operations_router else 'N/A'}")

if dataframe_operations_router is not None:
    try:
        logger.info(f"DataFrameOperations router is not None: {dataframe_operations_router is not None}")
        logger.info(f"DataFrameOperations router type: {type(dataframe_operations_router)}")
        
        # Check route count before inclusion
        route_count = len(dataframe_operations_router.routes) if dataframe_operations_router else 0
        logger.info(f"DataFrameOperations router has {route_count} routes before inclusion")
        
        if route_count == 0:
            logger.error("❌❌❌ DATAFRAME OPERATIONS ROUTER HAS NO ROUTES - NOT INCLUDING ❌❌❌")
            logger.error("The route decorators may not have executed during import")
        else:
            api_router.include_router(dataframe_operations_router, tags=["dataframe_operations"])
            logger.info("✅ DataFrameOperations router included in API")
            try:
                route_count_after = len(dataframe_operations_router.routes)
                logger.info(f"✅ DataFrameOperations router has {route_count_after} routes after inclusion")
                for route in dataframe_operations_router.routes:
                    if hasattr(route, 'path') and hasattr(route.path, 'methods'):
                        logger.info(f"  - {list(route.methods)} {route.path}")
                    elif hasattr(route, 'path'):
                        logger.info(f"  - {route.path}")
            except Exception as e:
                logger.warning(f"Could not log dataframe_operations routes: {e}")
    except Exception as e:
        logger.error(f"❌ Failed to include dataframe_operations router: {e}", exc_info=True)
else:
    # Router might register later during module import - check one more time
    # This is expected during initialization, so log at debug level
    logger.debug("DataFrameOperations router is None at initial check - this is normal during initialization")
    logger.info("Attempting to register DataFrameOperations router...")
    # Fallback: Try to import and register directly
    try:
        logger.info("Attempting direct import of Agent_DataFrameOperations.main_app...")
        # Force import to trigger registration
        import Agent_DataFrameOperations.main_app
        import time
        time.sleep(0.1)  # Give it time to register
        
        # Try getting from agent registry after import
        try:
            from agent_registry import get_agent_router
            dataframe_operations_router = get_agent_router("dataframe_operations")
            if dataframe_operations_router:
                logger.info("✅ Retrieved DataFrameOperations router from registry after direct import")
        except Exception as reg_err:
            logger.warning(f"⚠️ Could not get router from registry: {reg_err}")
        
        # Also try getting router directly from the module
        if dataframe_operations_router is None and hasattr(Agent_DataFrameOperations.main_app, 'router'):
            dataframe_operations_router = Agent_DataFrameOperations.main_app.router
            logger.info("✅ Retrieved DataFrameOperations router directly from main_app")
    except Exception as fallback_err:
        logger.warning(f"⚠️ Direct import fallback also failed: {fallback_err}")
        # Last resort: try old path
        try:
            from Agent_dataframe_operations.main_app import router as dataframe_operations_router_fallback
            logger.warning("⚠️ Using fallback dataframe_operations router from old Agent_dataframe_operations")
            dataframe_operations_router = dataframe_operations_router_fallback
        except ImportError:
            logger.warning("⚠️ Fallback dataframe_operations router also not available")
    
    # If fallback router was set, include it
    if dataframe_operations_router is not None:
        try:
            route_count = len(dataframe_operations_router.routes) if dataframe_operations_router else 0
            if route_count > 0:
                api_router.include_router(dataframe_operations_router, tags=["dataframe_operations"])
                logger.info("✅ DataFrameOperations fallback router included in API")
            else:
                logger.warning("⚠️ DataFrameOperations router has no routes, not including")
        except Exception as e:
            logger.error(f"❌ Failed to include fallback dataframe_operations router: {e}")
        try:
            route_count = len(dataframe_operations_router.routes) if dataframe_operations_router else 0
            if route_count > 0:
                api_router.include_router(dataframe_operations_router, tags=["dataframe_operations"])
                logger.info("✅ DataFrameOperations fallback router included in API")
        except Exception as e:
            logger.error(f"❌ Failed to include fallback dataframe_operations router: {e}")

if explore_router is not None:
    api_router.include_router(explore_router)
    logger.info("✅ Explore router included in API")
else:
    logger.warning("⚠️ Explore router is None - explore endpoint will not work")

# Include Correlation router
if correlation_router is not None:
    api_router.include_router(correlation_router)
    logger.info("✅ Correlation router included in API")
else:
    logger.warning("⚠️ Correlation router is None - correlation endpoint will not work")

# Include standardized data_upload_validate router (from TrinityAgent via agent registry)
# Router should already be initialized above, but ensure it's set if not
try:
    # Check if router was already initialized above
    if data_upload_validate_router is None:
        logger.info("=" * 80)
        logger.info("GETTING DATA UPLOAD VALIDATE ROUTER FROM TRINITY AGENT")
        logger.info("=" * 80)
        try:
            data_upload_validate_router = get_data_upload_validate_router()
        except NameError:
            logger.warning("⚠️ get_data_upload_validate_router not available")
            data_upload_validate_router = None
        except Exception as e:
            logger.error(f"❌ Failed to get data_upload_validate router: {e}", exc_info=True)
            data_upload_validate_router = None
except NameError:
    # Variable doesn't exist yet, initialize it
    logger.info("=" * 80)
    logger.info("GETTING DATA UPLOAD VALIDATE ROUTER FROM TRINITY AGENT")
    logger.info("=" * 80)
    try:
        data_upload_validate_router = get_data_upload_validate_router()
    except NameError:
        logger.warning("⚠️ get_data_upload_validate_router not available")
        data_upload_validate_router = None
    except Exception as e:
        logger.error(f"❌ Failed to get data_upload_validate router: {e}", exc_info=True)
        data_upload_validate_router = None

if data_upload_validate_router is not None:
    try:
        logger.info(f"DataUploadValidate router is not None: {data_upload_validate_router is not None}")
        logger.info(f"DataUploadValidate router type: {type(data_upload_validate_router)}")
        
        route_count = len(data_upload_validate_router.routes) if data_upload_validate_router else 0
        logger.info(f"DataUploadValidate router has {route_count} routes before inclusion")

        if route_count == 0:
            logger.error("❌❌❌ DATA UPLOAD VALIDATE ROUTER HAS NO ROUTES - NOT INCLUDING ❌❌❌")
            logger.error("The route decorators may not have executed during import")
        else:
            api_router.include_router(data_upload_validate_router, tags=["data_upload_validate"])
            logger.info("✅ DataUploadValidate router included in API")
            try:
                route_count_after = len(data_upload_validate_router.routes)
                logger.info(f"✅ DataUploadValidate router has {route_count_after} routes after inclusion")
                for route in data_upload_validate_router.routes:
                    if hasattr(route, 'path') and hasattr(route.path, 'methods'):
                        logger.info(f"  - {list(route.methods)} {route.path}")
                    elif hasattr(route, 'path'):
                        logger.info(f"  - {route.path}")
            except Exception as e:
                logger.warning(f"Could not log data_upload_validate routes: {e}")
    except Exception as e:
        logger.error(f"❌ Failed to include data_upload_validate router: {e}", exc_info=True)
else:
    logger.error("❌ DataUploadValidate router is None - data_upload_validate endpoint will not work")
    logger.error("This means the import from TrinityAgent.main_app failed or get_data_upload_validate_router returned None")

# Include standardized fetch_atom router (from TrinityAgent via agent registry)
# Ensure fetch_atom_router is defined (it should be initialized above, but handle case where it's not)
if 'fetch_atom_router' not in globals():
    fetch_atom_router = None

# Router should already be initialized above, but ensure it's set if not
if fetch_atom_router is None:
    logger.info("=" * 80)
    logger.info("GETTING FETCH ATOM ROUTER FROM TRINITY AGENT")
    logger.info("=" * 80)
    try:
        fetch_atom_router = get_fetch_atom_router()
    except NameError:
        logger.warning("⚠️ get_fetch_atom_router not available")
        fetch_atom_router = None
    except Exception as e:
        logger.error(f"❌ Failed to get fetch_atom router: {e}", exc_info=True)
        fetch_atom_router = None

if fetch_atom_router is not None:
    try:
        route_count = len(fetch_atom_router.routes) if fetch_atom_router else 0
        logger.info(f"FetchAtom router has {route_count} routes before inclusion")

        if route_count == 0:
            logger.error("❌❌❌ FETCH ATOM ROUTER HAS NO ROUTES - NOT INCLUDING ❌❌❌")
            logger.error("The route decorators may not have executed during import")
        else:
            api_router.include_router(fetch_atom_router, tags=["fetch_atom"])
            logger.info("✅ FetchAtom router included in API")
            try:
                route_count_after = len(fetch_atom_router.routes)
                logger.info(f"✅ FetchAtom router has {route_count_after} routes after inclusion")
                for route in fetch_atom_router.routes:
                    if hasattr(route, 'path') and hasattr(route.path, 'methods'):
                        logger.info(f"  - {list(route.methods)} {route.path}")
                    elif hasattr(route, 'path'):
                        logger.info(f"  - {route.path}")
            except Exception as e:
                logger.warning(f"Could not log fetch_atom routes: {e}")
    except Exception as e:
        logger.error(f"❌ Failed to include fetch_atom router: {e}", exc_info=True)
else:
    logger.error("❌ FetchAtom router is None - fetch_atom endpoint will not work")
    logger.error("This means the import from TrinityAgent.main_app failed or get_fetch_atom_router returned None")
    # Try one more time to get the router
    try:
        logger.info("Attempting final retry to get fetch_atom router...")
        fetch_atom_router = get_fetch_atom_router()
        if fetch_atom_router is not None:
            route_count = len(fetch_atom_router.routes) if fetch_atom_router else 0
            if route_count > 0:
                api_router.include_router(fetch_atom_router, tags=["fetch_atom"])
                logger.info("✅ FetchAtom router retrieved and included on final retry")
            else:
                logger.warning("⚠️ FetchAtom router has no routes, not including")
        else:
            logger.error("❌ FetchAtom router still None after final retry")
    except Exception as e:
        logger.error(f"❌ Final retry to get fetch_atom router failed: {e}")

# Use standardized data_upload_validate_router as df_validate_router (for backward compatibility)
if df_validate_router is None and 'data_upload_validate_router' in globals() and data_upload_validate_router is not None:
    df_validate_router = data_upload_validate_router
    logger.info("✅ Using standardized data_upload_validate_router as df_validate_router")

if df_validate_router is not None:
    api_router.include_router(df_validate_router)
    logger.info("✅ df_validate_router included in API")
else:
    logger.warning("⚠️ df_validate_router is None - df_validate endpoint will not work")
if insight_router is not None:
    try:
        api_router.include_router(insight_router)
        logger.info("✅ Insight router included in API")
        logger.info(f"Insight router has {len(insight_router.routes)} routes")
    except Exception as e:
        logger.error(f"❌ Failed to include insight router: {e}")
else:
    logger.warning("⚠️ Insight router is None - insight endpoint will not work")
    # Try to import directly as fallback
    try:
        from insight import router as insight_router_fallback
        if insight_router_fallback:
            api_router.include_router(insight_router_fallback)
            logger.info("✅ Insight router included via fallback import")
            insight_router = insight_router_fallback
    except Exception as e:
        logger.warning(f"⚠️ Insight router fallback also failed: {e}")

if workflow_insight_router is not None:
    api_router.include_router(workflow_insight_router)
    logger.info("✅ Workflow insight router included in API")
else:
    logger.warning("⚠️ Workflow insight router is None - workflow insight endpoint will not work")
api_router.include_router(workflow_router)
if memory_router is not None:
    api_router.include_router(memory_router)
    logger.info("✅ Memory service router registered")
else:
    logger.warning("⚠️ Memory service router not available - chat persistence disabled")

# Include STREAMAI HTTP router (for /streamai/chat endpoint)
# Note: Will be included later with WebSocket router to avoid duplicates
# (Moved to WebSocket initialization section to prevent duplicate inclusion)

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

# Final check: Try to get DataFrameOperations router one more time after all imports
# This handles the case where the router registers during module import (lazy registration)
if dataframe_operations_router is None:
    try:
        logger.info("Final check: Attempting to retrieve DataFrameOperations router after all imports...")
        import time
        time.sleep(0.3)  # Brief delay for any pending registrations
        dataframe_operations_router = get_dataframe_operations_router()
        if dataframe_operations_router:
            # Router found - include it now
            try:
                route_count = len(dataframe_operations_router.routes) if dataframe_operations_router else 0
                if route_count > 0:
                    api_router.include_router(dataframe_operations_router, tags=["dataframe_operations"])
                    logger.info(f"✅ DataFrameOperations router found and included on final check ({route_count} routes)")
                else:
                    logger.debug("⚠️ DataFrameOperations router has no routes")
            except Exception as e:
                logger.debug(f"⚠️ Could not include DataFrameOperations router on final check: {e}")
        else:
            # Try direct import as last resort
            try:
                import Agent_DataFrameOperations.main_app
                if hasattr(Agent_DataFrameOperations.main_app, 'router'):
                    dataframe_operations_router = Agent_DataFrameOperations.main_app.router
                    route_count = len(dataframe_operations_router.routes) if dataframe_operations_router else 0
                    if route_count > 0:
                        api_router.include_router(dataframe_operations_router, tags=["dataframe_operations"])
                        logger.info(f"✅ DataFrameOperations router included via direct import on final check ({route_count} routes)")
            except Exception as e:
                logger.debug(f"Final DataFrameOperations router check failed: {e} (router may register on first request)")
    except Exception as e:
        logger.debug(f"Final DataFrameOperations router check error: {e} (non-critical - router may register lazily)")

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

# Note: STREAMAI HTTP router will be included with WebSocket router below
# to avoid duplicate registrations

# =============================================================================
# Initialize Trinity AI WebSocket components
# =============================================================================
try:
    logger.info("🚀 Initializing Trinity AI WebSocket components...")
    
    # Get LLM configuration
    llm_config = get_llm_config()
    
    # Initialize components from STREAMAI (we're now in TrinityAgent)
    from STREAMAI.result_storage import get_result_storage
    from STREAMAI.stream_rag_engine import get_stream_rag_engine
    from STREAMAI.stream_api import router as stream_ws_router, initialize_stream_ai_components
    logger.info("✅ Imported StreamAI components")
    
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
    logger.info("✅ Trinity AI WebSocket router included")
    
    # Include the HTTP API router (for /streamai/chat endpoint) - ONLY ONCE
    # Check if already included to prevent duplicates
    if 'streamai_router' in globals() and streamai_router is not None:
        # Check if router is already included
        router_paths = [route.path for route in app.routes if hasattr(route, 'path')]
        if '/streamai/chat' not in router_paths:
            app.include_router(streamai_router)
            logger.info("✅ Trinity AI HTTP router included (POST /streamai/chat)")
        else:
            logger.info("ℹ️ Trinity AI HTTP router already included, skipping duplicate")
    else:
        try:
            from STREAMAI.main_app import router as stream_http_router
            router_paths = [route.path for route in app.routes if hasattr(route, 'path')]
            if '/streamai/chat' not in router_paths:
                app.include_router(stream_http_router)
                logger.info("✅ Trinity AI HTTP router included via direct import (POST /streamai/chat)")
            else:
                logger.info("ℹ️ Trinity AI HTTP router already included, skipping duplicate")
        except ImportError as e:
            logger.warning(f"⚠️ Could not import STREAMAI HTTP router: {e}")
        except Exception as e:
            logger.error(f"❌ Error including STREAMAI HTTP router: {e}")
    
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
        port=settings.AI_PORT,
        reload=False,
    )