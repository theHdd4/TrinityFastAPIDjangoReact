from fastapi import APIRouter
from .routes import router as Build1_routes

router = APIRouter()
router.include_router(
    Build1_routes,
    prefix="/api/v1",
    tags=["Build_1"],
)
