from __future__ import annotations

from fastapi import APIRouter

from .routes import router as export_routes

router = APIRouter()
router.include_router(export_routes)
