"""
Agent Concat - Standardized Concat Agent
Uses BaseAgent infrastructure for all common functionality.
"""

import logging
import sys

logger = logging.getLogger("trinity.agent_concat")

# CRITICAL: Always import router first to ensure it exists
# Then try to import main_app to register routes on it
router = None
agent = None
agent_initialized = False

# Step 1: Import router from router.py (this always works)
# This ensures router exists even if main_app fails
try:
    from .router import router
    logger.info("✅ Imported router from router.py")
except Exception as e:
    logger.error(f"❌ Failed to import router from router.py: {e}")
    # Create a minimal router as last resort
    from fastapi import APIRouter
    router = APIRouter()
    logger.warning("⚠️ Created minimal router as last resort")

# Step 2: Try to import main_app to register routes on the router
# This may fail if BaseAgent imports fail, but router will still exist
if router is not None:
    try:
        # Import main_app - this will register routes on router.py's router
        from . import main_app
        logger.info("✅ Imported main_app - routes should be registered")
        
        # Check if routes were registered
        if hasattr(router, 'routes'):
            route_count = len(router.routes)
            print(f"Router now has {route_count} routes after main_app import")
            logger.info(f"Router now has {route_count} routes after main_app import")
    except Exception as e:
        logger.warning(f"⚠️ Failed to import main_app: {e}")
        logger.warning("Router exists but may not have all routes registered")
        logger.warning(f"Traceback: {traceback.format_exc()}")

# Step 3: Try to import agent from main_app (may fail if BaseAgent fails)
try:
    from .main_app import agent, agent_initialized
    logger.info(f"✅ Imported agent from main_app (initialized: {agent_initialized})")
except Exception as e:
    agent = None
    agent_initialized = False
    logger.warning("⚠️ Failed to import agent from main_app")

# Ensure router is not None
if router is None:
    logger.error("❌ CRITICAL: Router is None - creating minimal router")
    from fastapi import APIRouter
    router = APIRouter()

logger.info(f"Final router status: {router is not None}, routes: {len(router.routes) if router else 0}")

__all__ = ["agent", "router", "agent_initialized"]

