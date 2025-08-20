from fastapi import APIRouter
from app.features.feature_overview.endpoint import router as feature_overview_router
from app.features.text_box.routes import router as textbox_router
from app.features.data_upload_validate.endpoint import router as data_upload_validate_router
from .card_archive import router as card_archive_router
from app.features.concat.endpoint import router as concat_router
from app.features.merge.endpoint import router as merge_router
from app.features.column_classifier.endpoint import router as column_classifier_router
from app.features.dataframe_operations.endpoint import router as dataframe_operations_router
from app.features.createcolumn.endpoint import router as create_router
from app.features.groupby_weighted_avg.endpoint import router as groupby_router
from app.features.project_state.endpoint import router as project_state_router
from app.features.scope_selector.endpoint import router as scope_selector_router
from app.features.user_apps.endpoint import router as user_apps_router
from app.features.chart_maker.endpoint import router as chart_maker_router
from app.features.build_model_feature_based.endpoint import router as build_model_router
# from app.features.build_autoregressive.endpoint import router as autoregressive_router
from app.features.select_models_feature_based.endpoint import router as select_router
from app.features.explore.endpoint import router as explore_router
api_router = APIRouter()
text_router  = APIRouter()
api_router.include_router(feature_overview_router)
text_router.include_router(textbox_router)
api_router.include_router(card_archive_router)
api_router.include_router(data_upload_validate_router)
api_router.include_router(concat_router)
api_router.include_router(merge_router)
api_router.include_router(column_classifier_router)
api_router.include_router(
    dataframe_operations_router,
    prefix="/dataframe-operations",
    tags=["DataFrame Operations"],
)
api_router.include_router(create_router)
api_router.include_router(groupby_router)
api_router.include_router(project_state_router)
api_router.include_router(scope_selector_router)
api_router.include_router(user_apps_router)
api_router.include_router(chart_maker_router)
api_router.include_router(explore_router)

api_router.include_router(build_model_router)
# api_router.include_router(autoregressive_router)


api_router.include_router(select_router)
