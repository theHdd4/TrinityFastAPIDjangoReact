from fastapi import APIRouter

from .routes import router as groupby_router

router = APIRouter()
router.include_router(groupby_router)
