from fastapi import APIRouter
from app.features.dataframe_operations.endpoint import router as dataframe_operations_router

api_router = APIRouter()

api_router.include_router(dataframe_operations_router, prefix="/dataframe-operations", tags=["DataFrame Operations"]) 