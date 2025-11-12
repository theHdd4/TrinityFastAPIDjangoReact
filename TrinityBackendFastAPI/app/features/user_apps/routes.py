import logging

from fastapi import APIRouter, Depends
from .schemas import AppSelection
from app.DataStorageRetrieval.db import fetch_allowed_apps, register_project_session
from app.core.observability import timing_dependency_factory

logger = logging.getLogger(__name__)

timing_dependency = timing_dependency_factory("app.features.user_apps")

router = APIRouter(dependencies=[Depends(timing_dependency)])

@router.get("/{user_id}/{client_id}")
async def list_user_apps(user_id: int, client_id: int):
    apps = await fetch_allowed_apps(user_id, client_id)
    logger.info(
        "user_apps.list user_id=%s client_id=%s count=%s",
        user_id,
        client_id,
        len(apps) if isinstance(apps, (list, tuple, set)) else "unknown",
    )
    return apps

@router.post("/select")
async def select_app(selection: AppSelection):
    logger.info(
        "user_apps.select user_id=%s client_id=%s app_id=%s project_id=%s",
        selection.user_id,
        selection.client_id,
        selection.app_id,
        selection.project_id,
    )
    await register_project_session(selection.dict())
    return {"status": "ok"}
