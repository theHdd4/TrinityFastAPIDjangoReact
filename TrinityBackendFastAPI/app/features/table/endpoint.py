"""
Table atom endpoint registration.
"""
from fastapi import APIRouter
from .routes import router as table_routes

router = APIRouter()

# Include the routes from routes.py
router.include_router(table_routes, tags=["Table"])


