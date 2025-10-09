"""
Simple SuperAgent AI for Trinity Laboratory Mode

Direct AI communication - send prompt, get answer.
"""

from .main_app import router as superagent_router

__version__ = "1.0.0"
__all__ = ["superagent_router"]
