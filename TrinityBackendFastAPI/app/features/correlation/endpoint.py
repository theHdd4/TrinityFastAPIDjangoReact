from fastapi import APIRouter
from .routes import router as correlation_routes

router = APIRouter()
router.include_router(
    correlation_routes,
    prefix="/correlation",
    tags=["Correlation"]
)
