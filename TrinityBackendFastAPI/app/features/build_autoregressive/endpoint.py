
from fastapi import APIRouter
from .routes import router as autoreg_routes

router = APIRouter()
router.include_router(
    autoreg_routes,
    prefix="/autoreg",
    tags=["autoreg"]
)