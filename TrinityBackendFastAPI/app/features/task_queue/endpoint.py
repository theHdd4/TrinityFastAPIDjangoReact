from __future__ import annotations

from fastapi import APIRouter

from .routes import router as task_router

router = APIRouter()
router.include_router(task_router, prefix="/tasks", tags=["Task Queue"])

# Backwards compatibility: the frontend and some callers still poll using the
# `/task-queue` prefix, so expose the same handlers there to avoid 404s when
# retrieving task statuses.
router.include_router(task_router, prefix="/task-queue", tags=["Task Queue"])

__all__ = ["router"]
