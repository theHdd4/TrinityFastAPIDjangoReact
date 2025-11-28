"""
Minimal router file for Concat Agent
This file only creates and exports the router, ensuring it's always importable
even if BaseAgent imports fail.
"""

from fastapi import APIRouter

# Create router at module level - this will always work
router = APIRouter()

# This router will be populated with routes in main_app.py
# But even if main_app.py fails to import, this router exists

__all__ = ["router"]





