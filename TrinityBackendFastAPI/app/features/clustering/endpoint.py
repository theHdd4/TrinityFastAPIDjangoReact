from fastapi import APIRouter
from app.features.clustering.clustering.routes import router as clustering_routes

router = APIRouter()

# Include the clustering routes
router.include_router(clustering_routes, prefix="/clustering", tags=["Clustering"])


