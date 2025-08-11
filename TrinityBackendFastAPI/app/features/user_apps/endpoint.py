from fastapi import APIRouter
from .routes import router as user_apps_router

router = APIRouter()
router.include_router(user_apps_router, prefix="/user-apps", tags=["User Apps"])
