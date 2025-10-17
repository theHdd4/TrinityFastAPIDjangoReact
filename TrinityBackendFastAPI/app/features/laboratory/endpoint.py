from fastapi import APIRouter

from .routes import router as laboratory_routes

router = APIRouter()
router.include_router(
    laboratory_routes,
    prefix="/laboratory",
    tags=["Laboratory"],
)
