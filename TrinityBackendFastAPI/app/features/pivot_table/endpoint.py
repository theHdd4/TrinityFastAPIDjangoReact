from fastapi import APIRouter

from .routes import router as pivot_table_routes


router = APIRouter()
router.include_router(pivot_table_routes)


