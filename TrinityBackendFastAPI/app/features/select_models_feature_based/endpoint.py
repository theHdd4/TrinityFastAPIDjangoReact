# app/features/feature_overview/endpoint.py

from fastapi import APIRouter
from .routes import router as select_routes

router = APIRouter()
router.include_router(
    select_routes,
    prefix="/select",
    tags=["Select Feature Based"]
)