"""FastAPI router wrapper for select models feature.

This module preserves the existing ``/api/select`` integration points while
allowing legacy imports of ``routes`` to continue functioning (e.g. for
standalone execution in ``main.py``).
"""

from fastapi import APIRouter

from .routes import router as select_routes

router = APIRouter()
router.include_router(
    select_routes,
    prefix="/select",
    tags=["Select Feature Based"],
)

__all__ = ["router"]

