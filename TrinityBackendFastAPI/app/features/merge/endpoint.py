
from fastapi import APIRouter
from .routes import router as merge_routes

router = APIRouter()
router.include_router(
    merge_routes,
    prefix="/merge",
    tags=["Merge"]
)
