from fastapi import APIRouter
from .routes import router as column_classifier_routes

router = APIRouter()
router.include_router(
    column_classifier_routes,
    prefix="/classify",
    tags=["Column Classifier"],
)
