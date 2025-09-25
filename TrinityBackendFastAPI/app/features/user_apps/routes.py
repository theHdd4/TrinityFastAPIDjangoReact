from fastapi import APIRouter
from .schemas import AppSelection
from app.DataStorageRetrieval.db import fetch_allowed_apps, register_project_session

router = APIRouter()

@router.get("/{user_id}/{client_id}")
async def list_user_apps(user_id: int, client_id: int):
    return await fetch_allowed_apps(user_id, client_id)

@router.post("/select")
async def select_app(selection: AppSelection):
    await register_project_session(selection.dict())
    return {"status": "ok"}
