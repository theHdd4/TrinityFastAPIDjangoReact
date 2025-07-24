from fastapi import APIRouter
from .routes import router as state_routes

router = APIRouter()
router.include_router(
    state_routes,
    prefix="/project-state",
    tags=["Project State"],
)
