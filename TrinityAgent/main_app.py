"""
TrinityAgent Main Application
Standardized entry point for connecting TrinityAgent to external systems.
This is the connection interface that external applications (like TrinityAI) use.
"""

import logging
import sys
from pathlib import Path
from typing import Optional, Dict, Any
from fastapi import APIRouter

logger = logging.getLogger("trinity.agent")

# Add current directory to path for imports
_current_dir = Path(__file__).resolve().parent
if str(_current_dir) not in sys.path:
    sys.path.insert(0, str(_current_dir))

# Import agent registry
try:
    from agent_registry import (
        get_agent_router,
        get_all_routers,
        initialize_all_agents,
        register_concat_agent,
        register_merge_agent,
        register_create_transform_agent
    )
    logger.info("✅ Imported agent registry")
except ImportError as e:
    logger.error(f"❌ Failed to import agent registry: {e}")
    raise


def get_concat_router() -> Optional[APIRouter]:
    """
    Get the concat agent router.
    This is the main connection point for external systems.
    
    Returns:
        APIRouter for concat agent, or None if not available
    """
    try:
        # Ensure agents are initialized
        initialize_all_agents()
        
        # Get concat router from registry
        router = get_agent_router("concat")
        
        if router:
            logger.info("✅ Concat router retrieved successfully")
            logger.info(f"Router has {len(router.routes)} routes")
        else:
            logger.warning("⚠️ Concat router not found in registry, attempting manual registration...")
            # Try to manually register
            if register_concat_agent():
                router = get_agent_router("concat")
                if router:
                    logger.info("✅ Concat router registered and retrieved")
        
        return router
    except Exception as e:
        logger.error(f"❌ Failed to get concat router: {e}", exc_info=True)
        return None


def get_merge_router() -> Optional[APIRouter]:
    """
    Get the merge agent router.
    This is the main connection point for external systems.
    
    Returns:
        APIRouter for merge agent, or None if not available
    """
    try:
        # Ensure agents are initialized
        initialize_all_agents()
        
        # Get merge router from registry
        router = get_agent_router("merge")
        
        if router:
            logger.info("✅ Merge router retrieved successfully")
            logger.info(f"Router has {len(router.routes)} routes")
        else:
            logger.warning("⚠️ Merge router not found in registry, attempting manual registration...")
            # Try to manually register
            from agent_registry import register_merge_agent
            if register_merge_agent():
                router = get_agent_router("merge")
                if router:
                    logger.info("✅ Merge router registered and retrieved")
        
        return router
    except Exception as e:
        logger.error(f"❌ Failed to get merge router: {e}", exc_info=True)
        return None


def get_create_transform_router() -> Optional[APIRouter]:
    """
    Get the create_transform agent router.
    This is the main connection point for external systems.
    
    Returns:
        APIRouter for create_transform agent, or None if not available
    """
    try:
        # Ensure agents are initialized
        initialize_all_agents()
        
        # Get create_transform router from registry
        router = get_agent_router("create_transform")
        
        if router:
            # Ensure main_app is imported to register routes
            route_count_before = len(router.routes)
            try:
                # Try multiple import strategies to ensure routes are registered
                try:
                    import Agent_CreateTransform.main_app
                except ImportError:
                    try:
                        from Agent_CreateTransform import main_app
                    except ImportError:
                        # Try absolute import
                        import sys
                        from pathlib import Path
                        agent_dir = Path(__file__).resolve().parent
                        if str(agent_dir) not in sys.path:
                            sys.path.insert(0, str(agent_dir))
                        import Agent_CreateTransform.main_app
                
                route_count_after = len(router.routes)
                logger.info(f"✅ CreateTransform router retrieved successfully")
                logger.info(f"  Routes before main_app import: {route_count_before}")
                logger.info(f"  Routes after main_app import: {route_count_after}")
                if route_count_after == 0:
                    logger.warning("⚠️ Router has no routes after importing main_app!")
            except Exception as e:
                logger.warning(f"⚠️ Could not import main_app to register routes: {e}")
                route_count = len(router.routes)
                logger.info(f"✅ CreateTransform router retrieved (has {route_count} routes)")
        else:
            logger.warning("⚠️ CreateTransform router not found in registry, attempting manual registration...")
            # Try to manually register
            from agent_registry import register_create_transform_agent
            if register_create_transform_agent():
                router = get_agent_router("create_transform")
                if router:
                    # Ensure routes are registered
                    try:
                        import Agent_CreateTransform.main_app
                    except:
                        pass
                    logger.info("✅ CreateTransform router registered and retrieved")
        
        return router
    except Exception as e:
        logger.error(f"❌ Failed to get create_transform router: {e}", exc_info=True)
        return None


def get_group_by_router() -> Optional[APIRouter]:
    """
    Get the group_by agent router.
    This is the main connection point for external systems.
    
    Returns:
        APIRouter for group_by agent, or None if not available
    """
    try:
        # Ensure agents are initialized
        initialize_all_agents()
        
        # Get group_by router from registry
        router = get_agent_router("group_by")
        
        if router:
            # Ensure main_app is imported to register routes
            route_count_before = len(router.routes)
            try:
                # Try multiple import strategies to ensure routes are registered
                try:
                    import Agent_GroupBy.main_app
                except ImportError:
                    try:
                        from Agent_GroupBy import main_app
                    except ImportError:
                        # Try absolute import
                        import sys
                        from pathlib import Path
                        agent_dir = Path(__file__).resolve().parent
                        if str(agent_dir) not in sys.path:
                            sys.path.insert(0, str(agent_dir))
                        import Agent_GroupBy.main_app
                
                route_count_after = len(router.routes)
                logger.info(f"✅ GroupBy router retrieved successfully")
                logger.info(f"  Routes before main_app import: {route_count_before}")
                logger.info(f"  Routes after main_app import: {route_count_after}")
                if route_count_after == 0:
                    logger.warning("⚠️ Router has no routes after importing main_app!")
            except Exception as e:
                logger.warning(f"⚠️ Could not import main_app to register routes: {e}")
                route_count = len(router.routes)
                logger.info(f"✅ GroupBy router retrieved (has {route_count} routes)")
        else:
            logger.warning("⚠️ GroupBy router not found in registry - will be auto-discovered")
            # GroupBy should be auto-discovered, but if not found, try to ensure it's registered
            # by importing the module
            try:
                import Agent_GroupBy.main_app
                router = get_agent_router("group_by")
                if router:
                    logger.info("✅ GroupBy router registered and retrieved after import")
            except Exception as e:
                logger.warning(f"⚠️ Could not import GroupBy main_app: {e}")
        
        return router
    except Exception as e:
        logger.error(f"❌ Failed to get group_by router: {e}", exc_info=True)
        return None


def get_chart_maker_router() -> Optional[APIRouter]:
    """
    Get the chart_maker agent router.
    This is the main connection point for external systems.
    
    Returns:
        APIRouter for chart_maker agent, or None if not available
    """
    try:
        # Ensure agents are initialized
        initialize_all_agents()
        
        # Get chart_maker router from registry
        router = get_agent_router("chart_maker")
        
        if router:
            # Ensure main_app is imported to register routes
            route_count_before = len(router.routes)
            try:
                # Try multiple import strategies to ensure routes are registered
                try:
                    import Agent_ChartMaker.main_app
                except ImportError:
                    try:
                        from Agent_ChartMaker import main_app
                    except ImportError:
                        # Try absolute import
                        import sys
                        from pathlib import Path
                        agent_dir = Path(__file__).resolve().parent
                        if str(agent_dir) not in sys.path:
                            sys.path.insert(0, str(agent_dir))
                        import Agent_ChartMaker.main_app
                
                route_count_after = len(router.routes)
                logger.info(f"✅ ChartMaker router retrieved successfully")
                logger.info(f"  Routes before main_app import: {route_count_before}")
                logger.info(f"  Routes after main_app import: {route_count_after}")
                if route_count_after == 0:
                    logger.warning("⚠️ Router has no routes after importing main_app!")
            except Exception as e:
                logger.warning(f"⚠️ Could not import main_app to register routes: {e}")
                route_count = len(router.routes)
                logger.info(f"✅ ChartMaker router retrieved (has {route_count} routes)")
        else:
            logger.warning("⚠️ ChartMaker router not found in registry - will be auto-discovered")
            # ChartMaker should be auto-discovered, but if not found, try to ensure it's registered
            # by importing the module
            try:
                import Agent_ChartMaker.main_app
                router = get_agent_router("chart_maker")
                if router:
                    logger.info("✅ ChartMaker router registered and retrieved after import")
            except Exception as e:
                logger.warning(f"⚠️ Could not import ChartMaker main_app: {e}")
        
        return router
    except Exception as e:
        logger.error(f"❌ Failed to get chart_maker router: {e}", exc_info=True)
        return None


def get_dataframe_operations_router() -> Optional[APIRouter]:
    """
    Get the dataframe_operations agent router.
    This is the main connection point for external systems.
    
    Returns:
        APIRouter for dataframe_operations agent, or None if not available
    """
    try:
        # Ensure agents are initialized
        initialize_all_agents()
        
        # Get dataframe_operations router from registry (using snake_case for consistency)
        router = get_agent_router("dataframe_operations")
        
        if router:
            # Ensure main_app is imported to register routes
            route_count_before = len(router.routes)
            try:
                # Try multiple import strategies to ensure routes are registered
                try:
                    import Agent_DataFrameOperations.main_app
                except ImportError:
                    try:
                        from Agent_DataFrameOperations import main_app
                    except ImportError:
                        # Try absolute import
                        import sys
                        from pathlib import Path
                        agent_dir = Path(__file__).resolve().parent
                        if str(agent_dir) not in sys.path:
                            sys.path.insert(0, str(agent_dir))
                        import Agent_DataFrameOperations.main_app
                
                route_count_after = len(router.routes)
                logger.info(f"✅ DataFrameOperations router retrieved successfully")
                logger.info(f"  Routes before main_app import: {route_count_before}")
                logger.info(f"  Routes after main_app import: {route_count_after}")
                if route_count_after == 0:
                    logger.warning("⚠️ Router has no routes after importing main_app!")
            except Exception as e:
                logger.warning(f"⚠️ Could not import main_app to register routes: {e}")
                route_count = len(router.routes)
                logger.info(f"✅ DataFrameOperations router retrieved (has {route_count} routes)")
        else:
            # DataFrameOperations should be auto-discovered, but if not found yet, try to ensure it's registered
            # by importing the module. This is expected during initialization, so log at debug level.
            logger.debug("DataFrameOperations router not found in registry yet - attempting to register via import")
            try:
                import Agent_DataFrameOperations.main_app
                router = get_agent_router("dataframe_operations")
                if router:
                    logger.info("✅ DataFrameOperations router registered and retrieved after import")
                else:
                    logger.debug("DataFrameOperations router still not found after import - will be auto-discovered")
            except Exception as e:
                logger.debug(f"Could not import DataFrameOperations main_app during initialization (will retry): {e}")
        
        return router
    except Exception as e:
        logger.error(f"❌ Failed to get dataframe_operations router: {e}", exc_info=True)
        return None


def get_data_upload_validate_router() -> Optional[APIRouter]:
    """
    Get the data_upload_validate agent router.
    This is the main connection point for external systems.
    
    Returns:
        APIRouter for data_upload_validate agent, or None if not available
    """
    try:
        # Ensure agents are initialized
        initialize_all_agents()
        
        # Get data_upload_validate router from registry (using snake_case for consistency)
        router = get_agent_router("data_upload_validate")
        
        if router:
            # Ensure main_app is imported to register routes
            route_count_before = len(router.routes)
            try:
                # Try multiple import strategies to ensure routes are registered
                try:
                    import Agent_DataUploadValidate.main_app
                except ImportError:
                    try:
                        from Agent_DataUploadValidate import main_app
                    except ImportError:
                        # Try absolute import
                        import sys
                        from pathlib import Path
                        agent_dir = Path(__file__).resolve().parent
                        if str(agent_dir) not in sys.path:
                            sys.path.insert(0, str(agent_dir))
                        import Agent_DataUploadValidate.main_app
                
                route_count_after = len(router.routes)
                logger.info(f"✅ DataUploadValidate router retrieved successfully")
                logger.info(f"  Routes before main_app import: {route_count_before}")
                logger.info(f"  Routes after main_app import: {route_count_after}")
                if route_count_after == 0:
                    logger.warning("⚠️ Router has no routes after importing main_app!")
            except Exception as e:
                logger.warning(f"⚠️ Could not import main_app to register routes: {e}")
                route_count = len(router.routes)
                logger.info(f"✅ DataUploadValidate router retrieved (has {route_count} routes)")
        else:
            logger.warning("⚠️ DataUploadValidate router not found in registry - will be auto-discovered")
            # DataUploadValidate should be auto-discovered, but if not found, try to ensure it's registered
            # by importing the module
            try:
                import Agent_DataUploadValidate.main_app
                router = get_agent_router("data_upload_validate")
                if router:
                    logger.info("✅ DataUploadValidate router registered and retrieved after import")
            except Exception as e:
                logger.warning(f"⚠️ Could not import DataUploadValidate main_app: {e}")
        
        return router
    except Exception as e:
        logger.error(f"❌ Failed to get data_upload_validate router: {e}", exc_info=True)
        return None


def get_fetch_atom_router() -> Optional[APIRouter]:
    """
    Get the fetch_atom agent router.
    This is the main connection point for external systems.
    
    Returns:
        APIRouter for fetch_atom agent, or None if not available
    """
    try:
        # Ensure agents are initialized
        initialize_all_agents()
        
        # Get fetch_atom router from registry (using snake_case for consistency)
        router = get_agent_router("fetch_atom")
        
        if router:
            # Ensure main_app is imported to register routes
            route_count_before = len(router.routes)
            try:
                # Try multiple import strategies to ensure routes are registered
                try:
                    import Agent_FetchAtom.main_app
                except ImportError:
                    try:
                        from Agent_FetchAtom import main_app
                    except ImportError:
                        # Try absolute import
                        import sys
                        from pathlib import Path
                        agent_dir = Path(__file__).resolve().parent
                        if str(agent_dir) not in sys.path:
                            sys.path.insert(0, str(agent_dir))
                        import Agent_FetchAtom.main_app
                
                route_count_after = len(router.routes)
                logger.info(f"✅ FetchAtom router retrieved successfully")
                logger.info(f"  Routes before main_app import: {route_count_before}")
                logger.info(f"  Routes after main_app import: {route_count_after}")
                if route_count_after == 0:
                    logger.warning("⚠️ Router has no routes after importing main_app!")
            except Exception as e:
                logger.warning(f"⚠️ Could not import main_app to register routes: {e}")
                route_count = len(router.routes)
                logger.info(f"✅ FetchAtom router retrieved (has {route_count} routes)")
        else:
            logger.warning("⚠️ FetchAtom router not found in registry - will be auto-discovered")
            # FetchAtom should be auto-discovered, but if not found, try to ensure it's registered
            # by importing the module
            try:
                import Agent_FetchAtom.main_app
                router = get_agent_router("fetch_atom")
                if router:
                    logger.info("✅ FetchAtom router registered and retrieved after import")
            except Exception as e:
                logger.warning(f"⚠️ Could not import FetchAtom main_app: {e}")
        
        return router
    except Exception as e:
        logger.error(f"❌ Failed to get fetch_atom router: {e}", exc_info=True)
        return None


def get_explore_router() -> Optional[APIRouter]:
    """
    Get the explore agent router.
    This is the main connection point for external systems.
    
    Returns:
        APIRouter for explore agent, or None if not available
    """
    try:
        # Ensure agents are initialized
        initialize_all_agents()
        
        # Get explore router from registry (using snake_case for consistency)
        router = get_agent_router("explore")
        
        if router:
            # Ensure main_app is imported to register routes
            route_count_before = len(router.routes)
            try:
                # Try multiple import strategies to ensure routes are registered
                try:
                    import Agent_Explore.main_app
                except ImportError:
                    try:
                        from Agent_Explore import main_app
                    except ImportError:
                        # Try absolute import
                        import sys
                        from pathlib import Path
                        agent_dir = Path(__file__).resolve().parent
                        if str(agent_dir) not in sys.path:
                            sys.path.insert(0, str(agent_dir))
                        import Agent_Explore.main_app
                
                route_count_after = len(router.routes)
                logger.info(f"✅ Explore router retrieved successfully")
                logger.info(f"  Routes before main_app import: {route_count_before}")
                logger.info(f"  Routes after main_app import: {route_count_after}")
                if route_count_after == 0:
                    logger.warning("⚠️ Router has no routes after importing main_app!")
            except Exception as e:
                logger.warning(f"⚠️ Could not import main_app to register routes: {e}")
                route_count = len(router.routes)
                logger.info(f"✅ Explore router retrieved (has {route_count} routes)")
        else:
            logger.warning("⚠️ Explore router not found in registry - will be auto-discovered")
            # Explore should be auto-discovered, but if not found, try to ensure it's registered
            # by importing the module
            try:
                import Agent_Explore.main_app
                router = get_agent_router("explore")
                if router:
                    logger.info("✅ Explore router registered and retrieved after import")
            except Exception as e:
                logger.warning(f"⚠️ Could not import Explore main_app: {e}")
        
        return router
    except Exception as e:
        logger.error(f"❌ Failed to get explore router: {e}", exc_info=True)
        return None


def get_all_agent_routers() -> Dict[str, APIRouter]:
    """
    Get all registered agent routers.
    
    Returns:
        Dictionary of agent_name -> router
    """
    try:
        initialize_all_agents()
        return get_all_routers()
    except Exception as e:
        logger.error(f"❌ Failed to get all routers: {e}", exc_info=True)
        return {}


def initialize_trinity_agent() -> Dict[str, bool]:
    """
    Initialize all TrinityAgent agents.
    This should be called when connecting TrinityAgent to an external system.
    
    Returns:
        Dictionary of agent_name -> initialization success status
    """
    try:
        logger.info("=" * 80)
        logger.info("INITIALIZING TRINITY AGENT")
        logger.info("=" * 80)
        
        results = initialize_all_agents()
        
        logger.info("=" * 80)
        logger.info(f"TrinityAgent initialization complete: {results}")
        logger.info("=" * 80)
        
        return results
    except Exception as e:
        logger.error(f"❌ Failed to initialize TrinityAgent: {e}", exc_info=True)
        return {}


# Auto-initialize on import (optional - can be disabled if needed)
AUTO_INIT = True
if AUTO_INIT:
    try:
        _init_results = initialize_trinity_agent()
        logger.info(f"Auto-initialization results: {_init_results}")
    except Exception as e:
        logger.warning(f"Auto-initialization failed (non-fatal): {e}")


__all__ = [
    "get_concat_router",
    "get_merge_router",
    "get_create_transform_router",
    "get_group_by_router",
    "get_chart_maker_router",
    "get_dataframe_operations_router",
    "get_data_upload_validate_router",
    "get_fetch_atom_router",
    "get_explore_router",
    "get_all_agent_routers",
    "initialize_trinity_agent",
    "get_agent_router",
    "get_all_routers",
    "initialize_all_agents",
]

