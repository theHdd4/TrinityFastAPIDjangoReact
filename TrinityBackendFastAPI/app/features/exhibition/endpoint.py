from __future__ import annotations

from fastapi import APIRouter

from .routes import router as exhibition_routes

router = APIRouter()
router.include_router(exhibition_routes)
