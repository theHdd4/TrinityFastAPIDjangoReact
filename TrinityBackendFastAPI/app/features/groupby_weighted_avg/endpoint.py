
from fastapi import APIRouter
from .routes import router as groupby_routes

router = APIRouter()
router.include_router(
    groupby_routes,
    prefix="/groupby",
    tags=["groupby"]
)