"""Expose the project image router for the FastAPI application."""

from fastapi import APIRouter

from .routes import router as image_routes

router = APIRouter()
router.include_router(image_routes)
