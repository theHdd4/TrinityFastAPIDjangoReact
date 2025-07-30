
from fastapi import APIRouter
from .routes import router as scope_selector_router

router = APIRouter()

router.include_router(scope_selector_router, prefix="/scope-selector", tags=["Scope Selector"])
