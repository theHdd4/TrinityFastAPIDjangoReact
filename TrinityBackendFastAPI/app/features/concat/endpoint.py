
from fastapi import APIRouter
from .routes import router as concat_routes

router = APIRouter()
router.include_router(
    concat_routes,
    prefix="/concat",
    tags=["Concat"]
)
