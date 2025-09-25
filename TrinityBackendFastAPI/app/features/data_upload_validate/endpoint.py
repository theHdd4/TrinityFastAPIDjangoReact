from fastapi import APIRouter
from .app.routes import router as validate_atom_router

router = APIRouter()

router.include_router(
    validate_atom_router,
    prefix="/data-upload-validate",
    tags=["Data Upload & Validate"]
)
