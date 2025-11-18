from __future__ import annotations

from fastapi import APIRouter

from .routes import router as task_router

router = APIRouter()
# Legacy prefix used by the frontend (`/api/task-queue/<id>`) and the
# canonical `/api/tasks/<id>` prefix both point to the same handlers so polling
# works regardless of which base URL the client uses.
router.include_router(task_router, prefix="/tasks", tags=["Task Queue"])
router.include_router(task_router, prefix="/task-queue", tags=["Task Queue"])

__all__ = ["router"]
