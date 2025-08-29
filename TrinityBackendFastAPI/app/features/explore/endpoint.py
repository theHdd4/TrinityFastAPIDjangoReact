# app/features/explore/endpoint.py

from fastapi import APIRouter
from .app.routes import router as explore_routes

router = APIRouter()
router.include_router(
    explore_routes,
    prefix="/explore",
    tags=["Explore"]
)