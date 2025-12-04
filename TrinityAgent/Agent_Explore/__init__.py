"""
Explore Agent Module
"""

import logging

router = None
agent = None
agent_initialized = False

try:
    from .router import router
    from . import main_app
except Exception as e:
    logging.warning(f"Failed to import Explore router or main_app: {e}")

try:
    from .main_app import agent, agent_initialized
except Exception as e:
    logging.warning(f"Failed to import Explore agent: {e}")

__all__ = ["agent", "router", "agent_initialized"]


