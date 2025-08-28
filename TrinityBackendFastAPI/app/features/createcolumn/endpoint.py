
from fastapi import APIRouter
from .routes import router as create_routes

router = APIRouter()
router.include_router(
    create_routes,
    prefix="/create-column",
    tags=["Create Column"]
)