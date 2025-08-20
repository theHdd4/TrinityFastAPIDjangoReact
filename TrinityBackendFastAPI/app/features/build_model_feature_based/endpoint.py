from fastapi import APIRouter
from .routes import router as Build1_routes

router = APIRouter()
router.include_router(
    Build1_routes,
    prefix="/build-model-feature-based",
    tags=["Build_1"],
)