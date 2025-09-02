# app/features/feature_overview/endpoint.py

from fastapi import APIRouter
<<<<<<< HEAD
from .routes import router as select_routes

router = APIRouter()
router.include_router(
    select_routes,
    prefix="/select",
    tags=["Select Feature Based"]
)
=======
from .routes import router as feature_overview_routes

router = APIRouter()
router.include_router(
    feature_overview_routes,
    prefix="/select",
    tags=["Select Feature Based"]
)
>>>>>>> dev
