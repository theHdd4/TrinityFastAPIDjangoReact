"""
Standardized Agent Registry for Trinity AI
Registers all agents and provides a unified way to access their routers.
This is the standard way to connect all atoms/agents.

Features:
- Auto-discovery of Agent_* directories
- Router-based registration (for FastAPI integration)
- Manual registration fallback for custom agents
"""

import logging
import sys
import importlib
import re
import asyncio
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Dict, Optional, Any, List
from fastapi import APIRouter

logger = logging.getLogger("trinity.agent_registry")

# Import PostgreSQL database functions
try:
    from BaseAgent.agent_registry_db import (
        save_agent_to_postgres,
        create_trinity_v1_agents_table,
        sync_all_agents_to_postgres,
        get_agent_from_postgres,
        get_all_agents_from_postgres,
    )
    POSTGRES_AVAILABLE = True
except ImportError:
    # Try absolute import as fallback
    try:
        from TrinityAgent.BaseAgent.agent_registry_db import (
            save_agent_to_postgres,
            create_trinity_v1_agents_table,
            sync_all_agents_to_postgres,
            get_agent_from_postgres,
            get_all_agents_from_postgres,
        )
        POSTGRES_AVAILABLE = True
    except ImportError as e:
        logger.warning(f"PostgreSQL agent registry not available: {e}")
        POSTGRES_AVAILABLE = False

# Registry to store all agent routers
_agent_routers: Dict[str, APIRouter] = {}

# Agent metadata for PostgreSQL storage
_agent_metadata: Dict[str, Dict[str, Any]] = {}

# Thread pool executor for running async code from sync context
_postgres_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="agent_postgres_sync")

# Track sync status
_sync_status: Dict[str, bool] = {}


def _save_agent_to_postgres_with_retry(
    agent_name: str,
    router: APIRouter,
    name: Optional[str] = None,
    description: Optional[str] = None,
    category: Optional[str] = None,
    tags: Optional[List[str]] = None,
    max_retries: int = 3
) -> bool:
    """
    Save agent to PostgreSQL with retry logic.
    Uses thread pool executor to run async code from sync context.
    
    Returns:
        True if saved successfully, False otherwise
    """
    if not POSTGRES_AVAILABLE:
        logger.debug(f"PostgreSQL not available, skipping save for '{agent_name}'")
        return False
    
    # Get metadata from cache or use defaults
    metadata = _agent_metadata.get(agent_name, {})
    agent_name_display = name or metadata.get('name', agent_name.replace('_', ' ').title())
    agent_description = description or metadata.get('description', f"Agent: {agent_name}")
    agent_category = category or metadata.get('category')
    agent_tags = tags or metadata.get('tags', [])
    
    async def _save_async():
        """Inner async function to save agent"""
        try:
            # Ensure table exists first
            await create_trinity_v1_agents_table()
            
            # Save agent
            success = await save_agent_to_postgres(
                agent_id=agent_name,
                name=agent_name_display,
                description=agent_description,
                router=router,
                category=agent_category,
                tags=agent_tags
            )
            return success
        except Exception as e:
            logger.error(f"Error in async save for '{agent_name}': {e}", exc_info=True)
            return False
    
    # Try with retry logic (only if asyncpg is available)
    if not POSTGRES_AVAILABLE:
        return False
        
    for attempt in range(max_retries):
        try:
            # Use thread pool executor to run async code
            future = _postgres_executor.submit(asyncio.run, _save_async())
            success = future.result(timeout=5)  # Reduced timeout to 5 seconds
            
            if success:
                _sync_status[agent_name] = True
                logger.info(f"✅ Successfully saved agent '{agent_name}' to PostgreSQL")
                return True
            else:
                if attempt < max_retries - 1:
                    wait_time = 1  # Shorter wait time
                    logger.debug(f"⚠️ Failed to save '{agent_name}' (attempt {attempt + 1}/{max_retries}), retrying in {wait_time}s...")
                    threading.Event().wait(wait_time)
                else:
                    logger.debug(f"⚠️ Failed to save agent '{agent_name}' to PostgreSQL after {max_retries} attempts. "
                               f"Will be synced via Django management command.")
                    _sync_status[agent_name] = False
                    return False
                    
        except TimeoutError:
            # Timeout is not critical - agents will be synced via Django management command
            logger.debug(f"⚠️ Timeout saving '{agent_name}' to PostgreSQL (attempt {attempt + 1}/{max_retries}). "
                        f"Will be synced via Django management command.")
            if attempt < max_retries - 1:
                threading.Event().wait(1)
            else:
                _sync_status[agent_name] = False
                return False
        except Exception as e:
            # Log but don't fail - agents will be synced via Django management command
            if attempt < max_retries - 1:
                wait_time = 1
                logger.debug(f"⚠️ Exception saving '{agent_name}' (attempt {attempt + 1}/{max_retries}): {e}, retrying in {wait_time}s...")
                threading.Event().wait(wait_time)
            else:
                logger.debug(f"⚠️ Failed to save agent '{agent_name}' to PostgreSQL: {e}. "
                           f"Will be synced via Django management command.")
                _sync_status[agent_name] = False
                return False
    
    return False


def _save_agent_to_postgres_async(
    agent_name: str,
    router: APIRouter,
    name: Optional[str] = None,
    description: Optional[str] = None,
    category: Optional[str] = None,
    tags: Optional[List[str]] = None
) -> None:
    """
    Helper function to save agent to PostgreSQL asynchronously (non-blocking).
    Uses thread pool executor to run async code reliably.
    """
    if not POSTGRES_AVAILABLE:
        return
    
    # Run in background thread (non-blocking)
    def _save_in_thread():
        try:
            _save_agent_to_postgres_with_retry(
                agent_name=agent_name,
                router=router,
                name=name,
                description=description,
                category=category,
                tags=tags
            )
        except Exception as e:
            logger.error(f"❌ Background save failed for '{agent_name}': {e}", exc_info=True)
    
    # Submit to thread pool (non-blocking)
    _postgres_executor.submit(_save_in_thread)


def register_agent(agent_name: str, router: APIRouter) -> bool:
    """
    Register an agent router in the registry.
    Also saves agent metadata to PostgreSQL trinity_v1_agents table.
    
    Args:
        agent_name: Name of the agent (e.g., 'concat', 'merge')
        router: FastAPI router for the agent
        
    Returns:
        True if registered successfully, False otherwise
    """
    try:
        if router is None:
            logger.error(f"❌ Cannot register {agent_name}: router is None")
            return False
        
        _agent_routers[agent_name] = router
        route_count = len(router.routes) if router else 0
        logger.info(f"✅ Registered agent '{agent_name}' with {route_count} routes")
        
        # Save to PostgreSQL (non-blocking, fire-and-forget)
        # Try to save to PostgreSQL (non-blocking, won't fail registration if it fails)
        if POSTGRES_AVAILABLE:
            try:
                _save_agent_to_postgres_async(agent_name, router)
            except Exception as e:
                # Don't fail registration if PostgreSQL save fails
                logger.debug(f"Could not save '{agent_name}' to PostgreSQL during registration: {e}. "
                           f"Will be synced via Django management command.")
        
        return True
    except Exception as e:
        logger.error(f"❌ Failed to register agent '{agent_name}': {e}", exc_info=True)
        return False


def get_agent_router(agent_name: str) -> Optional[APIRouter]:
    """
    Get a registered agent router.
    
    Args:
        agent_name: Name of the agent
        
    Returns:
        Router if found, None otherwise
    """
    return _agent_routers.get(agent_name)


def get_all_routers() -> Dict[str, APIRouter]:
    """
    Get all registered agent routers.
    
    Returns:
        Dictionary of agent_name -> router
    """
    return _agent_routers.copy()


def register_concat_agent() -> bool:
    """
    Register the Concat agent router.
    This is the standard way to connect the concat agent.
    
    Returns:
        True if registered successfully, False otherwise
    """
    # Use print to ensure we see output even if logger isn't configured
    print("=" * 80)
    print("REGISTERING CONCAT AGENT")
    print("=" * 80)
    
    try:
        import sys
        from pathlib import Path
        
        logger.info("=" * 80)
        logger.info("REGISTERING CONCAT AGENT")
        logger.info("=" * 80)
        
        # Ensure we can import from Agent_Concat
        # Get the directory containing this file (TrinityAgent)
        agent_dir = Path(__file__).resolve().parent
        print(f"Agent directory: {agent_dir}")
        print(f"Agent directory exists: {agent_dir.exists()}")
        logger.info(f"Agent directory: {agent_dir}")
        logger.info(f"Agent directory exists: {agent_dir.exists()}")
        
        if not agent_dir.exists():
            error_msg = f"❌ Agent directory does not exist: {agent_dir}"
            print(error_msg)
            logger.error(error_msg)
            return False
        
        if str(agent_dir) not in sys.path:
            sys.path.insert(0, str(agent_dir))
            print(f"✅ Added agent directory to sys.path: {agent_dir}")
            logger.info(f"✅ Added agent directory to sys.path: {agent_dir}")
        
        # Check if Agent_Concat directory exists
        agent_concat_dir = agent_dir / "Agent_Concat"
        print(f"Agent_Concat directory: {agent_concat_dir}")
        print(f"Agent_Concat directory exists: {agent_concat_dir.exists()}")
        logger.info(f"Agent_Concat directory: {agent_concat_dir}")
        logger.info(f"Agent_Concat directory exists: {agent_concat_dir.exists()}")
        
        if not agent_concat_dir.exists():
            error_msg = f"❌ Agent_Concat directory does not exist: {agent_concat_dir}"
            print(error_msg)
            logger.error(error_msg)
            return False
        
        # Import from __init__.py - this ensures main_app is imported first
        # which registers all routes on the router
        concat_router = None
        try:
            # Import from __init__.py - it imports main_app first, then router
            # This ensures routes are registered before we get the router
            print("Attempting to import from Agent_Concat.__init__.py...")
            logger.info("Attempting to import from Agent_Concat.__init__.py...")
            from Agent_Concat import router as concat_router
            print("✅ Imported concat router from Agent_Concat.__init__.py")
            print(f"Router type: {type(concat_router)}")
            print(f"Router is None: {concat_router is None}")
            if concat_router:
                print(f"Router has {len(concat_router.routes)} routes")
            logger.info("✅ Imported concat router from Agent_Concat.__init__.py")
            logger.info("✅ Routes should be registered (main_app imported first)")
        except Exception as e1:
            error_msg = f"Failed to import from __init__.py: {e1}"
            print(f"⚠️ {error_msg}")
            import traceback
            print(f"Traceback: {traceback.format_exc()}")
            logger.warning(error_msg)
            logger.warning(f"Traceback: {traceback.format_exc()}")
            # Fallback 1: Try router.py directly (but import main_app to register routes)
            try:
                print("Attempting fallback: import main_app then router...")
                logger.info("Attempting fallback: import main_app then router...")
                # Import main_app first to register routes
                import Agent_Concat.main_app
                print("✅ Imported main_app - routes should be registered")
                logger.info("✅ Imported main_app - routes should be registered")
                # Then import router
                from Agent_Concat.router import router as concat_router
                print(f"✅ Imported concat router from router.py")
                print(f"Router type: {type(concat_router)}")
                if concat_router:
                    print(f"Router has {len(concat_router.routes)} routes")
                logger.info("✅ Imported concat router from router.py")
            except Exception as e2:
                error_msg = f"Failed to import from router.py: {e2}"
                print(f"⚠️ {error_msg}")
                import traceback
                print(f"Traceback: {traceback.format_exc()}")
                logger.warning(error_msg)
                logger.warning(f"Traceback: {traceback.format_exc()}")
                error_msg = f"❌ Failed to import concat router from all sources:\n  __init__.py: {e1}\n  router.py: {e2}"
                print("=" * 80)
                print(error_msg)
                import traceback
                print(f"Full traceback:\n{traceback.format_exc()}")
                print("=" * 80)
                logger.error(error_msg)
                logger.error(f"Full traceback:\n{traceback.format_exc()}")
                return False
        
        if concat_router is None:
            error_msg = "❌ Concat router is None after import"
            print(error_msg)
            logger.error(error_msg)
            return False
        
        # Check router has routes
        route_count = len(concat_router.routes) if concat_router else 0
        print(f"Router has {route_count} routes")
        logger.info(f"Router has {route_count} routes")
        
        if route_count == 0:
            warning_msg = "⚠️ Router has no routes - routes may not be registered yet"
            print(warning_msg)
            logger.warning(warning_msg)
        
        # Set metadata for PostgreSQL
        set_agent_metadata("concat", {
            "name": "Concat",
            "description": "Concatenate multiple datasets together",
            "category": "Data Operations",
            "tags": ["concat", "merge", "data", "dataset"]
        })
        
        # Register the router
        print("Registering router in agent registry...")
        success = register_agent("concat", concat_router)
        
        if success:
            success_msg = "✅✅✅ CONCAT AGENT REGISTERED SUCCESSFULLY ✅✅✅"
            print(success_msg)
            logger.info(success_msg)
        else:
            error_msg = "❌ Failed to register concat agent in registry"
            print(error_msg)
            logger.error(error_msg)
        
        print("=" * 80)
        logger.info("=" * 80)
        return success
        
    except Exception as e:
        error_msg = f"❌ Failed to register concat agent: {e}"
        print("=" * 80)
        print(error_msg)
        import traceback
        print(f"Full traceback:\n{traceback.format_exc()}")
        print("=" * 80)
        logger.error("=" * 80)
        logger.error(error_msg, exc_info=True)
        logger.error(f"Full traceback:\n{traceback.format_exc()}")
        logger.error("=" * 80)
        return False


def auto_discover_agents(agent_dir: Optional[Path] = None) -> Dict[str, bool]:
    """
    Automatically discover and register all agents from Agent_* directories.
    
    This function scans for Agent_* directories and attempts to import their routers.
    It follows a standard pattern:
    1. Look for Agent_* directories
    2. Try to import router from Agent_*/__init__.py
    3. Fallback to Agent_*/router.py if __init__.py doesn't export router
    4. Register the router with the agent name (extracted from directory name)
    
    Args:
        agent_dir: Optional path to agent directory (defaults to parent of this file)
    
    Returns:
        Dictionary of agent_name -> registration success status
    """
    if agent_dir is None:
        agent_dir = Path(__file__).resolve().parent
    
    logger.info("=" * 80)
    logger.info("AUTO-DISCOVERING AGENTS")
    logger.info("=" * 80)
    logger.info(f"Scanning directory: {agent_dir}")
    
    results = {}
    
    if not agent_dir.exists():
        logger.error(f"❌ Agent directory does not exist: {agent_dir}")
        return results
    
    # Ensure agent directory is in sys.path
    if str(agent_dir) not in sys.path:
        sys.path.insert(0, str(agent_dir))
        logger.info(f"✅ Added agent directory to sys.path: {agent_dir}")
    
    # Find all Agent_* directories
    agent_dirs = [
        d for d in agent_dir.iterdir()
        if d.is_dir() and d.name.startswith("Agent_")
    ]
    
    logger.info(f"Found {len(agent_dirs)} agent directories: {[d.name for d in agent_dirs]}")
    
    for agent_dir_path in agent_dirs:
        # Extract agent name from directory (e.g., Agent_CreateTransform -> create_transform)
        agent_name = agent_dir_path.name.replace("Agent_", "")
        # Convert CamelCase to snake_case if needed
        agent_name = re.sub(r'(?<!^)(?=[A-Z])', '_', agent_name).lower()
        
        logger.info(f"Attempting to discover agent: {agent_name} from {agent_dir_path.name}")
        
        try:
            module_name = agent_dir_path.name
            router = None
            
            # Strategy 1: Try importing from __init__.py (which imports main_app to register routes)
            try:
                logger.info(f"  Strategy 1: Importing from {module_name} (__init__.py imports main_app)")
                module = importlib.import_module(module_name)
                # __init__.py should import main_app which registers routes on router
                if hasattr(module, 'router'):
                    router = module.router
                    route_count = len(router.routes) if router else 0
                    logger.info(f"  ✅ Successfully imported router from {module_name} with {route_count} routes")
            except Exception as e1:
                logger.debug(f"  Strategy 1 failed: {e1}")
                
                # Strategy 2: Try importing main_app first to register routes, then get router
                try:
                    logger.info(f"  Strategy 2: Importing main_app first, then router from {module_name}")
                    # Import main_app to ensure routes are registered
                    importlib.import_module(f"{module_name}.main_app")
                    # Then import router (routes should now be registered)
                    router_module = importlib.import_module(f"{module_name}.router")
                    if hasattr(router_module, 'router'):
                        router = router_module.router
                        route_count = len(router.routes) if router else 0
                        logger.info(f"  ✅ Successfully imported router via main_app with {route_count} routes")
                except Exception as e2:
                    logger.debug(f"  Strategy 2 failed: {e2}")
                    
                    # Strategy 3: Try importing router directly (may not have routes)
                    try:
                        logger.info(f"  Strategy 3: Importing router directly from {module_name}.router")
                        router_module = importlib.import_module(f"{module_name}.router")
                        if hasattr(router_module, 'router'):
                            router = router_module.router
                            route_count = len(router.routes) if router else 0
                            logger.warning(f"  ⚠️ Imported router directly (may not have routes): {route_count} routes")
                            # Try to import main_app to register routes
                            try:
                                importlib.import_module(f"{module_name}.main_app")
                                route_count_after = len(router.routes) if router else 0
                                logger.info(f"  ✅ Routes registered after main_app import: {route_count_after} routes")
                            except:
                                pass
                    except Exception as e3:
                        logger.warning(f"  All import strategies failed for {agent_name}:")
                        logger.warning(f"    Strategy 1: {e1}")
                        logger.warning(f"    Strategy 2: {e2}")
                        logger.warning(f"    Strategy 3: {e3}")
            
            if router is not None and isinstance(router, APIRouter):
                # Register the router
                success = register_agent(agent_name, router)
                results[agent_name] = success
                
                if success:
                    route_count = len(router.routes) if router else 0
                    logger.info(f"  ✅✅✅ Registered agent '{agent_name}' with {route_count} routes")
                else:
                    logger.error(f"  ❌ Failed to register agent '{agent_name}'")
            else:
                logger.warning(f"  ⚠️ No router found for {agent_name} (router is {type(router)})")
                results[agent_name] = False
                
        except Exception as e:
            logger.error(f"  ❌ Error discovering agent {agent_name}: {e}", exc_info=True)
            results[agent_name] = False
            continue
    
    logger.info("=" * 80)
    logger.info(f"Auto-discovery complete. Registered {sum(1 for v in results.values() if v)}/{len(results)} agents")
    logger.info("=" * 80)
    
    return results


def initialize_all_agents(use_auto_discovery: bool = True) -> Dict[str, bool]:
    """
    Initialize and register all agents.
    
    This function can use either:
    1. Auto-discovery (default): Automatically finds and registers all Agent_* directories
    2. Manual registration: Uses explicit registration functions (for backward compatibility)
    
    Args:
        use_auto_discovery: If True, use auto-discovery. If False, use manual registration.
    
    Returns:
        Dictionary of agent_name -> registration success status
    """
    logger.info("=" * 80)
    logger.info("INITIALIZING TRINITY AGENT REGISTRY")
    logger.info("=" * 80)
    
    if use_auto_discovery:
        logger.info("Using AUTO-DISCOVERY mode")
        results = auto_discover_agents()
    else:
        logger.info("Using MANUAL REGISTRATION mode (backward compatibility)")
        results = {}
        
        # Register concat agent
        results["concat"] = register_concat_agent()
        
        # Register merge agent
        results["merge"] = register_merge_agent()
        
        # Register create_transform agent
        results["create_transform"] = register_create_transform_agent()
    
    logger.info("=" * 80)
    logger.info(f"Agent registration complete: {results}")
    logger.info("=" * 80)
    
    return results


def _sync_agents_after_init():
    """
    Automatically sync agents to PostgreSQL after initialization.
    Runs in a background thread to avoid blocking module import.
    """
    if not POSTGRES_AVAILABLE:
        logger.debug("PostgreSQL not available, skipping startup sync")
        return
    
    if not _agent_routers:
        logger.debug("No agents registered, skipping startup sync")
        return
    
    def _sync_in_background():
        """Sync agents in background thread"""
        try:
            logger.info("=" * 80)
            logger.info("SYNCING AGENTS TO POSTGRESQL (STARTUP)")
            logger.info("=" * 80)
            
            # Wait a bit for any pending registrations
            threading.Event().wait(2)
            
            results = sync_agents_to_postgres_sync()
            
            success_count = sum(1 for v in results.values() if v)
            total_count = len(results)
            
            if success_count == total_count and total_count > 0:
                logger.info(f"✅✅✅ All {success_count} agents synced to PostgreSQL on startup ✅✅✅")
            elif success_count > 0:
                logger.warning(f"⚠️ Only {success_count}/{total_count} agents synced to PostgreSQL on startup")
            else:
                logger.error(f"❌ Failed to sync any agents to PostgreSQL on startup")
            
            logger.info("=" * 80)
        except Exception as e:
            logger.error(f"❌ Error syncing agents to PostgreSQL on startup: {e}", exc_info=True)
    
    # Start background thread (non-blocking)
    sync_thread = threading.Thread(target=_sync_in_background, daemon=True, name="agent_postgres_startup_sync")
    sync_thread.start()
    logger.debug("Started background thread for PostgreSQL sync")


# Auto-initialize when module is imported
# Wrap in try-except to prevent import failures from breaking the module
# But log errors clearly so they can be debugged
_initialization_results = {}
try:
    logger.info("=" * 80)
    logger.info("AUTO-INITIALIZING AGENT REGISTRY ON MODULE IMPORT")
    logger.info("=" * 80)
    _initialization_results = initialize_all_agents()
    logger.info(f"✅ Agent registry auto-initialization complete: {_initialization_results}")
    logger.info("=" * 80)
    
    # Sync agents to PostgreSQL after initialization (non-blocking)
    _sync_agents_after_init()
    
except Exception as init_error:
    logger.error("=" * 80)
    logger.error(f"❌❌❌ FAILED TO AUTO-INITIALIZE AGENT REGISTRY ❌❌❌")
    logger.error(f"Error: {init_error}")
    import traceback
    logger.error(f"Full traceback:\n{traceback.format_exc()}")
    logger.error("=" * 80)
    logger.warning("⚠️ Agent registry will need to be manually initialized")
    _initialization_results = {}

def register_merge_agent() -> bool:
    """
    Register the Merge agent router.
    This is the standard way to connect the merge agent.
    
    Returns:
        True if registered successfully, False otherwise
    """
    # Use print to ensure we see output even if logger isn't configured
    print("=" * 80)
    print("REGISTERING MERGE AGENT")
    print("=" * 80)
    
    try:
        import sys
        from pathlib import Path
        
        logger.info("=" * 80)
        logger.info("REGISTERING MERGE AGENT")
        logger.info("=" * 80)
        
        # Ensure we can import from Agent_Merge
        # Get the directory containing this file (TrinityAgent)
        agent_dir = Path(__file__).resolve().parent
        print(f"Agent directory: {agent_dir}")
        print(f"Agent directory exists: {agent_dir.exists()}")
        logger.info(f"Agent directory: {agent_dir}")
        logger.info(f"Agent directory exists: {agent_dir.exists()}")
        
        if not agent_dir.exists():
            error_msg = f"❌ Agent directory does not exist: {agent_dir}"
            print(error_msg)
            logger.error(error_msg)
            return False
        
        if str(agent_dir) not in sys.path:
            sys.path.insert(0, str(agent_dir))
            print(f"✅ Added agent directory to sys.path: {agent_dir}")
            logger.info(f"✅ Added agent directory to sys.path: {agent_dir}")
        
        # Check if Agent_Merge directory exists
        agent_merge_path = agent_dir / "Agent_Merge"
        print(f"Agent_Merge directory: {agent_merge_path}")
        print(f"Agent_Merge directory exists: {agent_merge_path.exists()}")
        logger.info(f"Agent_Merge directory: {agent_merge_path}")
        logger.info(f"Agent_Merge directory exists: {agent_merge_path.exists()}")
        
        if not agent_merge_path.exists():
            error_msg = f"❌ Agent_Merge directory does not exist: {agent_merge_path}"
            print(error_msg)
            logger.error(error_msg)
            return False
        
        # Try to import merge router from Agent_Merge.__init__.py
        print("Attempting to import from Agent_Merge.__init__.py...")
        logger.info("Attempting to import from Agent_Merge.__init__.py...")
        
        try:
            from Agent_Merge import router as merge_router
            print(f"✅ Imported merge router from Agent_Merge.__init__.py")
            logger.info(f"✅ Imported merge router from Agent_Merge.__init__.py")
            print(f"Router type: {type(merge_router)}")
            print(f"Router is None: {merge_router is None}")
            logger.info(f"Router type: {type(merge_router)}")
            logger.info(f"Router is None: {merge_router is None}")
            
            if merge_router is None:
                error_msg = "❌ Merge router is None after import"
                print(error_msg)
                logger.error(error_msg)
                return False
            
            if hasattr(merge_router, 'routes'):
                route_count = len(merge_router.routes)
                print(f"Router has {route_count} routes")
                logger.info(f"Router has {route_count} routes")
            
            # Set metadata for PostgreSQL
            set_agent_metadata("merge", {
                "name": "Merge",
                "description": "Merge datasets based on common columns",
                "category": "Data Operations",
                "tags": ["merge", "join", "data", "dataset"]
            })
            
            # Register router in agent registry
            print("Registering router in agent registry...")
            logger.info("Registering router in agent registry...")
            success = register_agent("merge", merge_router)
            
            if success:
                success_msg = "✅✅✅ MERGE AGENT REGISTERED SUCCESSFULLY ✅✅✅"
                print(success_msg)
                logger.info(success_msg)
            else:
                error_msg = "❌ Failed to register merge agent in registry"
                print(error_msg)
                logger.error(error_msg)
            
            print("=" * 80)
            logger.info("=" * 80)
            return success
            
        except ImportError as import_error:
            error_msg = f"❌ Failed to import merge router: {import_error}"
            print(error_msg)
            import traceback
            print(f"Traceback: {traceback.format_exc()}")
            logger.error(error_msg, exc_info=True)
            return False
        
    except Exception as e:
        error_msg = f"❌ Failed to register merge agent: {e}"
        print("=" * 80)
        print(error_msg)
        import traceback
        print(f"Full traceback:\n{traceback.format_exc()}")
        print("=" * 80)
        logger.error("=" * 80)
        logger.error(error_msg, exc_info=True)
        logger.error(f"Full traceback:\n{traceback.format_exc()}")
        logger.error("=" * 80)
        return False


def register_create_transform_agent() -> bool:
    """
    Register the CreateTransform agent router.
    This is the standard way to connect the create_transform agent.
    
    Returns:
        True if registered successfully, False otherwise
    """
    # Use print to ensure we see output even if logger isn't configured
    print("=" * 80)
    print("REGISTERING CREATETRANSFORM AGENT")
    print("=" * 80)
    
    try:
        import sys
        from pathlib import Path
        
        logger.info("=" * 80)
        logger.info("REGISTERING CREATETRANSFORM AGENT")
        logger.info("=" * 80)
        
        # Ensure we can import from Agent_CreateTransform
        # Get the directory containing this file (TrinityAgent)
        agent_dir = Path(__file__).resolve().parent
        print(f"Agent directory: {agent_dir}")
        print(f"Agent directory exists: {agent_dir.exists()}")
        logger.info(f"Agent directory: {agent_dir}")
        logger.info(f"Agent directory exists: {agent_dir.exists()}")
        
        if not agent_dir.exists():
            error_msg = f"❌ Agent directory does not exist: {agent_dir}"
            print(error_msg)
            logger.error(error_msg)
            return False
        
        if str(agent_dir) not in sys.path:
            sys.path.insert(0, str(agent_dir))
            print(f"✅ Added agent directory to sys.path: {agent_dir}")
            logger.info(f"✅ Added agent directory to sys.path: {agent_dir}")
        
        # Check if Agent_CreateTransform directory exists
        agent_create_transform_path = agent_dir / "Agent_CreateTransform"
        print(f"Agent_CreateTransform directory: {agent_create_transform_path}")
        print(f"Agent_CreateTransform directory exists: {agent_create_transform_path.exists()}")
        logger.info(f"Agent_CreateTransform directory: {agent_create_transform_path}")
        logger.info(f"Agent_CreateTransform directory exists: {agent_create_transform_path.exists()}")
        
        if not agent_create_transform_path.exists():
            error_msg = f"❌ Agent_CreateTransform directory does not exist: {agent_create_transform_path}"
            print(error_msg)
            logger.error(error_msg)
            return False
        
        # Try to import create_transform router from Agent_CreateTransform.__init__.py
        print("Attempting to import from Agent_CreateTransform.__init__.py...")
        logger.info("Attempting to import from Agent_CreateTransform.__init__.py...")
        
        try:
            from Agent_CreateTransform import router as create_transform_router
            print(f"✅ Imported create_transform router from Agent_CreateTransform.__init__.py")
            logger.info(f"✅ Imported create_transform router from Agent_CreateTransform.__init__.py")
            print(f"Router type: {type(create_transform_router)}")
            print(f"Router is None: {create_transform_router is None}")
            logger.info(f"Router type: {type(create_transform_router)}")
            logger.info(f"Router is None: {create_transform_router is None}")
            
            if create_transform_router is None:
                error_msg = "❌ CreateTransform router is None after import"
                print(error_msg)
                logger.error(error_msg)
                return False
            
            if hasattr(create_transform_router, 'routes'):
                route_count = len(create_transform_router.routes)
                print(f"Router has {route_count} routes")
                logger.info(f"Router has {route_count} routes")
            
            # Set metadata for PostgreSQL
            set_agent_metadata("create_transform", {
                "name": "Create Transform",
                "description": "Create and apply data transformations",
                "category": "Transformations",
                "tags": ["transform", "data", "transformation", "create"]
            })
            
            # Register router in agent registry
            print("Registering router in agent registry...")
            logger.info("Registering router in agent registry...")
            success = register_agent("create_transform", create_transform_router)
            
            if success:
                success_msg = "✅✅✅ CREATETRANSFORM AGENT REGISTERED SUCCESSFULLY ✅✅✅"
                print(success_msg)
                logger.info(success_msg)
            else:
                error_msg = "❌ Failed to register create_transform agent in registry"
                print(error_msg)
                logger.error(error_msg)
            
            print("=" * 80)
            logger.info("=" * 80)
            return success
            
        except ImportError as import_error:
            error_msg = f"❌ Failed to import create_transform router: {import_error}"
            print(error_msg)
            import traceback
            print(f"Traceback: {traceback.format_exc()}")
            logger.error(error_msg, exc_info=True)
            return False
        
    except Exception as e:
        error_msg = f"❌ Failed to register create_transform agent: {e}"
        print("=" * 80)
        print(error_msg)
        import traceback
        print(f"Full traceback:\n{traceback.format_exc()}")
        print("=" * 80)
        logger.error("=" * 80)
        logger.error(error_msg, exc_info=True)
        logger.error(f"Full traceback:\n{traceback.format_exc()}")
        logger.error("=" * 80)
        return False


async def sync_registry_to_postgres() -> Dict[str, bool]:
    """
    Sync all in-memory agents to PostgreSQL.
    Useful for manual synchronization or after bulk operations.
    
    Returns:
        Dictionary of agent_id -> sync success status
    """
    if not POSTGRES_AVAILABLE:
        logger.warning("PostgreSQL not available, cannot sync registry")
        return {agent_id: False for agent_id in _agent_routers.keys()}
    
    try:
        # Ensure table exists
        await create_trinity_v1_agents_table()
        
        # Sync all agents
        results = await sync_all_agents_to_postgres(_agent_routers, _agent_metadata)
        
        success_count = sum(1 for v in results.values() if v)
        total_count = len(results)
        logger.info(f"✅ Synced {success_count}/{total_count} agents to PostgreSQL")
        
        # Update sync status
        for agent_id, success in results.items():
            _sync_status[agent_id] = success
        
        return results
    except Exception as e:
        logger.error(f"❌ Failed to sync registry to PostgreSQL: {e}", exc_info=True)
        return {agent_id: False for agent_id in _agent_routers.keys()}


def sync_agents_to_postgres_sync() -> Dict[str, bool]:
    """
    Synchronous wrapper for sync_registry_to_postgres().
    Can be called from sync context (e.g., Django management commands).
    
    Returns:
        Dictionary of agent_id -> sync success status
    """
    if not POSTGRES_AVAILABLE:
        logger.warning("PostgreSQL not available, cannot sync registry")
        return {agent_id: False for agent_id in _agent_routers.keys()}
    
    if not _agent_routers:
        logger.warning("No agents in registry to sync")
        return {}
    
    try:
        # Use thread pool executor to run async code
        future = _postgres_executor.submit(asyncio.run, sync_registry_to_postgres())
        results = future.result(timeout=30)  # 30 second timeout
        
        success_count = sum(1 for v in results.values() if v)
        total_count = len(results)
        logger.info(f"✅ Synchronously synced {success_count}/{total_count} agents to PostgreSQL")
        
        return results
    except Exception as e:
        logger.error(f"❌ Failed to sync registry to PostgreSQL (sync): {e}", exc_info=True)
        return {agent_id: False for agent_id in _agent_routers.keys()}


async def get_agent_metadata_from_postgres(agent_id: str) -> Optional[Dict[str, Any]]:
    """
    Get agent metadata from PostgreSQL.
    
    Args:
        agent_id: Agent identifier
        
    Returns:
        Agent metadata dictionary or None if not found
    """
    if not POSTGRES_AVAILABLE:
        return None
    
    try:
        return await get_agent_from_postgres(agent_id)
    except Exception as e:
        logger.warning(f"⚠️ Failed to get agent '{agent_id}' metadata from PostgreSQL: {e}")
        return None


async def load_agents_from_postgres() -> List[Dict[str, Any]]:
    """
    Load all agents from PostgreSQL.
    Useful for checking which agents are registered in the database.
    
    Returns:
        List of agent metadata dictionaries
    """
    if not POSTGRES_AVAILABLE:
        return []
    
    try:
        agents = await get_all_agents_from_postgres()
        logger.info(f"✅ Loaded {len(agents)} agents from PostgreSQL")
        return agents
    except Exception as e:
        logger.warning(f"⚠️ Failed to load agents from PostgreSQL: {e}")
        return []


def set_agent_metadata(agent_name: str, metadata: Dict[str, Any]) -> None:
    """
    Set metadata for an agent (name, description, category, tags).
    This metadata will be used when saving to PostgreSQL.
    
    Args:
        agent_name: Agent identifier
        metadata: Dictionary with keys: name, description, category, tags
    """
    _agent_metadata[agent_name] = metadata
    logger.debug(f"Set metadata for agent '{agent_name}': {metadata}")


async def verify_registry_sync() -> Dict[str, Any]:
    """
    Verify that agents in memory match agents in PostgreSQL.
    Returns a dictionary with sync status information.
    
    Returns:
        Dictionary with keys:
        - in_sync: bool - Whether memory and DB are in sync
        - memory_only: List[str] - Agents in memory but not in DB
        - db_only: List[str] - Agents in DB but not in memory
        - both: List[str] - Agents in both memory and DB
    """
    if not POSTGRES_AVAILABLE:
        return {
            "in_sync": False,
            "error": "PostgreSQL not available",
            "memory_only": list(_agent_routers.keys()),
            "db_only": [],
            "both": []
        }
    
    try:
        # Get agents from memory
        memory_agents = set(_agent_routers.keys())
        
        # Get agents from PostgreSQL
        db_agents_data = await get_all_agents_from_postgres()
        db_agents = {agent['agent_id'] for agent in db_agents_data}
        
        # Compare
        memory_only = memory_agents - db_agents
        db_only = db_agents - memory_agents
        both = memory_agents & db_agents
        
        in_sync = len(memory_only) == 0 and len(db_only) == 0
        
        result = {
            "in_sync": in_sync,
            "memory_only": list(memory_only),
            "db_only": list(db_only),
            "both": list(both),
            "memory_count": len(memory_agents),
            "db_count": len(db_agents)
        }
        
        if not in_sync:
            logger.warning(f"⚠️ Registry sync mismatch detected:")
            logger.warning(f"   Memory only: {memory_only}")
            logger.warning(f"   DB only: {db_only}")
            logger.warning(f"   In both: {both}")
        else:
            logger.info(f"✅ Registry sync verified: {len(both)} agents in sync")
        
        return result
        
    except Exception as e:
        logger.error(f"❌ Error verifying registry sync: {e}", exc_info=True)
        return {
            "in_sync": False,
            "error": str(e),
            "memory_only": list(_agent_routers.keys()),
            "db_only": [],
            "both": []
        }


def verify_registry_sync_sync() -> Dict[str, Any]:
    """
    Synchronous wrapper for verify_registry_sync().
    Can be called from sync context.
    
    Returns:
        Dictionary with sync status information
    """
    if not POSTGRES_AVAILABLE:
        return {
            "in_sync": False,
            "error": "PostgreSQL not available",
            "memory_only": list(_agent_routers.keys()),
            "db_only": [],
            "both": []
        }
    
    try:
        future = _postgres_executor.submit(asyncio.run, verify_registry_sync())
        return future.result(timeout=10)
    except Exception as e:
        logger.error(f"❌ Error verifying registry sync (sync): {e}", exc_info=True)
        return {
            "in_sync": False,
            "error": str(e),
            "memory_only": list(_agent_routers.keys()),
            "db_only": [],
            "both": []
        }


def get_sync_status() -> Dict[str, Any]:
    """
    Get current sync status for all agents.
    
    Returns:
        Dictionary with agent_id -> sync status (True/False/None)
    """
    status = {}
    for agent_id in _agent_routers.keys():
        status[agent_id] = _sync_status.get(agent_id, None)
    return status


__all__ = [
    "register_agent",
    "get_agent_router",
    "get_all_routers",
    "register_concat_agent",
    "register_merge_agent",
    "register_create_transform_agent",
    "auto_discover_agents",
    "initialize_all_agents",
    "sync_registry_to_postgres",
    "sync_agents_to_postgres_sync",
    "get_agent_metadata_from_postgres",
    "load_agents_from_postgres",
    "set_agent_metadata",
    "verify_registry_sync",
    "verify_registry_sync_sync",
    "get_sync_status",
]

