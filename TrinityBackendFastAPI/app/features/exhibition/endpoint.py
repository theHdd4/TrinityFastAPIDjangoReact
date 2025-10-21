from __future__ import annotations

from fastapi import APIRouter

from .routes import (
    project_state_router as exhibition_project_state_router,
    router as exhibition_routes,
)

router = APIRouter()
router.include_router(exhibition_routes)
router.include_router(exhibition_project_state_router)
