from fastapi import APIRouter
from .routes import router as column_classifier_routes

router = APIRouter()

# Primary mount used by the frontend
router.include_router(
    column_classifier_routes,
    prefix="/column-classifier",
    tags=["Column Classifier"],
)

# Backwards compatibility for older clients that relied on the
# standalone classifier service running under the `/classify` prefix.
router.include_router(
    column_classifier_routes,
    prefix="/classify",
    tags=["Column Classifier"],
)
