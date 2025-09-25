from fastapi import APIRouter
from .routes import router as evaluate_routes

router = APIRouter()
router.include_router(
    evaluate_routes,
    prefix="/evaluate",
    tags=["Evaluate"],
)