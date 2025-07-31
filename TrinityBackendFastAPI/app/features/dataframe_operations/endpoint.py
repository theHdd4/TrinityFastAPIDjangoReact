from fastapi import APIRouter
from .app.routes import router as dataframe_ops_router

router = APIRouter()

router.include_router(
    dataframe_ops_router,
    tags=["DataFrame Operations"]
)
