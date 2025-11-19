from __future__ import annotations

from fastapi import APIRouter

from .routes import router as task_router

router = APIRouter()
router.include_router(task_router, prefix="/task-queue", tags=["Task Queue"])

__all__ = ["router"]
