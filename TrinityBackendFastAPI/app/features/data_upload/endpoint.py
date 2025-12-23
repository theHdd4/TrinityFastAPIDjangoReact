from fastapi import APIRouter
from .app.routes import router as upload_router

router = APIRouter()

# Data Upload routes - /api/data-upload (used by frontend UPLOAD_API)
router.include_router(
    upload_router,
    prefix="/data-upload",
    tags=["Data Upload"]
)
