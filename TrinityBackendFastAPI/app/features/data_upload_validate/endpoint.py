from fastapi import APIRouter
from .app.routes import router as validate_atom_router

router = APIRouter()

# Data Validate routes - /api/data-validate (used by frontend VALIDATE_API)
router.include_router(
    validate_atom_router,
    prefix="/data-validate",
    tags=["Data Validate"]
)

# Legacy route - /api/data-upload-validate (for backward compatibility)
router.include_router(
    validate_atom_router,
    prefix="/data-upload-validate",
    tags=["Data Upload & Validate (Legacy)"]
)
