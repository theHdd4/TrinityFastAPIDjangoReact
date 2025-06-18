from fastapi import APIRouter
from app.features.feature_overview.endpoint import router as feature_overview_router
from app.features.text_box.routes import router as textbox_router
from app.features.data_upload_validate.endpoint import router as data_upload_validate_router
from .card_archive import router as card_archive_router

api_router = APIRouter()
text_router  = APIRouter()
api_router.include_router(feature_overview_router)
text_router.include_router(textbox_router)
api_router.include_router(card_archive_router)
api_router.include_router(data_upload_validate_router)


