# app/features/feature_overview/endpoint.py

from fastapi import APIRouter
from .routes import router as feature_overview_routes

router = APIRouter()
router.include_router(
    feature_overview_routes,
    prefix="/select",
    tags=["Select Feature Based"]
)
