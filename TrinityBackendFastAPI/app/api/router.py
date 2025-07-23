from fastapi import APIRouter
from app.features.feature_overview.endpoint import router as feature_overview_router
from app.features.text_box.routes import router as textbox_router
from app.features.data_upload_validate.endpoint import router as data_upload_validate_router
from .card_archive import router as card_archive_router
from app.features.concat.endpoint import router as concat_router
from app.features.merge.endpoint import router as merge_router
from app.features.column_classifier.endpoint import router as column_classifier_router
from app.features.dataframe_operations.endpoint import router as dataframe_operations_router

api_router = APIRouter()
text_router  = APIRouter()
api_router.include_router(feature_overview_router)
text_router.include_router(textbox_router)
api_router.include_router(card_archive_router)
api_router.include_router(data_upload_validate_router)
api_router.include_router(concat_router)
api_router.include_router(merge_router)
api_router.include_router(column_classifier_router)
api_router.include_router(dataframe_operations_router, prefix="/dataframe-operations", tags=["DataFrame Operations"])
